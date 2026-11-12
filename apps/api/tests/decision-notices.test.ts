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
    async function candidate(
      withEmail = true,
      options: {
        name?: string;
        createdAt?: Date;
        submittedAt?: string;
        campaign?: string;
        form?: string;
      } = {},
    ) {
      const draft = await db.draft.create({
        data: {
          campaignId: options.campaign ?? campaignId,
          formVersionId: options.form ?? formId,
          tokenHash: randomUUID().replaceAll("-", "").repeat(2),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const person = await db.person.create({
        data: {
          organizationId: org,
          name: options.name ?? "Pessoa do teste de avisos",
          phone: "44999999999",
          birthDate: new Date("1990-01-01"),
        },
      });
      return (
        await db.registration.create({
          data: {
            personId: person.id,
            campaignId: options.campaign ?? campaignId,
            draftId: options.submittedAt !== undefined ? null : draft.id,
            formVersionId: options.form ?? formId,
            protocol: `AVISO-${randomUUID()}`,
            createdAt: options.createdAt,
            ...(options.submittedAt !== undefined
              ? {
                  origin: "IMPORT",
                  importData: { source: { submittedAt: options.submittedAt } },
                }
              : {}),
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
    const spiritualityStartsAt = new Date("2026-11-14T17:00:00Z");
    async function withSpirituality(run: () => Promise<void>) {
      await db.event.update({
        where: { id: eventId },
        data: { spiritualityStartsAt },
      });
      try {
        await run();
      } finally {
        await db.event.update({
          where: { id: eventId },
          data: { spiritualityStartsAt: null },
        });
      }
    }
    async function acceptedNotice(id: string) {
      expect((await status(id, "APPROVED")).status).toBe(200);
      const notice = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      return {
        ...notice,
        token: new URLSearchParams(new URL(notice.link).hash.slice(1)).get(
          "token",
        )!,
      };
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
      expect(tables).toHaveLength(26);
      expect(tables.every((t) => t.rowsecurity)).toBe(true);
    });
    it("aceite direto prepara link sem enviar; envio exige ação explícita", async () => {
      await status(registrationId, "APPROVED").then((r) =>
        expect(r.status).toBe(200),
      );
      expect(messages).toHaveLength(0);
      const pending = (
        await request(app)
          .get(`${base()}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      expect(pending.emailStatus).toBe("PENDENTE");
      expect(pending.emailSentAt).toBeNull();
      const history = await db.statusHistory.findMany({
        where: { registrationId },
      });
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        fromStatus: "RECEIVED",
        toStatus: "APPROVED",
        actorId: users.organizer.id,
      });
      await request(app)
        .post(`${base()}/decision-notice/email`)
        .set(auth())
        .expect(200);
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
      await request(app)
        .post(`${base(id)}/decision-notice/email`)
        .set(auth())
        .expect(200);
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
      await request(app)
        .post(`${base(id)}/decision-notice/email`)
        .set(auth())
        .expect(200);
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
      await request(app)
        .post(`${base(id)}/decision-notice/email`)
        .set(auth())
        .expect(200);
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
      await request(app)
        .post(`${base(id)}/decision-notice/email`)
        .set(auth())
        .expect(200);
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
    it("pesquisa e ordena o conjunto antes de paginar, filtra encerradas e valida datas históricas", async () => {
      const ids: string[] = [];
      for (let i = 0; i < 26; i++) {
        const id = await candidate(true, {
          name: `Lista Árvore ${String(i).padStart(2, "0")}`,
          createdAt: new Date(Date.UTC(2025, 0, i + 1)),
          ...(i === 1
            ? { submittedAt: "2021-01-01T12:00:00.000Z" }
            : i === 25
              ? { submittedAt: "2020-02-30T00:00:00.000Z" }
              : {}),
        });
        ids.push(id);
        const record = await db.registration.findUniqueOrThrow({
          where: { id },
        });
        await db.person.update({
          where: { id: record.personId },
          data: { name: `Lista Árvore ${String(i).padStart(2, "0")}` },
        });
        await db.registration.update({
          where: { id },
          data: {
            createdAt: new Date(Date.UTC(2025, 0, i + 1)),
            status:
              i === 1
                ? "APPROVED"
                : i === 7
                  ? "CONFIRMED"
                  : i === 2
                    ? "REJECTED"
                    : i === 3
                      ? "CANCELLED"
                      : i === 4
                        ? "REVIEW"
                        : i === 5
                          ? "WAITLIST"
                          : "RECEIVED",
          },
        });
      }
      const list = (query: Record<string, string | number>) =>
        request(app)
          .get(`/api/v1/organizations/${org}/registrations`)
          .set(auth())
          .query({ q: "lista arvore", eventId, pageSize: 5, ...query });
      const asc = (await list({ sort: "NAME_ASC", page: 2 }).expect(200)).body;
      expect(asc.total).toBe(26);
      expect(asc.items.map((r: { id: string }) => r.id)).toEqual(
        ids.slice(5, 10),
      );
      const desc = (await list({ sort: "NAME_DESC" }).expect(200)).body;
      expect(desc.items.map((r: { id: string }) => r.id)).toEqual(
        ids.slice(21).reverse(),
      );
      const accepted = (
        await list({ sort: "ACCEPTED_FIRST", includeClosed: "false" }).expect(
          200,
        )
      ).body;
      expect(accepted.total).toBe(24);
      expect(
        accepted.items.slice(0, 2).map((r: { id: string }) => r.id),
      ).toEqual([ids[1], ids[7]]);
      expect(accepted.items.map((r: { id: string }) => r.id)).not.toContain(
        ids[2],
      );
      for (const [status, index] of Object.entries({
        RECEIVED: 0,
        REVIEW: 4,
        APPROVED: 1,
        CONFIRMED: 7,
        WAITLIST: 5,
        REJECTED: 2,
        CANCELLED: 3,
      })) {
        const result = (
          await list({ status, sort: "NAME_ASC", pageSize: 100 }).expect(200)
        ).body;
        expect(
          result.items.some((r: { id: string }) => r.id === ids[index]),
        ).toBe(true);
        expect(
          result.items.every((r: { status: string }) => r.status === status),
        ).toBe(true);
      }
      expect(
        (await list({ completeness: "PENDING", sort: "NAME_ASC" }).expect(200))
          .body.total,
      ).toBe(2);
      expect(
        (await list({ completeness: "COMPLETE", sort: "NAME_ASC" }).expect(200))
          .body.total,
      ).toBe(24);
      const chronology = (
        await list({ sort: "RECEIVED_ASC", pageSize: 100 }).expect(200)
      ).body.items;
      expect(chronology[0].id).toBe(ids[1]);
      expect(chronology.at(-1).id).toBe(ids[25]);
      for (const submittedAt of [
        "invalid date",
        "0000-01-01T00:00:00Z",
        "2020-13-01T00:00:00Z",
        "2021-02-29T00:00:00.000Z",
      ]) {
        const name = `Data inválida ${submittedAt}`;
        const native = await candidate(true, {
          name,
          createdAt: new Date("2029-01-01"),
        });
        const imported = await candidate(true, {
          name,
          createdAt: new Date("2030-01-01"),
          submittedAt,
        });
        expect(
          (
            await list({ q: name, sort: "RECEIVED_ASC", pageSize: 100 }).expect(
              200,
            )
          ).body.items.map((r: { id: string }) => r.id),
        ).toEqual([native, imported]);
      }
      expect(
        (await list({ q: "Lista Árvore 25", sort: "NAME_ASC" }).expect(200))
          .body.total,
      ).toBe(1);
      expect(
        (await list({ q: "%", sort: "NAME_ASC" }).expect(200)).body.total,
      ).toBe(0);
      expect(
        (await list({ q: "' OR 1=1 --", sort: "NAME_ASC" }).expect(200)).body
          .total,
      ).toBe(0);
      await list({ sort: "DROP TABLE" }).expect(422);
      await list({ includeClosed: "yes" }).expect(422);
      await request(app)
        .get(`/api/v1/organizations/${org}/registrations`)
        .query({ q: "Lista", sort: "NAME_ASC" })
        .set(auth("other"))
        .expect(403);
      const summary = asc.items[0].decisionSummary;
      expect(summary).toMatchObject({ ready: true, notice: null });
    });
    it("pesquisa respeita a liberação de servos e não retorna outro evento ou organização", async () => {
      const camper = await db.campaign.create({
        data: {
          eventId,
          kind: "CAMPER",
          opensAt: new Date("2026-01-01"),
          closesAt: new Date("2027-01-01"),
        },
      });
      const form = await db.formVersion.create({
        data: { campaignId: camper.id, version: 1, config: {} },
      });
      const volunteerId = await candidate(true, { name: "Escopo Pesquisa" });
      await candidate(true, {
        name: "Escopo Pesquisa",
        campaign: camper.id,
        form: form.id,
      });
      const path = `/api/v1/organizations/${org}/registrations`;
      const query = { q: "Escopo Pesquisa", sort: "NAME_ASC", eventId };
      const limited = (
        await request(app).get(path).query(query).set(auth()).expect(200)
      ).body;
      expect(limited.items.map((r: { id: string }) => r.id)).toEqual([
        volunteerId,
      ]);
      expect(
        (
          await request(app)
            .get(path)
            .query({ ...query, campaignId: camper.id })
            .set(auth())
            .expect(200)
        ).body.total,
      ).toBe(0);
      const broadApp = createApp({
        db,
        eventsEnabled: true,
        rateLimits: false,
        decisionNotificationsEnabled: false,
        resolveIdentity: async (token) => users[token] ?? null,
      });
      expect(
        (await request(broadApp).get(path).query(query).set(auth()).expect(200))
          .body.total,
      ).toBe(2);
      expect(
        (
          await request(app)
            .get(path)
            .query({ ...query, eventId: randomUUID() })
            .set(auth())
            .expect(200)
        ).body.total,
      ).toBe(0);
      const otherPath = `/api/v1/organizations/${otherOrg}/registrations`;
      expect(
        (
          await request(app)
            .get(otherPath)
            .query(query)
            .set(auth("other"))
            .expect(200)
        ).body.total,
      ).toBe(0);
    });
    it("lista resume presença e envio sem expor links ou credenciais", async () => {
      const id = await candidate();
      await status(id, "APPROVED").then((r) => expect(r.status).toBe(200));
      const summary = async () => {
        const result = await request(app)
          .get(`/api/v1/organizations/${org}/registrations`)
          .query({ eventId, sort: "ACCEPTED_FIRST", pageSize: 100 })
          .set(auth())
          .expect(200);
        return result.body.items.find((r: { id: string }) => r.id === id)
          .decisionSummary;
      };
      expect((await summary()).notice).toMatchObject({
        active: true,
        expired: false,
        emailStatus: "PENDENTE",
        confirmedAt: null,
        emailSentAt: null,
        whatsappSentAt: null,
      });
      const notice = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      expect((await summary()).notice.whatsappSentAt).toBeNull();
      await request(app)
        .post(`${base(id)}/decision-notice/whatsapp-sent`)
        .set(auth())
        .expect(200);
      expect((await summary()).notice.whatsappSentAt).not.toBeNull();
      const currentToken = new URLSearchParams(
        new URL(notice.link).hash.slice(1),
      ).get("token");
      await request(app)
        .post(publicPath(notice.id))
        .send({ token: currentToken })
        .expect(200);
      const data = await summary();
      expect(data.notice.confirmedAt).not.toBeNull();
      expect(JSON.stringify(data)).not.toMatch(
        /token|hash|whatsappLink|shortLink|message|"link"/i,
      );
      const time = Date.now();
      let newestRevokedId = "";
      for (const offset of [-86400000, 1000]) {
        const history = await db.statusHistory.create({
          data: {
            registrationId: id,
            actorId: users.organizer.id,
            fromStatus: "REVIEW",
            toStatus: "APPROVED",
            reason: "Histórico sintético para conferir resumo de avisos",
          },
        });
        const revoked = await db.decisionNotice.create({
          data: {
            registrationId: id,
            historyId: history.id,
            createdById: users.organizer.id,
            kind: "ACEITE",
            tokenHash: randomUUID().replaceAll("-", "").repeat(2),
            createdAt: new Date(time + offset),
            revokedAt: new Date(time + offset + 1),
            expiresAt: new Date(time + 86400000),
          },
        });
        if (offset > 0) newestRevokedId = revoked.id;
      }
      // An active notice wins even when a newer revoked notice exists.
      expect((await summary()).notice.id).toBe(notice.id);
      await status(id, "CANCELLED");
      const fallback = (await summary()).notice;
      expect(fallback.active).toBe(false);
      expect(fallback.id).toBe(newestRevokedId);
    });
    it("corrige estados anteriores para recebida/análise com histórico, sem atalhos ou envio automático", async () => {
      const sentBefore = messages.length;
      for (const source of [
        "REVIEW",
        "APPROVED",
        "CONFIRMED",
        "WAITLIST",
        "REJECTED",
        "CANCELLED",
      ] as const) {
        for (const target of ["RECEIVED", "REVIEW"] as const) {
          if (source === target) continue;
          const id = await candidate();
          await db.registration.update({
            where: { id },
            data: { status: source },
          });
          const before = await db.registration.findUniqueOrThrow({
            where: { id },
          });
          await status(id, target).then((response) =>
            expect(response.status).toBe(200),
          );
          const after = await db.registration.findUniqueOrThrow({
            where: { id },
          });
          expect(after.status).toBe(target);
          expect(after.snapshot).toEqual(before.snapshot);
          expect(after.importData).toEqual(before.importData);
          expect(
            await db.statusHistory.findFirst({ where: { registrationId: id } }),
          ).toMatchObject({
            fromStatus: source,
            toStatus: target,
            actorId: users.organizer.id,
            reason: "Motivo interno que não será enviado ao candidato",
          });
          expect(
            await db.auditLog.findFirst({
              where: { entityId: id, action: `REGISTRATION_${target}` },
            }),
          ).not.toBeNull();
          expect(
            await db.decisionNotice.count({ where: { registrationId: id } }),
          ).toBe(0);
        }
      }
      const rejected = await candidate();
      await status(rejected, "REJECTED").then((response) =>
        expect(response.status).toBe(200),
      );
      // A terminal decision can be reopened, but cannot jump straight back to acceptance.
      await status(rejected, "APPROVED").then((response) =>
        expect(response.status).toBe(409),
      );
      expect(messages.length).toBe(sentBefore);
    });
    it("reabrir confirmação libera vaga, mantém indicação e evidências, revoga link e exige nova presença no aceite seguinte", async () => {
      const sentBefore = messages.length;
      const id = await candidate();
      const team = await db.team.create({
        data: { eventId, name: `CORREÇÃO ${randomUUID()}`, capacity: 1 },
      });
      const consent = await db.consent.create({
        data: {
          registrationId: id,
          version: "TESTE",
          termsText: "Termos fictícios aceitos anteriormente",
          accepted: true,
          guardianAuthorized: false,
          imageAuthorized: false,
        },
      });
      const health = await db.healthSubmission.create({
        data: { registrationId: id, data: { hasAllergies: false } },
      });
      const original = await db.registration.findUniqueOrThrow({
        where: { id },
      });
      await status(id, "APPROVED").then((response) =>
        expect(response.status).toBe(200),
      );
      await request(app)
        .put(`${base(id)}/team`)
        .set(auth())
        .send({ teamId: team.id })
        .expect(200);
      const previous = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      const previousToken = new URLSearchParams(
        new URL(previous.link).hash.slice(1),
      ).get("token");
      await request(app)
        .post(publicPath(previous.id))
        .send({ token: previousToken })
        .expect(200);
      await status(id, "CONFIRMED").then((response) =>
        expect(response.status).toBe(200),
      );
      await status(id, "RECEIVED").then((response) =>
        expect(response.status).toBe(200),
      );
      const reopened = await db.registration.findUniqueOrThrow({
        where: { id },
      });
      expect(reopened.teamId).toBe(team.id);
      expect(reopened.snapshot).toEqual(original.snapshot);
      expect(reopened.importData).toEqual(original.importData);
      expect(
        await db.consent.findUnique({ where: { registrationId: id } }),
      ).toEqual(consent);
      expect(
        await db.healthSubmission.findUnique({ where: { registrationId: id } }),
      ).toEqual(health);
      expect(
        await db.registration.count({
          where: { teamId: team.id, status: { in: ["APPROVED", "CONFIRMED"] } },
        }),
      ).toBe(0);
      const ended = await db.decisionNotice.findUniqueOrThrow({
        where: { id: previous.id },
      });
      expect(ended.revokedAt).not.toBeNull();
      expect(ended.confirmedAt).not.toBeNull();
      await request(app)
        .post(`${publicPath(previous.id)}/view`)
        .send({ token: previousToken })
        .expect(410);
      expect(
        await db.statusHistory.findFirst({
          where: {
            registrationId: id,
            fromStatus: "CONFIRMED",
            toStatus: "RECEIVED",
          },
        }),
      ).not.toBeNull();
      const other = await candidate();
      await status(other, "APPROVED").then((response) =>
        expect(response.status).toBe(200),
      );
      await request(app)
        .put(`${base(other)}/team`)
        .set(auth())
        .send({ teamId: team.id })
        .expect(200);
      await status(id, "APPROVED").then((response) =>
        expect(response.status).toBe(409),
      );
      expect(
        (await db.registration.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("RECEIVED");
      await status(other, "CANCELLED").then((response) =>
        expect(response.status).toBe(200),
      );
      await status(other, "REVIEW").then((response) =>
        expect(response.status).toBe(200),
      );
      expect(
        (await db.registration.findUniqueOrThrow({ where: { id: other } }))
          .teamId,
      ).toBeNull();
      await status(id, "APPROVED").then((response) =>
        expect(response.status).toBe(200),
      );
      const fresh = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      expect(fresh.id).not.toBe(previous.id);
      expect(fresh.confirmedAt).toBeNull();
      const confirmation = await status(id, "CONFIRMED");
      expect(confirmation.status).toBe(409);
      expect(confirmation.body.error.code).toBe(
        "CANDIDATE_CONFIRMATION_REQUIRED",
      );
      await request(app)
        .post(publicPath(previous.id))
        .send({ token: previousToken })
        .expect(410);
      await status(id, "REVIEW").then((response) =>
        expect(response.status).toBe(200),
      );
      expect(
        (await db.registration.findUniqueOrThrow({ where: { id } })).teamId,
      ).toBe(team.id);
      expect(
        await db.registration.count({
          where: { teamId: team.id, status: { in: ["APPROVED", "CONFIRMED"] } },
        }),
      ).toBe(0);
      expect(messages.length).toBe(sentBefore);
    });
    it("revoga recusa ao reabrir e não reativa o link antigo após nova decisão", async () => {
      const id = await candidate();
      await status(id, "REJECTED").then((response) =>
        expect(response.status).toBe(200),
      );
      const refusal = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      const refusalToken = new URLSearchParams(
        new URL(refusal.link).hash.slice(1),
      ).get("token");
      await status(id, "REVIEW").then((response) =>
        expect(response.status).toBe(200),
      );
      expect(
        (
          await db.decisionNotice.findUniqueOrThrow({
            where: { id: refusal.id },
          })
        ).revokedAt,
      ).not.toBeNull();
      await request(app)
        .post(`${publicPath(refusal.id)}/view`)
        .send({ token: refusalToken })
        .expect(410);
      await status(id, "RECEIVED").then((response) =>
        expect(response.status).toBe(200),
      );
      await status(id, "REJECTED").then((response) =>
        expect(response.status).toBe(200),
      );
      const fresh = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      expect(fresh.id).not.toBe(refusal.id);
      expect(fresh.kind).toBe("RECUSA");
      await request(app)
        .post(`${publicPath(refusal.id)}/view`)
        .send({ token: refusalToken })
        .expect(410);
    });
    it("revoga avisos ao reabrir mesmo sem configuração de envio e impede reativar o link antigo", async () => {
      const withoutSending = createApp({
        db,
        eventsEnabled: false,
        camperRegistrationsEnabled: false,
        volunteerRegistrationsEnabled: true,
        rateLimits: false,
        decisionNotificationsEnabled: false,
        resolveIdentity: async (token) => users[token] ?? null,
      });
      const sentBefore = messages.length;
      for (const source of ["APPROVED", "REJECTED"]) {
        const id = await candidate();
        await status(id, source).then((response) =>
          expect(response.status).toBe(200),
        );
        const previous = (
          await request(app)
            .get(`${base(id)}/decision-notice`)
            .set(auth())
            .expect(200)
        ).body.notice;
        const previousToken = new URLSearchParams(
          new URL(previous.link).hash.slice(1),
        ).get("token");
        await request(withoutSending)
          .patch(`${base(id)}/status`)
          .set(auth())
          .send({
            status: "RECEIVED",
            reason: "Correção com envio indisponível",
          })
          .expect(200);
        expect(
          (
            await db.decisionNotice.findUniqueOrThrow({
              where: { id: previous.id },
            })
          ).revokedAt,
        ).not.toBeNull();
        // Even reaccepting without a sending secret must not make the previous
        // personal link usable when the configured server handles it again.
        await request(withoutSending)
          .patch(`${base(id)}/status`)
          .set(auth())
          .send({
            status: source,
            reason: "Decisão revista sem envio automático",
          })
          .expect(200);
        await request(app)
          .post(`${publicPath(previous.id)}/view`)
          .send({ token: previousToken })
          .expect(410);
      }
      expect(messages.length).toBe(sentBefore);
    });
    it("mantém bloqueios de reabertura para eventos encerrados/cancelados e contas sem permissão", async () => {
      const id = await candidate();
      await status(id, "APPROVED").then((response) =>
        expect(response.status).toBe(200),
      );
      const noticesBefore = await db.decisionNotice.findMany({
        where: { registrationId: id },
      });
      const historiesBefore = await db.statusHistory.count({
        where: { registrationId: id },
      });
      for (const actor of ["other", "secretary"]) {
        await request(app)
          .patch(`${base(id)}/status`)
          .set(auth(actor))
          .send({ status: "RECEIVED", reason: "Correção indevida" })
          .expect(403);
      }
      try {
        for (const eventStatus of ["CANCELLED", "COMPLETED"] as const) {
          await db.event.update({
            where: { id: eventId },
            data: { status: eventStatus },
          });
          for (const target of ["RECEIVED", "REVIEW"]) {
            const denied = await status(id, target);
            expect(denied.status).toBe(409);
            expect(denied.body.error.message).toContain(
              "não aceita reabertura",
            );
          }
        }
      } finally {
        await db.event.update({
          where: { id: eventId },
          data: { status: "PUBLISHED" },
        });
      }
      expect(
        (await db.registration.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("APPROVED");
      expect(
        await db.statusHistory.count({ where: { registrationId: id } }),
      ).toBe(historiesBefore);
      expect(
        await db.decisionNotice.findMany({ where: { registrationId: id } }),
      ).toEqual(noticesBefore);
    });
    it("registra desistência e mudança de resposta sem alterar a candidatura ou enviar mensagens", async () => {
      const id = await candidate();
      expect((await status(id, "APPROVED")).status).toBe(200);
      const notice = (
        await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200)
      ).body.notice;
      const secret = new URLSearchParams(
        new URL(notice.link).hash.slice(1),
      ).get("token")!;
      const sent = messages.length;
      const post = () =>
        request(app)
          .post(publicPath(notice.id))
          .send({ token: secret, resposta: "NAO_IREI" });
      const results = await Promise.all([post(), post()]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(results[0].body.declinedAt).toBeTruthy();
      expect(
        (await db.registration.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("APPROVED");
      expect(messages).toHaveLength(sent);
      expect((await status(id, "CONFIRMED")).status).toBe(409);
      const filtered = await request(app)
        .get(`/api/v1/organizations/${org}/registrations`)
        .query({ eventId, presence: "NAO_IREI" })
        .set(auth())
        .expect(200);
      expect(
        filtered.body.items.map((item: { id: string }) => item.id),
      ).toContain(id);
      const history = () =>
        db.$queryRaw<
          { resposta: string }[]
        >`SELECT resposta FROM inscricoes.respostas_presenca_historico WHERE aviso_id=${notice.id}::uuid ORDER BY respondido_em`;
      expect(await history()).toEqual([{ resposta: "NAO_IREI" }]);
      await request(app)
        .post(publicPath(notice.id))
        .send({ token: secret, resposta: "VOU" })
        .expect(200);
      expect(await history()).toEqual([
        { resposta: "NAO_IREI" },
        { resposta: "VOU" },
      ]);
      await db.decisionNotice.update({
        where: { id: notice.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await request(app)
        .post(publicPath(notice.id) + "/view")
        .send({ token: secret })
        .expect(200);
      await request(app)
        .post(publicPath(notice.id))
        .send({ token: secret, resposta: "NAO_IREI" })
        .expect(410);
      expect(await history()).toHaveLength(2);
    });
    it("responde espiritualidade de modo independente, com histórico idempotente e sem fabricar presença ou aceites", async () => {
      await withSpirituality(async () => {
        const id = await candidate();
        const notice = await acceptedNotice(id);
        const before = await db.registration.findUniqueOrThrow({
          where: { id },
        });
        const consentCount = await db.consent.count({
          where: { registrationId: id },
        });
        const sent = messages.length;
        const path = `${publicPath(notice.id)}/spirituality`;
        const initial = await request(app)
          .post(`${publicPath(notice.id)}/view`)
          .send({ token: notice.token })
          .expect(200);
        expect(initial.body.spirituality).toEqual({
          startsAt: spiritualityStartsAt.toISOString(),
          answer: null,
          respondedAt: null,
          canRespond: true,
        });
        const responses = await Promise.all([
          request(app).post(path).send({ token: notice.token, response: false }),
          request(app).post(path).send({ token: notice.token, response: false }),
        ]);
        expect(responses.map((r) => r.status)).toEqual([200, 200]);
        expect(responses[0].body).toMatchObject({
          confirmedAt: null,
          declinedAt: null,
          spirituality: { answer: false, canRespond: true },
        });
        const history = () =>
          db.$queryRaw<{ participara: boolean; espiritualidade_em: Date }[]>`
            SELECT participara, espiritualidade_em
            FROM inscricoes.respostas_espiritualidade_historico
            WHERE inscricao_id=${id}::uuid ORDER BY respondido_em, resposta_id`;
        expect(await history()).toEqual([
          { participara: false, espiritualidade_em: spiritualityStartsAt },
        ]);
        const declined = await request(app)
          .post(publicPath(notice.id))
          .send({ token: notice.token, resposta: "NAO_IREI" })
          .expect(200);
        const yes = await request(app)
          .post(path)
          .send({ token: notice.token, response: true })
          .expect(200);
        expect(yes.body).toMatchObject({
          confirmedAt: null,
          declinedAt: declined.body.declinedAt,
          spirituality: { answer: true },
        });
        const after = await db.registration.findUniqueOrThrow({
          where: { id },
        });
        expect(after).toMatchObject({
          status: before.status,
          teamId: before.teamId,
          snapshot: before.snapshot,
          spiritualityResponse: true,
          spiritualityAt: spiritualityStartsAt,
        });
        expect(after.spiritualityRespondedAt).toBeInstanceOf(Date);
        expect(
          await db.consent.count({ where: { registrationId: id } }),
        ).toBe(consentCount);
        expect(await history()).toHaveLength(2);
        expect(messages).toHaveLength(sent);
        // Legacy requests still default to VOU, without changing the separate answer.
        const legacy = await request(app)
          .post(publicPath(notice.id))
          .send({ token: notice.token })
          .expect(200);
        expect(legacy.body.confirmedAt).toBeTruthy();
        expect(legacy.body.spirituality.answer).toBe(true);
        const admin = await request(app)
          .get(`${base(id)}/decision-notice`)
          .set(auth())
          .expect(200);
        expect(admin.body.notice.spirituality.answer).toBe(true);
        const list = await request(app)
          .get(`/api/v1/organizations/${org}/registrations`)
          .query({ eventId, q: before.snapshot && "Pessoa do teste de avisos", sort: "NAME_ASC", pageSize: 100 })
          .set(auth())
          .expect(200);
        expect(
          list.body.items.find((item: { id: string }) => item.id === id)
            ?.decisionSummary.notice.spirituality.answer,
        ).toBe(true);
      });
    });
    it("preserva a resposta após renovar ou substituir o convite e separa uma nova data de espiritualidade", async () => {
      await withSpirituality(async () => {
        const id = await candidate();
        const notice = await acceptedNotice(id);
        await request(app)
          .post(`${publicPath(notice.id)}/spirituality`)
          .send({ token: notice.token, response: true })
          .expect(200);
        const renewed = await request(app)
          .post(`${base(id)}/decision-notice/renew`)
          .set(auth())
          .expect(200);
        expect(renewed.body.notice.spirituality.answer).toBe(true);
        await status(id, "RECEIVED").then((r) => expect(r.status).toBe(200));
        const replacement = await acceptedNotice(id);
        expect(replacement.id).not.toBe(notice.id);
        const view = await request(app)
          .post(`${publicPath(replacement.id)}/view`)
          .send({ token: replacement.token })
          .expect(200);
        expect(view.body.spirituality.answer).toBe(true);
        await request(app)
          .post(`${publicPath(notice.id)}/spirituality`)
          .send({ token: notice.token, response: false })
          .expect(404);
        const nextMeeting = new Date("2026-11-15T17:00:00Z");
        await db.event.update({
          where: { id: eventId },
          data: { spiritualityStartsAt: nextMeeting },
        });
        const changedDate = await request(app)
          .post(`${publicPath(replacement.id)}/view`)
          .send({ token: replacement.token })
          .expect(200);
        expect(changedDate.body.spirituality).toMatchObject({
          startsAt: nextMeeting.toISOString(),
          answer: null,
          respondedAt: null,
        });
        await request(app)
          .post(`${publicPath(replacement.id)}/spirituality`)
          .send({ token: replacement.token, response: false })
          .expect(200);
        const history = await db.$queryRaw<
          { participara: boolean; espiritualidade_em: Date }[]
        >`SELECT participara, espiritualidade_em FROM inscricoes.respostas_espiritualidade_historico
          WHERE inscricao_id=${id}::uuid ORDER BY respondido_em, resposta_id`;
        expect(history).toEqual([
          { participara: true, espiritualidade_em: spiritualityStartsAt },
          { participara: false, espiritualidade_em: nextMeeting },
        ]);
      });
    });
    it("não habilita espiritualidade sem configuração, para campistas ou em avisos de recusa", async () => {
      const id = await candidate();
      const notice = await acceptedNotice(id);
      const noMeeting = await request(app)
        .post(`${publicPath(notice.id)}/view`)
        .send({ token: notice.token })
        .expect(200);
      expect(noMeeting.body.spirituality).toBeNull();
      await request(app)
        .post(`${publicPath(notice.id)}/spirituality`)
        .send({ token: notice.token, response: true })
        .expect(409);
      await withSpirituality(async () => {
        const refusedId = await candidate();
        expect((await status(refusedId, "REJECTED")).status).toBe(200);
        const refusal = (
          await request(app)
            .get(`${base(refusedId)}/decision-notice`)
            .set(auth())
            .expect(200)
        ).body.notice;
        const refusalToken = new URLSearchParams(new URL(refusal.link).hash.slice(1)).get("token");
        expect(refusal.spirituality).toBeNull();
        await request(app)
          .post(`${publicPath(refusal.id)}/spirituality`)
          .send({ token: refusalToken, response: true })
          .expect(409);
        const camper = await db.campaign.findFirstOrThrow({
          where: { eventId, kind: "CAMPER" },
          include: { forms: true },
        });
        const camperId = await candidate(true, {
          campaign: camper.id,
          form: camper.forms[0].id,
        });
        const camperApp = createApp({
          db,
          eventsEnabled: true,
          camperRegistrationsEnabled: true,
          volunteerRegistrationsEnabled: true,
          rateLimits: false,
          decisionNotificationsEnabled: true,
          decisionLinkSecret: "segredo-exclusivo-do-teste-de-avisos-123456789",
          resolveIdentity: async (token) => users[token] ?? null,
        });
        await request(camperApp)
          .patch(`${base(camperId)}/status`)
          .set(auth())
          .send({ status: "APPROVED", reason: "Decisão explícita de teste" })
          .expect(200);
        const camperNotice = (
          await request(camperApp)
            .get(`${base(camperId)}/decision-notice`)
            .set(auth())
            .expect(200)
        ).body.notice;
        const camperToken = new URLSearchParams(new URL(camperNotice.link).hash.slice(1)).get("token");
        const camperView = await request(camperApp)
          .post(`${publicPath(camperNotice.id)}/view`)
          .send({ token: camperToken })
          .expect(200);
        expect(camperView.body.spirituality).toBeNull();
        await request(camperApp)
          .post(`${publicPath(camperNotice.id)}/spirituality`)
          .send({ token: camperToken, response: true })
          .expect(409);
      });
    });
    it("valida os campos da resposta e bloqueia token inválido, link vencido ou candidatura cancelada", async () => {
      await withSpirituality(async () => {
        const id = await candidate();
        const notice = await acceptedNotice(id);
        const path = `${publicPath(notice.id)}/spirituality`;
        for (const invalid of [
          { token: notice.token },
          { token: notice.token, response: "SIM" },
          { token: notice.token, response: null },
          { token: notice.token, response: false, resposta: "VOU" },
          { token: "inválido", response: false },
        ])
          await request(app).post(path).send(invalid).expect(422);
        await request(app)
          .post(path)
          .send({ token: "x".repeat(43), response: true })
          .expect(404);
        await request(app)
          .post(publicPath(notice.id))
          .send({ token: notice.token, resposta: "VOU" })
          .expect(200);
        await db.decisionNotice.update({
          where: { id: notice.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        const expiredView = await request(app)
          .post(`${publicPath(notice.id)}/view`)
          .send({ token: notice.token })
          .expect(200);
        expect(expiredView.body.spirituality.canRespond).toBe(false);
        await request(app)
          .post(path)
          .send({ token: notice.token, response: true })
          .expect(410);
        expect(
          (await db.registration.findUniqueOrThrow({ where: { id } }))
            .spiritualityResponse,
        ).toBeNull();
        expect((await status(id, "CANCELLED")).status).toBe(200);
        await request(app)
          .post(path)
          .send({ token: notice.token, response: true })
          .expect(410);
        const history = await db.$queryRaw<{ total: bigint }[]>`
          SELECT count(*) AS total FROM inscricoes.respostas_espiritualidade_historico WHERE inscricao_id=${id}::uuid`;
        expect(Number(history[0].total)).toBe(0);
      });
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
