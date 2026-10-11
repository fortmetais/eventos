import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "Cadastro completo e logotipo da organização",
  () => {
    if (url && new URL(url).pathname !== "/fac_tests")
      throw new Error("Use apenas fac_tests isolado.");
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_tests",
    });
    const users = {
      admin: { id: randomUUID(), email: `${randomUUID()}@org.test` },
      other: { id: randomUUID(), email: `${randomUUID()}@org.test` },
    };
    const upload = vi.fn(async (key: string, _buffer: Buffer) => ({
      bucket: "artes-eventos",
      key,
      url: `https://storage.test/${key}`,
    }));
    const remove = vi.fn(async (_bucket: string, _key: string) => {});
    const app = createApp({
      db,
      eventsEnabled: false,
      eventManagementEnabled: false,
      rateLimits: false,
      resolveIdentity: async (token) =>
        users[token as keyof typeof users] ?? null,
      artworkStorage: { upload, remove },
      mail: {
        async send() {
          return false;
        },
      },
    });
    const path = "/api/v1/admin/organizations";
    const auth = (user = "admin") => ({ Authorization: `Bearer ${user}` });
    const data = () => ({
      name: "Ficha org " + randomUUID(),
      kind: "PARISH",
      city: "Loanda",
      state: "PR",
      contact: "Contato teste",
      cnpj: "12.345.678/0001-95",
      legalName: "Entidade de teste",
      tradeName: "Comunidade",
      postalCode: "87900-000",
      street: "Rua de teste",
      number: "123",
      complement: "Sala 2",
      neighborhood: "Centro",
    });
    let png: Buffer;
    beforeAll(async () => {
      for (const [role, user] of Object.entries(users))
        await db.account.create({
          data: { ...user, platformAdmin: role === "admin" },
        });
      png = await sharp({
        create: {
          width: 1200,
          height: 400,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
    });
    beforeEach(() => {
      upload.mockClear();
      remove.mockClear();
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    it("bloqueia usuários sem permissão antes de enviar o arquivo", async () => {
      await request(app)
        .post(path)
        .field("data", JSON.stringify(data()))
        .attach("logo", png, "logo.png")
        .expect(401);
      await request(app)
        .post(path)
        .set(auth("other"))
        .field("data", JSON.stringify(data()))
        .attach("logo", png, "logo.png")
        .expect(403);
      expect(upload).not.toHaveBeenCalled();
    });
    it("salva, lista e reedita todos os dados e conserva transparência e proporção", async () => {
      const payload = data();
      const created = await request(app)
        .post(path)
        .set(auth())
        .field("data", JSON.stringify(payload))
        .attach("logo", png, "logo.png")
        .expect(201);
      expect(created.body).toMatchObject({
        ...payload,
        cnpj: "12345678000195",
        postalCode: "87900000",
        logoBucket: "artes-eventos",
      });
      expect(created.body.logoThumbnailUrl).toBe(`https://storage.test/${created.body.logoThumbnailKey}`);
      const mini = await sharp(upload.mock.calls[1][1]).metadata();
      expect(mini).toMatchObject({ width: 160, height: 53, hasAlpha: true, format: "webp" });
      const metadata = await sharp(upload.mock.calls[0][1]).metadata();
      expect(metadata).toMatchObject({
        format: "webp",
        width: 800,
        height: 267,
        hasAlpha: true,
      });
      const listed = await request(app)
        .get(path + "?pageSize=100")
        .set(auth())
        .expect(200);
      expect(
        listed.body.items.find((o: { id: string }) => o.id === created.body.id),
      ).toMatchObject({
        legalName: payload.legalName,
        logoUrl: created.body.logoUrl,
      });
      const updated = await request(app)
        .put(path + "/" + created.body.id)
        .set(auth())
        .send({ ...payload, street: "Nova rua", active: true })
        .expect(200);
      expect(updated.body).toMatchObject({
        street: "Nova rua",
        logoUrl: created.body.logoUrl,
        logoKey: created.body.logoKey,
      });
      expect(remove).not.toHaveBeenCalled();
      expect(
        (
          await db.organization.findUniqueOrThrow({
            where: { id: created.body.id },
          })
        ).street,
      ).toBe("Nova rua");
    });
    it("substitui o arquivo e remove somente o logotipo anterior após salvar", async () => {
      const payload = data();
      const created = await request(app)
        .post(path)
        .set(auth())
        .field("data", JSON.stringify(payload))
        .attach("logo", png, "logo.png")
        .expect(201);
      const changed = await request(app)
        .put(path + "/" + created.body.id)
        .set(auth())
        .field("data", JSON.stringify({ ...payload, active: true }))
        .attach("logo", png, "novo.png")
        .expect(200);
      expect(changed.body.logoKey).not.toBe(created.body.logoKey);
      expect(remove).toHaveBeenCalledTimes(2);
      expect(remove).toHaveBeenCalledWith(created.body.logoBucket, created.body.logoThumbnailKey);
      expect(remove).toHaveBeenCalledWith(
        created.body.logoBucket,
        created.body.logoKey,
      );
    });
    it("não cria cadastro nem envia arquivo quando os dados ou imagem são inválidos", async () => {
      const payload = data();
      await request(app)
        .post(path)
        .set(auth())
        .field("data", JSON.stringify({ ...payload, cnpj: "11111111111111" }))
        .attach("logo", png, "logo.png")
        .expect(422);
      await request(app)
        .post(path)
        .set(auth())
        .field("data", "{")
        .attach("logo", png, "logo.png")
        .expect(400);
      await request(app)
        .post(path)
        .set(auth())
        .field("data", JSON.stringify(payload))
        .attach("logo", Buffer.from("não é uma imagem"), {
          filename: "logo.png",
          contentType: "image/png",
        })
        .expect(422);
      await request(app)
        .post(path)
        .set(auth())
        .field("data", JSON.stringify(payload))
        .attach("logo", Buffer.from("<svg></svg>"), "logo.svg")
        .expect(422);
      await request(app)
        .post(path)
        .set(auth())
        .field("data", JSON.stringify(payload))
        .attach("logo", png, "logo.png")
        .attach("logo", png, "extra.png")
        .expect(400);
      await request(app)
        .post(path)
        .set(auth())
        .field("data", JSON.stringify(payload))
        .attach("logo", Buffer.alloc(10 * 1024 * 1024 + 1), "logo.png")
        .expect(413);
      expect(upload).not.toHaveBeenCalled();
      expect(
        await db.organization.count({ where: { name: payload.name } }),
      ).toBe(0);
    });
    it("mantém a organização e a imagem anterior se o armazenamento falhar", async () => {
      const payload = data();
      const created = await request(app)
        .post(path)
        .set(auth())
        .send({ ...payload, logoUrl: "https://old.test/logo.png" })
        .expect(201);
      upload.mockRejectedValueOnce(new Error("Falha de teste"));
      await request(app)
        .put(path + "/" + created.body.id)
        .set(auth())
        .field(
          "data",
          JSON.stringify({
            ...payload,
            legalName: "Não deve salvar",
            active: true,
          }),
        )
        .attach("logo", png, "logo.png")
        .expect(500);
      expect(
        await db.organization.findUniqueOrThrow({
          where: { id: created.body.id },
        }),
      ).toMatchObject({
        legalName: payload.legalName,
        logoUrl: "https://old.test/logo.png",
      });
      expect(remove).not.toHaveBeenCalled();
    });
    it("remove a nova imagem se a gravação do cadastro falhar", async () => {
      const payload = data();
      const fail = vi
        .spyOn(db.organization, "create")
        .mockRejectedValueOnce(new Error("Falha de gravação"));
      try {
        await request(app)
          .post(path)
          .set(auth())
          .field("data", JSON.stringify(payload))
          .attach("logo", png, "logo.png")
          .expect(500);
      } finally {
        fail.mockRestore();
      }
      const uploaded = await upload.mock.results[0].value;
      expect(remove).toHaveBeenCalledTimes(2);
      expect(remove).toHaveBeenCalledWith(uploaded.bucket, (await upload.mock.results[1].value).key);
      expect(remove).toHaveBeenCalledWith(
        uploaded.bucket,
        uploaded.key,
      );
      expect(
        await db.organization.count({ where: { name: payload.name } }),
      ).toBe(0);
    });
    it("a atualização SQL pode ser repetida sem mudar os cadastros existentes", async () => {
      const payload = data();
      const created = await request(app)
        .post(path)
        .set(auth())
        .send(payload)
        .expect(201);
      const sql = readFileSync(
        new URL(
          "../../../database/manual/10_ficha_organizacao.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const alter = sql.slice(
        sql.indexOf("ALTER TABLE"),
        sql.indexOf("COMMIT;"),
      );
      for (let i = 0; i < 2; i++) await db.$executeRawUnsafe(alter);
      expect(
        await db.organization.findUniqueOrThrow({
          where: { id: created.body.id },
        }),
      ).toMatchObject({ legalName: payload.legalName, cnpj: "12345678000195" });
    });
  },
);
