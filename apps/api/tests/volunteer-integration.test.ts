import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import sharp from "sharp";
import { defaultLayout, fieldCatalog } from "@fac/form-layout";
import { createApp } from "../src/app.js";
import { createPreviewApp } from "../src/core/preview-app.js";
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
    const artworkUpload = vi.fn(async (key: string, _buffer: Buffer) => ({
      bucket: "artes-eventos",
      key,
      url: `https://storage.test/${key}`,
    }));
    const artworkRemove = vi.fn(async (_bucket: string, _key: string) => {});
    const api = createApp({
      db,
      eventsEnabled: false,
      camperRegistrationsEnabled: false,
      volunteerRegistrationsEnabled: true,
      rateLimits: false,
      artworkStorage: { upload: artworkUpload, remove: artworkRemove },
      resolveIdentity: async (token) => users[token] ?? null,
      storage: {
        async upload() {},
        async signedUrl(key) {
          return `https://storage.test/${key}`;
        },
        async remove() {},
      },
    });
    const app = createPreviewApp(api, {
      webRoot: fileURLToPath(
        new URL("./fixtures/preview-web/", import.meta.url),
      ),
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
    it("estrutura manual possui 20 tabelas, RLS e prontidão sem liberar campistas", async () => {
      const result = await request(app).get("/api/v1/config").expect(200);
      expect(result.body.volunteerRegistrationsReady).toBe(true);
      expect(result.body.eventsEnabled).toBe(false);
      const tables = await db.$queryRaw<
        { rowsecurity: boolean }[]
      >`SELECT rowsecurity FROM pg_tables WHERE schemaname IN ('acesso','organizacoes','pessoas','eventos','inscricoes','saude','arquivos')`;
      expect(tables).toHaveLength(21);
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
      const publishedConfig = volunteerTemplate(
        "FAC",
        volunteerTeams.map((name) => name.toLocaleUpperCase("pt-BR")),
      );
      publishedConfig.volunteer!.description =
        "  Descrição inicial da ficha de intenção.\nServir à comunidade.  ";
      const result = await request(app)
        .post(path())
        .set(auth())
        .send(publishedConfig)
        .expect(201);
      expect(result.body.form.version).toBe(1);
      expect(result.body.form.config.volunteer.description).toBe(
        "Descrição inicial da ficha de intenção.\nServir à comunidade.",
      );
      const reopened = await request(app).get(path()).set(auth()).expect(200);
      expect(reopened.body.form.config.volunteer.description).toBe(
        result.body.form.config.volunteer.description,
      );
      const campaign = await request(app)
        .get(`/api/v1/public/campaigns/${campaignId}`)
        .expect(200);
      expect(campaign.body.form.config.volunteer.description).toBe(
        result.body.form.config.volunteer.description,
      );
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
      config.volunteer!.description = "Descrição atualizada na segunda versão.";
      await request(app).post(path()).set(auth()).send(config).expect(201);
      const newest = await request(app).get(path()).set(auth()).expect(200);
      expect(newest.body.form.config.volunteer.description).toBe(
        config.volunteer!.description,
      );
      const resumed = await request(app)
        .get(draftPath())
        .set("X-Draft-Token", draft.token)
        .expect(200);
      expect(resumed.body.form.version).toBe(1);
      expect(resumed.body.form.config.volunteer.description).toBe(
        "Descrição inicial da ficha de intenção.\nServir à comunidade.",
      );
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
      expect(await db.registration.count({ where: { campaignId } })).toBe(0);
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
      expect(await db.registration.count({ where: { campaignId } })).toBe(1);
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
    const detailsPath = () =>
      `/api/v1/organizations/${orgA}/event-setups/${eventId}/details`;
    const currentDetails = async () => {
      const event = await db.event.findUniqueOrThrow({
        where: { id: eventId },
        include: { type: true },
      });
      return {
        event: {
          typeName: event.type.name,
          name: event.name,
          description: event.description,
          location: event.location,
          city: event.city,
          startsAt: event.startsAt.toISOString().slice(0, 10),
          endsAt: event.endsAt.toISOString().slice(0, 10),
        },
      };
    };
    it("edita nome, local e arte com inscrições ativas preservando status, fichas, equipes e candidatos", async () => {
      const before = {
        campaigns: await db.campaign.findMany({
          where: { eventId },
          orderBy: { id: "asc" },
        }),
        teams: await db.team.findMany({
          where: { eventId },
          orderBy: { id: "asc" },
        }),
        forms: await db.formVersion.findMany({
          where: { campaign: { eventId } },
          orderBy: { id: "asc" },
        }),
        registrations: await db.registration.findMany({
          where: { campaign: { eventId } },
          orderBy: { id: "asc" },
        }),
      };
      expect(before.registrations.length).toBeGreaterThan(0);
      const listing = await request(app)
        .get(`/api/v1/organizations/${orgA}/event-setups`)
        .set(auth())
        .expect(200);
      expect(
        listing.body.find((e: { id: string }) => e.id === eventId)
          .hasRegistrations,
      ).toBe(true);
      const input = await currentDetails();
      input.event.name = "FAC Servos atualizado";
      input.event.location = "Chácara da comunidade";
      const image = await sharp({
        create: { width: 90, height: 160, channels: 3, background: "#7053cc" },
      })
        .png()
        .toBuffer();
      const result = await request(app)
        .put(detailsPath())
        .set(auth())
        .field("data", JSON.stringify(input))
        .attach("artwork", image, "nova-arte.png")
        .expect(200);
      expect(result.body).toMatchObject({
        name: input.event.name,
        location: input.event.location,
        status: "PUBLISHED",
      });
      expect(result.body.imageUrl).toMatch(/^https:\/\/storage.test\//);
      expect(
        await db.campaign.findMany({
          where: { eventId },
          orderBy: { id: "asc" },
        }),
      ).toEqual(before.campaigns);
      expect(
        await db.team.findMany({ where: { eventId }, orderBy: { id: "asc" } }),
      ).toEqual(before.teams);
      expect(
        await db.formVersion.findMany({
          where: { campaign: { eventId } },
          orderBy: { id: "asc" },
        }),
      ).toEqual(before.forms);
      expect(
        await db.registration.findMany({
          where: { campaign: { eventId } },
          orderBy: { id: "asc" },
        }),
      ).toEqual(before.registrations);
      const event = await db.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      await request(app).put(detailsPath()).set(auth()).send(input).expect(200);
      expect(
        (await db.event.findUniqueOrThrow({ where: { id: eventId } })).imageKey,
      ).toBe(event.imageKey);
      await request(app)
        .put(detailsPath())
        .set(auth())
        .field("data", JSON.stringify(input))
        .attach("artwork", image, "substituida.png")
        .expect(200);
      expect(artworkRemove).toHaveBeenCalledWith(
        event.imageBucket,
        event.imageKey,
      );
    });
    it("datas com inscrições são recusadas sem alterar o evento; arte enviada é removida no rollback", async () => {
      const original = await db.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      const auditCount = await db.auditLog.count({
        where: { entityId: eventId },
      });
      const input = await currentDetails();
      input.event.startsAt = "2027-05-31";
      input.event.name = "Alteração que será recusada";
      const image = await sharp({
        create: { width: 90, height: 160, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer();
      const result = await request(app)
        .put(detailsPath())
        .set(auth())
        .field("data", JSON.stringify(input))
        .attach("artwork", image, "rollback.png")
        .expect(409);
      expect(result.body.error.message).toContain("preservam suas datas");
      const uploaded = await artworkUpload.mock.results.at(-1)!.value;
      expect(artworkRemove).toHaveBeenCalledWith(uploaded.bucket, uploaded.key);
      expect(
        await db.event.findUniqueOrThrow({ where: { id: eventId } }),
      ).toEqual(original);
      expect(await db.auditLog.count({ where: { entityId: eventId } })).toBe(
        auditCount,
      );
    });
    it("edição de detalhes respeita organização e papel e não aceita períodos, departamentos ou estado", async () => {
      const input = await currentDetails();
      const count = artworkUpload.mock.calls.length;
      for (const user of ["secretary", "other"])
        await request(app)
          .put(detailsPath())
          .set(auth(user))
          .field("data", JSON.stringify(input))
          .attach("artwork", Buffer.from("fake"), "fake.png")
          .expect(403);
      await request(app)
        .put(`/api/v1/organizations/${orgB}/event-setups/${eventId}/details`)
        .set(auth("other"))
        .field("data", JSON.stringify(input))
        .attach("artwork", Buffer.from("fake"), "fake.png")
        .expect(404);
      await request(app).put(detailsPath()).send(input).expect(401);
      for (const extra of [
        { campaigns: [] },
        { departments: [] },
        { status: "DRAFT" },
      ])
        await request(app)
          .put(detailsPath())
          .set(auth())
          .send({ ...input, ...extra })
          .expect(422);
      expect(artworkUpload.mock.calls.length).toBe(count);
    });
    it("período de inscrição aberto sem candidatos não impede corrigir datas de publicado", async () => {
      const original = await db.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      const event = await db.event.create({
        data: {
          organizationId: orgA,
          typeId: original.typeId,
          name: "FAC ainda sem inscritos",
          description: original.description,
          location: original.location,
          city: original.city,
          startsAt: original.startsAt,
          endsAt: original.endsAt,
          status: "PUBLISHED",
          campaigns: {
            create: {
              kind: "VOLUNTEER",
              opensAt: new Date(now - 3600000),
              closesAt: new Date(now + 3600000),
            },
          },
        },
      });
      const input = await currentDetails();
      input.event.startsAt = "2027-07-01";
      input.event.endsAt = "2027-07-03";
      const result = await request(app)
        .put(`/api/v1/organizations/${orgA}/event-setups/${event.id}/details`)
        .set(auth())
        .send(input)
        .expect(200);
      expect(result.body).toMatchObject({
        status: "PUBLISHED",
        startsAt: "2027-07-01T00:00:00.000Z",
        endsAt: "2027-07-03T00:00:00.000Z",
      });
      const listing = await request(app)
        .get(`/api/v1/organizations/${orgA}/event-setups`)
        .set(auth())
        .expect(200);
      expect(
        listing.body.find((e: { id: string }) => e.id === event.id)
          .hasRegistrations,
      ).toBe(false);
    });
    it("publica layout novo sem alterar versões antigas e salva/envia sem foto ou campos ocultos", async () => {
      const old = await db.registration.findUniqueOrThrow({
        where: { id: registrationId },
        include: { form: true },
      });
      const setup = await request(app).get(path()).set(auth()).expect(200);
      const config = setup.body.form.config;
      config.questions.find(
        (question: { id: string }) => question.id === "equipes_preferencia",
      ).options = setup.body.departments.map(
        (team: { name: string }) => team.name,
      );
      const catalog = fieldCatalog(config, "VOLUNTEER");
      config.layout = defaultLayout(config, "VOLUNTEER");
      for (const group of config.layout.steps)
        for (const field of group.fields)
          field.hidden = !catalog.find((item) => item.key === field.key)
            ?.protectedReason;
      config.layout.steps[0].fields.reverse();
      const invalid = structuredClone(config);
      invalid.layout.steps[0].fields.find(
        (field: { key: string }) => field.key === "base:name",
      ).hidden = true;
      await request(app).post(path()).set(auth()).send(invalid).expect(422);
      const published = await request(app)
        .post(path())
        .set(auth())
        .send(config);
      expect(published.body.error ?? published.status).toBe(201);
      expect(published.body.form.config.askShirt).toBe(false);
      expect(published.body.form.config.layout.steps[0].fields).toEqual(
        config.layout.steps[0].fields,
      );
      const next = (
        await request(app)
          .post(`/api/v1/public/campaigns/${campaignId}/drafts`)
          .expect(201)
      ).body;
      const route = `/api/v1/public/drafts/${next.id}`;
      await request(app)
        .put(route)
        .set("X-Draft-Token", next.token)
        .send({
          payload: {
            ...payload(),
            name: "Novo servo sem foto",
            phone: "44977777777",
            photoAssetId: photoId,
          },
          health,
        })
        .expect(200);
      const resumed = await request(app)
        .get(route)
        .set("X-Draft-Token", next.token)
        .expect(200);
      expect(resumed.body.payload).not.toHaveProperty("photoAssetId");
      expect(resumed.body.payload).not.toHaveProperty("emergencyName");
      expect(resumed.body.payload.answers).toEqual({});
      expect(resumed.body.health).toEqual({});
      const image = await sharp({
        create: { width: 100, height: 100, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer();
      await request(app)
        .post(`${route}/photo`)
        .set("X-Draft-Token", next.token)
        .attach("photo", image, "foto.png")
        .expect(422);
      const sent = await request(app)
        .post(`${route}/submit`)
        .set("X-Draft-Token", next.token)
        .expect(200);
      const stored = await db.registration.findUniqueOrThrow({
        where: { id: sent.body.id },
      });
      expect(stored.snapshot).not.toHaveProperty("photoAssetId");
      const oldAfter = await db.registration.findUniqueOrThrow({
        where: { id: registrationId },
        include: { form: true },
      });
      expect(oldAfter.snapshot).toEqual(old.snapshot);
      expect(oldAfter.form.config).toEqual(old.form.config);
      expect(oldAfter.form.config).not.toHaveProperty("layout");
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
