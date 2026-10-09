import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_INITIAL_DATABASE_URL;
const integration = url ? describe : describe.skip;
integration("Etapa inicial com SOMENTE as seis tabelas do DBeaver", () => {
  if (url && new URL(url).pathname !== "/fac_initial_tests")
    throw new Error("Use somente a base isolada fac_initial_tests.");
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_initial_tests",
  });
  const users = {
    admin: { id: randomUUID(), email: "admin@initial.test" },
    organizer: { id: randomUUID(), email: "organizer@initial.test" },
    other: { id: randomUUID(), email: "other@initial.test" },
    secretary: { id: randomUUID(), email: "secretary@initial.test" },
  };
  const app = createApp({
    db,
    eventsEnabled: false,
    rateLimits: false,
    resolveIdentity: async (token) =>
      users[token as keyof typeof users] ?? null,
    mail: {
      async send() {
        return false;
      },
    },
  });
  const auth = (user: keyof typeof users) => ({
    Authorization: `Bearer ${user}`,
  });
  let orgA: string, orgB: string, link: string;
  const organization = (name: string) => ({
    name,
    kind: "PARISH",
    city: "Toledo",
    state: "PR",
    contact: "Contato de teste",
  });
  beforeAll(async () => {
    await db.account.create({ data: { ...users.admin, platformAdmin: true } });
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it("readiness verifica os seis modelos mapeados", async () => {
    const result = await request(app).get("/api/v1/readiness").expect(200);
    expect(result.body.status).toBe("ready");
    expect(result.body.eventsEnabled).toBe(false);
    expect(result.body.eventManagementReady).toBe(false);
    const tables = await db.$queryRaw<
      { total: bigint }[]
    >`SELECT count(*) AS total FROM pg_tables WHERE schemaname IN ('acesso','organizacoes','pessoas','public')`;
    expect(Number(tables[0].total)).toBe(6);
  });
  it("identidade verificada cria conta comum, sem promoção automática", async () => {
    await request(app)
      .get("/api/v1/admin/organizations")
      .set(auth("other"))
      .expect(403);
    expect(
      (await db.account.findUniqueOrThrow({ where: { id: users.other.id } }))
        .platformAdmin,
    ).toBe(false);
    await request(app).get("/api/v1/admin/organizations").expect(401);
  });
  it("admin cadastra e lista duas paróquias sem tabela de eventos", async () => {
    orgA = (
      await request(app)
        .post("/api/v1/admin/organizations")
        .set(auth("admin"))
        .send(organization("Paróquia inicial A"))
        .expect(201)
    ).body.id;
    orgB = (
      await request(app)
        .post("/api/v1/admin/organizations")
        .set(auth("admin"))
        .send(organization("Paróquia inicial B"))
        .expect(201)
    ).body.id;
    const list = await request(app)
      .get("/api/v1/admin/organizations")
      .set(auth("admin"))
      .expect(200);
    expect(list.body.total).toBe(2);
    expect(await db.organization.count()).toBe(2);
  });
  it("convite manual usa as colunas portuguesas e permite aceite único", async () => {
    const invitation = await request(app)
      .post(`/api/v1/organizations/${orgA}/invitations`)
      .set(auth("admin"))
      .send({ email: users.organizer.email, role: "ORGANIZER" })
      .expect(201);
    expect(invitation.body.delivery).toBe("manual");
    link = new URL(invitation.body.link).pathname;
    const accept = `/api/v1/invitations/${link.split("/").at(-1)}/accept`;
    await request(app).post(accept).set(auth("other")).expect(403);
    await request(app).post(accept).set(auth("organizer")).expect(200);
    await request(app).post(accept).set(auth("organizer")).expect(410);
    expect(
      await db.auditLog.count({
        where: { organizationId: orgA, action: "INVITATION_ACCEPTED" },
      }),
    ).toBe(1);
  });
  it("membros funcionam sem eventos e respeitam o isolamento por paróquia", async () => {
    const own = await request(app)
      .get(`/api/v1/organizations/${orgA}/members`)
      .set(auth("organizer"))
      .expect(200);
    expect(own.body.events).toEqual([]);
    expect(own.body.members).toHaveLength(1);
    expect(own.body.invitations).toHaveLength(1);
    expect(own.body.invitations[0].acceptedAt).toBeTruthy();
    expect(own.body.invitations[0].email).toBe(users.organizer.email);
    await request(app)
      .get(`/api/v1/organizations/${orgB}/members`)
      .set(auth("organizer"))
      .expect(403);
    const access = await request(app)
      .get("/api/v1/me/access")
      .set(auth("organizer"))
      .expect(200);
    expect(
      access.body.organizations.map(
        (item: { organizationId: string }) => item.organizationId,
      ),
    ).toEqual([orgA]);
    expect(access.body.account.platformAdmin).toBe(false);
    await request(app)
      .get("/api/v1/admin/organizations")
      .set(auth("organizer"))
      .expect(403);
  });
  it("suspensão bloqueia o membro mesmo com identidade autenticada", async () => {
    await db.account.create({ data: users.secretary });
    const member = await db.membership.create({
      data: {
        organizationId: orgA,
        accountId: users.secretary.id,
        role: "SECRETARY",
      },
    });
    await request(app)
      .patch(`/api/v1/organizations/${orgA}/members/${member.id}`)
      .set(auth("organizer"))
      .send({ active: false, role: "SECRETARY", healthEventIds: [] })
      .expect(200);
    const access = await request(app)
      .get("/api/v1/me/access")
      .set(auth("secretary"))
      .expect(200);
    expect(access.body.organizations).toEqual([]);
    expect(
      await db.auditLog.count({
        where: { entityId: member.id, action: "MEMBERSHIP_UPDATED" },
      }),
    ).toBe(1);
    const organizer = await db.membership.findFirstOrThrow({
      where: { accountId: users.organizer.id },
    });
    await request(app)
      .patch(`/api/v1/organizations/${orgA}/members/${organizer.id}`)
      .set(auth("organizer"))
      .send({ active: false, role: "ORGANIZER", healthEventIds: [] })
      .expect(409);
  });
  it("perfil básico funciona sem inscrições e recusa campos de privilégio", async () => {
    await request(app)
      .put("/api/v1/me/profile")
      .set(auth("organizer"))
      .send({ name: "Organizador inicial", city: "Toledo" })
      .expect(200);
    const profile = await request(app)
      .get("/api/v1/me/profile")
      .set(auth("organizer"))
      .expect(200);
    expect(profile.body.profile.name).toBe("Organizador inicial");
    await request(app)
      .put("/api/v1/me/profile")
      .set(auth("organizer"))
      .send({ name: "Teste", platformAdmin: true })
      .expect(422);
    const registrations = await request(app)
      .get("/api/v1/me/registrations")
      .set(auth("organizer"))
      .expect(200);
    expect(registrations.body).toEqual([]);
    await request(app).get("/api/v1/public/events").expect(404);
    const setup = await request(app)
      .get(`/api/v1/organizations/${orgA}/event-setups`)
      .set(auth("organizer"))
      .expect(503);
    expect(setup.body.error.code).toBe("EVENT_SETUP_REQUIRED");
  });
  it("modelo Pessoa usa o esquema pessoas e o vínculo da organização", async () => {
    const person = await db.person.create({
      data: {
        organizationId: orgA,
        name: "Pessoa fictícia",
        birthDate: new Date("1990-01-01"),
        phone: "44999999999",
      },
    });
    expect(
      (await db.person.findUniqueOrThrow({ where: { id: person.id } }))
        .organizationId,
    ).toBe(orgA);
    const rows = await db.$queryRaw<
      { pessoa_id: string }[]
    >`SELECT pessoa_id FROM pessoas.pessoas WHERE pessoa_id = ${person.id}::uuid`;
    expect(rows[0].pessoa_id).toBe(person.id);
  });
});
