import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient, type RegistrationStatus } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { EventRegistrationSummaryService } from "../src/modules/registrations/event-registration-summary.service.js";

const statuses: RegistrationStatus[] = [
  "RECEIVED",
  "REVIEW",
  "APPROVED",
  "CONFIRMED",
  "WAITLIST",
  "REJECTED",
  "CANCELLED",
];
const counts = (value: number) =>
  Object.fromEntries(statuses.map((status) => [status, value]));

describe("Resumo de inscrições — compatibilidade e leitura consistente", () => {
  function mocked(
    stage: { registrations: boolean; presence: boolean },
    campaigns = [{ id: randomUUID(), kind: "VOLUNTEER" }],
  ) {
    const eventId = randomUUID(),
      organizationId = randomUUID();
    const tx = {
      event: {
        findFirst: vi.fn().mockResolvedValue({ id: eventId, campaigns }),
      },
      $queryRaw: vi.fn().mockResolvedValueOnce([stage]).mockResolvedValue([]),
    };
    const transaction = vi.fn(
      async (operation: (tx: unknown) => Promise<unknown>) => operation(tx),
    );
    return {
      eventId,
      organizationId,
      tx,
      transaction,
      service: new EventRegistrationSummaryService({
        $transaction: transaction,
      } as unknown as PrismaClient),
    };
  }
  it("mantém contagens administrativas sem infraestrutura de avisos, sem inventar zero para VOU", async () => {
    const fixture = mocked({ registrations: true, presence: false });
    fixture.tx.$queryRaw.mockResolvedValueOnce([
      {
        campaignId: (await fixture.tx.event.findFirst()).campaigns[0].id,
        status: "CONFIRMADA",
        total: 2n,
        candidateGoing: null,
      },
    ]);
    const result = await fixture.service.read(
      fixture.organizationId,
      fixture.eventId,
    );
    expect(result.presenceAvailable).toBe(false);
    expect(result.totals).toMatchObject({
      total: 2,
      candidateGoing: null,
      byStatus: { CONFIRMED: 2 },
    });
    expect(result.campaigns[0].candidateGoing).toBeNull();
    expect(fixture.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(fixture.tx.$queryRaw.mock.calls[1][0].sql).not.toContain(
      "avisos_decisao",
    );
  });
  it("retorna zeros para evento sem campanhas e não executa consultas por campanha", async () => {
    const fixture = mocked({ registrations: true, presence: true }, []);
    const result = await fixture.service.read(
      fixture.organizationId,
      fixture.eventId,
    );
    expect(result.campaigns).toEqual([]);
    expect(result.totals).toEqual({
      total: 0,
      byStatus: counts(0),
      candidateGoing: 0,
    });
    expect(fixture.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it("informa estrutura de inscrições ausente sem mascarar falha como total zero", async () => {
    const fixture = mocked({ registrations: false, presence: false });
    await expect(
      fixture.service.read(fixture.organizationId, fixture.eventId),
    ).rejects.toMatchObject({
      status: 503,
      code: "EVENT_REGISTRATION_SUMMARY_SETUP_REQUIRED",
    });
  });
});

const url = process.env.TEST_EVENT_SUMMARY_DATABASE_URL;
(url ? describe : describe.skip)(
  "Dashboard do evento em PostgreSQL descartável",
  () => {
    if (url && new URL(url).pathname !== "/fac_event_summary_tests")
      throw new Error("Use somente fac_event_summary_tests.");
    const db = new PrismaClient({
      datasourceUrl:
        url ?? "postgresql://test@127.0.0.1:1/fac_event_summary_tests",
    });
    const identities = Object.fromEntries(
      ["organizer", "secretary", "health", "other"].map((key) => [
        key,
        {
          id: randomUUID(),
          email: `${key}-${randomUUID()}@event-summary.test`,
        },
      ]),
    );
    const send = vi.fn(async () => "ENVIADA" as const);
    const build = (options: {
      eventsEnabled: boolean;
      camperRegistrationsEnabled: boolean;
    }) =>
      createApp({
        db,
        ...options,
        eventManagementEnabled: true,
        volunteerRegistrationsEnabled: true,
        decisionNotificationsEnabled: false,
        decisionEmail: { send },
        rateLimits: false,
        resolveIdentity: async (token) => identities[token] ?? null,
      });
    const full = build({
      eventsEnabled: true,
      camperRegistrationsEnabled: true,
    });
    const volunteers = build({
      eventsEnabled: false,
      camperRegistrationsEnabled: false,
    });
    const releasedCampers = build({
      eventsEnabled: false,
      camperRegistrationsEnabled: true,
    });
    const auth = (who = "organizer") => ({ Authorization: `Bearer ${who}` });
    let org: string,
      otherOrg: string,
      eventId: string,
      otherEventId: string,
      emptyEventId: string,
      camperOnlyEventId: string;
    let volunteerCampaign: string, camperCampaign: string;
    const rows: Record<string, string[]> = {};
    let goingNotice: string;
    const path = (event = eventId, organization = org) =>
      `/api/v1/organizations/${organization}/events/${event}/registration-summary`;
    async function notice(
      registrationId: string,
      options: {
        going?: boolean;
        declined?: boolean;
        revoked?: boolean;
        kind?: "ACEITE" | "RECUSA";
      } = {},
    ) {
      const history = await db.statusHistory.create({
        data: {
          registrationId,
          actorId: identities.organizer.id,
          fromStatus: "RECEIVED",
          toStatus: "APPROVED",
          reason: "Fixture sintética do resumo",
        },
      });
      return db.decisionNotice.create({
        data: {
          registrationId,
          historyId: history.id,
          createdById: identities.organizer.id,
          kind: options.kind ?? "ACEITE",
          tokenHash: randomUUID().replaceAll("-", "").repeat(2),
          expiresAt: new Date("2020-01-01"),
          confirmedAt: options.going ? new Date("2019-12-01") : null,
          declinedAt: options.declined ? new Date("2019-12-02") : null,
          revokedAt: options.revoked ? new Date("2019-12-03") : null,
        },
      });
    }
    beforeAll(async () => {
      await db.account.createMany({ data: Object.values(identities) });
      const organizations = await Promise.all(
        ["Organização do resumo", "Organização externa do resumo"].map((name) =>
          db.organization.create({
            data: {
              name,
              city: "Cidade fictícia",
              state: "PR",
              contact: "Contato sintético",
            },
          }),
        ),
      );
      [org, otherOrg] = organizations.map((entry) => entry.id);
      for (const [who, organizationId, role] of [
        ["organizer", org, "ORGANIZER"],
        ["secretary", org, "SECRETARY"],
        ["health", org, "HEALTH"],
        ["other", otherOrg, "ORGANIZER"],
      ] as const)
        await db.membership.create({
          data: { organizationId, accountId: identities[who].id, role },
        });
      const type = await db.eventType.create({
        data: { organizationId: org, name: "FAC resumo" },
      });
      const otherType = await db.eventType.create({
        data: { organizationId: otherOrg, name: "FAC externo" },
      });
      const event = (organizationId: string, typeId: string, name: string) =>
        db.event.create({
          data: {
            organizationId,
            typeId,
            name,
            description: "Evento isolado para conferir os indicadores",
            city: "Cidade fictícia",
            location: "Local fictício",
            startsAt: new Date("2027-02-05"),
            endsAt: new Date("2027-02-09"),
            status: "PUBLISHED",
          },
        });
      const events = await Promise.all([
        event(org, type.id, "Evento principal do resumo"),
        event(otherOrg, otherType.id, "Evento externo do resumo"),
        event(org, type.id, "Evento vazio do resumo"),
        event(org, type.id, "Somente campanha futura"),
      ]);
      [eventId, otherEventId, emptyEventId, camperOnlyEventId] = events.map(
        (entry) => entry.id,
      );
      const campaigns = await Promise.all(
        (["VOLUNTEER", "CAMPER"] as const).map((kind) =>
          db.campaign.create({
            data: {
              eventId,
              kind,
              opensAt: new Date("2020-01-01"),
              closesAt: new Date("2020-02-01"),
            },
          }),
        ),
      );
      [volunteerCampaign, camperCampaign] = campaigns.map((entry) => entry.id);
      await db.campaign.create({
        data: {
          eventId: camperOnlyEventId,
          kind: "CAMPER",
          opensAt: new Date("2020-01-01"),
          closesAt: new Date("2020-02-01"),
        },
      });
      for (const campaign of campaigns) {
        const form = await db.formVersion.create({
          data: {
            campaignId: campaign.id,
            version: 1,
            config: {},
            publishedAt: new Date(),
          },
        });
        for (const status of statuses) {
          const key = `${campaign.kind}:${status}`;
          rows[key] = [];
          for (
            let index = 0;
            index < (campaign.kind === "VOLUNTEER" ? 3 : 1);
            index++
          ) {
            const person = await db.person.create({
              data: {
                organizationId: org,
                name: "SEGREDO_PRIVADO_TESTE_RESUMO",
                phone: "44999999999",
                email: "privado@event-summary.test",
                birthDate: new Date("1990-01-01"),
              },
            });
            const imported = index % 2 === 1;
            const draft = imported
              ? null
              : await db.draft.create({
                  data: {
                    campaignId: campaign.id,
                    formVersionId: form.id,
                    tokenHash: randomUUID().replaceAll("-", "").repeat(2),
                    expiresAt: new Date("2090-01-01"),
                  },
                });
            const registration = await db.registration.create({
              data: {
                personId: person.id,
                campaignId: campaign.id,
                formVersionId: form.id,
                protocol: `SUMMARY-${randomUUID()}`,
                status,
                origin: imported ? "IMPORT" : "PUBLIC_FORM",
                draftId: draft?.id,
                ...(imported
                  ? {
                      importData: {
                        source: { batchId: randomUUID() },
                        pending: ["Complementação sintética"],
                      },
                    }
                  : {}),
                snapshot: {
                  name: person.name,
                  phone: person.phone,
                  email: person.email,
                },
              },
            });
            rows[key].push(registration.id);
          }
        }
        // An unsubmitted draft is deliberately outside every counter.
        await db.draft.create({
          data: {
            campaignId: campaign.id,
            formVersionId: form.id,
            tokenHash: randomUUID().replaceAll("-", "").repeat(2),
            expiresAt: new Date("2090-01-01"),
            payload: { name: "Rascunho não enviado" },
          },
        });
      }
      goingNotice = (
        await notice(rows["VOLUNTEER:APPROVED"][0], { going: true })
      ).id;
      await notice(rows["VOLUNTEER:CONFIRMED"][0], { declined: true });
      for (const status of ["RECEIVED", "REVIEW", "WAITLIST", "CANCELLED"])
        await notice(rows[`VOLUNTEER:${status}`][0], { going: true });
      await notice(rows["VOLUNTEER:REJECTED"][0], {
        going: true,
        revoked: true,
      });
      await notice(rows["VOLUNTEER:REJECTED"][0], { kind: "RECUSA" });
      await notice(rows["CAMPER:APPROVED"][0], { going: true, revoked: true });
      await notice(rows["CAMPER:APPROVED"][0]);
      for (let i = 0; i < 3; i++)
        await notice(rows["CAMPER:CONFIRMED"][0], {
          going: true,
          revoked: true,
        });
      await notice(rows["CAMPER:CONFIRMED"][0], { going: true });
    }, 30000);
    afterAll(async () => {
      await db.$disconnect();
    });

    it("conta todos os estados e origens e deriva o total das mesmas campanhas", async () => {
      const response = await request(full).get(path()).set(auth()).expect(200);
      expect(response.body.eventId).toBe(eventId);
      expect(Date.parse(response.body.generatedAt)).not.toBeNaN();
      expect(response.body.presenceAvailable).toBe(true);
      expect(response.body.totals).toEqual({
        total: 28,
        byStatus: counts(4),
        candidateGoing: 2,
      });
      expect(response.body.campaigns).toHaveLength(2);
      expect(
        response.body.campaigns.find(
          (campaign: { id: string }) => campaign.id === volunteerCampaign,
        ),
      ).toEqual({
        id: volunteerCampaign,
        kind: "VOLUNTEER",
        total: 21,
        byStatus: counts(3),
        candidateGoing: 1,
      });
      expect(
        response.body.campaigns.find(
          (campaign: { id: string }) => campaign.id === camperCampaign,
        ),
      ).toEqual({
        id: camperCampaign,
        kind: "CAMPER",
        total: 7,
        byStatus: counts(1),
        candidateGoing: 1,
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /SEGREDO_PRIVADO|privado@|token|snapshot|health|photo|link|SUMMARY-/i,
      );
      expect(send).not.toHaveBeenCalled();
    });
    it("independe da página e coincide com os filtros clicáveis de status e VOU", async () => {
      const summary = (await request(full).get(path()).set(auth()).expect(200))
        .body;
      const list = await request(full)
        .get(`/api/v1/organizations/${org}/registrations`)
        .query({ eventId, includeClosed: "true", pageSize: 20 })
        .set(auth())
        .expect(200);
      expect(list.body.items).toHaveLength(20);
      expect(list.body.total).toBe(summary.totals.total);
      for (const status of statuses) {
        const filtered = await request(full)
          .get(`/api/v1/organizations/${org}/registrations`)
          .query({ eventId, includeClosed: "true", status })
          .set(auth())
          .expect(200);
        expect(filtered.body.total).toBe(summary.totals.byStatus[status]);
      }
      const going = await request(full)
        .get(`/api/v1/organizations/${org}/registrations`)
        .query({ eventId, includeClosed: "true", presence: "VOU" })
        .set(auth())
        .expect(200);
      expect(going.body.total).toBe(summary.totals.candidateGoing);
    });
    it("exclui campistas não liberados e inclui a liberação específica sem depender de eventsEnabled", async () => {
      const restricted = await request(volunteers)
        .get(path())
        .set(auth())
        .expect(200);
      expect(restricted.body.campaigns).toEqual([
        {
          id: volunteerCampaign,
          kind: "VOLUNTEER",
          total: 21,
          byStatus: counts(3),
          candidateGoing: 1,
        },
      ]);
      expect(restricted.body.totals).toEqual({
        total: 21,
        byStatus: counts(3),
        candidateGoing: 1,
      });
      const released = await request(releasedCampers)
        .get(path())
        .set(auth())
        .expect(200);
      expect(released.body.totals).toEqual({
        total: 28,
        byStatus: counts(4),
        candidateGoing: 2,
      });
    });
    it("preserva os resultados de evento concluído e convites vencidos sem contar avisos revogados", async () => {
      await db.event.update({
        where: { id: eventId },
        data: { status: "COMPLETED" },
      });
      try {
        const result = await request(full).get(path()).set(auth()).expect(200);
        expect(result.body.totals).toEqual({
          total: 28,
          byStatus: counts(4),
          candidateGoing: 2,
        });
        const listed = await request(full)
          .get(`/api/v1/organizations/${org}/registrations`)
          .query({ eventId, presence: "VOU" })
          .set(auth())
          .expect(200);
        expect(listed.body.total).toBe(2);
      } finally {
        await db.event.update({
          where: { id: eventId },
          data: { status: "PUBLISHED" },
        });
      }
    });
    it("resposta negativa do candidato não altera a confirmação administrativa no agregado", async () => {
      await db.decisionNotice.update({
        where: { id: goingNotice },
        data: { confirmedAt: null, declinedAt: new Date() },
      });
      try {
        const result = await request(full).get(path()).set(auth()).expect(200);
        expect(result.body.totals.candidateGoing).toBe(1);
        expect(result.body.totals.byStatus.CONFIRMED).toBe(4);
        expect(result.body.totals.byStatus.APPROVED).toBe(4);
      } finally {
        await db.decisionNotice.update({
          where: { id: goingNotice },
          data: { confirmedAt: new Date("2019-12-01"), declinedAt: null },
        });
      }
    });
    it("mantém exatamente a permissão da listagem e não libera o painel à Saúde", async () => {
      for (const app of [full, volunteers]) {
        await request(app).get(path()).set(auth("secretary")).expect(200);
        await request(app).get(path()).set(auth("health")).expect(403);
        await request(app).get(path()).set(auth("other")).expect(403);
        await request(app).get(path()).expect(401);
      }
    });
    it("isola evento e organização e valida identificadores antes do banco", async () => {
      await request(full).get(path(otherEventId)).set(auth()).expect(404);
      await request(full)
        .get(path(eventId, otherOrg))
        .set(auth("other"))
        .expect(404);
      await request(full).get(path(randomUUID())).set(auth()).expect(404);
      await request(full).get(path("malformado")).set(auth()).expect(422);
      await request(full)
        .get(path(eventId, "malformado"))
        .set(auth())
        .expect(422);
    });
    it("preenche zeros para eventos e campanhas sem inscrições permitidas", async () => {
      const empty = await request(full)
        .get(path(emptyEventId))
        .set(auth())
        .expect(200);
      expect(empty.body.totals).toEqual({
        total: 0,
        byStatus: counts(0),
        candidateGoing: 0,
      });
      expect(empty.body.campaigns).toEqual([]);
      const campaignEmpty = await request(full)
        .get(path(camperOnlyEventId))
        .set(auth())
        .expect(200);
      expect(campaignEmpty.body.campaigns).toHaveLength(1);
      expect(campaignEmpty.body.campaigns[0]).toMatchObject({
        kind: "CAMPER",
        total: 0,
        byStatus: counts(0),
        candidateGoing: 0,
      });
      const hidden = await request(volunteers)
        .get(path(camperOnlyEventId))
        .set(auth())
        .expect(200);
      expect(hidden.body.campaigns).toEqual([]);
      expect(hidden.body.totals.total).toBe(0);
    });
    it("continua lendo totais administrativos quando avisos ainda não estão instalados", async () => {
      await db.$executeRawUnsafe(
        "ALTER TABLE inscricoes.avisos_decisao RENAME TO avisos_decisao_summary_temporario",
      );
      try {
        const result = await request(full).get(path()).set(auth()).expect(200);
        expect(result.body.presenceAvailable).toBe(false);
        expect(result.body.totals).toEqual({
          total: 28,
          byStatus: counts(4),
          candidateGoing: null,
        });
        expect(
          result.body.campaigns.every(
            (campaign: { candidateGoing: number | null }) =>
              campaign.candidateGoing === null,
          ),
        ).toBe(true);
      } finally {
        await db.$executeRawUnsafe(
          "ALTER TABLE inscricoes.avisos_decisao_summary_temporario RENAME TO avisos_decisao",
        );
      }
    });
  },
);
