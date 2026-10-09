import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import type { PrivateStorage } from "../src/core/supabase.js";
const url = process.env.TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;
integration(
  "Fluxos com PostgreSQL real e serviços externos substituídos somente nos testes",
  () => {
    if (url && new URL(url).pathname !== "/fac_tests")
      throw new Error("Os testes exigem um banco exclusivo chamado fac_tests.");
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://fac_test@127.0.0.1:1/fac_tests",
    });
    const identities = {
      admin: { id: randomUUID(), email: "admin@example.test" },
      organizer: { id: randomUUID(), email: "organizer@example.test" },
      other: { id: randomUUID(), email: "other@example.test" },
      secretary: { id: randomUUID(), email: "secretary@example.test" },
      health: { id: randomUUID(), email: "health@example.test" },
      participant: { id: randomUUID(), email: "participant@example.test" },
      invited: { id: randomUUID(), email: "invited@example.test" },
    };
    const images = new Map<string, Buffer>();
    const storage: PrivateStorage = {
      async upload(key, buffer) {
        images.set(key, buffer);
      },
      async signedUrl(key) {
        if (!images.has(key)) throw new Error("Missing test image");
        return `https://private.example.test/${key}?expires=120`;
      },
      async remove(key) {
        images.delete(key);
      },
    };
    const sentInvitations: string[] = [];
    const app = createApp({
      db,
      storage,
      resolveIdentity: async (token) =>
        identities[token as keyof typeof identities] ?? null,
      mail: {
        async send(_email, _org, link) {
          sentInvitations.push(link);
          return true;
        },
      },
      rateLimits: false,
      eventsEnabled: true,
    });
    const auth = (name: keyof typeof identities) => ({
      Authorization: `Bearer ${name}`,
    });
    let orgA: string,
      orgB: string,
      eventA: string,
      eventB: string,
      camper: string,
      volunteer: string,
      formId: string;
    let photo: Buffer;
    let first: {
      id: string;
      token: string;
      registrationId: string;
      protocol: string;
    };
    const config = {
      askCpf: false,
      askAddress: false,
      askShirt: true,
      questions: [],
      terms: "Termos fictícios para o teste de consentimento desta inscrição.",
    };
    const health = {
      hasAllergies: false,
      hasMedication: true,
      medication: "Medicamento reservado do teste",
      hasDiet: false,
      hasCondition: false,
      hasNeeds: false,
    };
    const payload = (name: string, phone: string) => ({
      name,
      phone,
      birthDate: "1990-01-01",
      email: "participant@example.test",
      emergencyName: "Contato de emergência",
      emergencyPhone: "44999991111",
      emergencyRelationship: "Amigo",
      termsAccepted: true,
      imageAuthorized: false,
      availability: "Disponível durante todo o evento",
      answers: {},
    });
    async function draft(campaignId: string, name: string, phone: string) {
      const created = await request(app)
        .post(`/api/v1/public/campaigns/${campaignId}/drafts`)
        .expect(201);
      const { id, token } = created.body;
      const uploaded = await request(app)
        .post(`/api/v1/public/drafts/${id}/photo`)
        .set("X-Draft-Token", token)
        .attach("photo", photo, {
          filename: "selfie.jpg",
          contentType: "image/jpeg",
        })
        .expect(201);
      const data = { ...payload(name, phone), photoAssetId: uploaded.body.id };
      await request(app)
        .put(`/api/v1/public/drafts/${id}`)
        .set("X-Draft-Token", token)
        .send({ payload: data, health })
        .expect(200);
      return { id, token, data, assetId: uploaded.body.id };
    }
    async function submit(campaignId: string, name: string, phone: string) {
      const created = await draft(campaignId, name, phone);
      const result = await request(app)
        .post(`/api/v1/public/drafts/${created.id}/submit`)
        .set("X-Draft-Token", created.token)
        .expect(200);
      return {
        ...created,
        registrationId: result.body.id,
        protocol: result.body.protocol,
      };
    }
    async function status(id: string, state: string) {
      return request(app)
        .patch(`/api/v1/organizations/${orgA}/registrations/${id}/status`)
        .set(auth("organizer"))
        .send({ status: state, reason: "Análise realizada pela organização" });
    }
    beforeAll(async () => {
      await db.$connect();
      for (const [name, user] of Object.entries(identities))
        await db.account.create({
          data: { ...user, platformAdmin: name === "admin" },
        });
      const createOrg = async (name: string) => {
        const res = await request(app)
          .post("/api/v1/admin/organizations")
          .set(auth("admin"))
          .send({
            name,
            kind: "PARISH",
            city: "Toledo",
            state: "PR",
            contact: "Contato fictício",
          })
          .expect(201);
        return res.body.id as string;
      };
      orgA = await createOrg("Paróquia A de teste");
      orgB = await createOrg("Paróquia B de teste");
      for (const [organizationId, key, role] of [
        [orgA, "organizer", "ORGANIZER"],
        [orgA, "secretary", "SECRETARY"],
        [orgA, "health", "HEALTH"],
        [orgB, "other", "ORGANIZER"],
      ] as const)
        await db.membership.create({
          data: { organizationId, accountId: identities[key].id, role },
        });
      const createEvent = async (org: string, key: keyof typeof identities) => {
        const res = await request(app)
          .post(`/api/v1/organizations/${org}/events`)
          .set(auth(key))
          .send({
            typeName: "FAC",
            name: "FAC de teste",
            description: "Evento demonstrativo para os testes de fluxo.",
            location: "Local de teste",
            city: "Toledo",
            startsAt: "2027-05-01",
            endsAt: "2027-05-04",
          })
          .expect(201);
        return res.body.id as string;
      };
      eventA = await createEvent(orgA, "organizer");
      eventB = await createEvent(orgB, "other");
      for (const kind of ["CAMPER", "VOLUNTEER"]) {
        const res = await request(app)
          .put(`/api/v1/organizations/${orgA}/events/${eventA}/campaigns`)
          .set(auth("organizer"))
          .send({
            kind,
            opensAt: new Date(Date.now() - 3600000).toISOString(),
            closesAt: new Date(Date.now() + 86400000).toISOString(),
            capacity: kind === "CAMPER" ? 1 : null,
            allowWaitlist: true,
          })
          .expect(200);
        const campaignId = res.body.id;
        if (kind === "CAMPER") camper = campaignId;
        else volunteer = campaignId;
        const form = await request(app)
          .post(`/api/v1/organizations/${orgA}/campaigns/${campaignId}/forms`)
          .set(auth("organizer"))
          .send(config)
          .expect(201);
        if (kind === "CAMPER") formId = form.body.id;
        await request(app)
          .post(
            `/api/v1/organizations/${orgA}/campaigns/${campaignId}/forms/${form.body.id}/publish`,
          )
          .set(auth("organizer"))
          .expect(200);
      }
      await request(app)
        .patch(`/api/v1/organizations/${orgA}/events/${eventA}/status`)
        .set(auth("organizer"))
        .send({ status: "PUBLISHED" })
        .expect(200);
      photo = await sharp({
        create: { width: 900, height: 700, channels: 3, background: "#675bca" },
      })
        .jpeg()
        .toBuffer();
    }, 30000);
    afterAll(async () => {
      await db.$disconnect();
    });
    it("cadastra paróquias somente com administrador e não aceita papel enviado pelo cliente", async () => {
      await request(app)
        .post("/api/v1/admin/organizations")
        .set(auth("organizer"))
        .send({ name: "Outra paróquia" })
        .expect(403);
      await request(app).get("/api/v1/admin/organizations").expect(401);
    });
    it("isola eventos e identificadores entre organizações", async () => {
      await request(app)
        .get(`/api/v1/organizations/${orgB}/events`)
        .set(auth("organizer"))
        .expect(403);
      await request(app)
        .put(`/api/v1/organizations/${orgA}/events/${eventB}`)
        .set(auth("organizer"))
        .send({
          typeName: "FAC",
          name: "Tentativa",
          description: "Teste de isolamento entre organizações",
          location: "Local",
          city: "Toledo",
          startsAt: "2027-05-01",
          endsAt: "2027-05-04",
        })
        .expect(404);
    });
    it("lista ambos os botões apenas para campanhas abertas e filtra por paróquia/cidade", async () => {
      const list = await request(app)
        .get("/api/v1/public/events?city=Toledo")
        .expect(200);
      expect(list.body.total).toBe(1);
      expect(
        list.body.items[0].campaigns.filter((c: { open: boolean }) => c.open),
      ).toHaveLength(2);
      expect(list.body.items[0].organization.contact).toBeUndefined();
      const empty = await request(app)
        .get(`/api/v1/public/events?organizationId=${orgB}`)
        .expect(200);
      expect(empty.body.total).toBe(0);
    });
    it("envia convite, exige o e-mail correto e impede reutilização concorrente", async () => {
      const invitation = await request(app)
        .post(`/api/v1/organizations/${orgA}/invitations`)
        .set(auth("organizer"))
        .send({ email: identities.invited.email, role: "SECRETARY" })
        .expect(201);
      expect(invitation.body.delivery).toBe("sent");
      expect(sentInvitations).toHaveLength(1);
      const token = new URL(invitation.body.link).pathname.split("/").at(-1);
      await request(app)
        .post(`/api/v1/invitations/${token}/accept`)
        .set(auth("participant"))
        .expect(403);
      const results = await Promise.all([
        request(app)
          .post(`/api/v1/invitations/${token}/accept`)
          .set(auth("invited")),
        request(app)
          .post(`/api/v1/invitations/${token}/accept`)
          .set(auth("invited")),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
    });
    it("bloqueia o membro suspenso mesmo com a mesma sessão", async () => {
      const member = await db.membership.findUniqueOrThrow({
        where: {
          organizationId_accountId: {
            organizationId: orgA,
            accountId: identities.invited.id,
          },
        },
      });
      await request(app)
        .patch(`/api/v1/organizations/${orgA}/members/${member.id}`)
        .set(auth("organizer"))
        .send({ role: "SECRETARY", active: false, healthEventIds: [] })
        .expect(200);
      await request(app)
        .get(`/api/v1/organizations/${orgA}/registrations`)
        .set(auth("invited"))
        .expect(403);
    });
    it("não permite suspender o último organizador", async () => {
      const member = await db.membership.findUniqueOrThrow({
        where: {
          organizationId_accountId: {
            organizationId: orgA,
            accountId: identities.organizer.id,
          },
        },
      });
      await request(app)
        .patch(`/api/v1/organizations/${orgA}/members/${member.id}`)
        .set(auth("organizer"))
        .send({ role: "ORGANIZER", active: false, healthEventIds: [] })
        .expect(409);
    });
    it("retoma rascunho somente pela credencial e guarda foto otimizada privada", async () => {
      const created = await draft(camper, "Campista Primeiro", "44988881111");
      await request(app).get(`/api/v1/public/drafts/${created.id}`).expect(401);
      const resumed = await request(app)
        .get(`/api/v1/public/drafts/${created.id}`)
        .set("X-Draft-Token", created.token)
        .expect(200);
      expect(resumed.body.payload.name).toBe("Campista Primeiro");
      const saved = await db.draft.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(saved.tokenHash).not.toBe(created.token);
      expect(JSON.stringify(saved.payload)).not.toContain(
        "Medicamento reservado",
      );
      const asset = await db.mediaAsset.findUniqueOrThrow({
        where: { id: created.assetId },
      });
      const optimized = await sharp(images.get(asset.objectKey)!).metadata();
      expect(optimized.width).toBe(500);
      expect(optimized.height).toBe(500);
      expect(optimized.format).toBe("webp");
      const result = await request(app)
        .post(`/api/v1/public/drafts/${created.id}/submit`)
        .set("X-Draft-Token", created.token)
        .expect(200);
      first = {
        id: created.id,
        token: created.token,
        registrationId: result.body.id,
        protocol: result.body.protocol,
      };
    });
    it("reenvio simultâneo devolve o mesmo protocolo, sem duplicar", async () => {
      const results = await Promise.all([
        request(app)
          .post(`/api/v1/public/drafts/${first.id}/submit`)
          .set("X-Draft-Token", first.token),
        request(app)
          .post(`/api/v1/public/drafts/${first.id}/submit`)
          .set("X-Draft-Token", first.token),
      ]);
      expect(
        results.every(
          (r) => r.status === 200 && r.body.protocol === first.protocol,
        ),
      ).toBe(true);
      expect(
        await db.registration.count({ where: { draftId: first.id } }),
      ).toBe(1);
    });
    it("não revela saúde nas respostas comuns nem concede saúde ao administrador global", async () => {
      const result = await request(app)
        .get(
          `/api/v1/organizations/${orgA}/registrations/${first.registrationId}`,
        )
        .set(auth("secretary"))
        .expect(200);
      expect(JSON.stringify(result.body)).not.toContain(
        "Medicamento reservado",
      );
      expect(result.body.health).toBeUndefined();
      await request(app)
        .get(
          `/api/v1/organizations/${orgA}/registrations/${first.registrationId}/health`,
        )
        .set(auth("admin"))
        .expect(403);
      await request(app)
        .get(
          `/api/v1/organizations/${orgA}/registrations/${first.registrationId}/health`,
        )
        .set(auth("health"))
        .expect(403);
    });
    it("autoriza saúde por evento e audita a leitura", async () => {
      const member = await db.membership.findUniqueOrThrow({
        where: {
          organizationId_accountId: {
            organizationId: orgA,
            accountId: identities.health.id,
          },
        },
      });
      await request(app)
        .patch(`/api/v1/organizations/${orgA}/members/${member.id}`)
        .set(auth("organizer"))
        .send({ role: "HEALTH", active: true, healthEventIds: [eventB] })
        .expect(422);
      await request(app)
        .patch(`/api/v1/organizations/${orgA}/members/${member.id}`)
        .set(auth("organizer"))
        .send({ role: "HEALTH", active: true, healthEventIds: [eventA] })
        .expect(200);
      const result = await request(app)
        .get(
          `/api/v1/organizations/${orgA}/registrations/${first.registrationId}/health`,
        )
        .set(auth("health"))
        .expect(200);
      expect(result.body.medication).toBe("Medicamento reservado do teste");
      expect(
        await db.auditLog.count({
          where: { action: "HEALTH_VIEWED", entityId: first.registrationId },
        }),
      ).toBe(1);
      await request(app)
        .get(`/api/v1/organizations/${orgA}/registrations`)
        .set(auth("health"))
        .expect(403);
    });
    it("isola fotos por organização e por credencial de rascunho", async () => {
      await request(app)
        .get(
          `/api/v1/organizations/${orgB}/registrations/${first.registrationId}/photo`,
        )
        .set(auth("other"))
        .expect(404);
      const asset = await db.mediaAsset.findFirstOrThrow({
        where: { draftId: first.id },
      });
      const another = await request(app)
        .post(`/api/v1/public/campaigns/${camper}/drafts`)
        .expect(201);
      await request(app)
        .get(`/api/v1/public/drafts/${another.body.id}/photos/${asset.id}`)
        .set("X-Draft-Token", another.body.token)
        .expect(404);
    });
    it("exige e-mail verificado e credencial para vincular somente a inscrição comprovada", async () => {
      await request(app)
        .post(`/api/v1/me/drafts/${first.id}/claim`)
        .set(auth("other"))
        .set("X-Draft-Token", first.token)
        .expect(403);
      await request(app)
        .post(`/api/v1/me/drafts/${first.id}/claim`)
        .set(auth("participant"))
        .expect(401);
      await request(app)
        .post(`/api/v1/me/drafts/${first.id}/claim`)
        .set(auth("participant"))
        .set("X-Draft-Token", first.token)
        .expect(200);
      const list = await request(app)
        .get("/api/v1/me/registrations")
        .set(auth("participant"))
        .expect(200);
      expect(list.body.map((r: { id: string }) => r.id)).toEqual([
        first.registrationId,
      ]);
      expect(JSON.stringify(list.body)).not.toContain("Medicamento reservado");
      const other = await request(app)
        .get("/api/v1/me/registrations")
        .set(auth("other"))
        .expect(200);
      expect(other.body).toHaveLength(0);
    });
    it("atualizar perfil não altera a ficha histórica nem permite elevar permissões", async () => {
      const before = await db.registration.findUniqueOrThrow({
        where: { id: first.registrationId },
      });
      await request(app)
        .put("/api/v1/me/profile")
        .set(auth("participant"))
        .send({ name: "Nome Atualizado", city: "Cianorte" })
        .expect(200);
      const after = await db.registration.findUniqueOrThrow({
        where: { id: first.registrationId },
      });
      expect(after.snapshot).toEqual(before.snapshot);
      await request(app)
        .put("/api/v1/me/profile")
        .set(auth("participant"))
        .send({ name: "Nome", platformAdmin: true })
        .expect(422);
    });
    it("não duplica inscrição ativa usando os mesmos dados sem expor o cadastro existente", async () => {
      const duplicate = await draft(camper, "Campista Primeiro", "44988881111");
      const result = await request(app)
        .post(`/api/v1/public/drafts/${duplicate.id}/submit`)
        .set("X-Draft-Token", duplicate.token)
        .expect(409);
      expect(result.body.error.code).toBe("DUPLICATE_REGISTRATION");
      expect(JSON.stringify(result.body)).not.toContain(first.registrationId);
    });
    it("confirmações simultâneas respeitam a capacidade e geram lista de espera", async () => {
      const second = await submit(camper, "Campista Segundo", "44988882222");
      for (const candidate of [first, second]) {
        expect((await status(candidate.registrationId, "REVIEW")).status).toBe(
          200,
        );
        const approved = await status(candidate.registrationId, "APPROVED");
        expect(approved.status).toBe(200);
      }
      const results = await Promise.all([
        status(first.registrationId, "CONFIRMED"),
        status(second.registrationId, "CONFIRMED"),
      ]);
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(results.map((r) => r.body.status).sort()).toEqual([
        "CONFIRMED",
        "WAITLIST",
      ]);
      expect(
        await db.registration.count({
          where: { campaignId: camper, status: "CONFIRMED" },
        }),
      ).toBe(1);
    });
    it("servo exige aprovação e equipe pertencente à sua edição", async () => {
      const candidate = await submit(
        volunteer,
        "Servo de Teste",
        "44988883333",
      );
      expect((await status(candidate.registrationId, "CONFIRMED")).status).toBe(
        409,
      );
      expect((await status(candidate.registrationId, "REVIEW")).status).toBe(
        200,
      );
      expect((await status(candidate.registrationId, "APPROVED")).status).toBe(
        200,
      );
      expect((await status(candidate.registrationId, "CONFIRMED")).status).toBe(
        409,
      );
      const wrongTeam = await db.team.create({
        data: { eventId: eventB, name: "Equipe de outra paróquia" },
      });
      await request(app)
        .put(
          `/api/v1/organizations/${orgA}/registrations/${candidate.registrationId}/team`,
        )
        .set(auth("organizer"))
        .send({ teamId: wrongTeam.id })
        .expect(422);
      const team = await request(app)
        .post(`/api/v1/organizations/${orgA}/events/${eventA}/teams`)
        .set(auth("organizer"))
        .send({ name: "Cozinha", capacity: 2 })
        .expect(201);
      await request(app)
        .put(
          `/api/v1/organizations/${orgA}/registrations/${candidate.registrationId}/team`,
        )
        .set(auth("organizer"))
        .send({ teamId: team.body.id })
        .expect(200);
      expect((await status(candidate.registrationId, "CONFIRMED")).status).toBe(
        200,
      );
    });
    it("preserva a versão antiga quando uma nova ficha é publicada", async () => {
      const old = await draft(camper, "Campista Terceiro", "44988884444");
      const created = await request(app)
        .post(`/api/v1/organizations/${orgA}/campaigns/${camper}/forms`)
        .set(auth("organizer"))
        .send({
          ...config,
          questions: [
            {
              id: "new_required",
              label: "Nova pergunta obrigatória",
              type: "text",
              required: true,
              options: [],
            },
          ],
        })
        .expect(201);
      await request(app)
        .post(
          `/api/v1/organizations/${orgA}/campaigns/${camper}/forms/${created.body.id}/publish`,
        )
        .set(auth("organizer"))
        .expect(200);
      await request(app)
        .post(`/api/v1/public/drafts/${old.id}/submit`)
        .set("X-Draft-Token", old.token)
        .expect(200);
      const registration = await db.registration.findUniqueOrThrow({
        where: { draftId: old.id },
      });
      expect(registration.formVersionId).toBe(formId);
      const newer = await draft(camper, "Campista Quarto", "44988885555");
      await request(app)
        .post(`/api/v1/public/drafts/${newer.id}/submit`)
        .set("X-Draft-Token", newer.token)
        .expect(422);
      expect(
        await db.formVersion.findUnique({ where: { id: formId } }),
      ).toMatchObject({ config });
    });
    it("campanha que fecha durante preenchimento preserva rascunho e impede envio", async () => {
      const created = await draft(volunteer, "Servo Segundo", "44988886666");
      await db.campaign.update({
        where: { id: volunteer },
        data: { paused: true },
      });
      const result = await request(app)
        .post(`/api/v1/public/drafts/${created.id}/submit`)
        .set("X-Draft-Token", created.token)
        .expect(409);
      expect(result.body.error.code).toBe("CAMPAIGN_CLOSED");
      const restored = await request(app)
        .get(`/api/v1/public/drafts/${created.id}`)
        .set("X-Draft-Token", created.token)
        .expect(200);
      expect(restored.body.payload.name).toBe("Servo Segundo");
      await db.campaign.update({
        where: { id: volunteer },
        data: { paused: false },
      });
    });
    it("não apaga ou reprograma um evento com inscrições", async () => {
      await request(app)
        .delete(`/api/v1/organizations/${orgA}/events/${eventA}`)
        .set(auth("organizer"))
        .expect(404);
      await request(app)
        .patch(`/api/v1/organizations/${orgA}/events/${eventA}/status`)
        .set(auth("organizer"))
        .send({ status: "DRAFT" })
        .expect(409);
    });
    it("menor exige responsável e autorização também na API", async () => {
      const created = await draft(volunteer, "Servo Menor", "44977771111");
      const data = { ...created.data, birthDate: "2015-01-01" };
      await request(app)
        .put(`/api/v1/public/drafts/${created.id}`)
        .set("X-Draft-Token", created.token)
        .send({ payload: data, health })
        .expect(200);
      await request(app)
        .post(`/api/v1/public/drafts/${created.id}/submit`)
        .set("X-Draft-Token", created.token)
        .expect(422);
      await request(app)
        .put(`/api/v1/public/drafts/${created.id}`)
        .set("X-Draft-Token", created.token)
        .send({
          payload: {
            ...data,
            guardianName: "Responsável de Teste",
            guardianPhone: "44977772222",
            guardianRelationship: "Mãe",
            guardianAuthorization: true,
          },
          health,
        })
        .expect(200);
      await request(app)
        .post(`/api/v1/public/drafts/${created.id}/submit`)
        .set("X-Draft-Token", created.token)
        .expect(200);
    });
    it("inscrição sem e-mail não cria conta e só ganha vínculo por revisão autorizada", async () => {
      const created = await draft(volunteer, "Servo Sem Email", "44977773333");
      const { email: _, ...data } = created.data;
      await request(app)
        .put(`/api/v1/public/drafts/${created.id}`)
        .set("X-Draft-Token", created.token)
        .send({ payload: data, health })
        .expect(200);
      const sent = await request(app)
        .post(`/api/v1/public/drafts/${created.id}/submit`)
        .set("X-Draft-Token", created.token)
        .expect(200);
      const record = await db.registration.findUniqueOrThrow({
        where: { id: sent.body.id },
      });
      expect(record.accountId).toBeNull();
      await request(app)
        .post(`/api/v1/me/drafts/${created.id}/claim`)
        .set(auth("participant"))
        .set("X-Draft-Token", created.token)
        .expect(403);
      const body = {
        email: identities.other.email,
        reason: "Identidade conferida pela coordenação no teste",
      };
      await request(app)
        .post(`/api/v1/organizations/${orgA}/registrations/${record.id}/link`)
        .set(auth("secretary"))
        .send(body)
        .expect(403);
      await request(app)
        .post(`/api/v1/organizations/${orgB}/registrations/${record.id}/link`)
        .set(auth("other"))
        .send(body)
        .expect(404);
      await request(app)
        .post(`/api/v1/organizations/${orgA}/registrations/${record.id}/link`)
        .set(auth("organizer"))
        .send(body)
        .expect(200);
      expect(
        (await db.registration.findUniqueOrThrow({ where: { id: record.id } }))
          .accountId,
      ).toBe(identities.other.id);
      expect(
        await db.auditLog.count({
          where: {
            entityId: record.id,
            action: "REGISTRATION_LINKED_BY_REVIEW",
          },
        }),
      ).toBe(1);
    });
    it("migrations habilitam RLS em todas as tabelas de negócio", async () => {
      const tables = await db.$queryRaw<
        { tablename: string; rowsecurity: boolean }[]
      >`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname IN ('public', 'acesso', 'organizacoes', 'pessoas', 'eventos', 'inscricoes', 'saude', 'arquivos') AND tablename <> '_prisma_migrations'`;
      expect(tables.length).toBe(19);
      expect(tables.every((table) => table.rowsecurity)).toBe(true);
    });
  },
);
