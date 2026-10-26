import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import {
  eventReference,
  eventSlug,
  optionalEventSlug,
} from "../src/modules/events/event-slug.js";

describe("Endereços públicos dos eventos", () => {
  it("normaliza letras e acentos e mantém o identificador original", () => {
    expect(eventSlug.parse("  3 FAC São José 2027  ")).toBe(
      "3-fac-sao-jose-2027",
    );
    const id = randomUUID();
    expect(eventReference.parse(id)).toBe(id);
    expect(optionalEventSlug.parse("")).toBeNull();
    expect(optionalEventSlug.parse(undefined)).toBeUndefined();
  });
  it("recusa endereços ambíguos, muito curtos ou com caracteres de URL", () => {
    for (const value of [
      randomUUID(),
      "ab",
      "-fac",
      "fac-",
      "fac--2027",
      "fac/teste",
      "fac?x=1",
      "fac%2fteste",
      "https://site.test",
      "a".repeat(81),
    ])
      expect(eventSlug.safeParse(value).success, value).toBe(false);
  });
});

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "Banners e links personalizados com PostgreSQL isolado",
  () => {
    if (url && new URL(url).pathname !== "/fac_tests")
      throw new Error("Use apenas fac_tests isolado.");
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_tests",
    });
    const user = {
      id: randomUUID(),
      email: `event-banner-${randomUUID()}@test.invalid`,
    };
    const upload = vi.fn(async (key: string, _buffer: Buffer) => ({
      bucket: "artes-eventos",
      key,
      url: `https://storage.test/${key}`,
    }));
    const remove = vi.fn(async (_bucket: string, _key: string) => {});
    const options = {
      db,
      rateLimits: false,
      resolveIdentity: async (token: string) =>
        token === "organizer" ? user : null,
      artworkStorage: { upload, remove },
    };
    const app = createApp({
      ...options,
      eventsEnabled: true,
      eventManagementEnabled: true,
    });
    const gradual = createApp({
      ...options,
      eventsEnabled: false,
      eventManagementEnabled: true,
      volunteerRegistrationsEnabled: true,
    });
    const auth = { Authorization: "Bearer organizer" };
    const slug = `fac-${randomUUID().slice(0, 8)}`;
    const input = (customSlug: string | null = slug) => ({
      typeName: "FAC",
      name: "Evento com banners",
      description: "Evento usado para verificar banners e links.",
      location: "Salão paroquial",
      city: "Toledo",
      startsAt: "2027-02-05",
      endsAt: "2027-02-09",
      slug: customSlug,
    });
    let org: string,
      other: string,
      eventId: string,
      desktop: Buffer,
      mobile: Buffer;
    const path = (organizationId = org) =>
      `/api/v1/organizations/${organizationId}/events`;
    beforeAll(async () => {
      await db.account.create({ data: user });
      for (const name of ["Banners A", "Banners B"]) {
        const organization = await db.organization.create({
          data: {
            name,
            city: "Toledo",
            state: "PR",
            contact: "Teste",
            memberships: { create: { accountId: user.id, role: "ORGANIZER" } },
          },
        });
        if (!org) org = organization.id;
        else other = organization.id;
      }
      desktop = await sharp({
        create: {
          width: 2400,
          height: 800,
          channels: 3,
          background: "#124a87",
        },
      })
        .png()
        .toBuffer();
      mobile = await sharp({
        create: {
          width: 1200,
          height: 1500,
          channels: 3,
          background: "#ab7612",
        },
      })
        .png()
        .toBuffer();
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    it("cria os dois banners em uma única gravação, com otimização e proporção preservada", async () => {
      const response = await request(app)
        .post(path())
        .set(auth)
        .field("data", JSON.stringify(input()))
        .attach("artwork", desktop, "desktop.png")
        .attach("mobileArtwork", mobile, "mobile.png")
        .expect(201);
      eventId = response.body.id;
      expect(response.body.slug).toBe(slug);
      expect(response.body.mobileImageKey).toContain("-mobile.webp");
      expect(upload).toHaveBeenCalledTimes(3); // computador, miniatura e celular
      expect(await sharp(upload.mock.calls[0][1]).metadata()).toMatchObject({
        format: "webp",
        width: 1920,
        height: 640,
      });
      expect(await sharp(upload.mock.calls[2][1]).metadata()).toMatchObject({
        format: "webp",
        width: 960,
        height: 1200,
      });
      await request(app).get(`/api/v1/public/events/${slug}`).expect(404);
      await db.event.update({
        where: { id: eventId },
        data: { status: "PUBLISHED" },
      });
      const byId = await request(app)
        .get(`/api/v1/public/events/${eventId}`)
        .expect(200);
      const bySlug = await request(app)
        .get(`/api/v1/public/events/${slug}`)
        .expect(200);
      expect(bySlug.body).toEqual(byId.body);
      expect(bySlug.body.mobileImageUrl).toBe(response.body.mobileImageUrl);
      await request(app)
        .get("/api/v1/public/events/endereco-inexistente")
        .expect(404);
    });
    it("mantém slug omitido e imagens em uma edição sem arquivos", async () => {
      const previous = await db.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      const { slug: _, ...data } = input();
      await request(app)
        .put(`${path()}/${eventId}`)
        .set(auth)
        .send(data)
        .expect(200);
      expect(
        await db.event.findUniqueOrThrow({ where: { id: eventId } }),
      ).toMatchObject({
        slug,
        imageKey: previous.imageKey,
        mobileImageKey: previous.mobileImageKey,
      });
    });
    it("recusa slug de outro evento e limpa somente os arquivos da tentativa", async () => {
      const prior = await db.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      const count = await db.event.count({
        where: { organizationId: { in: [org, other] } },
      });
      const start = upload.mock.calls.length;
      const failed = await request(app)
        .post(path(other))
        .set(auth)
        .field("data", JSON.stringify(input()))
        .attach("artwork", desktop, "d.png")
        .attach("mobileArtwork", mobile, "m.png")
        .expect(409);
      expect(failed.body.error.code).toBe("EVENT_SLUG_CONFLICT");
      expect(
        await db.event.count({
          where: { organizationId: { in: [org, other] } },
        }),
      ).toBe(count);
      for (const call of upload.mock.calls.slice(start))
        expect(remove).toHaveBeenCalledWith("artes-eventos", call[0]);
      expect(remove).not.toHaveBeenCalledWith("artes-eventos", prior.imageKey);
      expect(remove).not.toHaveBeenCalledWith(
        "artes-eventos",
        prior.mobileImageKey,
      );
    });
    it("o fluxo gradual também edita slug e banner do celular de evento publicado", async () => {
      const previous = await db.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      const editedSlug = `${slug}-novo`;
      await request(gradual)
        .put(`/api/v1/organizations/${org}/event-setups/${eventId}/details`)
        .set(auth)
        .field("data", JSON.stringify({ event: input(editedSlug) }))
        .attach("mobileArtwork", mobile, "novo.png")
        .expect(200);
      const result = await request(app)
        .get(`/api/v1/public/events/${editedSlug}`)
        .expect(200);
      expect(result.body.imageKey).toBe(previous.imageKey);
      expect(result.body.mobileImageKey).not.toBe(previous.mobileImageKey);
      expect(remove).toHaveBeenCalledWith(
        "artes-eventos",
        previous.mobileImageKey,
      );
      await request(app).get(`/api/v1/public/events/${eventId}`).expect(200);
    });
    it("remove banner de celular e endereço sem alterar o banner do computador", async () => {
      const previous = await db.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      const response = await request(app)
        .put(`${path()}/${eventId}`)
        .set(auth)
        .send({ ...input(null), removeMobileArtwork: true })
        .expect(200);
      expect(response.body).toMatchObject({
        slug: null,
        mobileImageUrl: null,
        mobileImageBucket: null,
        mobileImageKey: null,
        imageKey: previous.imageKey,
      });
      expect(remove).toHaveBeenCalledWith(
        "artes-eventos",
        previous.mobileImageKey,
      );
      await request(app).get(`/api/v1/public/events/${eventId}`).expect(200);
    });
    it("recusa arquivos inválidos e não deixa o primeiro banner órfão", async () => {
      const count = await db.event.count({
        where: { organizationId: { in: [org, other] } },
      });
      const start = upload.mock.calls.length;
      await request(app)
        .post(path())
        .set(auth)
        .field("data", JSON.stringify(input(null)))
        .attach("artwork", desktop, "desktop.png")
        .attach("mobileArtwork", Buffer.from("arquivo inválido"), "fake.png")
        .expect(422);
      expect(
        await db.event.count({
          where: { organizationId: { in: [org, other] } },
        }),
      ).toBe(count);
      for (const call of upload.mock.calls.slice(start))
        expect(remove).toHaveBeenCalledWith("artes-eventos", call[0]);
      const calls = upload.mock.calls.length;
      await request(app)
        .put(`${path(other)}/${eventId}`)
        .set(auth)
        .field("data", JSON.stringify(input()))
        .attach("mobileArtwork", mobile, "m.png")
        .expect(404);
      await request(app)
        .post(path())
        .field("data", JSON.stringify(input()))
        .attach("mobileArtwork", mobile, "m.png")
        .expect(401);
      await request(app)
        .post(path())
        .set(auth)
        .field(
          "data",
          JSON.stringify({ ...input(null), removeMobileArtwork: true }),
        )
        .attach("mobileArtwork", mobile, "m.png")
        .expect(422);
      expect(upload.mock.calls.length).toBe(calls);
    });
    it("a unicidade também bloqueia requisições simultâneas e a API oculta organizações inativas", async () => {
      const concurrent = `${slug}-paralelo`;
      const responses = await Promise.all(
        [org, other].map((organizationId) =>
          request(app)
            .post(path(organizationId))
            .set(auth)
            .send(input(concurrent)),
        ),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      await db.organization.update({
        where: { id: org },
        data: { active: false },
      });
      await request(app).get(`/api/v1/public/events/${eventId}`).expect(404);
      await db.organization.update({
        where: { id: org },
        data: { active: true },
      });
    });
  },
);
