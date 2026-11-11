import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { DeliveryResult } from "../src/core/decision-mail.js";

const url = process.env.TEST_NOTICE_DATABASE_URL;
(url ? describe : describe.skip)(
  "Aceites e recusas — avisos, resposta do candidato e envio sem duplicação",
  () => {
    if (url && new URL(url).pathname !== "/fac_notice_tests")
      throw new Error("Use apenas fac_notice_tests.");
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_notice_tests",
    });
    const users = Object.fromEntries(
      ["organizer", "other", "secretary"].map((name) => [
        name,
        { id: randomUUID(), email: `${name}@notice.test` },
      ]),
    );
    const messages: {
      to: string;
      subject: string;
      text: string;
      messageId: string;
    }[] = [];
    let delivery: DeliveryResult = "ENVIADA";
    const app = createApp({
      db,
      eventsEnabled: false,
      camperRegistrationsEnabled: false,
      volunteerRegistrationsEnabled: true,
      rateLimits: false,
      decisionNotificationsEnabled: true,
      decisionLinkSecret: "segredo-exclusivo-do-teste-de-avisos-123456789",
      decisionEmail: {
        async send(message) {
          messages.push(message);
          return delivery;
        },
      },
      resolveIdentity: async (token) => users[token] ?? null,
    });
    const auth = (name = "organizer") => ({ Authorization: `Bearer ${name}` });
    let org: string,
      otherOrg: string,
      eventId: string,
      campaignId: string,
      formId: string,
      registrationId: string,
      noticeId: string,
      token: string;
    const base = (id = registrationId) =>
      `/api/v1/organizations/${org}/registrations/${id}`;
    const publicPath = (id = noticeId) =>
      `/api/v1/public/decision-responses/${id}`;
    async function candidate(withEmail = true) {
      const draft = await db.draft.create({
        data: {
          campaignId,
          formVersionId: formId,
          tokenHash: randomUUID().replaceAll("-", "").repeat(2),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const person = await db.person.create({
        data: {
          organizationId: org,
          name: "Pessoa do teste de avisos",
          phone: "44999999999",
          birthDate: new Date("1990-01-01"),
        },
      });
      return (
        await db.registration.create({
          data: {
            personId: person.id,
            campaignId,
            draftId: draft.id,
            formVersionId: formId,
            protocol: `AVISO-${randomUUID()}`,
            snapshot: {
              name: person.name,
              phone: person.phone,
              email: withEmail ? "candidato@example.test" : "",
            },
          },
        })
      ).id;
    }
    async function status(id: string, next: string) {
      return request(app)
        .patch(`${base(id)}/status`)
        .set(auth())
        .send({
          status: next,
          reason: "Motivo interno que não será enviado ao candidato",
        });
    }
    beforeAll(async () => {
      await db.account.createMany({ data: Object.values(users) });
      org = (
        await db.organization.create({
          data: {
            name: "Paróquia Avisos A",
            city: "Toledo",
            state: "PR",
            contact: "Teste",
          },
        })
      ).id;
      otherOrg = (
        await db.organization.create({
          data: {
            name: "Paróquia Avisos B",
            city: "Toledo",
            state: "PR",
            contact: "Teste",
          },
        })
      ).id;
      await db.membership.createMany({
        data: [
          {
            organizationId: org,
            accountId: users.organizer.id,
            role: "ORGANIZER",
          },
          {
            organizationId: org,
            accountId: users.secretary.id,
            role: "SECRETARY",
          },
          {
            organizationId: otherOrg,
            accountId: users.other.id,
            role: "ORGANIZER",
          },
        ],
      });
      const type = await db.eventType.create({
        data: { organizationId: org, name: "FAC" },
      });
      const event = await db.event.create({
        data: {
          organizationId: org,
          typeId: type.id,
          name: "FAC — Avisos",
          description: "Evento de teste",
          city: "Toledo",
          location: "Chácara",
          startsAt: new Date("2027-06-01"),
          endsAt: new Date("2027-06-03"),
          status: "PUBLISHED",
        },
      });
      eventId = event.id;
      campaignId = (
        await db.campaign.create({
          data: {
            eventId,
            kind: "VOLUNTEER",
            opensAt: new Date(Date.now() - 86400000),
            closesAt: new Date(Date.now() + 86400000),
            capacity: 10,
          },
        })
      ).id;
      formId = (
        await db.formVersion.create({
          data: { campaignId, version: 1, config: {}, publishedAt: new Date() },
        })
      ).id;
      registrationId = await candidate();
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    it("SQL manual cria uma tabela protegida, com um aviso por decisão", async () => {
      const tables = await db.$queryRaw<
        { rowsecurity: boolean }[]
      >`SELECT rowsecurity FROM pg_tables WHERE schemaname IN ('acesso','organizacoes','pessoas','eventos','inscricoes','saude','arquivos')`;
      expect(tables).toHaveLength(24);
      expect(tables.every((t) => t.rowsecurity)).toBe(true);
    });
    it("aceite gera e envia link individual depois de salvar decisão e histórico", async () => {
      await status(registrationId, "REVIEW").then((r) =>
        expect(r.status).toBe(200),
      );
      await status(registrationId, "APPROVED").then((r) =>
        expect(r.status).toBe(200),
      );
      const state = (
        await request(app)
          .get(`${base()}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body;
      noticeId = state.notice.id;
      token = new URLSearchParams(new URL(state.notice.link).hash.slice(1)).get(
        "token",
      )!;
      expect(messages).toHaveLength(1);
      expect(messages[0].to).toBe("candidato@example.test");
      expect(messages[0].text).toContain("foi aceita!");
      expect(messages[0].text).toContain(state.notice.shortLink);
      expect(state.notice.shortLink.length).toBeLessThan(
        state.notice.link.length,
      );
      expect(new URL(state.notice.shortLink).pathname).toBe("/r");
      const packed = Buffer.from(
        new URL(state.notice.shortLink).hash.slice(1),
        "base64url",
      );
      expect(packed).toHaveLength(48);
      expect(packed.subarray(0, 16).toString("hex")).toBe(
        noticeId.replaceAll("-", ""),
      );
      expect(packed.subarray(16).toString("base64url")).toBe(token);
      expect(messages[0].text).not.toContain("Motivo interno");
      expect(messages[0].text).not.toContain("saúde");
      expect(state.notice.message).toContain(
        "Departamento alocado: A definir pela organização.",
      );
      expect(state.notice.emailStatus).toBe("ENVIADA");
      const row = await db.decisionNotice.findUniqueOrThrow({
        where: { id: noticeId },
      });
      expect(row.tokenHash).not.toBe(token);
      expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(await db.decisionNotice.count({ where: { registrationId } })).toBe(
        1,
      );
    });
    it("consultar/reenviar não duplica; outro organizador e secretaria não acessam os links", async () => {
      const count = messages.length;
      await Promise.all([
        request(app)
          .post(`${base()}/decision-notice/email`)
          .set(auth())
          .expect(200),
        request(app)
          .post(`${base()}/decision-notice/email`)
          .set(auth())
          .expect(200),
      ]);
      expect(messages.length).toBe(count);
      await request(app)
        .get(`${base()}/decision-notice`)
        .set(auth("other"))
        .expect(403);
      await request(app)
        .get(`${base()}/decision-notice`)
        .set(auth("secretary"))
        .expect(403);
      await request(app)
        .get(
          `/api/v1/organizations/${otherOrg}/registrations/${registrationId}/decision-notice`,
        )
        .set(auth("other"))
        .expect(404);
      await request(app)
        .post(publicPath() + "/view")
        .send({ token: "z".repeat(43) })
        .expect(404);
    });
    it("WhatsApp fica pendente até declaração explícita; texto inclui o link codificado", async () => {
      const state = (
        await request(app)
          .get(`${base()}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body;
      const whatsapp = new URL(state.notice.whatsappLink);
      expect(whatsapp.pathname).toBe("/5544999999999");
      expect(whatsapp.searchParams.get("text")).toContain(
        state.notice.shortLink,
      );
      const packed = Buffer.from(
        new URL(state.notice.shortLink).hash.slice(1),
        "base64url",
      );
      const originalToken = packed.subarray(16).toString("base64url");
      await request(app)
        .post(publicPath() + "/view")
        .send({ token: originalToken })
        .expect(200);
      const tampered = Buffer.from(packed.subarray(16));
      tampered[0] ^= 1;
      await request(app)
        .post(publicPath() + "/view")
        .send({ token: tampered.toString("base64url") })
        .expect(404);
      expect(state.notice.whatsappSentAt).toBeNull();
      await request(app)
        .post(`${base()}/decision-notice/whatsapp-sent`)
        .set(auth())
        .expect(200);
      expect(
        (await db.decisionNotice.findUniqueOrThrow({ where: { id: noticeId } }))
          .whatsappSentAt,
      ).not.toBeNull();
    });
    it("prepara WhatsApp com o departamento atual e mantém o link e o controle de envio ao realocar", async () => {
      const id = await candidate();
      delivery = "SEM_CONFIGURACAO";
      expect((await status(id, "REVIEW")).status).toBe(200);
      expect((await status(id, "APPROVED")).status).toBe(200);
      const initial = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      expect(initial.message).toContain(
        "Departamento alocado: A definir pela organização.",
      );
      const teamA = await db.team.create({
        data: { eventId, name: "SECRETARIA & ACOLHIDA", capacity: 2 },
      });
      const teamB = await db.team.create({
        data: { eventId, name: "ANJOS", capacity: 2 },
      });
      const sentBeforeAllocation = messages.length;
      await request(app)
        .put(`${base(id)}/team`)
        .set(auth())
        .send({ teamId: teamA.id })
        .expect(200);
      let notice = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      expect(notice.message).toContain(
        "Departamento alocado: SECRETARIA & ACOLHIDA.",
      );
      expect(notice.message).not.toContain(
        "A organização finalizará sua equipe",
      );
      expect(new URL(notice.whatsappLink).searchParams.get("text")).toBe(
        notice.message,
      );
      expect(notice.link).toBe(initial.link);
      expect(notice.whatsappSentAt).toBeNull();
      expect(messages.length).toBe(sentBeforeAllocation);
      delivery = "ENVIADA";
      await request(app)
        .post(`${base(id)}/decision-notice/email`)
        .set(auth())
        .expect(200);
      expect(messages.at(-1)!.text).toContain(
        "Departamento alocado: SECRETARIA & ACOLHIDA.",
      );
      const count = messages.length;
      await request(app)
        .put(`${base(id)}/team`)
        .set(auth())
        .send({ teamId: teamB.id })
        .expect(200);
      notice = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      expect(notice.message).toContain("Departamento alocado: ANJOS.");
      expect(notice.message).not.toContain("SECRETARIA & ACOLHIDA");
      expect(notice.link).toBe(initial.link);
      expect(notice.whatsappSentAt).toBeNull();
      expect(messages.length).toBe(count);
      expect((await status(id, "REJECTED")).status).toBe(200);
      const refusal = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      expect(refusal.message).toContain("Não foi dessa vez!");
      expect(refusal.message).not.toContain("Departamento alocado:");
    });
    it("abrir o link não confirma; resposta é explícita, sem conta e idempotente", async () => {
      const response = await request(app)
        .post(publicPath() + "/view")
        .send({ token })
        .expect(200);
      expect(response.body.confirmedAt).toBeNull();
      expect(response.body.email).toBeUndefined();
      expect(response.body.phone).toBeUndefined();
      const team = await db.team.create({
        data: { eventId, name: "Cozinha", capacity: 2 },
      });
      await request(app)
        .put(`${base()}/team`)
        .set(auth())
        .send({ teamId: team.id })
        .expect(200);
      await status(registrationId, "CONFIRMED").then((r) => {
        expect(r.status).toBe(409);
        expect(r.body.error.code).toBe("CANDIDATE_CONFIRMATION_REQUIRED");
      });
      const results = await Promise.all([
        request(app).post(publicPath()).send({ token }).expect(200),
        request(app).post(publicPath()).send({ token }).expect(200),
      ]);
      expect(results[0].body.confirmedAt).toBeTruthy();
      expect(results[1].body.confirmedAt).toBe(results[0].body.confirmedAt);
      expect(
        (
          await db.registration.findUniqueOrThrow({
            where: { id: registrationId },
          })
        ).status,
      ).toBe("APPROVED");
      await status(registrationId, "CONFIRMED").then((r) =>
        expect(r.status).toBe(200),
      );
    });
    it("falha no e-mail preserva a decisão e permite uma única tentativa simultânea", async () => {
      const id = await candidate();
      delivery = "FALHA";
      await status(id, "REVIEW");
      await status(id, "APPROVED");
      let state = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body;
      expect(state.notice.emailStatus).toBe("FALHA");
      expect(state.notice.emailSentAt).toBeNull();
      const count = messages.length;
      delivery = "ENVIADA";
      await Promise.all([
        request(app)
          .post(`${base(id)}/decision-notice/email`)
          .set(auth())
          .expect(200),
        request(app)
          .post(`${base(id)}/decision-notice/email`)
          .set(auth())
          .expect(200),
      ]);
      expect(messages.length).toBe(count + 1);
      state = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body;
      expect(state.notice.emailStatus).toBe("ENVIADA");
    });
    it("recusa envia Não foi dessa vez, invalida aceite antigo e não permite confirmação", async () => {
      const id = await candidate();
      await status(id, "REVIEW");
      await status(id, "APPROVED");
      const previous = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
      ).body.notice;
      const previousToken = new URLSearchParams(
        new URL(previous.link).hash.slice(1),
      ).get("token");
      await status(id, "REJECTED").then((r) => expect(r.status).toBe(200));
      const current = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
      ).body.notice;
      expect(current.kind).toBe("RECUSA");
      expect(current.message).toContain("Não foi dessa vez!");
      expect(current.message).not.toContain("Motivo interno");
      expect(messages.at(-1)!.text).toContain("Não foi dessa vez!");
      expect(current.emailStatus).toBe("ENVIADA");
      await request(app)
        .post(publicPath(previous.id) + "/view")
        .send({ token: previousToken })
        .expect(410);
      const refusalToken = new URLSearchParams(
        new URL(current.link).hash.slice(1),
      ).get("token");
      await request(app)
        .post(publicPath(current.id) + "/view")
        .send({ token: refusalToken })
        .expect(200);
      await request(app)
        .post(publicPath(current.id))
        .send({ token: refusalToken })
        .expect(409);
    });
    it("sem e-mail prepara WhatsApp; link expirado pode ser renovado sem reutilizar o anterior", async () => {
      const id = await candidate(false);
      const count = messages.length;
      await status(id, "REVIEW");
      await status(id, "APPROVED");
      const state = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
      ).body;
      expect(state.notice.emailStatus).toBe("SEM_EMAIL");
      expect(messages.length).toBe(count);
      const expiredToken = new URLSearchParams(
        new URL(state.notice.link).hash.slice(1),
      ).get("token");
      await db.decisionNotice.update({
        where: { id: state.notice.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await request(app)
        .post(publicPath(state.notice.id))
        .send({ token: expiredToken })
        .expect(410);
      const renewed = (
        await request(app)
          .post(`${base(id)}/decision-notice/renew`)
          .set(auth())
          .expect(200)
      ).body;
      const renewedToken = new URLSearchParams(
        new URL(renewed.notice.link).hash.slice(1),
      ).get("token");
      expect(renewedToken).not.toBe(expiredToken);
      expect(renewed.notice.shortLink).not.toBe(state.notice.shortLink);
      await request(app)
        .post(publicPath(state.notice.id))
        .send({ token: expiredToken })
        .expect(404);
      await request(app)
        .post(publicPath(state.notice.id))
        .send({ token: renewedToken })
        .expect(200);
    });
    it("SMTP sem configuração mantém a recusa registrada sem alegar envio", async () => {
      const id = await candidate();
      delivery = "SEM_CONFIGURACAO";
      await status(id, "REJECTED").then((r) => expect(r.status).toBe(200));
      const state = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body;
      expect(state.notice.kind).toBe("RECUSA");
      expect(state.notice.emailStatus).toBe("SEM_CONFIGURACAO");
      expect(state.notice.emailSentAt).toBeNull();
      expect(state.notice.whatsappLink).toContain("wa.me");
      delivery = "ENVIADA";
    });
    it("cancelamento e suspensão bloqueiam respostas e ações administrativas", async () => {
      await status(registrationId, "CANCELLED").then((r) =>
        expect(r.status).toBe(200),
      );
      await request(app).post(publicPath()).send({ token }).expect(410);
      await db.membership.updateMany({
        where: { accountId: users.organizer.id },
        data: { active: false },
      });
      await request(app)
        .post(`${base()}/decision-notice/email`)
        .set(auth())
        .expect(403);
    });
  },
);
