import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../src/app.js";

const url = process.env.TEST_EVENTS_DATABASE_URL;
const integration = url ? describe : describe.skip;
integration("Eventos com apenas as nove tabelas do fluxo gradual", () => {
  if (url && new URL(url).pathname !== "/fac_events_tests")
    throw new Error("Use apenas fac_events_tests isolado.");
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_events_tests",
  });
  const users = {
    organizer: { id: randomUUID(), email: "organizer@events.test" },
    other: { id: randomUUID(), email: "other@events.test" },
    secretary: { id: randomUUID(), email: "secretary@events.test" },
    health: { id: randomUUID(), email: "health@events.test" },
    admin: { id: randomUUID(), email: "admin@events.test" },
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
    eventManagementEnabled: true,
    rateLimits: false,
    resolveIdentity: async (token) =>
      users[token as keyof typeof users] ?? null,
    artworkStorage: { upload, remove },
  });
  const auth = (user = "organizer") => ({ Authorization: `Bearer ${user}` });
  let orgA: string, orgB: string, eventId: string;
  const data = () => ({
    event: {
      typeName: "FAC",
      name: "FAC de teste",
      description: "Encontro comunitário de teste.",
      location: "Chácara de teste",
      city: "Toledo",
      startsAt: "2027-01-10",
      endsAt: "2027-01-12",
    },
    campaigns: [
      {
        kind: "VOLUNTEER",
        opensAt: "2026-11-20T09:00:00-03:00",
        closesAt: "2026-12-01T18:00:00-03:00",
      },
      {
        kind: "CAMPER",
        opensAt: "2026-11-01T09:00:00-03:00",
        closesAt: "2026-12-10T18:00:00-03:00",
      },
    ],
  });
  const path = () => `/api/v1/organizations/${orgA}/event-setups`;
  beforeAll(async () => {
    for (const [role, user] of Object.entries(users))
      await db.account.create({
        data: { ...user, platformAdmin: role === "admin" },
      });
    for (const name of ["Paróquia Eventos A", "Paróquia Eventos B"]) {
      const org = await db.organization.create({
        data: { name, city: "Toledo", state: "PR", contact: "Teste" },
      });
      if (!orgA) orgA = org.id;
      else orgB = org.id;
    }
    for (const [user, role, organizationId] of [
      ["organizer", "ORGANIZER", orgA],
      ["other", "ORGANIZER", orgB],
      ["secretary", "SECRETARY", orgA],
      ["health", "HEALTH", orgA],
    ] as const)
      await db.membership.create({
        data: { organizationId, accountId: users[user].id, role },
      });
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it("SQL manual e Prisma funcionam sem tabelas futuras", async () => {
    const readiness = await request(app).get("/api/v1/readiness").expect(200);
    expect(readiness.body.eventManagementReady).toBe(true);
    const result = await db.$queryRaw<
      { total: bigint }[]
    >`SELECT count(*) AS total FROM pg_tables WHERE schemaname IN ('acesso','organizacoes','pessoas','eventos','public')`;
    expect(Number(result[0].total)).toBe(9);
    await request(app).get("/api/v1/public/events").expect(404);
  });
  it("organizador cria evento e períodos independentes juntos", async () => {
    await request(app).post(path()).set(auth()).send({ ...data(), departments: [{ name: "ANJO", capacity: 2 }] }).expect(503);
    const result = await request(app)
      .post(path())
      .set(auth())
      .send(data())
      .expect(201);
    eventId = result.body.id;
    expect(result.body.status).toBe("DRAFT");
    expect(result.body.campaigns).toHaveLength(2);
    expect(
      result.body.campaigns.find((c: { kind: string }) => c.kind === "CAMPER")
        .opensAt,
    ).toBe("2026-11-01T12:00:00.000Z");
    const raw = await db.$queryRaw<
      { nome: string; situacao: string }[]
    >`SELECT nome, situacao::text FROM eventos.eventos WHERE evento_id = ${eventId}::uuid`;
    expect(raw[0]).toEqual({ nome: "FAC de teste", situacao: "RASCUNHO" });
    expect(
      await db.auditLog.count({
        where: { entityId: eventId, action: "EVENT_CREATED" },
      }),
    ).toBe(1);
  });
  it("secretaria consulta; saúde, admin sem vínculo e outra organização não criam", async () => {
    await request(app).get(path()).set(auth("secretary")).expect(200);
    for (const user of ["secretary", "health", "admin", "other"])
      await request(app).post(path()).set(auth(user)).send(data()).expect(403);
    await request(app).get(path()).set(auth("other")).expect(403);
    await request(app).post(path()).send(data()).expect(401);
    await request(app)
      .put(`/api/v1/organizations/${orgB}/event-setups/${eventId}`)
      .set(auth("other"))
      .send(data())
      .expect(404);
  });
  it("datas inválidas e campanhas duplicadas não criam registros parciais", async () => {
    const count = await db.event.count();
    for (const input of [
      { ...data(), event: { ...data().event, endsAt: "2027-01-09" } },
      { ...data(), event: { ...data().event, startsAt: "2027-02-30" } },
      {
        ...data(),
        campaigns: [
          { ...data().campaigns[0], closesAt: data().campaigns[0].opensAt },
          data().campaigns[1],
        ],
      },
      { ...data(), campaigns: [data().campaigns[0], data().campaigns[0]] },
      { ...data(), campaigns: [data().campaigns[0]] },
    ])
      await request(app).post(path()).set(auth()).send(input).expect(422);
    expect(await db.event.count()).toBe(count);
  });
  it("edita para um dia, atualiza períodos e preserva as campanhas", async () => {
    const input = data();
    input.event.endsAt = input.event.startsAt;
    const original = await db.campaign.findMany({ where: { eventId } });
    const result = await request(app)
      .put(`${path()}/${eventId}`)
      .set(auth())
      .send(input)
      .expect(200);
    expect(result.body.startsAt).toBe(result.body.endsAt);
    expect(
      result.body.campaigns.map((c: { id: string }) => c.id).sort(),
    ).toEqual(original.map((c) => c.id).sort());
  });
  it("otimiza arte vertical, preserva proporção e substitui o arquivo anterior", async () => {
    const image = await sharp({
      create: { width: 1440, height: 2560, channels: 3, background: "#7053cc" },
    })
      .png()
      .toBuffer();
    const result = await request(app)
      .put(`${path()}/${eventId}`)
      .set(auth())
      .field("data", JSON.stringify(data()))
      .attach("artwork", image, "arte.png")
      .expect(200);
    const metadata = await sharp(upload.mock.calls.at(-1)![1]).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1920);
    expect(result.body.imageKey).toContain(`${orgA}/${eventId}/`);
    const oldKey = result.body.imageKey;
    await request(app)
      .put(`${path()}/${eventId}`)
      .set(auth())
      .send(data())
      .expect(200);
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: eventId } })).imageKey,
    ).toBe(oldKey);
    await request(app)
      .put(`${path()}/${eventId}`)
      .set(auth())
      .field("data", JSON.stringify(data()))
      .attach("artwork", image, "nova.png")
      .expect(200);
    expect(remove).toHaveBeenCalledWith("artes-eventos", oldKey);
  });
  it("arquivo falsificado e acesso cruzado não chegam ao armazenamento", async () => {
    const count = upload.mock.calls.length;
    await request(app)
      .post(path())
      .set(auth())
      .field("data", JSON.stringify(data()))
      .attach("artwork", Buffer.from("<svg>fake</svg>"), "fake.png")
      .expect(422);
    await request(app)
      .put(`/api/v1/organizations/${orgB}/event-setups/${eventId}`)
      .set(auth("other"))
      .field("data", JSON.stringify(data()))
      .attach("artwork", Buffer.from("fake"), "fake.png")
      .expect(404);
    expect(upload.mock.calls.length).toBe(count);
  });
  it("rollback remove arte recém-enviada e não deixa evento ou campanhas", async () => {
    await db.$executeRawUnsafe(
      `CREATE FUNCTION organizacoes.reject_event_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.acao = 'EVENT_CREATED' THEN RAISE EXCEPTION 'rollback-test'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER reject_event_test BEFORE INSERT ON organizacoes.auditoria FOR EACH ROW EXECUTE FUNCTION organizacoes.reject_event_test()`,
    );
    const count = await db.event.count();
    try {
      const image = await sharp({
        create: { width: 90, height: 160, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer();
      await request(app)
        .post(path())
        .set(auth())
        .field("data", JSON.stringify(data()))
        .attach("artwork", image, "rollback.png")
        .expect(500);
      expect(await db.event.count()).toBe(count);
      expect(remove).toHaveBeenCalledWith(
        "artes-eventos",
        upload.mock.results.at(-1)
          ? (await upload.mock.results.at(-1)!.value).key
          : "",
      );
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER reject_event_test ON organizacoes.auditoria`,
      );
      await db.$executeRawUnsafe(
        `DROP FUNCTION organizacoes.reject_event_test()`,
      );
    }
  });
  it("evento publicado e membro suspenso não são alterados por este fluxo", async () => {
    await db.event.update({
      where: { id: eventId },
      data: { status: "PUBLISHED" },
    });
    await request(app)
      .put(`${path()}/${eventId}`)
      .set(auth())
      .send(data())
      .expect(409);
    await db.membership.updateMany({
      where: { accountId: users.organizer.id },
      data: { active: false },
    });
    await request(app).post(path()).set(auth()).send(data()).expect(403);
  });
});
