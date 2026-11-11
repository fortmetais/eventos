import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
const url = process.env.TEST_NOTICE_DATABASE_URL;
(url ? describe : describe.skip)("Mensagens de aceite por evento", () => {
  if (url && new URL(url).pathname !== "/fac_notice_tests")
    throw new Error("Use somente fac_notice_tests.");
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_notice_tests",
  });
  const users = Object.fromEntries(
    ["organizer", "secretary", "other"].map((role) => [
      role,
      { id: randomUUID(), email: `${role}@event-messages.test` },
    ]),
  );
  const send = vi.fn(async () => "ENVIADA" as const);
  const app = createApp({
    db,
    eventsEnabled: true,
    rateLimits: false,
    decisionNotificationsEnabled: true,
    decisionLinkSecret: "segredo-teste-mensagens-12345678901234567890",
    decisionEmail: { send },
    resolveIdentity: async (token) => users[token] ?? null,
  });
  const auth = (role = "organizer") => ({ Authorization: `Bearer ${role}` });
  let org: string,
    other: string,
    event: string,
    secondEvent: string,
    campaign: string,
    form: string,
    registration: string;
  const path = () =>
    `/api/v1/organizations/${org}/events/${event}/accept-message`;
  const template =
    "Paz e bem, {{nome}}! Você foi escolhido para {{evento}}. Departamento: {{departamento}}. Confirme em {{link}} até {{validade}}. {{organizacao}}";
  beforeAll(async () => {
    await db.account.createMany({ data: Object.values(users) });
    org = (
      await db.organization.create({
        data: {
          name: "Paróquia Mensagens",
          city: "Loanda",
          state: "PR",
          contact: "Secretaria",
        },
      })
    ).id;
    other = (
      await db.organization.create({
        data: {
          name: "Outra organização Mensagens",
          city: "Loanda",
          state: "PR",
          contact: "Secretaria",
        },
      })
    ).id;
    await db.membership.createMany({
      data: Object.entries(users).map(([role, user]) => ({
        organizationId: role === "other" ? other : org,
        accountId: user.id,
        role:
          role === "secretary"
            ? ("SECRETARY" as const)
            : ("ORGANIZER" as const),
      })),
    });
    const type = await db.eventType.create({
      data: { organizationId: org, name: "FAC Mensagens" },
    });
    const data = {
      organizationId: org,
      typeId: type.id,
      name: "FAC Mensagens",
      description: "Teste",
      city: "Loanda",
      location: "Chácara",
      startsAt: new Date("2027-06-01"),
      endsAt: new Date("2027-06-03"),
      status: "PUBLISHED" as const,
    };
    event = (await db.event.create({ data })).id;
    secondEvent = (
      await db.event.create({ data: { ...data, name: "Outro FAC Mensagens" } })
    ).id;
    campaign = (
      await db.campaign.create({
        data: {
          eventId: event,
          kind: "VOLUNTEER",
          opensAt: new Date("2026-01-01"),
          closesAt: new Date("2027-05-20"),
          capacity: 20,
        },
      })
    ).id;
    form = (
      await db.formVersion.create({
        data: {
          campaignId: campaign,
          version: 1,
          config: {},
          publishedAt: new Date(),
        },
      })
    ).id;
  });
  afterAll(() => db.$disconnect());
  it("restringe consulta/edição ao organizador e mostra padrão sem criar configuração", async () => {
    await request(app).get(path()).expect(401);
    await request(app).get(path()).set(auth("secretary")).expect(403);
    await request(app).get(path()).set(auth("other")).expect(403);
    await request(app)
      .get(`/api/v1/organizations/${other}/events/${event}/accept-message`)
      .set(auth("other"))
      .expect(404);
    const page = (await request(app).get(path()).set(auth()).expect(200)).body;
    expect(page).toMatchObject({ ready: true, revision: 0, customized: false });
    expect(page.previewValues).toMatchObject({
      nome: "Maria Exemplo",
      evento: "FAC Mensagens",
      departamento: "SECRETARIA",
    });
    expect(page.template).toBe(page.defaultTemplate);
  });
  it("valida informações obrigatórias e salva com revisão sem enviar", async () => {
    for (const invalid of [
      template.replace("{{link}}", ""),
      template + " {{senha}}",
      template + " {{link}}",
    ]) {
      await request(app)
        .put(path())
        .set(auth())
        .send({ revision: 0, template: invalid })
        .expect(422);
    }
    const result = (
      await request(app)
        .put(path())
        .set(auth())
        .send({ revision: 0, template })
        .expect(200)
    ).body;
    expect(result).toMatchObject({ revision: 1, customized: true, template });
    await request(app)
      .put(path())
      .set(auth())
      .send({ revision: 0, template })
      .expect(409);
    const second = (
      await request(app)
        .get(
          `/api/v1/organizations/${org}/events/${secondEvent}/accept-message`,
        )
        .set(auth())
        .expect(200)
    ).body;
    expect(second.customized).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("usa o modelo no WhatsApp com nome, alocação e link pessoal sem confirmar presença", async () => {
    const person = await db.person.create({
      data: {
        organizationId: org,
        name: "Maria Integração",
        birthDate: new Date("1990-01-01"),
        phone: "44999999999",
      },
    });
    const draft = await db.draft.create({
      data: {
        campaignId: campaign,
        formVersionId: form,
        tokenHash: randomUUID().replaceAll("-", "").repeat(2),
        expiresAt: new Date("2090-01-01"),
      },
    });
    registration = (
      await db.registration.create({
        data: {
          personId: person.id,
          campaignId: campaign,
          formVersionId: form,
          draftId: draft.id,
          protocol: `MSG-${randomUUID()}`,
          snapshot: { name: person.name, phone: person.phone },
        },
      })
    ).id;
    const base = `/api/v1/organizations/${org}/registrations/${registration}`;
    for (const status of ["REVIEW", "APPROVED"])
      await request(app)
        .patch(base + "/status")
        .set(auth())
        .send({ status, reason: "Avaliação de teste" })
        .expect(200);
    const team = await db.team.create({
      data: { eventId: event, name: "COZINHA", capacity: 2 },
    });
    await request(app)
      .put(base + "/team")
      .set(auth())
      .send({ teamId: team.id })
      .expect(200);
    const notice = (
      await request(app)
        .get(base + "/decision-notice")
        .set(auth())
        .expect(200)
    ).body.notice;
    expect(notice.message).toContain("Paz e bem, Maria Integração!");
    expect(notice.message).toContain("Departamento: COZINHA");
    expect(notice.message).toContain(notice.shortLink);
    expect(new URL(notice.whatsappLink).searchParams.get("text")).toBe(
      notice.message,
    );
    expect(notice.confirmedAt).toBeNull();
    expect(notice.whatsappSentAt).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it("impede sobrescrita concorrente e restaura padrão sem afetar candidatura", async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app).put(path()).set(auth()).send({ revision: 1, template }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = (await request(app).get(path()).set(auth()).expect(200))
      .body;
    const reset = (
      await request(app)
        .put(path())
        .set(auth())
        .send({ revision: current.revision, template: null })
        .expect(200)
    ).body;
    expect(reset.customized).toBe(false);
    expect(reset.template).toBe(reset.defaultTemplate);
    expect(
      (await db.registration.findUniqueOrThrow({ where: { id: registration } }))
        .status,
    ).toBe("APPROVED");
    expect(
      await db.auditLog.count({
        where: { entityId: event, action: "EVENT_ACCEPT_MESSAGE_RESET" },
      }),
    ).toBe(1);
  });
});
