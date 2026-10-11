import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashToken, newToken } from "../src/core/security.js";
import { defaultLayout, fieldCatalog } from "@fac/form-layout";
import {
  guardianSignSchema,
  requiresGuardian,
  signatureSchema,
} from "../src/modules/registrations/guardian.validation.js";
const signed = {
  name: "Responsável Teste",
  cpf: "52998224725",
  relationship: "Mãe",
  phone: "44999998888",
  email: "responsavel@example.test",
  city: "Toledo",
  participantCity: "Toledo",
  participantCpf: "",
  familyName: "Contato Familiar",
  familyPhone: "44999997777",
  hasMedication: true,
  medication: "Informação reservada de teste",
  hasAllergies: false,
  allergies: "",
  participationAccepted: true,
  responsibilityAccepted: true,
  privacyAccepted: true,
  imageAuthorized: false,
  signature: [
    [
      { x: 20, y: 40 },
      { x: 120, y: 80 },
      { x: 200, y: 40 },
    ],
  ],
};
describe("Regras do termo do responsável", () => {
  it("considera a idade atual mesmo que o participante faça 18 antes do evento", () => {
    expect(
      requiresGuardian(
        "2008-10-10",
        new Date("2027-01-01"),
        new Date("2026-10-09T12:00:00Z"),
      ),
    ).toBe(true);
    expect(
      requiresGuardian(
        "2008-10-09",
        new Date("2027-01-01"),
        new Date("2026-10-09T12:00:00Z"),
      ),
    ).toBe(false);
    expect(
      requiresGuardian(
        "2008-10-09",
        new Date("2027-01-01"),
        new Date("2026-10-09T01:00:00Z"),
      ),
    ).toBe(true);
  });
  it("recusa assinatura vazia, ponto, coordenadas fora da tela e excesso de dados", () => {
    for (const signature of [
      [],
      [[{ x: 1, y: 1 }]],
      [
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
      ],
      [
        [
          { x: -1, y: 1 },
          { x: 30, y: 1 },
        ],
      ],
      Array(41).fill(signed.signature[0]),
    ])
      expect(signatureSchema.safeParse(signature).success).toBe(false);
  });
  it("exige CPF, aceites e detalhes de saúde, mas preserva recusa de imagem", () => {
    expect(guardianSignSchema.parse(signed).imageAuthorized).toBe(false);
    expect(
      guardianSignSchema.safeParse({ ...signed, cpf: "11111111111" }).success,
    ).toBe(false);
    expect(
      guardianSignSchema.safeParse({ ...signed, privacyAccepted: false })
        .success,
    ).toBe(false);
    expect(
      guardianSignSchema.safeParse({ ...signed, medication: "" }).success,
    ).toBe(false);
  });
});
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "Autorização de menores com PostgreSQL isolado",
  () => {
    if (url && new URL(url).pathname !== "/fac_tests")
      throw new Error("Use apenas fac_tests.");
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_tests",
    });
    const users = {
      organizer: { id: randomUUID(), email: "guardian-organizer@example.test" },
      other: { id: randomUUID(), email: "guardian-other@example.test" },
    };
    const messages: { to: string; text: string }[] = [];
    let delivery: "ENVIADA" | "FALHA" = "ENVIADA";
    const app = createApp({
      db,
      eventsEnabled: true,
      rateLimits: false,
      decisionLinkSecret: "segredo-guardian-teste-12345678901234567890",
      decisionEmail: {
        async send(message) {
          messages.push(message);
          return delivery;
        },
      },
      resolveIdentity: async (token) =>
        users[token as keyof typeof users] ?? null,
    });
    let organizationId: string,
      campaignId: string,
      formVersionId: string,
      eventId: string;
    const health = {
      hasMedication: false,
      hasAllergies: false,
      hasDiet: false,
      hasCondition: true,
      condition: "Condição reservada preservada",
      hasNeeds: false,
    };
    const base = (id: string) =>
      `/api/v1/organizations/${organizationId}/registrations/${id}`;
    const auth = { Authorization: "Bearer organizer" };
    beforeAll(async () => {
      await db.account.createMany({ data: Object.values(users) });
      const organization = await db.organization.create({
        data: {
          name: "Organização do termo",
          city: "Cidade Termo Teste",
          state: "PR",
          contact: "Contato da organização",
        },
      });
      organizationId = organization.id;
      await db.membership.create({
        data: {
          organizationId,
          accountId: users.organizer.id,
          role: "ORGANIZER",
        },
      });
      const type = await db.eventType.create({
        data: { organizationId, name: "Acampamento do termo" },
      });
      const event = await db.event.create({
        data: {
          organizationId,
          typeId: type.id,
          name: "Evento do termo",
          city: "Cidade Termo Teste",
          location: "Local do termo",
          description: "Teste",
          startsAt: new Date("2027-06-01"),
          endsAt: new Date("2027-06-03"),
          status: "PUBLISHED",
        },
      });
      eventId = event.id;
      const campaign = await db.campaign.create({
        data: {
          eventId,
          kind: "CAMPER",
          opensAt: new Date(Date.now() - 86400000),
          closesAt: new Date(Date.now() + 86400000),
        },
      });
      campaignId = campaign.id;
      formVersionId = (
        await db.formVersion.create({
          data: {
            campaignId,
            version: 1,
            publishedAt: new Date(),
            config: {
              askCpf: false,
              askAddress: false,
              askShirt: false,
              questions: [],
              terms: "Regras da ficha do termo",
            },
          },
        })
      ).id;
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    async function candidate(
      birthDate = "2012-01-01",
      email = "responsavel@example.test",
      hidden = false,
    ) {
      const token = newToken();
      let candidateForm = formVersionId;
      if (hidden) {
        const config = {
          askCpf: false,
          askAddress: false,
          askShirt: false,
          questions: [],
          terms: "Regras da ficha do termo",
        };
        const catalog = fieldCatalog(config, "CAMPER");
        const layout = defaultLayout(config, "CAMPER");
        for (const group of layout.steps)
          for (const field of group.fields)
            field.hidden = !catalog.find((item) => item.key === field.key)
              ?.protectedReason;
        candidateForm = (
          await db.formVersion.create({
            data: {
              campaignId,
              version: 2,
              publishedAt: new Date(),
              config: { ...config, layout },
            },
          })
        ).id;
      }
      const draft = await db.draft.create({
        data: {
          campaignId,
          formVersionId: candidateForm,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 86400000),
          health: { create: { data: health } },
        },
      });
      const photo = await db.mediaAsset.create({
        data: {
          draftId: draft.id,
          organizationId,
          bucket: "test",
          objectKey: randomUUID(),
          purpose: "REGISTRATION",
          mimeType: "image/webp",
          size: 10,
        },
      });
      const payload = {
        name: `Menor ${randomUUID()}`,
        birthDate,
        phone: "44999999999",
        photoAssetId: photo.id,
        emergencyName: "Contato Familiar",
        emergencyPhone: "44999997777",
        emergencyRelationship: "Pai",
        guardianName: "Responsável Teste",
        guardianPhone: "44999998888",
        guardianEmail: email,
        guardianRelationship: "Mãe",
        guardianAuthorization: true,
        termsAccepted: true,
        imageAuthorized: true,
      };
      await db.draft.update({ where: { id: draft.id }, data: { payload } });
      const result = await request(app)
        .post(`/api/v1/public/drafts/${draft.id}/submit`)
        .set("X-Draft-Token", token)
        .expect(200);
      return {
        ...result.body,
        draftId: draft.id,
        draftToken: token,
        token: result.body.guardian?.link
          ? new URLSearchParams(
              new URL(result.body.guardian.link).hash.slice(1),
            ).get("token")
          : "",
      };
    }
    const view = (c: any, token = c.token) =>
      request(app)
        .post(`/api/v1/public/guardian-authorizations/${c.guardian.id}/view`)
        .send({ token });
    const sign = (c: any, data = signed) =>
      request(app)
        .post(`/api/v1/public/guardian-authorizations/${c.guardian.id}/sign`)
        .send({ token: c.token, data });
    const change = (c: any, status: string) =>
      request(app)
        .patch(`${base(c.id)}/status`)
        .set(auth)
        .send({ status, reason: "Avaliação do teste" });
    it("mantém saúde não perguntada e permite ao responsável completar dados omitidos", async () => {
      const c = await candidate("2012-01-01", "responsavel@example.test", true);
      const before = await view(c).expect(200);
      expect(before.body.health).not.toHaveProperty("hasAllergies");
      expect(before.body.health).not.toHaveProperty("hasMedication");
      expect(before.body.snapshot.familyName).toBe("");
      expect(before.body.snapshot.familyPhone).toBe("");
      await sign(c).expect(200);
      const after = await db.healthSubmission.findUniqueOrThrow({
        where: { registrationId: c.id },
      });
      expect(after.data).toMatchObject({
        hasMedication: true,
        medication: signed.medication,
        hasAllergies: false,
      });
      const registration = await db.registration.findUniqueOrThrow({
        where: { id: c.id },
      });
      expect(registration.snapshot).not.toHaveProperty("emergencyName");
    });
    it("cria termo pendente, envia ao responsável, permite retomada e ignora autorização marcada pelo menor", async () => {
      const c = await candidate();
      expect(c.guardian.emailStatus).toBe("ENVIADA");
      expect(messages.at(-1)?.to).toBe("responsavel@example.test");
      expect(messages.at(-1)?.text).not.toContain("Condição reservada");
      expect(new URL(c.guardian.whatsappLink).pathname).toBe("/5544999998888");
      const consent = await db.consent.findUniqueOrThrow({
        where: { registrationId: c.id },
      });
      expect(consent.guardianAuthorized).toBe(false);
      expect(consent.imageAuthorized).toBe(false);
      const resumed = await request(app)
        .get(`/api/v1/public/drafts/${c.draftId}`)
        .set("X-Draft-Token", c.draftToken)
        .expect(200);
      expect(resumed.body.guardian.id).toBe(c.guardian.id);
      const repeat = await request(app)
        .post(`/api/v1/public/drafts/${c.draftId}/submit`)
        .set("X-Draft-Token", c.draftToken)
        .expect(200);
      expect(repeat.body.id).toBe(c.id);
      expect(
        await db.guardianAuthorization.count({
          where: { registrationId: c.id },
        }),
      ).toBe(1);
      const response = await view(c).expect(200);
      expect(response.body.termsText).toContain("Organização do termo");
      expect(response.body.termsText).toContain("01/06/2027");
      expect(response.body.termsText).toContain("Regras da ficha do termo");
    });
    it("adultos não criam termo nem enviam mensagem ao responsável", async () => {
      const before = messages.length;
      const c = await candidate("1990-01-01");
      expect(c.guardian).toBeNull();
      expect(messages).toHaveLength(before);
    });
    it("bloqueia confirmação sem assinatura e libera após assinatura sem expor saúde no painel", async () => {
      const c = await candidate();
      await change(c, "REVIEW").expect(200);
      await change(c, "APPROVED").expect(200);
      expect((await change(c, "CONFIRMED").expect(409)).body.error.code).toBe(
        "GUARDIAN_SIGNATURE_REQUIRED",
      );
      await sign(c, { ...signed, cpf: "11111111111" }).expect(422);
      const responses = await Promise.all([sign(c), sign(c)]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(responses[0].body.receiptHash).toBe(responses[1].body.receiptHash);
      expect(responses[0].body.receiptHash).toMatch(/^[a-f0-9]{64}$/);
      await sign(c, { ...signed, name: "Tentativa de substituir" }).expect(200);
      expect((await view(c).expect(200)).body.signedData.name).toBe(
        signed.name,
      );
      const consent = await db.consent.findUniqueOrThrow({
        where: { registrationId: c.id },
      });
      expect(consent.guardianAuthorized).toBe(true);
      expect(consent.imageAuthorized).toBe(false);
      const finalHealth = (
        await db.healthSubmission.findUniqueOrThrow({
          where: { registrationId: c.id },
        })
      ).data as any;
      expect(finalHealth.medication).toBe(signed.medication);
      expect(finalHealth.condition).toBe(health.condition);
      const panel = await request(app)
        .get(`${base(c.id)}/guardian`)
        .set(auth)
        .expect(200);
      expect(JSON.stringify(panel.body)).not.toContain(signed.medication);
      expect(JSON.stringify(panel.body)).not.toContain(health.condition);
      await change(c, "CONFIRMED").expect(200);
      await request(app)
        .post(`${base(c.id)}/guardian/renew`)
        .set(auth)
        .expect(409);
    });
    it("recusa credencial errada, outra organização e inscrição cancelada", async () => {
      const c = await candidate();
      await view(c, "a".repeat(43)).expect(401);
      await request(app)
        .get(`${base(c.id)}/guardian`)
        .expect(401);
      await request(app)
        .get(`${base(c.id)}/guardian`)
        .set("Authorization", "Bearer other")
        .expect(403);
      await request(app)
        .get(
          `/api/v1/organizations/${randomUUID()}/registrations/${c.id}/guardian`,
        )
        .set(auth)
        .expect(404);
      await change(c, "CANCELLED").expect(200);
      await sign(c).expect(409);
    });
    it("link expirado exige renovação, que invalida o anterior e conserva o termo", async () => {
      const c = await candidate();
      const original = await db.guardianAuthorization.findUniqueOrThrow({
        where: { registrationId: c.id },
      });
      await db.guardianAuthorization.update({
        where: { id: original.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await view(c).expect(410);
      await db.event.update({
        where: { id: eventId },
        data: { name: "Nome atualizado" },
      });
      const renewed = await request(app)
        .post(`${base(c.id)}/guardian/renew`)
        .set(auth)
        .expect(200);
      expect(renewed.body.authorization.termsText).toBe(original.termsText);
      await view(c).expect(401);
      c.token = new URLSearchParams(
        new URL(renewed.body.authorization.link).hash.slice(1),
      ).get("token");
      await sign(c).expect(200);
    });
    it("falha de e-mail preserva inscrição e link do WhatsApp, permitindo reenvio", async () => {
      delivery = "FALHA";
      const c = await candidate();
      expect(c.guardian.emailStatus).toBe("FALHA");
      expect(c.guardian.whatsappLink).toContain("wa.me");
      delivery = "ENVIADA";
      await db.guardianAuthorization.update({
        where: { registrationId: c.id },
        data: { emailStartedAt: new Date(Date.now() - 61000) },
      });
      const results = await Promise.all([
        request(app)
          .post(`${base(c.id)}/guardian/email`)
          .set(auth),
        request(app)
          .post(`${base(c.id)}/guardian/email`)
          .set(auth),
      ]);
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(
        (
          await db.guardianAuthorization.findUniqueOrThrow({
            where: { registrationId: c.id },
          })
        ).emailStatus,
      ).toBe("ENVIADA");
    });
    it("permite criar termo para menor de uma inscrição antiga sem confiar no aceite antigo", async () => {
      const c = await candidate();
      await db.guardianTermHealth.delete({
        where: { authorizationId: c.guardian.id },
      });
      await db.guardianAuthorization.delete({ where: { id: c.guardian.id } });
      expect(
        (
          await request(app)
            .get(`${base(c.id)}/guardian`)
            .set(auth)
            .expect(200)
        ).body.needsAuthorization,
      ).toBe(true);
      const created = await request(app)
        .post(`${base(c.id)}/guardian/renew`)
        .set(auth)
        .expect(200);
      expect(created.body.authorization.signedAt).toBeNull();
    });
  },
);
