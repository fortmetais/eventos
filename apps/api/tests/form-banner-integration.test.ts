import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { volunteerTemplate } from "../src/modules/events/volunteer-template.js";

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("Banner versionado da ficha", () => {
  if (url && new URL(url).pathname !== "/fac_tests")
    throw new Error("Use apenas fac_tests isolado.");
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_tests",
  });
  const users = {
    organizer: { id: randomUUID(), email: `${randomUUID()}@banner.test` },
    other: { id: randomUUID(), email: `${randomUUID()}@banner.test` },
  };
  const upload = vi.fn(async (key: string, _data: Buffer) => ({
    bucket: "artes-eventos",
    key,
    url: `https://storage.test/${key}`,
  }));
  const remove = vi.fn(async (_bucket: string, _key: string) => {});
  const app = createApp({
    db,
    eventsEnabled: true,
    rateLimits: false,
    resolveIdentity: async (token) =>
      users[token as keyof typeof users] ?? null,
    artworkStorage: { upload, remove },
  });
  let org: string;
  let image: Buffer;
  async function event() {
    const type = await db.eventType.create({
      data: { organizationId: org, name: randomUUID() },
    });
    const record = await db.event.create({
      data: {
        organizationId: org,
        typeId: type.id,
        name: "Evento de banner",
        description: "Teste do banner",
        location: "Chácara",
        city: "Loanda",
        startsAt: new Date("2027-01-01"),
        endsAt: new Date("2027-01-03"),
      },
    });
    const campaign = await db.campaign.create({
      data: {
        eventId: record.id,
        kind: "VOLUNTEER",
        opensAt: new Date(Date.now() - 3600000),
        closesAt: new Date(Date.now() + 3600000),
      },
    });
    await db.team.createMany({
      data: ["COZINHA", "SECRETARIA"].map((name) => ({
        eventId: record.id,
        name,
        capacity: 5,
      })),
    });
    return {
      eventId: record.id,
      campaignId: campaign.id,
      path: `/api/v1/organizations/${org}/events/${record.id}/volunteer-form`,
    };
  }
  const config = () => volunteerTemplate("FAC", ["COZINHA", "SECRETARIA"]);
  beforeAll(async () => {
    await db.account.createMany({ data: Object.values(users) });
    org = (
      await db.organization.create({
        data: {
          name: "Paróquia do banner",
          city: "Loanda",
          state: "PR",
          contact: "Contato do teste",
          kind: "PARISH",
        },
      })
    ).id;
    await db.membership.create({
      data: {
        organizationId: org,
        accountId: users.organizer.id,
        role: "ORGANIZER",
      },
    });
    image = await sharp({
      create: { width: 2400, height: 600, channels: 3, background: "#123456" },
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
  it("publica arquivo otimizado e preserva banners antigos em rascunhos, reutilização e remoção", async () => {
    const target = await event();
    const first = await request(app)
      .post(target.path)
      .set("Authorization", "Bearer organizer")
      .field("data", JSON.stringify(config()))
      .attach("banner", image, "banner.png")
      .expect(201);
    const original = first.body.form.config.banner;
    expect(original).toMatchObject({
      width: 1600,
      height: 400,
      bucket: "artes-eventos",
    });
    expect(original.key).toContain(
      `organizacoes/${org}/eventos/${target.eventId}/fichas/banners/`,
    );
    expect(await sharp(upload.mock.calls[0][1]).metadata()).toMatchObject({
      format: "webp",
      width: 1600,
      height: 400,
    });
    const draft = await request(app)
      .post(`/api/v1/public/campaigns/${target.campaignId}/drafts`)
      .expect(201);
    const second = await request(app)
      .post(target.path)
      .set("Authorization", "Bearer organizer")
      .field("data", JSON.stringify(config()))
      .attach("banner", image, "novo.png")
      .expect(201);
    expect(second.body.form.config.banner.key).not.toBe(original.key);
    const resumed = await request(app)
      .get(`/api/v1/public/drafts/${draft.body.id}`)
      .set("X-Draft-Token", draft.body.token)
      .expect(200);
    expect(resumed.body.form.config.banner).toEqual(original);
    const reused = await request(app)
      .post(target.path)
      .set("Authorization", "Bearer organizer")
      .send({ ...config(), banner: original })
      .expect(201);
    expect(reused.body.form.config.banner).toEqual(original);
    await request(app)
      .post(target.path)
      .set("Authorization", "Bearer organizer")
      .send({ ...config(), banner: null })
      .expect(201);
    const published = await request(app)
      .get(`/api/v1/public/campaigns/${target.campaignId}`)
      .expect(200);
    expect(published.body.form.config.banner).toBeNull();
    expect(
      (
        await db.formVersion.findUniqueOrThrow({
          where: { id: first.body.form.id },
        })
      ).config,
    ).toMatchObject({ banner: original });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();
  });
  it("bloqueia sem permissão, arquivo inválido, formato vertical e dados multipart incorretos", async () => {
    const target = await event();
    await request(app)
      .post(target.path)
      .field("data", JSON.stringify(config()))
      .attach("banner", image, "banner.png")
      .expect(401);
    await request(app)
      .post(target.path)
      .set("Authorization", "Bearer other")
      .field("data", JSON.stringify(config()))
      .attach("banner", image, "banner.png")
      .expect(403);
    await request(app)
      .post(target.path)
      .set("Authorization", "Bearer organizer")
      .field("data", "json inválido")
      .attach("banner", image, "banner.png")
      .expect(400);
    await request(app)
      .post(target.path)
      .set("Authorization", "Bearer organizer")
      .field("data", JSON.stringify(config()))
      .attach("banner", Buffer.from("não é uma imagem"), "banner.png")
      .expect(422);
    const square = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await request(app)
      .post(target.path)
      .set("Authorization", "Bearer organizer")
      .field("data", JSON.stringify(config()))
      .attach("banner", square, "quadrado.png")
      .expect(422);
    await request(app)
      .post(target.path)
      .set("Authorization", "Bearer organizer")
      .field("data", JSON.stringify(config()))
      .attach("banner", Buffer.alloc(10 * 1024 * 1024 + 1), "grande.png")
      .expect(413);
    expect(upload).not.toHaveBeenCalled();
  });
  it("remove somente o upload novo quando a publicação falha e rejeita banner de outro evento", async () => {
    const target = await event();
    const invalid = config();
    invalid.questions.find((q) => q.id === "equipes_preferencia")!.options = [
      "DEPARTAMENTO ERRADO",
    ];
    await request(app)
      .post(target.path)
      .set("Authorization", "Bearer organizer")
      .field("data", JSON.stringify(invalid))
      .attach("banner", image, "banner.png")
      .expect(409);
    expect(remove).toHaveBeenCalledWith(
      "artes-eventos",
      upload.mock.calls[0][0],
    );
    expect(
      await db.formVersion.count({ where: { campaignId: target.campaignId } }),
    ).toBe(0);
    const published = await request(app)
      .post(target.path)
      .set("Authorization", "Bearer organizer")
      .field("data", JSON.stringify(config()))
      .attach("banner", image, "banner.png")
      .expect(201);
    const other = await event();
    await request(app)
      .post(other.path)
      .set("Authorization", "Bearer organizer")
      .send({ ...config(), banner: published.body.form.config.banner })
      .expect(422);
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it("salva banner na criação da ficha de campistas sem mudar a liberação do produto", async () => {
    const target = await event();
    const camper = await db.campaign.create({
      data: {
        eventId: target.eventId,
        kind: "CAMPER",
        capacity: 30,
        opensAt: new Date(Date.now() - 1000),
        closesAt: new Date(Date.now() + 3600000),
      },
    });
    const created = await request(app)
      .post(`/api/v1/organizations/${org}/campaigns/${camper.id}/forms`)
      .set("Authorization", "Bearer organizer")
      .field(
        "data",
        JSON.stringify({
          askCpf: false,
          askAddress: false,
          askShirt: false,
          questions: [],
          terms: "Termos gerais para inscrição de campistas",
        }),
      )
      .attach("banner", image, "banner.png")
      .expect(201);
    expect(created.body.config.banner).toMatchObject({
      width: 1600,
      height: 400,
    });
    expect(created.body.publishedAt).toBeNull();
  });
});
