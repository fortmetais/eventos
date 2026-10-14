import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { camperTemplate } from "../src/modules/events/camper-template.js";
import { formSchema } from "../src/modules/events/events.validation.js";
import { validateSubmission } from "../src/modules/registrations/registrations.validation.js";
import { orderedFields, validateLayout } from "@fac/form-layout";

describe("Modelo completo de ficha para campistas", () => {
  it("mantém os campos do modelo 2 nas mesmas etapas, sem preferências de departamentos", () => {
    const form = formSchema.parse(camperTemplate("FAC"));
    expect(validateLayout(form)).toEqual([]);
    expect(
      orderedFields(form, "CAMPER", "identification").map((f) => f.key),
    ).toContain("question:estado");
    expect(orderedFields(form, "CAMPER", "care").map((f) => f.key)).toContain(
      "base:emergencyAlternativePhone",
    );
    expect(orderedFields(form, "CAMPER", "review").map((f) => f.key)).toContain(
      "question:aceite_orientacoes",
    );
    expect(JSON.stringify(form)).not.toContain("equipes_preferencia");
    expect(JSON.stringify(form)).not.toContain("aceite_formacao");
  });
  it("rejeita misturar os públicos da ficha", () => {
    const form = camperTemplate("FAC");
    expect(
      formSchema.safeParse({
        ...form,
        layout: { ...form.layout!, kind: "VOLUNTEER" },
      }).success,
    ).toBe(false);
    expect(() =>
      validateSubmission(
        {
          name: "Teste",
          birthDate: "1990-01-01",
          phone: "44999999999",
          termsAccepted: true,
        },
        {},
        form,
        new Date("2027-06-01"),
        "VOLUNTEER",
      ),
    ).toThrow();
  });
});

