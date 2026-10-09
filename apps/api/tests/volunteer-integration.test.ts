import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import {
  volunteerTemplate,
  volunteerTeams,
} from "../src/modules/events/volunteer-template.js";

const url = process.env.TEST_VOLUNTEER_DATABASE_URL;
(url ? describe : describe.skip)(
  "Ficha de intenção para servos — SQL manual, publicação e avaliação",
  () => {
    if (url && new URL(url).pathname !== "/fac_volunteer_tests")
      throw new Error("Use apenas a base isolada fac_volunteer_tests.");
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_volunteer_tests",
    });
    const users = Object.fromEntries(
      ["organizer", "other", "secretary"].map((name) => [
        name,
        { id: randomUUID(), email: `${name}@volunteer.test` },
      ]),
    );
    const app = createApp({
      db,
      eventsEnabled: false,
      volunteerRegistrationsEnabled: true,
      rateLimits: false,
      resolveIdentity: async (token) => users[token] ?? null,
      storage: {
        async upload() {},
        async signedUrl(key) {
          return `https://storage.test/${key}`;
        },
        async remove() {},
      },
    });
    const auth = (name = "organizer") => ({ Authorization: `Bearer ${name}` });
    let orgA: string,
      orgB: string,
      eventId: string,
      campaignId: string,
      camperId: string;
    let draft: { id: string; token: string },
      registrationId: string,
      photoId: string;
    const now = Date.now();
    const path = () =>
      `/api/v1/organizations/${orgA}/events/${eventId}/volunteer-form`;
    const draftPath = () => `/api/v1/public/drafts/${draft.id}`;
    const payload = () => ({
      name: "Servo de teste",
      phone: "44999999999",
      birthDate: "1990-07-01",
      email: "",
      photoAssetId: photoId,
      shirt: "XGG",
      availability: "Disponível durante todo o evento",
      emergencyName: "Contato de teste",
      emergencyPhone: "44988888888",
      emergencyRelationship: "Irmão",
      termsAccepted: true,
      imageAuthorized: false,
      answers: {
        sexo: "Masculino",
        cidade: "Toledo",
        experiencia_evento: false,
        acampamento_edicao: "1º Sênior de teste",
        sacramentos: ["Batismo", "Crisma"],
        equipes_preferencia: ["COZINHA", "SECRETARIA", "INTERCESSÃO"],
        aceite_formacao: true,
        aceite_regras: true,
        formacao_saude: "Enfermagem em andamento",
        conjuge: "",
        paroquia: "Paróquia de teste",
      },
    });
    const health = {
      hasAllergies: false,
      hasMedication: false,
      hasDiet: false,
      hasCondition: false,
      hasNeeds: false,
    };
    beforeAll(async () => {
      for (const user of Object.values(users))
        await db.account.create({ data: user });
      orgA = (
        await db.organization.create({
          data: {
            name: "Paróquia Servos A",
            city: "Toledo",
            state: "PR",
            contact: "Teste",
          },
        })
      ).id;
      orgB = (
        await db.organization.create({
          data: {
            name: "Paróquia Servos B",
            city: "Toledo",
            state: "PR",
            contact: "Teste",
          },
        })
      ).id;
      await db.membership.createMany({
        data: [
          {
            organizationId: orgA,
            accountId: users.organizer.id,
            role: "ORGANIZER",
          },
          {
            organizationId: orgA,
            accountId: users.secretary.id,
            role: "SECRETARY",
          },
          {
            organizationId: orgB,
            accountId: users.other.id,
            role: "ORGANIZER",
          },
        ],
      });
      const result = await request(app)
        .post(`/api/v1/organizations/${orgA}/event-setups`)
        .set(auth())
        .send({
          departments: volunteerTeams.map((name) => ({ name, capacity: 10 })),
          event: {
            typeName: "FAC",
            name: "FAC Servos",
            description: "Acampamento fictício para testes",
            location: "Chácara",
            city: "Toledo",
            startsAt: "2027-06-01",
            endsAt: "2027-06-03",
          },
          campaigns: ["VOLUNTEER", "CAMPER"].map((kind) => ({
            kind,
            opensAt: new Date(now - 3600000).toISOString(),
            closesAt: new Date(now + 3600000).toISOString(),
          })),
        })
        .expect(201);
      eventId = result.body.id;
      campaignId = result.body.campaigns.find(
        (c: { kind: string }) => c.kind === "VOLUNTEER",
      ).id;
      camperId = result.body.campaigns.find(
        (c: { kind: string }) => c.kind === "CAMPER",
      ).id;
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    it("estrutura manual possui 18 tabelas, RLS e prontidão sem liberar campistas", async () => {
      const result = await request(app).get("/api/v1/config").expect(200);
      expect(result.body.volunteerRegistrationsReady).toBe(true);
      expect(result.body.eventsEnabled).toBe(false);
      const tables = await db.$queryRaw<
        { rowsecurity: boolean }[]
      >`SELECT rowsecurity FROM pg_tables WHERE schemaname IN ('acesso','organizacoes','pessoas','eventos','inscricoes','saude','arquivos')`;
      expect(tables).toHaveLength(18);
      expect(tables.every((t) => t.rowsecurity)).toBe(true);
      await request(app)
        .get(`/api/v1/public/campaigns/${camperId}`)
        .expect(404);
    });
    it("organizador publica o modelo; outra organização e secretaria não publicam", async () => {
      const setup = await request(app).get(path()).set(auth()).expect(200);
      expect(
        setup.body.template.questions.find(
          (q: { id: string }) => q.id === "equipes_preferencia",
        ).maxSelections,
      ).toBe(3);
      await request(app)
        .post(path())
        .set(auth("other"))
        .send(
          volunteerTemplate(
            "FAC",
            volunteerTeams.map((name) => name.toLocaleUpperCase("pt-BR")),
          ),
        )
        .expect(403);
      await request(app)
        .post(path())
        .set(auth("secretary"))
        .send(
          volunteerTemplate(
            "FAC",
            volunteerTeams.map((name) => name.toLocaleUpperCase("pt-BR")),
          ),
        )
        .expect(403);
      await request(app)
        .post(`/api/v1/organizations/${orgB}/events/${eventId}/volunteer-form`)
        .set(auth("other"))
        .send(
          volunteerTemplate(
            "FAC",
            volunteerTeams.map((name) => name.toLocaleUpperCase("pt-BR")),
          ),
        )
        .expect(404);
      const result = await request(app)
        .post(path())
        .set(auth())
        .send(
          volunteerTemplate(
            "FAC",
            volunteerTeams.map((name) => name.toLocaleUpperCase("pt-BR")),
          ),
        )
        .expect(201);
      expect(result.body.form.version).toBe(1);
      expect(
        (await db.event.findUniqueOrThrow({ where: { id: eventId } })).status,
      ).toBe("PUBLISHED");
      const list = await request(app).get("/api/v1/public/events").expect(200);
      expect(list.body.items[0].campaigns).toHaveLength(1);
      expect(list.body.items[0].campaigns[0].kind).toBe("VOLUNTEER");
    });
    it("sem conta cria rascunho, envia foto privada e guarda a versão original", async () => {
      draft = (
        await request(app)
          .post(`/api/v1/public/campaigns/${campaignId}/drafts`)
          .expect(201)
      ).body;
      const image = await sharp({
        create: { width: 500, height: 500, channels: 3, background: "#ccc" },
      })
        .png()
        .toBuffer();
      photoId = (
        await request(app)
          .post(`${draftPath()}/photo`)
          .set("X-Draft-Token", draft.token)
          .attach("photo", image, "foto.png")
          .expect(201)
      ).body.id;
      await request(app)
        .put(draftPath())
        .set("X-Draft-Token", draft.token)
        .send({ payload: payload(), health })
        .expect(200);
      const config = volunteerTemplate(
        "FAC",
        volunteerTeams.map((name) => name.toLocaleUpperCase("pt-BR")),
      );
      config.volunteer!.training =
        "Nova preparação específica para novos candidatos.";
      await request(app).post(path()).set(auth()).send(config).expect(201);
      const resumed = await request(app)
        .get(draftPath())
        .set("X-Draft-Token", draft.token)
        .expect(200);
      expect(resumed.body.form.version).toBe(1);
      expect(resumed.body.form.config.volunteer.training).not.toBe(
        config.volunteer!.training,
      );
    });
    it("rejeita quatro equipes, sacramentos incompatíveis e aceites falsos", async () => {
      for (const answers of [
        {
          ...payload().answers,
          equipes_preferencia: [
            "COZINHA",
            "SECRETARIA",
            "INTERCESSÃO",
            "EXTERNA",
          ],
        },
        {
          ...payload().answers,
          sacramentos: ["Batismo", "Não possuo nenhum sacramento"],
        },
        { ...payload().answers, aceite_formacao: false },
        { ...payload().answers, aceite_regras: false },
        { ...payload().answers, cidade: "   " },
      ]) {
        await request(app)
          .put(draftPath())
          .set("X-Draft-Token", draft.token)
          .send({ payload: { ...payload(), answers }, health })
          .expect(200);
        await request(app)
          .post(`${draftPath()}/submit`)
          .set("X-Draft-Token", draft.token)
          .expect(422);
      }
      expect(await db.registration.count()).toBe(0);
    });
    it("encerramento impede envio e preserva rascunho; reenvio é idempotente", async () => {
      await request(app)
        .put(draftPath())
        .set("X-Draft-Token", draft.token)
        .send({ payload: payload(), health })
        .expect(200);
      await db.campaign.update({
        where: { id: campaignId },
        data: { paused: true },
      });
      await request(app)
        .post(`${draftPath()}/submit`)
        .set("X-Draft-Token", draft.token)
        .expect(409);
      const resumed = await request(app)
        .get(draftPath())
        .set("X-Draft-Token", draft.token)
        .expect(200);
      expect(resumed.body.payload.name).toBe("Servo de teste");
      await db.campaign.update({
        where: { id: campaignId },
        data: { paused: false },
      });
      const result = await request(app)
        .post(`${draftPath()}/submit`)
        .set("X-Draft-Token", draft.token)
        .expect(200);
      registrationId = result.body.id;
      expect(result.body.status).toBe("RECEIVED");
      const again = await request(app)
        .post(`${draftPath()}/submit`)
        .set("X-Draft-Token", draft.token)
        .expect(200);
      expect(again.body.id).toBe(registrationId);
      expect(await db.registration.count()).toBe(1);
      expect(
        (await db.consent.findUniqueOrThrow({ where: { registrationId } }))
          .imageAuthorized,
      ).toBe(false);
    });
    it("organização avalia sem dados médicos; apenas organizador decide e histórico fica registrado", async () => {
      const base = `/api/v1/organizations/${orgA}/registrations/${registrationId}`;
      const detail = await request(app).get(base).set(auth()).expect(200);
      expect(detail.body.snapshot.answers.equipes_preferencia).toHaveLength(3);
      expect(detail.body.health).toBeUndefined();
      expect(detail.body.form.version).toBe(1);
      await request(app).get(base).set(auth("other")).expect(403);
      await request(app).get(base).set(auth("secretary")).expect(200);
      await request(app)
        .patch(`${base}/status`)
        .set(auth("secretary"))
        .send({ status: "REVIEW", reason: "Análise" })
        .expect(403);
      await request(app).get(`${base}/health`).set(auth()).expect(403);
      for (const status of ["REVIEW", "APPROVED"])
        await request(app)
          .patch(`${base}/status`)
          .set(auth())
          .send({ status, reason: "Critérios avaliados pela organização" })
          .expect(200);
      expect(
        await db.statusHistory.count({
          where: { registrationId, actorId: users.organizer.id },
        }),
      ).toBe(2);
      await request(app)
        .patch(`${base}/status`)
        .set(auth())
        .send({ status: "CONFIRMED", reason: "Confirmar" })
        .expect(409);
      const team = await request(app)
        .post(`/api/v1/organizations/${orgA}/events/${eventId}/teams`)
        .set(auth())
        .send({ name: "Equipe definida pelo organizador", capacity: 2 })
        .expect(201);
      await request(app)
        .put(`${base}/team`)
        .set(auth())
        .send({ teamId: team.body.id })
        .expect(200);
      await request(app)
        .patch(`${base}/status`)
        .set(auth())
        .send({
          status: "CONFIRMED",
          reason: "Equipe definida e participação confirmada",
        })
        .expect(200);
    });
    it("recusa candidatura e impede ações do membro suspenso", async () => {
      const original = await db.registration.findUniqueOrThrow({
        where: { id: registrationId },
      });
      const extraDraft = await db.draft.create({
        data: {
          campaignId,
          formVersionId: original.formVersionId,
          tokenHash: "a".repeat(64),
          expiresAt: new Date(now + 3600000),
        },
      });
      const rejected = await db.registration.create({
        data: {
          draftId: extraDraft.id,
          campaignId,
          personId: original.personId,
          formVersionId: original.formVersionId,
          protocol: "TESTE-RECUSA",
          snapshot: original.snapshot,
        },
      });
      await request(app)
        .patch(
          `/api/v1/organizations/${orgA}/registrations/${rejected.id}/status`,
        )
        .set(auth())
        .send({
          status: "REJECTED",
          reason: "Indisponibilidade para preparação",
        })
        .expect(200);
      expect(
        (
          await db.registration.findUniqueOrThrow({
            where: { id: rejected.id },
          })
        ).status,
      ).toBe("REJECTED");
      await db.membership.updateMany({
        where: { accountId: users.organizer.id },
        data: { active: false },
      });
      await request(app).get(path()).set(auth()).expect(403);
    });
    it("o SQL manual impede alterar fichas publicadas e respostas enviadas", async () => {
      const original = await db.registration.findUniqueOrThrow({
        where: { id: registrationId },
      });
      await expect(
        db.formVersion.update({
          where: { id: original.formVersionId },
          data: { config: { adulterada: true } },
        }),
      ).rejects.toThrow();
      await expect(
        db.registration.update({
          where: { id: registrationId },
          data: { snapshot: { adulterada: true } },
        }),
      ).rejects.toThrow();
      expect(
        (
          await db.registration.findUniqueOrThrow({
            where: { id: registrationId },
          })
        ).snapshot,
      ).toEqual(original.snapshot);
    });
  },
);
