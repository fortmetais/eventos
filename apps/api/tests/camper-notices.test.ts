import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { camperTemplate } from "../src/modules/events/camper-template.js";
import { hashToken, newToken } from "../src/core/security.js";
const url = process.env.TEST_NOTICE_DATABASE_URL;
(url ? describe : describe.skip)("Avisos de aprovação para campistas", () => {
  if (url && new URL(url).pathname !== "/fac_notice_tests")
    throw new Error("Use somente fac_notice_tests.");
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_notice_tests",
  });
  const organizer = {
    id: randomUUID(),
    email: "organizer@camper-notices.test",
  };
  const messages: { text: string; subject: string }[] = [];
  const app = createApp({
    db,
    eventsEnabled: false,
    camperRegistrationsEnabled: true,
    decisionNotificationsEnabled: true,
    decisionLinkSecret: "segredo-campista-avisos-12345678901234567890",
    rateLimits: false,
    resolveIdentity: async (token) =>
      token === "organizer" ? organizer : null,
    decisionEmail: {
      async send(message) {
        messages.push(message);
        return "ENVIADA";
      },
    },
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it("envia o resultado de campista e exige presença antes de confirmar a vaga sem departamento", async () => {
    await db.account.create({ data: organizer });
    const org = await db.organization.create({
      data: {
        name: "Organização Campistas Avisos",
        city: "Toledo",
        state: "PR",
        contact: "Secretaria",
      },
    });
    await db.membership.create({
      data: {
        accountId: organizer.id,
        organizationId: org.id,
        role: "ORGANIZER",
      },
    });
    const type = await db.eventType.create({
      data: { organizationId: org.id, name: "Encontro Campistas" },
    });
    const event = await db.event.create({
      data: {
        organizationId: org.id,
        typeId: type.id,
        name: "Encontro do campista",
        description: "Teste de confirmação",
        location: "Chácara",
        city: "Toledo",
        startsAt: new Date("2027-06-01"),
        endsAt: new Date("2027-06-03"),
        status: "PUBLISHED",
      },
    });
    const campaign = await db.campaign.create({
      data: {
        eventId: event.id,
        kind: "CAMPER",
        opensAt: new Date(Date.now() - 1000),
        closesAt: new Date(Date.now() + 86400000),
        capacity: 10,
      },
    });
    const form = await db.formVersion.create({
      data: {
        campaignId: campaign.id,
        version: 1,
        publishedAt: new Date(),
        config: camperTemplate("Encontro"),
      },
    });
    const person = await db.person.create({
      data: {
        organizationId: org.id,
        name: "Pessoa campista",
        birthDate: new Date("1990-01-01"),
        phone: "44999999999",
        email: "campista@example.test",
      },
    });
    const draft = await db.draft.create({
      data: {
        campaignId: campaign.id,
        formVersionId: form.id,
        tokenHash: hashToken(newToken()),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const registration = await db.registration.create({
      data: {
        campaignId: campaign.id,
        formVersionId: form.id,
        personId: person.id,
        draftId: draft.id,
        protocol: `CAMP-${randomUUID()}`,
        snapshot: {
          name: person.name,
          birthDate: "1990-01-01",
          phone: person.phone,
          email: person.email,
        },
      },
    });
    const base = `/api/v1/organizations/${org.id}/registrations/${registration.id}`;
    const status = (next: string) =>
      request(app)
        .patch(`${base}/status`)
        .set("Authorization", "Bearer organizer")
        .send({ status: next, reason: "Avaliação de campista" });
    await status("REVIEW").expect(200);
    await status("APPROVED").expect(200);
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toContain("inscrição como campista");
    expect(messages[0].text).not.toContain("para servir");
    const state = await request(app)
      .get(`${base}/decision-notice`)
      .set("Authorization", "Bearer organizer")
      .expect(200);
    expect(state.body.notice.emailStatus).toBe("ENVIADA");
    const notice = state.body.notice,
      token = new URLSearchParams(new URL(notice.link).hash.slice(1)).get(
        "token",
      );
    expect((await status("CONFIRMED").expect(409)).body.error.code).toBe(
      "CANDIDATE_CONFIRMATION_REQUIRED",
    );
    const response = await request(app)
      .post(`/api/v1/public/decision-responses/${notice.id}`)
      .send({ token })
      .expect(200);
    expect(response.body.participation).toBe("CAMPER");
    expect((await status("CONFIRMED").expect(200)).body.teamId).toBeNull();
    expect(
      (
        await db.registration.findUniqueOrThrow({
          where: { id: registration.id },
        })
      ).status,
    ).toBe("CONFIRMED");
  });
});