const url = process.env.TEST_VOLUNTEER_DATABASE_URL;
(url ? describe : describe.skip)(
  "Campistas na instalação gradual com PostgreSQL real",
  () => {
    if (url && new URL(url).pathname !== "/fac_volunteer_tests")
      throw new Error("Use somente a base isolada fac_volunteer_tests.");
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_volunteer_tests",
    });
    const users = Object.fromEntries(
      ["organizer", "secretary", "other", "health"].map((key) => [
        key,
        { id: randomUUID(), email: `${key}@camper.test` },
      ]),
    );
    const app = createApp({
      db,
      eventsEnabled: false,
      camperRegistrationsEnabled: true,
      rateLimits: false,
      resolveIdentity: async (token) => users[token] ?? null,
      decisionLinkSecret: "segredo-exclusivo-campistas-1234567890123456789",
      decisionEmail: {
        async send() {
          return "SEM_CONFIGURACAO";
        },
      },
      storage: {
        async upload() {},
        async remove() {},
        async signedUrl(key) {
          return `https://storage.test/${key}`;
        },
      },
      artworkStorage: {
        async upload(key) {
          return {
            key,
            bucket: "artes-test",
            url: `https://storage.test/${key}`,
          };
        },
        async remove() {},
      },
    });
    const oldApp = createApp({
      db,
      eventsEnabled: false,
      camperRegistrationsEnabled: false,
      rateLimits: false,
      resolveIdentity: async (token) => users[token] ?? null,
    });
    let organizationId: string,
      otherOrganization: string,
      eventId: string,
      campaignId: string;
    let config = camperTemplate("FAC");
    const auth = (user = "organizer") => ({ Authorization: `Bearer ${user}` });
    const setupPath = () =>
      `/api/v1/organizations/${organizationId}/events/${eventId}/camper-form`;
    const draftPath = (id: string) => `/api/v1/public/drafts/${id}`;
    const regPath = (id: string) =>
      `/api/v1/organizations/${organizationId}/registrations/${id}`;
    const health = {
      hasMedication: true,
      medication: "Saúde reservada do campista",
      hasAllergies: false,
      hasDiet: false,
      hasCondition: false,
      hasNeeds: false,
    };
    beforeAll(async () => {
      await db.account.createMany({ data: Object.values(users) });
      organizationId = (
        await db.organization.create({
          data: {
            name: "Comunidade Campistas",
            city: "Cidade Campistas",
            state: "PR",
            contact: "Contato teste",
          },
        })
      ).id;
      otherOrganization = (
        await db.organization.create({
          data: {
            name: "Comunidade Campistas B",
            city: "Cidade Campistas",
            state: "PR",
            contact: "Contato teste",
          },
        })
      ).id;
      const type = await db.eventType.create({
        data: { organizationId, name: "FAC" },
      });
      eventId = (
        await db.event.create({
          data: {
            organizationId,
            typeId: type.id,
            name: "FAC Campistas",
            description: "Evento para testar campistas",
            city: "Cidade Campistas",
            location: "Chácara de teste",
            startsAt: new Date("2027-06-01"),
            endsAt: new Date("2027-06-03"),
          },
        })
      ).id;
      for (const [user, org, role] of [
        ["organizer", organizationId, "ORGANIZER"],
        ["secretary", organizationId, "SECRETARY"],
        ["health", organizationId, "HEALTH"],
        ["other", otherOrganization, "ORGANIZER"],
      ] as const)
        await db.membership.create({
          data: {
            organizationId: org,
            accountId: users[user].id,
            role,
            healthEventIds: role === "HEALTH" ? [eventId] : [],
          },
        });
      campaignId = (
        await db.campaign.create({
          data: {
            eventId,
            kind: "CAMPER",
            opensAt: new Date(Date.now() - 86400000),
            closesAt: new Date(Date.now() + 86400000),
            capacity: null,
            allowWaitlist: true,
          },
        })
      ).id;
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    async function draft(minor = false) {
      const created = await request(app)
        .post(`/api/v1/public/campaigns/${campaignId}/drafts`)
        .expect(201);
      const credentials = created.body as { id: string; token: string };
      const photo = await db.mediaAsset.create({
        data: {
          draftId: credentials.id,
          organizationId,
          purpose: "REGISTRATION",
          bucket: "private-test",
          objectKey: randomUUID(),
          mimeType: "image/webp",
          size: 20,
        },
      });
      const payload = {
        name: `Campista ${randomUUID()}`,
        birthDate: minor ? "2012-01-01" : "1990-01-01",
        phone: "44999999999",
        email: "",
        photoAssetId: photo.id,
        shirt: "M",
        address: "Endereço do teste",
        emergencyName: "Contato familiar",
        emergencyPhone: "44999997777",
        emergencyAlternativePhone: "(44) 98888-6666",
        emergencyRelationship: "Mãe",
        guardianName: "Responsável de teste",
        guardianPhone: "44999998888",
        guardianRelationship: "Mãe",
        termsAccepted: true,
        imageAuthorized: true,
        answers: {
          cidade: "Toledo",
          estado: "PR",
          experiencia_evento: false,
          expectativas: "Viver uma experiência de fé",
          chegada: "Carona com a família",
          transporte: false,
          aceite_orientacoes: true,
          observacoes: "Observação do campista",
        },
      };
      await request(app)
        .put(draftPath(credentials.id))
        .set("X-Draft-Token", credentials.token)
        .send({ payload, health })
        .expect(200);
      return { ...credentials, payload };
    }
    async function submit(minor = false) {
      const d = await draft(minor);
      const response = await request(app)
        .post(`${draftPath(d.id)}/submit`)
        .set("X-Draft-Token", d.token)
        .expect(200);
      return {
        ...d,
        registrationId: response.body.id as string,
        guardian: response.body.guardian,
      };
    }
    async function change(id: string, status: string) {
      return request(app)
        .patch(`${regPath(id)}/status`)
        .set(auth())
        .send({ status, reason: "Avaliação do campista" });
    }
    it("oferece o modelo 2, exige vagas e protege a publicação por organização e função", async () => {
      const result = await request(app)
        .get(setupPath())
        .set(auth())
        .expect(200);
      expect(result.body.template.camper.template).toBe(
        "CAMPER_REGISTRATION_V1",
      );
      expect(result.body.departments).toEqual([]);
      await request(app)
        .post(setupPath())
        .set(auth("secretary"))
        .send(config)
        .expect(403);
      await request(app)
        .post(setupPath())
        .set(auth("other"))
        .send(config)
        .expect(403);
      await request(app).post(setupPath()).set(auth()).send(config).expect(422);
      await request(app)
        .put(
          `/api/v1/organizations/${organizationId}/events/${eventId}/campaigns`,
        )
        .set(auth())
        .send({
          kind: "CAMPER",
          opensAt: new Date(Date.now() - 86400000).toISOString(),
          closesAt: new Date(Date.now() + 86400000).toISOString(),
          capacity: 1,
          allowWaitlist: true,
        })
        .expect(200);
      const banner = await sharp({
        create: { width: 800, height: 200, channels: 3, background: "#5247b8" },
      })
        .png()
        .toBuffer();
      const published = await request(app)
        .post(setupPath())
        .set(auth())
        .field("data", JSON.stringify(config))
        .attach("banner", banner, {
          filename: "banner.png",
          contentType: "image/png",
        })
        .expect(200);
      expect(published.body.form.version).toBe(1);
      expect(published.body.form.config.banner.width).toBe(800);
      expect(
        (await db.event.findUniqueOrThrow({ where: { id: eventId } })).status,
      ).toBe("PUBLISHED");
      config = published.body.form.config;
      expect(
        (
          await request(app)
            .get(`/api/v1/public/events?organizationId=${organizationId}`)
            .expect(200)
        ).body.items[0].campaigns[0].kind,
      ).toBe("CAMPER");
      await request(oldApp).get(setupPath()).set(auth()).expect(404);
      await request(oldApp)
        .post(`/api/v1/public/campaigns/${campaignId}/drafts`)
        .expect(404);
    });
    it("preserva a versão antiga ao publicar novos textos e campos reordenados ou ocultos", async () => {
      const old = await draft();
      const next = structuredClone(config);
      next.camper!.description = "Nova descrição somente para novas inscrições";
      next
        .layout!.steps.find((s) => s.step === "about")!
        .fields.find((f) => f.key === "question:observacoes")!.hidden = true;
      next
        .layout!.steps.find((s) => s.step === "identification")!
        .fields.reverse();
      const published = await request(app)
        .post(setupPath())
        .set(auth())
        .send(next)
        .expect(200);
      expect(published.body.form.version).toBe(2);
      const original = await request(app)
        .get(draftPath(old.id))
        .set("X-Draft-Token", old.token)
        .expect(200);
      expect(original.body.form.version).toBe(1);
      expect(original.body.payload.answers.observacoes).toBe(
        "Observação do campista",
      );
      const fresh = await draft();
      const resumed = await request(app)
        .get(draftPath(fresh.id))
        .set("X-Draft-Token", fresh.token)
        .expect(200);
      expect(resumed.body.form.version).toBe(2);
      expect(resumed.body.payload.answers.observacoes).toBeUndefined();
      expect(resumed.body.form.config.camper.description).toContain(
        "Nova descrição",
      );
    });
    it("salva e envia a inscrição com idempotência, telefone alternativo e saúde restrita", async () => {
      const c = await submit();
      expect(c.guardian).toBeNull();
      const repeated = await request(app)
        .post(`${draftPath(c.id)}/submit`)
        .set("X-Draft-Token", c.token)
        .expect(200);
      expect(repeated.body.id).toBe(c.registrationId);
      const detail = await request(app)
        .get(regPath(c.registrationId))
        .set(auth())
        .expect(200);
      expect(detail.body.snapshot.emergencyAlternativePhone).toBe(
        "44988886666",
      );
      expect(detail.body.snapshot.availability).toBeUndefined();
      expect(JSON.stringify(detail.body)).not.toContain(health.medication);
      await request(app)
        .get(`${regPath(c.registrationId)}/health`)
        .set(auth())
        .expect(403);
      expect(
        (
          await request(app)
            .get(`${regPath(c.registrationId)}/health`)
            .set(auth("health"))
            .expect(200)
        ).body.medication,
      ).toBe(health.medication);
    });
    it("exige autorização assinada para menores e confirma respeitando as vagas", async () => {
      const c = await submit(true);
      expect(c.guardian.link).toContain("/autorizacao/");
      await change(c.registrationId, "REVIEW").then((r) =>
        expect(r.status).toBe(200),
      );
      await change(c.registrationId, "APPROVED").then((r) =>
        expect(r.status).toBe(200),
      );
      expect(
        (await change(c.registrationId, "CONFIRMED")).body.error.code,
      ).toBe("GUARDIAN_SIGNATURE_REQUIRED");
      const token = new URLSearchParams(
        new URL(c.guardian.link).hash.slice(1),
      ).get("token");
      await request(app)
        .post(`/api/v1/public/guardian-authorizations/${c.guardian.id}/sign`)
        .send({
          token,
          data: {
            name: "Responsável",
            cpf: "52998224725",
            relationship: "Mãe",
            phone: "44999998888",
            email: "",
            city: "Toledo",
            participantCity: "Toledo",
            participantCpf: "",
            familyName: "Contato",
            familyPhone: "44999997777",
            hasMedication: false,
            medication: "",
            hasAllergies: false,
            allergies: "",
            participationAccepted: true,
            responsibilityAccepted: true,
            privacyAccepted: true,
            imageAuthorized: false,
            signature: [
              [
                { x: 10, y: 10 },
                { x: 100, y: 80 },
              ],
            ],
          },
        })
        .expect(200);
      expect((await change(c.registrationId, "CONFIRMED")).body.status).toBe(
        "CONFIRMED",
      );
      const other = await submit();
      await change(other.registrationId, "REVIEW");
      await change(other.registrationId, "APPROVED");
      expect(
        (await change(other.registrationId, "CONFIRMED")).body.status,
      ).toBe("WAITLIST");
      expect(
        await db.registration.count({
          where: { campaignId, status: "CONFIRMED" },
        }),
      ).toBe(1);
    });
    it("pausa bloqueia novos rascunhos e preserva respostas existentes", async () => {
      const d = await draft();
      await request(app)
        .put(
          `/api/v1/organizations/${organizationId}/events/${eventId}/campaigns`,
        )
        .set(auth())
        .send({
          kind: "CAMPER",
          opensAt: new Date(Date.now() - 86400000).toISOString(),
          closesAt: new Date(Date.now() + 86400000).toISOString(),
          paused: true,
          capacity: 1,
          allowWaitlist: true,
        })
        .expect(200);
      await request(app)
        .post(`/api/v1/public/campaigns/${campaignId}/drafts`)
        .expect(409);
      await request(app)
        .post(`${draftPath(d.id)}/submit`)
        .set("X-Draft-Token", d.token)
        .expect(409);
      expect(
        (
          await request(app)
            .get(draftPath(d.id))
            .set("X-Draft-Token", d.token)
            .expect(200)
        ).body.payload.name,
      ).toBe(d.payload.name);
    });
  },
);
