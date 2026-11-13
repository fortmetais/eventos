import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient, type RegistrationStatus } from "@prisma/client";
import request from "supertest";
import { defaultLayout } from "@fac/form-layout";
import { createApp } from "../src/app.js";
import { volunteerTemplate } from "../src/modules/events/volunteer-template.js";
import { readRegistrationCorrections } from "../src/modules/registrations/registration-corrections-history.js";

const url = process.env.TEST_REGISTRATION_CORRECTIONS_DATABASE_URL;
describe("Leitura compatível do histórico de correções", () => {
  it("retorna lista vazia antes da coluna de auditoria existir", async () => {
    const query = vi.fn().mockResolvedValue([{ ready: false }]);
    const result = await readRegistrationCorrections(
      { $queryRaw: query } as unknown as PrismaClient,
      randomUUID(),
      randomUUID(),
      volunteerTemplate("FAC"),
    );
    expect(result).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
(url ? describe : describe.skip)(
  "Correções auditadas de inscrições em PostgreSQL descartável",
  () => {
    if (url && new URL(url).pathname !== "/fac_registration_corrections_tests")
      throw new Error("Use somente fac_registration_corrections_tests.");
    const db = new PrismaClient({
      datasourceUrl:
        url ??
        "postgresql://test@127.0.0.1:1/fac_registration_corrections_tests",
    });
    const users = Object.fromEntries(
      ["organizer", "secretary", "other"].map((key) => [
        key,
        { id: randomUUID(), email: `${key}-${randomUUID()}@corrections.test` },
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
    const json = (value: unknown) =>
      JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    let org: string,
      otherOrg: string,
      campaignId: string,
      formVersionId: string;
    const departmentNames = ["Anjos", "Secretaria", "Recreação", "Manutenção"];
    const reason = "Conferência solicitada pela pessoa inscrita";
    const endpoint = (id: string, organizationId = org) =>
      `/api/v1/organizations/${organizationId}/registrations/${id}/corrections`;
    const registration = (id: string) =>
      db.registration.findUniqueOrThrow({
        where: { id },
        include: { person: true },
      });
    const correct = async (
      id: string,
      overrides: Record<string, unknown>,
      options: {
        who?: string;
        updatedAt?: string;
        reason?: string;
        org?: string;
      } = {},
    ) => {
      const current = await registration(id);
      return request(app)
        .patch(endpoint(id, options.org))
        .set(auth(options.who))
        .send({
          updatedAt: options.updatedAt ?? current.updatedAt.toISOString(),
          overrides,
          reason: options.reason ?? reason,
        });
    };
    const audit = (id: string) =>
      db.auditLog.findMany({
        where: { entityId: id, action: "REGISTRATION_DATA_CORRECTED" },
        orderBy: { createdAt: "asc" },
      });

    async function candidate(
      origin: "PUBLIC_FORM" | "IMPORT" = "PUBLIC_FORM",
      options: {
        snapshot?: Record<string, unknown>;
        personId?: string;
        status?: RegistrationStatus;
      } = {},
    ) {
      const snapshot = {
        name: "Pessoa fictícia para correção",
        birthDate: "2000-01-01",
        phone: "44999999999",
        email: "original@corrections.test",
        cpf: "52998224725",
        address: "Rua fictícia, 123",
        shirt: "M",
        availability: "Todo o período",
        emergencyName: "Contato fictício",
        emergencyPhone: "44988888888",
        emergencyAlternativePhone: "4433333333",
        emergencyRelationship: "Mãe",
        guardianName: "Responsável fictício",
        guardianPhone: "44977777777",
        guardianEmail: "responsavel@corrections.test",
        guardianRelationship: "Mãe",
        termsAccepted: true,
        imageAuthorized: false,
        guardianAuthorization: false,
        photoAssetId: randomUUID(),
        emailProof: { verified: true, email: "original@corrections.test" },
        answers: {
          sexo: "Feminino",
          cidade: "Cidade fictícia - PR",
          experiencia_evento: true,
          acampamento_edicao: "Nunca participei",
          sacramentos: ["Batismo"],
          equipes_preferencia:
            origin === "IMPORT" ? departmentNames : ["Anjos"],
          aceite_formacao: true,
          aceite_regras: true,
          boolean_opcional: true,
          numero_opcional: 2,
          data_opcional: "2026-01-01",
          texto_oculto: "Resposta antiga preservada",
          aceite_orientacoes: false,
        },
        ...options.snapshot,
      };
      const person = options.personId
        ? await db.person.findUniqueOrThrow({ where: { id: options.personId } })
        : await db.person.create({
            data: {
              organizationId: org,
              name: String(snapshot.name),
              birthDate: new Date(String(snapshot.birthDate)),
              phone: String(snapshot.phone),
              email: "original@corrections.test",
              cpf: "52998224725",
            },
          });
      const draft =
        origin === "PUBLIC_FORM"
          ? await db.draft.create({
              data: {
                campaignId,
                formVersionId,
                tokenHash: randomUUID().replaceAll("-", "").repeat(2),
                expiresAt: new Date("2090-01-01"),
                payload: json(snapshot),
              },
            })
          : null;
      const importData = {
        source: {
          batchId: randomUUID(),
          rowId: randomUUID(),
          fileName: "fixture-sintetica.csv",
          submittedAt: "2026-01-01T12:00:00.000Z",
        },
        original: {
          headers: ["Nome", "Telefone"],
          cells: [snapshot.name, snapshot.phone],
        },
        baseline: snapshot,
        pending: ["Adicionar foto", "Termos gerais atuais não confirmados"],
        historical: { training: "Registro histórico fictício" },
      };
      const created = await db.registration.create({
        data: {
          protocol: `CORR-${randomUUID()}`,
          personId: person.id,
          campaignId,
          formVersionId,
          origin,
          draftId: draft?.id,
          accountId: origin === "PUBLIC_FORM" ? users.organizer.id : null,
          snapshot: json(snapshot),
          status: options.status ?? "RECEIVED",
          ...(origin === "IMPORT" ? { importData: json(importData) } : {}),
        },
      });
      if (origin === "PUBLIC_FORM") {
        await db.consent.create({
          data: {
            registrationId: created.id,
            version: "CORRECTIONS_TEST_TERMS",
            termsText: "Termos fictícios aceitos na inscrição original",
            accepted: true,
            imageAuthorized: false,
            guardianAuthorized: false,
          },
        });
        await db.healthSubmission.create({
          data: { registrationId: created.id, data: { hasAllergies: false } },
        });
      }
      return registration(created.id);
    }

    beforeAll(async () => {
      await db.account.createMany({
        data: Object.values(users).map((user) => ({
          ...user,
          profile: { name: "Perfil original fictício", emailVerified: true },
        })),
      });
      const organizations = await Promise.all(
        ["Correções isoladas", "Outra organização de correções"].map((name) =>
          db.organization.create({
            data: {
              name,
              city: "Cidade fictícia",
              state: "PR",
              contact: "Contato fictício",
            },
          }),
        ),
      );
      [org, otherOrg] = organizations.map((item) => item.id);
      for (const [who, organizationId, role] of [
        ["organizer", org, "ORGANIZER"],
        ["secretary", org, "SECRETARY"],
        ["other", otherOrg, "ORGANIZER"],
      ] as const)
        await db.membership.create({
          data: { organizationId, accountId: users[who].id, role },
        });
      const type = await db.eventType.create({
        data: { organizationId: org, name: "FAC correções" },
      });
      const event = await db.event.create({
        data: {
          organizationId: org,
          typeId: type.id,
          name: "Evento fictício de correções",
          description: "Evento isolado para validação de correções",
          location: "Local fictício",
          city: "Cidade fictícia",
          startsAt: new Date("2027-02-05"),
          endsAt: new Date("2027-02-09"),
          status: "PUBLISHED",
        },
      });
      const campaign = await db.campaign.create({
        data: {
          eventId: event.id,
          kind: "VOLUNTEER",
          opensAt: new Date("2020-01-01"),
          closesAt: new Date("2021-01-01"),
        },
      });
      campaignId = campaign.id;
      const config = volunteerTemplate("FAC", departmentNames);
      config.askCpf = true;
      config.askAddress = true;
      config.questions.push(
        {
          id: "boolean_opcional",
          label: "Pergunta opcional",
          type: "boolean",
          required: false,
          options: [],
        },
        {
          id: "numero_opcional",
          label: "Número opcional",
          type: "number",
          required: false,
          options: [],
        },
        {
          id: "data_opcional",
          label: "Data opcional",
          type: "date",
          required: false,
          options: [],
        },
        {
          id: "texto_oculto",
          label: "Pergunta oculta",
          type: "text",
          required: false,
          options: [],
        },
        {
          id: "aceite_orientacoes",
          label: "Aceite reservado",
          type: "boolean",
          required: false,
          options: [],
        },
      );
      config.layout = defaultLayout(config, "VOLUNTEER");
      config.layout.steps
        .flatMap((step) => step.fields)
        .find((field) => field.key === "question:texto_oculto")!.hidden = true;
      formVersionId = (
        await db.formVersion.create({
          data: {
            campaignId,
            version: 1,
            publishedAt: new Date(),
            config: json(config),
          },
        })
      ).id;
    });
    afterAll(async () => {
      await db.$disconnect();
    });

    it.each(["PUBLIC_FORM", "IMPORT"] as const)(
      "corrige %s com valores reais na auditoria e mantém decisão e origem",
      async (origin) => {
        const initial = await candidate(origin);
        const original = initial.importData as Record<string, unknown> | null;
        const response = await correct(initial.id, {
          name: "  Nome conferido fictício  ",
          phone: "(44) 98888-7777",
          cpf: "111.444.777-35",
          "question:cidade": "Cidade conferida - PR",
        });
        expect(response.status).toBe(200);
        expect(response.body.corrections).toHaveLength(1);
        expect(response.body.corrections[0]).toMatchObject({
          actor: {
            id: users.organizer.id,
            name: "Perfil original fictício",
            email: users.organizer.email,
          },
          reason,
          changes: expect.arrayContaining([
            {
              field: "name",
              label: "Nome completo",
              before: "Pessoa fictícia para correção",
              after: "Nome conferido fictício",
            },
          ]),
        });
        expect(
          new Date(response.body.corrections[0].createdAt).getTime(),
        ).not.toBeNaN();
        const saved = await registration(initial.id);
        expect(saved.snapshot).toMatchObject({
          name: "Nome conferido fictício",
          phone: "44988887777",
          cpf: "11144477735",
          answers: { cidade: "Cidade conferida - PR" },
        });
        expect(saved.person).toMatchObject({
          name: "Nome conferido fictício",
          phone: "44988887777",
          cpf: "11144477735",
        });
        expect(saved).toMatchObject({
          origin,
          status: initial.status,
          teamId: initial.teamId,
          accountId: initial.accountId,
          draftId: initial.draftId,
        });
        expect(saved.updatedAt.getTime()).toBeGreaterThan(
          initial.updatedAt.getTime(),
        );
        if (origin === "IMPORT") {
          expect(saved.importData).toMatchObject({
            source: original!.source,
            original: original!.original,
            baseline: original!.baseline,
          });
          expect(
            (saved.snapshot as { answers: { equipes_preferencia: string[] } })
              .answers.equipes_preferencia,
          ).toEqual(departmentNames);
        }
        const logs = await audit(initial.id);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
          actorId: users.organizer.id,
          organizationId: org,
        });
        expect(logs[0].details).toMatchObject({
          reason,
          actorId: users.organizer.id,
          changes: {
            name: {
              before: "Pessoa fictícia para correção",
              after: "Nome conferido fictício",
            },
            phone: { before: "44999999999", after: "44988887777" },
            cpf: { before: "52998224725", after: "11144477735" },
          },
          before: { snapshot: initial.snapshot, personId: initial.personId },
          after: { snapshot: saved.snapshot, personId: saved.personId },
        });
        const history = await db.statusHistory.findMany({
          where: { registrationId: initial.id },
        });
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({
          actorId: users.organizer.id,
          fromStatus: initial.status,
          toStatus: initial.status,
        });
        expect(history[0].reason).toContain(reason);
        expect(history[0].reason).toMatch(/nome/i);
        expect(history[0].reason).not.toContain("44988887777");
        expect(send).not.toHaveBeenCalled();
        expect(
          await db.decisionNotice.count({
            where: { registrationId: initial.id },
          }),
        ).toBe(0);
      },
    );

    it("salva email apenas como contato e preserva conta, prova, rascunho, saúde e aceites", async () => {
      const initial = await candidate();
      const before = await Promise.all([
        db.account.findUniqueOrThrow({ where: { id: users.organizer.id } }),
        db.draft.findUniqueOrThrow({ where: { id: initial.draftId! } }),
        db.consent.findUniqueOrThrow({ where: { registrationId: initial.id } }),
        db.healthSubmission.findUniqueOrThrow({
          where: { registrationId: initial.id },
        }),
      ]);
      expect(
        (await correct(initial.id, { email: "  Contato@Corrections.test  " }))
          .status,
      ).toBe(200);
      const saved = await registration(initial.id);
      expect(saved.snapshot).toMatchObject({
        email: "original@corrections.test",
        contactEmail: "contato@corrections.test",
        emailProof: (initial.snapshot as Record<string, unknown>).emailProof,
      });
      expect(saved.person.email).toBe(initial.person.email);
      expect(
        await Promise.all([
          db.account.findUniqueOrThrow({ where: { id: users.organizer.id } }),
          db.draft.findUniqueOrThrow({ where: { id: initial.draftId! } }),
          db.consent.findUniqueOrThrow({
            where: { registrationId: initial.id },
          }),
          db.healthSubmission.findUniqueOrThrow({
            where: { registrationId: initial.id },
          }),
        ]),
      ).toEqual(before);
      expect((await correct(initial.id, { email: null })).status).toBe(200);
      expect((await registration(initial.id)).snapshot).toMatchObject({
        contactEmail: "",
        email: "original@corrections.test",
      });
    });

    it("corrige os demais contatos e respostas visíveis sem alterar saúde ou aceites", async () => {
      const initial = await candidate();
      const overrides = {
        birthDate: "1999-02-03",
        address: "Endereço fictício conferido, 456",
        shirt: "G4",
        availability: "Noite e fim de semana",
        emergencyName: "Contato de emergência conferido",
        emergencyPhone: "(44) 98888-1111",
        emergencyAlternativePhone: "(44) 3333-2222",
        emergencyRelationship: "Pai",
        guardianName: "Responsável conferido",
        guardianPhone: "(44) 98888-2222",
        guardianEmail: "Responsavel-Conferido@corrections.test",
        guardianRelationship: "Pai",
        "question:numero_opcional": 0,
        "question:data_opcional": "2026-02-03",
        "question:sexo": "Masculino",
      };
      expect((await correct(initial.id, overrides)).status).toBe(200);
      const saved = await registration(initial.id);
      expect(saved.snapshot).toMatchObject({
        birthDate: overrides.birthDate,
        address: overrides.address,
        shirt: "G4",
        availability: overrides.availability,
        emergencyName: overrides.emergencyName,
        emergencyPhone: "44988881111",
        emergencyAlternativePhone: "4433332222",
        emergencyRelationship: "Pai",
        guardianName: overrides.guardianName,
        guardianPhone: "44988882222",
        guardianEmail: "responsavel-conferido@corrections.test",
        guardianRelationship: "Pai",
        termsAccepted: true,
        imageAuthorized: false,
        answers: {
          numero_opcional: 0,
          data_opcional: "2026-02-03",
          sexo: "Masculino",
          aceite_regras: true,
        },
      });
      expect(saved.person.birthDate.toISOString().slice(0, 10)).toBe(
        "1999-02-03",
      );
      expect(
        await db.healthSubmission.findUniqueOrThrow({
          where: { registrationId: initial.id },
        }),
      ).toMatchObject({ data: { hasAllergies: false } });
      expect(
        await db.consent.findUniqueOrThrow({
          where: { registrationId: initial.id },
        }),
      ).toMatchObject({
        accepted: true,
        imageAuthorized: false,
        guardianAuthorized: false,
      });
    });

    it("distingue false de ausência e permite limpar resposta opcional importada", async () => {
      const initial = await candidate("IMPORT");
      expect(
        (await correct(initial.id, { "question:boolean_opcional": false }))
          .status,
      ).toBe(200);
      expect((await registration(initial.id)).snapshot).toMatchObject({
        answers: { boolean_opcional: false },
      });
      expect(
        (
          await correct(initial.id, {
            "question:boolean_opcional": null,
            address: null,
            guardianEmail: null,
          })
        ).status,
      ).toBe(200);
      const saved = await registration(initial.id);
      const snapshot = saved.snapshot as Record<string, any>;
      expect(snapshot.answers.boolean_opcional ?? null).toBeNull();
      expect(snapshot.address ?? "").toBe("");
      expect(snapshot.guardianEmail ?? "").toBe("");
      const logs = await audit(initial.id);
      expect(logs[1].details).toMatchObject({
        changes: {
          "question:boolean_opcional": { before: false, after: null },
        },
      });
    });

    it("valida somente os campos alterados de fichas legadas incompletas", async () => {
      const initial = await candidate("PUBLIC_FORM", {
        snapshot: {
          shirt: "",
          availability: "",
          answers: { cidade: "", experiencia_evento: null },
        },
      });
      expect(
        (await correct(initial.id, { emergencyPhone: "(44) 98888-1111" }))
          .status,
      ).toBe(200);
      expect((await registration(initial.id)).snapshot).toMatchObject({
        shirt: "",
        availability: "",
        emergencyPhone: "44988881111",
        answers: { cidade: "", experiencia_evento: null },
      });
    });

    it.each([
      ["name", ""],
      ["birthDate", null],
      ["phone", "123"],
      ["cpf", "11111111111"],
      ["birthDate", "2026-02-31"],
      ["email", "inválido"],
      ["shirt", "G5"],
      ["emergencyPhone", "123"],
      ["guardianPhone", "abc"],
      ["guardianEmail", "inválido"],
      ["question:numero_opcional", "dois"],
      ["question:experiencia_evento", "false"],
      ["question:data_opcional", "2026-02-31"],
      ["question:sexo", "Opção inexistente"],
      ["question:equipes_preferencia", ["Equipe inexistente"]],
      ["question:desconhecida", "qualquer"],
      ["question:texto_oculto", "alteração"],
      ["question:aceite_formacao", true],
      ["question:aceite_regras", false],
      ["question:aceite_orientacoes", true],
      ["health:hasAllergies", true],
      ["termsAccepted", false],
      ["imageAuthorized", true],
      ["guardianAuthorization", true],
      ["photoAssetId", randomUUID()],
      ["status", "CONFIRMED"],
      ["teamId", randomUUID()],
      ["accountId", randomUUID()],
    ])(
      "rejeita correção inválida em %s sem efeito parcial",
      async (target, value) => {
        const initial = await candidate();
        const response = await correct(initial.id, {
          name: "Nome que deve reverter",
          [String(target)]: value,
        });
        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe("CORRECTION_VALIDATION");
        expect(response.body.error.fields.fieldErrors).toHaveProperty(
          String(target),
        );
        expect(await registration(initial.id)).toEqual(initial);
        expect(await audit(initial.id)).toHaveLength(0);
        expect(
          await db.statusHistory.count({
            where: { registrationId: initial.id },
          }),
        ).toBe(0);
      },
    );

    it("também exige identidade e valores válidos em importadas incompletas", async () => {
      const initial = await candidate("IMPORT");
      for (const overrides of [
        { name: null },
        { birthDate: "" },
        { phone: null },
        { phone: "123" },
        { cpf: "11111111111" },
      ]) {
        expect((await correct(initial.id, overrides)).status).toBe(422);
        expect(await registration(initial.id)).toEqual(initial);
      }
      expect(await audit(initial.id)).toHaveLength(0);
    });

    it.each([
      "shirt",
      "availability",
      "emergencyName",
      "question:cidade",
      "question:experiencia_evento",
      "question:equipes_preferencia",
    ])(
      "impede apagar obrigatório nativo %s e aceita pendência importada",
      async (target) => {
        const native = await candidate();
        expect((await correct(native.id, { [target]: null })).status).toBe(422);
        expect(await registration(native.id)).toEqual(native);
        const imported = await candidate("IMPORT");
        expect((await correct(imported.id, { [target]: null })).status).toBe(
          200,
        );
        const saved = await registration(imported.id);
        const pendingLabel: Record<string, string> = {
          shirt: "tamanho da camiseta",
          availability: "Disponibilidade",
          emergencyName: "Nome do contato de emergência",
          "question:cidade": "Cidade onde mora",
          "question:experiencia_evento": "Já participou ou serviu",
          "question:equipes_preferencia": "Em quais departamentos",
        };
        expect(
          (saved.importData as { pending: string[] }).pending.join(" "),
        ).toContain(pendingLabel[target]);
        expect(saved.status).toBe(imported.status);
      },
    );

    it("respeita três preferências nativas e preserva quatro preferências importadas", async () => {
      const native = await candidate();
      expect(
        (
          await correct(native.id, {
            "question:equipes_preferencia": departmentNames,
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await correct(native.id, {
            "question:equipes_preferencia": departmentNames.slice(0, 3),
          })
        ).status,
      ).toBe(200);
      const imported = await candidate("IMPORT");
      const importedPreferences = [...departmentNames].reverse();
      expect(
        (
          await correct(imported.id, {
            "question:equipes_preferencia": importedPreferences,
          })
        ).status,
      ).toBe(200);
      expect(
        (await correct(imported.id, { phone: "44988881111" })).status,
      ).toBe(200);
      expect((await registration(imported.id)).snapshot).toMatchObject({
        answers: { equipes_preferencia: importedPreferences },
      });
    });

    it("recusa revisão desatualizada e reverte todas as alterações", async () => {
      const initial = await candidate();
      expect((await correct(initial.id, { phone: "44988881111" })).status).toBe(
        200,
      );
      const winner = await registration(initial.id);
      const response = await correct(
        initial.id,
        { name: "Alteração perdedora", cpf: "11144477735" },
        { updatedAt: initial.updatedAt.toISOString() },
      );
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("REGISTRATION_REVISION_CONFLICT");
      expect(await registration(initial.id)).toEqual(winner);
      expect(await audit(initial.id)).toHaveLength(1);
      expect(
        await db.statusHistory.count({ where: { registrationId: initial.id } }),
      ).toBe(1);
    });

    it("isola uma pessoa compartilhada e preserva a outra inscrição e o perfil", async () => {
      const initial = await candidate();
      const sibling = await candidate("PUBLIC_FORM", {
        personId: initial.personId,
      });
      const account = await db.account.findUniqueOrThrow({
        where: { id: users.organizer.id },
      });
      const drafts = await db.draft.findMany({
        where: { id: { in: [initial.draftId!, sibling.draftId!] } },
        orderBy: { id: "asc" },
      });
      expect(
        (
          await correct(initial.id, {
            name: "Identidade conferida",
            phone: "44988881111",
            cpf: "11144477735",
          })
        ).status,
      ).toBe(200);
      const saved = await registration(initial.id);
      expect(saved.personId).not.toBe(initial.personId);
      expect(saved.person).toMatchObject({
        name: "Identidade conferida",
        phone: "44988881111",
        cpf: "11144477735",
        email: initial.person.email,
      });
      expect(await registration(sibling.id)).toEqual(sibling);
      expect(
        await db.person.findUniqueOrThrow({ where: { id: initial.personId } }),
      ).toEqual(initial.person);
      expect(
        await db.account.findUniqueOrThrow({
          where: { id: users.organizer.id },
        }),
      ).toEqual(account);
      expect(
        await db.draft.findMany({
          where: { id: { in: [initial.draftId!, sibling.draftId!] } },
          orderBy: { id: "asc" },
        }),
      ).toEqual(drafts);
    });

    it.each([false, true])(
      "protege identificação com documento do responsável assinado=%s",
      async (signed) => {
        const initial = await candidate("PUBLIC_FORM", {
          snapshot: { birthDate: "2011-01-01" },
        });
        const document = await db.guardianAuthorization.create({
          data: {
            registrationId: initial.id,
            tokenHash: randomUUID(),
            expiresAt: new Date("2090-01-01"),
            termsText: "Documento fictício para preservar",
            snapshot: { name: "Identificação original fictícia" },
            ...(signed
              ? {
                  signedAt: new Date(),
                  signedData: { name: "Responsável fictício" },
                  signature: [
                    [
                      { x: 0, y: 0 },
                      { x: 100, y: 100 },
                    ],
                  ],
                  receiptHash: "f".repeat(64),
                }
              : {}),
          },
        });
        for (const overrides of [
          { name: "Identidade diferente" },
          { birthDate: "2010-01-01" },
          { cpf: "11144477735" },
        ]) {
          const response = await correct(initial.id, overrides);
          expect(response.status).toBe(409);
          expect(response.body.error.code).toBe(
            "GUARDIAN_DOCUMENT_REVIEW_REQUIRED",
          );
        }
        expect(await registration(initial.id)).toEqual(initial);
        expect(
          (
            await correct(initial.id, {
              phone: "44988881111",
              guardianName: "Contato conferido",
              guardianPhone: "44988882222",
              guardianEmail: "contato-responsavel@corrections.test",
            })
          ).status,
        ).toBe(200);
        expect(
          await db.guardianAuthorization.findUniqueOrThrow({
            where: { registrationId: initial.id },
          }),
        ).toEqual(document);
      },
    );

    it("bloqueia transformar nativo confirmado em menor e mantém importado confirmado com pendências", async () => {
      const native = await candidate("PUBLIC_FORM", { status: "CONFIRMED" });
      expect(
        (await correct(native.id, { birthDate: "2011-01-01" })).status,
      ).toBe(409);
      expect(await registration(native.id)).toEqual(native);
      const imported = await candidate("IMPORT", { status: "CONFIRMED" });
      expect(
        (await correct(imported.id, { birthDate: "2011-01-01" })).status,
      ).toBe(200);
      const saved = await registration(imported.id);
      expect(saved.status).toBe("CONFIRMED");
      expect(saved.person.birthDate.toISOString().slice(0, 10)).toBe(
        "2011-01-01",
      );
      const detail = await request(app)
        .get(`/api/v1/organizations/${org}/registrations/${imported.id}`)
        .set(auth())
        .expect(200);
      expect(detail.body.pendingInformation.join(" ")).toMatch(/responsável/i);
      expect(
        await db.guardianAuthorization.count({
          where: { registrationId: imported.id },
        }),
      ).toBe(0);
    });

    it("limita correções ao organizador da organização e exige motivo e versão", async () => {
      const initial = await candidate();
      expect(
        (
          await correct(
            initial.id,
            { phone: "44988881111" },
            { who: "secretary" },
          )
        ).status,
      ).toBe(403);
      expect(
        (await correct(initial.id, { phone: "44988881111" }, { who: "other" }))
          .status,
      ).toBe(403);
      expect(
        (
          await correct(
            initial.id,
            { phone: "44988881111" },
            { who: "other", org: otherOrg },
          )
        ).status,
      ).toBe(404);
      await request(app)
        .patch(endpoint(initial.id))
        .send({
          updatedAt: initial.updatedAt.toISOString(),
          overrides: { phone: "44988881111" },
          reason,
        })
        .expect(401);
      for (const body of [
        {
          updatedAt: initial.updatedAt.toISOString(),
          overrides: { phone: "44988881111" },
          reason: "ab",
        },
        { overrides: { phone: "44988881111" }, reason },
        { updatedAt: initial.updatedAt.toISOString(), overrides: {}, reason },
      ])
        await request(app)
          .patch(endpoint(initial.id))
          .set(auth())
          .send(body)
          .expect(422);
      expect(await registration(initial.id)).toEqual(initial);
      expect(await audit(initial.id)).toHaveLength(0);
    });

    it("apresenta histórico antes/depois, autor e data sem evidências completas nem registros de outra organização", async () => {
      const initial = await candidate();
      const response = await correct(initial.id, {
        "question:boolean_opcional": false,
        "question:numero_opcional": 0,
      });
      expect(response.status).toBe(200);
      const dto = response.body.corrections[0];
      expect(Object.keys(dto).sort()).toEqual([
        "actor",
        "changes",
        "createdAt",
        "id",
        "reason",
      ]);
      expect(dto.changes).toEqual(
        expect.arrayContaining([
          {
            field: "question:boolean_opcional",
            label: "Pergunta opcional",
            before: true,
            after: false,
          },
          {
            field: "question:numero_opcional",
            label: "Número opcional",
            before: 2,
            after: 0,
          },
        ]),
      );
      await db.auditLog.createMany({
        data: [
          {
            organizationId: org,
            actorId: users.organizer.id,
            entityId: initial.id,
            action: "HEALTH_VIEWED",
            details: {
              reason: "Motivo privado fora das correções",
              changes: {
                name: { before: "Segredo de outra ação", after: "Outro dado" },
              },
            },
          },
          {
            organizationId: otherOrg,
            actorId: users.other.id,
            entityId: initial.id,
            action: "REGISTRATION_DATA_CORRECTED",
            details: {
              reason: "Motivo privado de outra organização",
              changes: {
                name: {
                  before: "Segredo da outra organização",
                  after: "Outro dado",
                },
              },
            },
          },
          {
            organizationId: org,
            actorId: users.organizer.id,
            entityId: initial.id,
            action: "REGISTRATION_DATA_CORRECTED",
            details: {
              reason: "Registro com campos protegidos",
              before: {
                snapshot: {
                  token: "credencial-privada",
                  health: { private: "dado-saude-privado" },
                },
              },
              changes: {
                photoAssetId: { before: "credencial-privada", after: null },
                "question:aceite_orientacoes": { before: false, after: true },
                "question:texto_oculto": {
                  before: "oculto-privado",
                  after: "Outro dado",
                },
                name: {
                  before: { nested: "objeto-privado" },
                  after: "Outro dado",
                },
              },
            },
          },
        ],
      });
      for (const who of ["organizer", "secretary"]) {
        const detail = await request(app)
          .get(`/api/v1/organizations/${org}/registrations/${initial.id}`)
          .set(auth(who))
          .expect(200);
        expect(detail.body.corrections).toEqual(response.body.corrections);
        expect(JSON.stringify(detail.body.corrections)).not.toMatch(
          /credencial-privada|dado-saude-privado|objeto-privado|oculto-privado|Segredo|Motivo privado/,
        );
        expect(JSON.stringify(detail.body.corrections)).not.toContain(
          "original@corrections.test",
        );
      }
      await request(app)
        .get(`/api/v1/organizations/${org}/registrations/${initial.id}`)
        .set(auth("other"))
        .expect(403);
      await request(app)
        .get(`/api/v1/organizations/${otherOrg}/registrations/${initial.id}`)
        .set(auth("other"))
        .expect(404);
    });
    it("mantém bloqueados snapshot e pessoa da inscrição em gravações diretas", async () => {
      for (const origin of ["PUBLIC_FORM", "IMPORT"] as const) {
        const initial = await candidate(origin);
        const other = await candidate(origin);
        await expect(
          db.registration.update({
            where: { id: initial.id },
            data: { snapshot: { name: "Sem auditoria" } },
          }),
        ).rejects.toThrow();
        await expect(
          db.registration.update({
            where: { id: initial.id },
            data: { personId: other.personId },
          }),
        ).rejects.toThrow();
        await expect(
          db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('fac.registration_correction', 'on', true)`;
            await tx.registration.update({
              where: { id: initial.id },
              data: { snapshot: { name: "Flag sem auditoria" } },
            });
          }),
        ).rejects.toThrow();
        expect(await registration(initial.id)).toEqual(initial);
      }
      expect(send).not.toHaveBeenCalled();
    });
  },
);
