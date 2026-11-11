import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { volunteerTemplate } from "../src/modules/events/volunteer-template.js";
import { defaultLayout } from "@fac/form-layout";
import { RegistrationsService } from "../src/modules/registrations/registrations.service.js";
import { RegistrationsRepository } from "../src/modules/registrations/registrations.repository.js";

const url = process.env.TEST_EVENT_IMPORT_DATABASE_URL;
(url ? describe : describe.skip)(
  "Candidaturas importadas em PostgreSQL descartável",
  () => {
    if (url && new URL(url).pathname !== "/fac_event_import_tests")
      throw new Error("Use somente fac_event_import_tests.");
    const db = new PrismaClient({
      datasourceUrl:
        url ?? "postgresql://test@127.0.0.1:1/fac_event_import_tests",
    });
    const users = Object.fromEntries(
      ["organizer", "secretary", "other"].map((key) => [
        key,
        { id: randomUUID(), email: `${key}@event-import.test` },
      ]),
    );
    const send = vi.fn(async () => "ENVIADA" as const);
    const app = createApp({
      db,
      eventsEnabled: true,
      rateLimits: false,
      resolveIdentity: async (token) => users[token] ?? null,
      decisionEmail: { send },
      decisionNotificationsEnabled: false,
    });
    const auth = (who = "organizer") => ({ Authorization: `Bearer ${who}` });
    let org: string,
      otherOrg: string,
      campaignId: string,
      formVersionId: string,
      eventId: string,
      base: string,
      batch: any;
    let teams: { id: string; name: string }[];
    const headers = [
      "Carimbo de data/hora",
      "Nome completo:",
      "Sexo:",
      "Celular:",
      "Idade:",
      "Data de Nascimento:",
      "Cidade:",
      "Já FEZ ou SERVIU no FAC?",
      "É campista? Qual edição do Acampamento que você fez?",
      "Possui ou cursa formação na área da saúde? Se sim, qual?",
      "Seu cônjuge também se inscreveu para servir?",
      "Qual paróquia frequenta?",
      "Possui quais sacramentos?",
      "SUGESTÃO- Qual equipe GOSTARIA de servir?",
      "Tamanho Camiseta:",
      "Informe o @ do seu INSTAGRAM",
      "FORMAÇÃO PARA EQUIPE DE TRABALHO",
      "CONFIRMAÇÃO DA INSCRIÇÃO:",
    ];
    const targets = [
      "metadata:submittedAt",
      "name",
      "question:sexo",
      "phone",
      "metadata:age",
      "birthDate",
      "question:cidade",
      "question:experiencia_evento",
      "question:acampamento_edicao",
      "question:formacao_saude",
      "question:conjuge",
      "question:paroquia",
      "question:sacramentos",
      "question:equipes_preferencia",
      "shirt",
      "metadata:instagram",
      "historical:training",
      "historical:confirmation",
    ];
    const sourceRow = (
      name = "Ana Importada",
      phone = "44999999999",
      city = "Loanda",
    ) => [
      "2026/10/09 1:00:00 PM GMT-3",
      name,
      "Feminino",
      phone,
      "26",
      "2000-01-01",
      city,
      "Sim!",
      "1º FAC Teste",
      "",
      "",
      "Paróquia Teste",
      "BATISMO;CRISMA",
      "Anjos;Secretaria;Recreação;Manutenção",
      "gg",
      "@teste",
      "Sim, estou de acordo",
      "Sim, estou de acordo",
    ];
    const csv = (rows: string[][]) =>
      Buffer.from(
        [headers, ...rows]
          .map((row) =>
            row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
          )
          .join("\r\n"),
      );
    const upload = (
      bytes: Buffer,
      c = campaignId,
      f = formVersionId,
      who = "organizer",
    ) =>
      request(app)
        .post(base + "/event")
        .set(auth(who))
        .field("campaignId", c)
        .field("formVersionId", f)
        .attach("file", bytes, "respostas.csv");
    const mapping = () =>
      targets.map((target, column) => ({ column, target, confirmed: true }));
    const get = async (id = batch.id) =>
      (await request(app).get(`${base}/${id}`).set(auth()).expect(200)).body;
    const settings = async (b: any, extra: object = {}) =>
      (
        await request(app)
          .put(`${base}/${b.id}/settings`)
          .set(auth())
          .send({ revision: b.revision, ...extra })
          .expect(200)
      ).body;
    const revise = async (b: any, row: any, extra: object = {}) =>
      (
        await request(app)
          .put(`${base}/${b.id}/rows/${row.id}`)
          .set(auth())
          .send({
            revision: row.revision,
            decision: "KEEP",
            overrides: row.overrides ?? {},
            ...extra,
          })
          .expect(200)
      ).body;
    beforeAll(async () => {
      await db.account.createMany({ data: Object.values(users) });
      org = (
        await db.organization.create({
          data: {
            name: "Organização Importação Evento",
            city: "Loanda",
            state: "PR",
            contact: "Contato",
          },
        })
      ).id;
      otherOrg = (
        await db.organization.create({
          data: {
            name: "Outra Organização Importação",
            city: "Loanda",
            state: "PR",
            contact: "Contato",
          },
        })
      ).id;
      for (const [who, organizationId, role] of [
        ["organizer", org, "ORGANIZER"],
        ["secretary", org, "SECRETARY"],
        ["other", otherOrg, "ORGANIZER"],
      ] as const)
        await db.membership.create({
          data: { organizationId, accountId: users[who].id, role },
        });
      const type = await db.eventType.create({
        data: { organizationId: org, name: "FAC" },
      });
      const event = await db.event.create({
        data: {
          organizationId: org,
          typeId: type.id,
          name: "FAC Importação",
          description: "Teste isolado",
          location: "Chácara Teste",
          city: "Loanda",
          startsAt: new Date("2027-02-05"),
          endsAt: new Date("2027-02-09"),
          status: "PUBLISHED",
        },
      });
      eventId = event.id;
      teams = await Promise.all(
        ["Anjos", "Secretaria", "Recreação", "Manutenção"].map((name) =>
          db.team.create({ data: { eventId, name, capacity: 1 } }),
        ),
      );
      const campaign = await db.campaign.create({
        data: {
          eventId,
          kind: "VOLUNTEER",
          opensAt: new Date("2020-01-01"),
          closesAt: new Date("2021-01-01"),
        },
      });
      campaignId = campaign.id;
      const config = volunteerTemplate(
        "FAC",
        teams.map((t) => t.name),
      );
      config.layout = defaultLayout(config, "VOLUNTEER");
      formVersionId = (
        await db.formVersion.create({
          data: {
            campaignId,
            version: 1,
            publishedAt: new Date(),
            config: JSON.parse(JSON.stringify(config)),
          },
        })
      ).id;
      base = `/api/v1/organizations/${org}/participant-imports`;
    });
    afterAll(async () => {
      await db.$disconnect();
    });

    it("restringe importação ao organizador e persiste desde o envio sem criar candidaturas", async () => {
      const bytes = csv([sourceRow(), sourceRow("Bruna Importada", "123")]);
      await upload(bytes, undefined, undefined, "secretary").expect(403);
      await upload(bytes, undefined, undefined, "other").expect(403);
      batch = (await upload(bytes).expect(200)).body;
      expect(batch).toMatchObject({
        mode: "EVENT",
        state: "MAPPING",
        summary: { total: 2, imported: 0 },
      });
      expect(batch.headers).toHaveLength(18);
      expect(await db.registration.count()).toBe(0);
      expect((await get()).id).toBe(batch.id);
      expect((await upload(bytes).expect(200)).body.id).toBe(batch.id);
      await request(app)
        .get(
          `/api/v1/organizations/${otherOrg}/participant-imports/${batch.id}`,
        )
        .set(auth("other"))
        .expect(404);
    });
    it("exige as 18 associações, normaliza e preserva quatro preferências sem criar aceites", async () => {
      await request(app)
        .put(`${base}/${batch.id}/settings`)
        .set(auth())
        .send({
          revision: batch.revision,
          mapping: mapping().slice(0, 17),
          step: 3,
        })
        .expect(422);
      batch = await settings(batch, { mapping: mapping(), step: 3 });
      const row = batch.rows[0];
      expect(row.payload.name).toBe("Ana Importada");
      expect(row.payload.shirt).toBe("GG");
      expect(row.payload.answers.experiencia_evento).toBe(true);
      expect(row.payload.answers.equipes_preferencia).toHaveLength(4);
      expect(row.departmentIds).toHaveLength(4);
      expect(row.payload.termsAccepted).not.toBe(true);
      expect(row.payload.answers.aceite_regras).not.toBe(true);
      expect(row.pending.length).toBeGreaterThan(0);
      expect(batch.rows[1].errors.length).toBeGreaterThan(0);
      expect(await db.consent.count()).toBe(0);
    });
    it("detecta revisão desatualizada e preserva correção individual ao aplicar equivalências", async () => {
      const row = batch.rows[0];
      batch = await revise(batch, row, {
        overrides: { "question:cidade": "Cidade Confirmada - PR" },
      });
      await request(app)
        .put(`${base}/${batch.id}/rows/${row.id}`)
        .set(auth())
        .send({ revision: row.revision, decision: "KEEP", overrides: {} })
        .expect(409);
      batch = await settings(batch, {
        rules: [
          { target: "question:cidade", from: "Loanda", to: "Loanda - PR" },
        ],
        step: 4,
      });
      expect(batch.rows[0].payload.answers.cidade).toBe(
        "Cidade Confirmada - PR",
      );
      batch = await revise(batch, batch.rows[0]);
    });
    it("confirma parcialmente, repete sem duplicar e congela a linha incorporada", async () => {
      const body = { revision: batch.revision, rowIds: [batch.rows[0].id] };
      const before = batch;
      batch = (
        await request(app)
          .post(`${base}/${batch.id}/confirm`)
          .set(auth())
          .send(body)
          .expect(200)
      ).body;
      expect(batch.state).toBe("PARTIALLY_CONFIRMED");
      expect(batch.summary).toMatchObject({ imported: 1, total: 2 });
      await request(app)
        .post(`${base}/${batch.id}/confirm`)
        .set(auth())
        .send(body)
        .expect(200);
      expect(await db.registration.count()).toBe(1);
      expect(await db.previousParticipant.count()).toBe(0);
      expect(await db.consent.count()).toBe(0);
      expect(await db.healthSubmission.count()).toBe(0);
      expect(send).not.toHaveBeenCalled();
      const reg = await db.registration.findFirstOrThrow();
      expect(reg).toMatchObject({
        origin: "IMPORT",
        draftId: null,
        accountId: null,
        status: "RECEIVED",
        teamId: null,
      });
      await request(app)
        .put(`${base}/${batch.id}/rows/${batch.rows[0].id}`)
        .set(auth())
        .send({
          revision: batch.rows[0].revision,
          decision: "DISCARD",
          overrides: {},
        })
        .expect(409);
      await request(app)
        .post(`${base}/${batch.id}/confirm`)
        .set(auth())
        .send({ revision: batch.revision, rowIds: [batch.rows[1].id] })
        .expect(422);
      expect((await get()).revision).toBe(batch.revision);
      await request(app)
        .post(`${base}/${batch.id}/cancel`)
        .set(auth())
        .send({ revision: batch.revision })
        .expect(409);
      expect(before.rows[0].original).toEqual(batch.rows[0].original);
    });
    it("confirma vaga importada com pendências sem fabricar dados, saúde ou aceites", async () => {
      const reg = await db.registration.findFirstOrThrow();
      const pendingBefore = reg.importData;
      const path = `/api/v1/organizations/${org}/registrations/${reg.id}`;
      for (const status of ["REVIEW", "APPROVED"])
        await request(app)
          .patch(path + "/status")
          .set(auth())
          .send({ status, reason: "Avaliação do organizador" })
          .expect(200);
      await request(app)
        .put(path + "/team")
        .set(auth())
        .send({ teamId: teams[0].id })
        .expect(200);
      const confirmed = await request(app)
        .patch(path + "/status")
        .set(auth())
        .send({ status: "CONFIRMED", reason: "Confirmar após avaliação" })
        .expect(200);
      expect(confirmed.body.status).toBe("CONFIRMED");
      expect(confirmed.body.noticeWarning).toContain("informações pendentes");
      expect(
        await db.auditLog.count({
          where: {
            entityId: reg.id,
            action: "REGISTRATION_CONFIRMED_WITH_PENDING_INFORMATION",
          },
        }),
      ).toBe(1);
      expect(
        (
          await db.statusHistory.findFirstOrThrow({
            where: { registrationId: reg.id, toStatus: "CONFIRMED" },
          })
        ).reason,
      ).toContain("com informações pendentes");
      expect(
        (await db.registration.findUniqueOrThrow({ where: { id: reg.id } }))
          .teamId,
      ).toBe(teams[0].id);
      await request(app)
        .get(path + "/photo")
        .set(auth())
        .expect(404);
      const detail = (await request(app).get(path).set(auth()).expect(200))
        .body;
      expect(detail.consent).toBeNull();
      expect(detail.origin).toBe("IMPORT");
      expect(detail.importData.pending.length).toBeGreaterThan(0);
      expect(detail.importData).toEqual(pendingBefore);
      expect(detail.pendingInformation).toEqual(detail.importData.pending);
      expect(await db.healthSubmission.count()).toBe(0);
      expect(await db.consent.count()).toBe(0);
      const list = await request(app)
        .get(
          `/api/v1/organizations/${org}/registrations?origin=IMPORT&completeness=PENDING`,
        )
        .set(auth())
        .expect(200);
      expect(list.body.total).toBe(1);
      const native = await request(app)
        .get(
          `/api/v1/organizations/${org}/registrations?origin=PUBLIC_FORM&completeness=PENDING`,
        )
        .set(auth())
        .expect(200);
      expect(native.body.total).toBe(0);
    });
    it("compara arquivo alterado e preserva conta, decisão, departamento e correção posterior", async () => {
      const registration = await db.registration.findFirstOrThrow();
      const linked = await db.registration.update({
        where: { id: registration.id },
        data: { accountId: users.organizer.id },
      });
      await expect(
        db.registration.update({
          where: { id: registration.id },
          data: { snapshot: { name: "Alteração direta proibida" } },
        }),
      ).rejects.toThrow();
      const correctionPath = `/api/v1/organizations/${org}/registrations/${registration.id}/imported-data`;
      const correction = {
        updatedAt: linked.updatedAt.toISOString(),
        overrides: { "question:cidade": "Correção posterior" },
        reason: "Conferência do organizador",
      };
      await request(app)
        .patch(correctionPath)
        .set(auth("secretary"))
        .send(correction)
        .expect(403);
      await request(app)
        .patch(correctionPath)
        .set(auth())
        .send(correction)
        .expect(200);
      await request(app)
        .patch(correctionPath)
        .set(auth())
        .send(correction)
        .expect(409);
      let newer = (
        await upload(
          csv([
            sourceRow("Ana Importada", "44999999999", "Cidade de novo arquivo"),
          ]),
        ).expect(200)
      ).body;
      newer = await settings(newer, { mapping: mapping(), step: 4 });
      expect(newer.rows[0].candidates[0].id).toBe(registration.id);
      newer = await revise(newer, newer.rows[0], {
        decision: "REPLACE",
        replaceId: registration.id,
      });
      await request(app)
        .post(`${base}/${newer.id}/confirm`)
        .set(auth())
        .send({ revision: newer.revision, rowIds: [newer.rows[0].id] })
        .expect(200);
      const after = await db.registration.findUniqueOrThrow({
        where: { id: registration.id },
      });
      expect(after).toMatchObject({
        status: "CONFIRMED",
        teamId: teams[0].id,
        accountId: users.organizer.id,
      });
      expect((after.snapshot as any).answers.cidade).toBe("Correção posterior");
      await request(app)
        .patch(correctionPath)
        .set(auth())
        .send({
          updatedAt: after.updatedAt.toISOString(),
          overrides: { "question:paroquia": "" },
          reason: "Remover dado desatualizado",
        })
        .expect(200);
      let third = (
        await upload(
          csv([sourceRow("Ana Importada", "44999999999", "Terceiro arquivo")]),
        ).expect(200)
      ).body;
      third = await settings(third, { mapping: mapping(), step: 4 });
      third = await revise(third, third.rows[0], {
        decision: "REPLACE",
        replaceId: registration.id,
      });
      await request(app)
        .post(`${base}/${third.id}/confirm`)
        .set(auth())
        .send({ revision: third.revision, rowIds: [third.rows[0].id] })
        .expect(200);
      const protectedAgain = (
        await db.registration.findUniqueOrThrow({
          where: { id: registration.id },
        })
      ).snapshot as any;
      expect(protectedAgain.answers.cidade).toBe("Correção posterior");
      expect(protectedAgain.answers.paroquia).toBeUndefined();
      expect(await db.registration.count()).toBe(1);
    });
    it("retoma linhas restantes, impede lotes em evento concluído e cancela apenas lote não incorporado", async () => {
      batch = await get();
      batch = await revise(batch, batch.rows[1], {
        overrides: { phone: "44888888888" },
      });
      batch = (
        await request(app)
          .post(`${base}/${batch.id}/confirm`)
          .set(auth())
          .send({ revision: batch.revision, rowIds: [batch.rows[1].id] })
          .expect(200)
      ).body;
      expect(batch.state).toBe("CONFIRMED");
      expect(batch.summary.imported).toBe(2);
      const bruna = await db.registration.findFirstOrThrow({
        where: { person: { name: "Bruna Importada" } },
      });
      const brunaPath = `/api/v1/organizations/${org}/registrations/${bruna.id}`;
      for (const status of ["REVIEW", "APPROVED"])
        await request(app)
          .patch(brunaPath + "/status")
          .set(auth())
          .send({ status, reason: "Avaliar segunda candidata" })
          .expect(200);
      await request(app)
        .put(brunaPath + "/team")
        .set(auth())
        .send({ teamId: teams[0].id })
        .expect(409);
      let unused = (
        await upload(
          csv([sourceRow("Pessoa Cancelada", "44777777777")]),
        ).expect(200)
      ).body;
      unused = (
        await request(app)
          .post(`${base}/${unused.id}/cancel`)
          .set(auth())
          .send({ revision: unused.revision })
          .expect(200)
      ).body;
      expect(unused.state).toBe("CANCELLED");
      await db.event.update({
        where: { id: eventId },
        data: { status: "COMPLETED" },
      });
      await upload(csv([sourceRow("Pessoa Posterior", "44666666666")])).expect(
        409,
      );
    });
    it("mantém respostas nativas imutáveis e associa importação sem recriar a candidatura", async () => {
      await db.event.update({
        where: { id: eventId },
        data: { status: "PUBLISHED" },
      });
      const draft = await db.draft.create({
        data: {
          campaignId,
          formVersionId,
          tokenHash: "d".repeat(64),
          expiresAt: new Date("2090-01-01"),
        },
      });
      const person = await db.person.create({
        data: {
          organizationId: org,
          name: "Carlos Nativo",
          birthDate: new Date("2000-01-01"),
          phone: "44555555555",
        },
      });
      const original = {
        name: person.name,
        birthDate: "2000-01-01",
        phone: person.phone,
        answers: { cidade: "Cidade da ficha original", sexo: "Masculino" },
      };
      const native = await db.registration.create({
        data: {
          draftId: draft.id,
          personId: person.id,
          campaignId,
          formVersionId,
          protocol: `NAT-${randomUUID()}`,
          snapshot: original,
        },
      });
      await expect(
        db.registration.update({
          where: { id: native.id },
          data: { snapshot: { ...original, phone: "44999998888" } },
        }),
      ).rejects.toThrow();
      let b = (
        await upload(
          csv([sourceRow(person.name, person.phone, "Cidade do CSV")]),
        ).expect(200)
      ).body;
      b = await settings(b, { mapping: mapping(), step: 4 });
      b = await revise(b, b.rows[0], {
        decision: "REPLACE",
        replaceId: native.id,
      });
      await request(app)
        .post(`${base}/${b.id}/confirm`)
        .set(auth())
        .send({ revision: b.revision, rowIds: [b.rows[0].id] })
        .expect(200);
      const after = await db.registration.findUniqueOrThrow({
        where: { id: native.id },
      });
      expect(after.origin).toBe("PUBLIC_FORM");
      expect(after.snapshot).toEqual(original);
      expect(after.importData).toBeNull();
      const row = await db.participantImportRow.findUniqueOrThrow({
        where: { id: b.rows[0].id },
      });
      expect(row.registrationId).toBe(native.id);
    });
    it("consulta duplicidades de todo o lote, preserva incorporadas e localiza origens entre páginas e lotes", async () => {
      const originals = [
        sourceRow("Homônima Conferida", "44999990001"),
        ...Array.from({ length: 50 }, (_, n) =>
          sourceRow(`Pessoa Única ${n}`, "44999990002"),
        ),
        sourceRow("Homônima Conferida", "44999990003"),
      ];
      let b = (await upload(csv(originals)).expect(200)).body;
      b = await settings(b, { mapping: mapping(), step: 4 });
      const lookup = (query: string, who = "organizer") =>
        request(app).get(`${base}/${b.id}?${query}`).set(auth(who));
      let duplicates = (await lookup("view=duplicates&pageSize=1").expect(200))
        .body;
      expect(duplicates).toMatchObject({
        duplicateCount: 2,
        filteredTotal: 2,
        summary: { total: 52 },
      });
      expect(duplicates.rows[0].duplicateRows).toEqual([53]);
      expect(duplicates.rows[0].relatedRows[0]).toMatchObject({
        rowNumber: 53,
        payload: { phone: "44999990003" },
      });
      const second = (
        await lookup("view=duplicates&pageSize=1&page=2").expect(200)
      ).body.rows[0];
      expect(second.rowNumber).toBe(53);
      const last = (await lookup(`rowId=${second.id}&pageSize=50`).expect(200))
        .body;
      expect(last.page).toBe(2);
      expect(last.rows.some((row: any) => row.id === second.id)).toBe(true);
      await lookup(`rowId=${randomUUID()}`).expect(404);
      await lookup("view=duplicates", "secretary").expect(403);
      await request(app)
        .get(
          `/api/v1/organizations/${otherOrg}/participant-imports/${b.id}?view=duplicates`,
        )
        .set(auth("other"))
        .expect(404);
      const first = b.rows[0];
      b = await revise(b, first); // No justification: confirmation must remain blocked.
      await request(app)
        .post(`${base}/${b.id}/confirm`)
        .set(auth())
        .send({ revision: b.revision, rowIds: [first.id] })
        .expect(422);
      b = await revise(b, b.rows[0], {
        distinctReason: "Pessoas distintas conferidas, telefones diferentes",
      });
      b = (
        await request(app)
          .post(`${base}/${b.id}/confirm`)
          .set(auth())
          .send({ revision: b.revision, rowIds: [first.id] })
          .expect(200)
      ).body;
      duplicates = (await lookup("view=duplicates").expect(200)).body;
      expect(
        duplicates.rows.find((r: any) => r.id === first.id).executionState,
      ).toBe("IMPORTED");
      const pending = duplicates.rows.find((r: any) => r.id === second.id);
      expect(pending.duplicateRows).toEqual([2]);
      expect(pending.candidates[0]).toMatchObject({
        protocol: expect.stringMatching(/^INS-/),
        sources: [
          expect.objectContaining({
            batchId: b.id,
            rowNumber: 2,
            rowId: first.id,
          }),
        ],
      });
      b = await revise(b, pending, {
        distinctReason: "Segunda pessoa distinta conferida",
      });
      b = (
        await request(app)
          .post(`${base}/${b.id}/confirm`)
          .set(auth())
          .send({ revision: b.revision, rowIds: [second.id] })
          .expect(200)
      ).body;
      duplicates = (await lookup("view=duplicates").expect(200)).body;
      expect(duplicates.rows).toHaveLength(2);
      expect(
        duplicates.rows.every(
          (r: any) => r.executionState === "IMPORTED" && r.distinctReason,
        ),
      ).toBe(true);

      // A new file associated to the same candidature is an additional source, not a second person.
      let associated = (
        await upload(
          csv([
            sourceRow(
              "Homônima Conferida",
              "44999990001",
              "Arquivo atualizado",
            ),
          ]),
        ).expect(200)
      ).body;
      associated = await settings(associated, { mapping: mapping(), step: 4 });
      const candidateId = duplicates.rows.find(
        (r: any) => r.id === first.id,
      ).registrationId;
      associated = await revise(associated, associated.rows[0], {
        decision: "REPLACE",
        replaceId: candidateId,
      });
      associated = (
        await request(app)
          .post(`${base}/${associated.id}/confirm`)
          .set(auth())
          .send({
            revision: associated.revision,
            rowIds: [associated.rows[0].id],
          })
          .expect(200)
      ).body;
      expect(associated.state).toBe("CONFIRMED");
      const after = (await lookup("view=duplicates").expect(200)).body;
      const reference = after.rows
        .find((r: any) => r.id === second.id)
        .candidates.find((c: any) => c.id === candidateId);
      expect(reference.sources).toHaveLength(2);
      const confirmedView = await request(app)
        .get(`${base}/${associated.id}?view=duplicates`)
        .set(auth())
        .expect(200);
      expect(
        confirmedView.body.rows[0].candidates.every(
          (c: any) => c.id !== candidateId,
        ),
      ).toBe(true);

      let samePerson = (
        await upload(
          csv([
            sourceRow("Carlos Nativo", "44555555555", "Primeira origem"),
            sourceRow("Carlos Nativo", "44555555555", "Segunda origem"),
          ]),
        ).expect(200)
      ).body;
      samePerson = await settings(samePerson, { mapping: mapping(), step: 4 });
      const nativeId = samePerson.rows[0].candidates[0].id;
      for (let index = 0; index < 2; index++) {
        samePerson = await revise(samePerson, samePerson.rows[index], {
          decision: "REPLACE",
          replaceId: nativeId,
        });
        samePerson = (
          await request(app)
            .post(`${base}/${samePerson.id}/confirm`)
            .set(auth())
            .send({
              revision: samePerson.revision,
              rowIds: [samePerson.rows[index].id],
            })
            .expect(200)
        ).body;
      }
      const noDuplicate = (
        await request(app)
          .get(`${base}/${samePerson.id}?view=duplicates`)
          .set(auth())
          .expect(200)
      ).body;
      expect(noDuplicate).toMatchObject({
        state: "CONFIRMED",
        duplicateCount: 0,
        filteredTotal: 0,
        rows: [],
      });
    });
    it("permite o mesmo arquivo em outra campanha e exige revalidar departamento removido", async () => {
      const event = await db.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      const next = await db.event.create({
        data: {
          organizationId: org,
          typeId: event.typeId,
          name: "Outro evento de importação",
          description: "Teste",
          location: "Local",
          city: "Loanda",
          startsAt: new Date("2027-03-01"),
          endsAt: new Date("2027-03-02"),
          status: "PUBLISHED",
        },
      });
      const nextCampaign = await db.campaign.create({
        data: {
          eventId: next.id,
          kind: "VOLUNTEER",
          opensAt: new Date("2020-01-01"),
          closesAt: new Date("2021-01-01"),
        },
      });
      const form = await db.formVersion.findUniqueOrThrow({
        where: { id: formVersionId },
      });
      const nextForm = await db.formVersion.create({
        data: {
          campaignId: nextCampaign.id,
          version: 1,
          config: form.config!,
          publishedAt: new Date(),
        },
      });
      const secondBatch = (
        await upload(
          csv([sourceRow(), sourceRow("Bruna Importada", "123")]),
          nextCampaign.id,
          nextForm.id,
        ).expect(200)
      ).body;
      expect(secondBatch.id).not.toBe(batch.id);
      const a = sourceRow("Pessoa Conferida", "44444444444");
      a[13] = "Manutenção";
      let b = (await upload(csv([a])).expect(200)).body;
      b = await settings(b, { mapping: mapping(), step: 4 });
      b = await revise(b, b.rows[0]);
      await db.team.delete({ where: { id: teams[3].id } });
      const response = await request(app)
        .post(`${base}/${b.id}/confirm`)
        .set(auth())
        .send({ revision: b.revision, rowIds: [b.rows[0].id] });
      expect([409, 422]).toContain(response.status);
      expect(
        await db.registration.count({
          where: { person: { name: "Pessoa Conferida" } },
        }),
      ).toBe(0);
    });
    it("preserva presença, departamento e capacidade ao confirmar importados e mantém autorização nativa", async () => {
      const secret = "segredo-importacao-presenca-responsavel-1234567890";
      const noticesApp = createApp({
        db,
        eventsEnabled: true,
        rateLimits: false,
        resolveIdentity: async (token) => users[token] ?? null,
        decisionNotificationsEnabled: true,
        decisionLinkSecret: secret,
        decisionEmail: { send },
      });
      const type = await db.eventType.create({
        data: { organizationId: org, name: "Validação de vagas importadas" },
      });
      const event = await db.event.create({
        data: {
          organizationId: org,
          typeId: type.id,
          name: "Vagas com cadastro pendente",
          description: "Evento fictício isolado",
          location: "Local teste",
          city: "Loanda",
          startsAt: new Date("2027-08-01"),
          endsAt: new Date("2027-08-03"),
          status: "PUBLISHED",
        },
      });
      const campaign = await db.campaign.create({
        data: {
          eventId: event.id,
          kind: "VOLUNTEER",
          opensAt: new Date("2020-01-01"),
          closesAt: new Date("2021-01-01"),
          capacity: 1,
        },
      });
      const form = await db.formVersion.create({
        data: {
          campaignId: campaign.id,
          version: 1,
          publishedAt: new Date(),
          config: JSON.parse(
            JSON.stringify(volunteerTemplate("FAC", ["SECRETARIA"])),
          ),
        },
      });
      const team = await db.team.create({
        data: { eventId: event.id, name: "SECRETARIA", capacity: 2 },
      });
      async function candidate(
        birthDate: string,
        native = false,
        pending = ["Adicionar foto", "Aceitar os termos atuais"],
      ) {
        const person = await db.person.create({
          data: {
            organizationId: org,
            name: `Pessoa ${randomUUID()}`,
            phone: "44999999999",
            birthDate: new Date(birthDate),
          },
        });
        const draft = native
          ? await db.draft.create({
              data: {
                campaignId: campaign.id,
                formVersionId: form.id,
                tokenHash: randomUUID().replaceAll("-", "").repeat(2),
                expiresAt: new Date("2090-01-01"),
              },
            })
          : null;
        return db.registration.create({
          data: {
            personId: person.id,
            campaignId: campaign.id,
            formVersionId: form.id,
            protocol: `PEND-${randomUUID()}`,
            origin: native ? "PUBLIC_FORM" : "IMPORT",
            draftId: draft?.id ?? null,
            ...(native
              ? {}
              : {
                  importData: {
                    pending,
                  },
                }),
            snapshot: {
              name: person.name,
              birthDate,
              phone: person.phone,
              answers: {},
            },
          },
        });
      }
      const path = (id: string) =>
        `/api/v1/organizations/${org}/registrations/${id}`;
      const change = (id: string, status: string) =>
        request(noticesApp)
          .patch(`${path(id)}/status`)
          .set(auth())
          .send({ status, reason: "Confirmação da vaga com dados pendentes" });
      const adult = await candidate("2000-01-01");
      await change(adult.id, "APPROVED").expect(200);
      const unconfirmed = await change(adult.id, "CONFIRMED").expect(409);
      expect(unconfirmed.body.error.code).toBe(
        "CANDIDATE_CONFIRMATION_REQUIRED",
      );
      async function confirmPresence(id: string) {
        const notice = (
          await request(noticesApp)
            .get(`${path(id)}/decision-notice`)
            .set(auth())
            .expect(200)
        ).body.notice;
        expect(notice.whatsappLink).toContain("wa.me/");
        const token = new URLSearchParams(
          new URL(notice.link).hash.slice(1),
        ).get("token");
        await request(noticesApp)
          .post(`/api/v1/public/decision-responses/${notice.id}`)
          .send({ token })
          .expect(200);
      }
      await confirmPresence(adult.id);
      expect(
        (await change(adult.id, "CONFIRMED").expect(409)).body.error.message,
      ).toContain("departamento");
      await request(noticesApp)
        .put(`${path(adult.id)}/team`)
        .set(auth())
        .send({ teamId: team.id })
        .expect(200);
      await change(adult.id, "CONFIRMED").expect(200);
      const minor = await candidate("2011-01-01");
      await change(minor.id, "APPROVED").expect(200);
      await confirmPresence(minor.id);
      await request(noticesApp)
        .put(`${path(minor.id)}/team`)
        .set(auth())
        .send({ teamId: team.id })
        .expect(200);
      expect(
        (await change(minor.id, "CONFIRMED").expect(409)).body.error.code,
      ).toBe("CAPACITY_REACHED");
      await db.campaign.update({
        where: { id: campaign.id },
        data: { capacity: 2 },
      });
      const confirmedMinor = await change(minor.id, "CONFIRMED").expect(200);
      expect(confirmedMinor.body.noticeWarning).toContain(
        "autorização do responsável",
      );
      const detail = (
        await request(noticesApp).get(path(minor.id)).set(auth()).expect(200)
      ).body;
      expect(detail.pendingInformation).toContain(
        "Autorização do responsável pendente: obrigatória antes do evento.",
      );
      expect(detail.consent).toBeNull();
      expect(
        await db.guardianAuthorization.count({
          where: { registrationId: minor.id },
        }),
      ).toBe(0);
      expect(
        (await db.registration.findUniqueOrThrow({ where: { id: minor.id } }))
          .importData,
      ).toEqual(minor.importData);
      const listed = (
        await request(noticesApp)
          .get(`/api/v1/organizations/${org}/registrations`)
          .set(auth())
          .query({ eventId: event.id, sort: "NAME_ASC" })
          .expect(200)
      ).body.items;
      expect(
        listed.find((item: { id: string }) => item.id === minor.id)
          .pendingInformation,
      ).toEqual(detail.pendingInformation);
      const native = await candidate("2011-01-01", true);
      await change(native.id, "APPROVED").expect(200);
      expect(
        (await change(native.id, "CONFIRMED").expect(409)).body.error.code,
      ).toBe("GUARDIAN_SIGNATURE_REQUIRED");
      await db.guardianAuthorization.create({
        data: {
          registrationId: minor.id,
          tokenHash: randomUUID(),
          expiresAt: new Date("2090-01-01"),
          termsText: "Termo fictício assinado",
          snapshot: {},
          signedAt: new Date(),
          signedData: { name: "Responsável de teste" },
          signature: [
            [
              { x: 0, y: 0 },
              { x: 100, y: 100 },
            ],
          ],
          receiptHash: "f".repeat(64),
        },
      });
      // Reading a real signature must not depend on a configured sending secret.
      const serviceWithoutLinks = new RegistrationsService(
        new RegistrationsRepository(db),
      );
      const signedDetail = await serviceWithoutLinks.detail(org, minor.id);
      expect(
        "pendingInformation" in signedDetail && signedDetail.pendingInformation,
      ).not.toContain(
        "Autorização do responsável pendente: obrigatória antes do evento.",
      );
      expect(signedDetail.importData).toEqual(minor.importData);
      expect(
        await db.consent.findUnique({ where: { registrationId: minor.id } }),
      ).toBeNull();
      const emptyPending = await candidate("2000-01-01", false, []);
      const emptyDetail = await serviceWithoutLinks.detail(
        org,
        emptyPending.id,
      );
      expect(
        "pendingInformation" in emptyDetail && emptyDetail.pendingInformation,
      ).toEqual(["Termos gerais atuais não confirmados"]);
      await db.consent.create({
        data: {
          registrationId: emptyPending.id,
          version: "TEST_TERMS",
          termsText: "Termos fictícios do teste",
          accepted: false,
          guardianAuthorized: false,
          imageAuthorized: false,
        },
      });
      const refusedDetail = await serviceWithoutLinks.detail(
        org,
        emptyPending.id,
      );
      expect(
        "pendingInformation" in refusedDetail &&
          refusedDetail.pendingInformation,
      ).toEqual(["Termos gerais atuais não confirmados"]);
      await db.consent.update({
        where: { registrationId: emptyPending.id },
        data: { accepted: true },
      });
      const completedDetail = await serviceWithoutLinks.detail(
        org,
        emptyPending.id,
      );
      expect(
        "pendingInformation" in completedDetail &&
          completedDetail.pendingInformation,
      ).toEqual([]);
      expect(send).not.toHaveBeenCalled();
    });
  },
);
