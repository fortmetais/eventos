import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type ParticipantImportRow,
  type PreviousParticipant,
} from "@prisma/client";
import { z } from "zod";
import { assert } from "../../core/errors.js";
import { id, json } from "../../core/security.js";
import { fieldVisible } from "@fac/form-layout";
import {
  campaignIsOpen,
  type FormConfig,
} from "../events/events.validation.js";
import type { RegistrationsService } from "../registrations/registrations.service.js";
import {
  readWorkbook,
  mappedValues,
  mappingSchema,
  normalized,
  valuesSchema,
  type Values,
  fields,
  type Mapping,
} from "./workbook.js";

const decisionSchema = z
  .object({
    values: valuesSchema,
    decision: z.enum(["KEEP", "DISCARD", "REPLACE", "PENDING"]),
    replaceId: id.nullable().default(null),
  })
  .strict();
type Row = Pick<
  ParticipantImportRow,
  | "id"
  | "rowNumber"
  | "original"
  | "values"
  | "decision"
  | "reviewed"
  | "replaceId"
>;
type Profile = Pick<
  PreviousParticipant,
  "id" | "name" | "normalizedName" | "birthDate" | "normalizedPhone"
>;
export function analyzeRows(rows: Row[], profiles: Profile[]) {
  const prepared = rows.map((row) => ({
    ...row,
    normalized: normalized(row.values as unknown as Values),
  }));
  const profileGroups = new Map<string, Profile[]>();
  for (const p of profiles) {
    const key = `${p.normalizedName}|${p.birthDate.toISOString().slice(0, 10)}`;
    profileGroups.set(key, [...(profileGroups.get(key) ?? []), p]);
  }
  const groups = new Map<string, typeof prepared>();
  for (const row of prepared) {
    if (row.decision !== "DISCARD" && !row.normalized.errors.length)
      groups.set(row.normalized.nameBirth, [
        ...(groups.get(row.normalized.nameBirth) ?? []),
        row,
      ]);
  }
  return prepared.map(({ normalized: n, ...row }) => {
    const candidates = profileGroups.get(n.nameBirth) ?? [];
    const duplicates = (groups.get(n.nameBirth) ?? [])
      .filter((other) => other.id !== row.id)
      .slice(0, 30)
      .map((other) => other.rowNumber);
    const sharedPhone = prepared.some(
      (other) =>
        other.id !== row.id &&
        other.normalized.phone === n.phone &&
        other.normalized.normalizedName !== n.normalizedName,
    );
    return {
      ...row,
      errors: n.errors,
      warnings: [
        ...n.warnings,
        ...(sharedPhone
          ? ["Celular compartilhado com outro nome. Confira a identificação."]
          : []),
      ],
      duplicateRows: duplicates,
      candidates: candidates.map((p) => ({
        id: p.id,
        name: p.name,
        birthDate: p.birthDate.toISOString().slice(0, 10),
        phone: p.normalizedPhone,
      })),
      pending:
        row.decision !== "DISCARD" &&
        (n.errors.length > 0 ||
          row.decision === "PENDING" ||
          (!row.reviewed && (duplicates.length > 0 || candidates.length > 0))),
    };
  });
}

export class ParticipantImportsService {
  constructor(
    private db: PrismaClient,
    private registrations: RegistrationsService,
    public prefillEnabled = false,
  ) {}
  async ready() {
    const result = await this.db.$queryRaw<
      { ready: boolean }[]
    >`SELECT bool_and(to_regclass(nome) IS NOT NULL) AS ready FROM unnest(ARRAY['pessoas.lotes_importacao','pessoas.linhas_importacao','pessoas.cadastros_anteriores']) AS tabelas(nome)`;
    return result[0]?.ready === true;
  }
  async requireReady() {
    assert(
      await this.ready(),
      503,
      "A importação aguarda a configuração dos cadastros anteriores.",
      "PARTICIPANT_IMPORT_SETUP_REQUIRED",
    );
  }
  async metadata(organizationId: string) {
    const ready = await this.ready().catch(() => false);
    if (!ready)
      return { ready, prefillEnabled: this.prefillEnabled, batches: [] };
    const batches = await this.db.participantImport.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        fileName: true,
        sheet: true,
        state: true,
        createdAt: true,
        _count: { select: { rows: true } },
      },
    });
    return { ready, prefillEnabled: this.prefillEnabled, batches };
  }
  async preview(
    organizationId: string,
    actorId: string,
    file: { buffer: Buffer; originalname: string },
    sheetName: string,
    input: unknown,
  ) {
    await this.requireReady();
    const mapping = mappingSchema.parse(input);
    const hash = createHash("sha256").update(file.buffer).digest("hex");
    const sheets = await readWorkbook(file.buffer);
    const sheet = sheets.find((s) => s.name === sheetName);
    assert(sheet?.rows.length, 422, "Selecione uma aba com respostas.");
    assert(
      Object.values(mapping).every(
        (index) => index === null || index < sheet.headers.length,
      ),
      422,
      "Confira o mapeamento das colunas.",
    );
    const importId = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT organizacao_id FROM organizacoes.organizacoes WHERE organizacao_id = ${organizationId}::uuid FOR UPDATE`;
        const existing = await tx.participantImport.findUnique({
          where: {
            organizationId_fileHash_sheet: {
              organizationId,
              fileHash: hash,
              sheet: sheetName,
            },
          },
        });
        if (existing) {
          assert(
            fields.every(
              (key) => (existing.mapping as Mapping)[key] === mapping[key],
            ),
            409,
            "Este arquivo já tem um lote com outro mapeamento. Retome a importação existente na lista para revisar os dados.",
          );
          return existing.id;
        }
        const batch = await tx.participantImport.create({
          data: {
            organizationId,
            createdBy: actorId,
            fileHash: hash,
            fileName: file.originalname.slice(0, 255),
            sheet: sheetName,
            mapping: json(mapping),
          },
        });
        const rows = sheet.rows.map((row) => ({
          id: randomUUID(),
          importId: batch.id,
          organizationId,
          rowNumber: row.rowNumber,
          original: json({ headers: sheet.headers, cells: row.cells }),
          values: json(mappedValues(row.cells, mapping)),
          decision: "KEEP",
          reviewed: false,
          replaceId: null,
        }));
        const names = [
          ...new Set(
            rows.map((row) => normalized(row.values as Values).normalizedName),
          ),
        ];
        const profiles = await tx.previousParticipant.findMany({
          where: { organizationId, normalizedName: { in: names } },
        });
        const reports = analyzeRows(rows, profiles);
        await tx.participantImportRow.createMany({
          data: rows.map((row, i) => ({
            ...row,
            decision: reports[i].pending ? "PENDING" : "KEEP",
          })),
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            action: "PARTICIPANT_IMPORT_PREVIEW",
            entityId: batch.id,
          },
        });
        return batch.id;
      },
      { timeout: 30000 },
    );
    return this.batch(organizationId, importId);
  }
  private async load(
    db: Prisma.TransactionClient | PrismaClient,
    organizationId: string,
    importId: string,
  ) {
    const batch = await db.participantImport.findFirst({
      where: { id: importId, organizationId },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });
    assert(batch, 404, "Lote não encontrado.");
    const names = [
      ...new Set(
        batch.rows.map(
          (row) => normalized(row.values as unknown as Values).normalizedName,
        ),
      ),
    ];
    const profiles = await db.previousParticipant.findMany({
      where: { organizationId, normalizedName: { in: names } },
    });
    const reports = analyzeRows(batch.rows, profiles);
    if (batch.state === "CONFIRMED")
      for (const report of reports) report.pending = false;
    return { batch, reports, profiles };
  }
  async batch(
    organizationId: string,
    importId: string,
    page = 1,
    pageSize = 50,
  ) {
    await this.requireReady();
    const { batch, reports } = await this.load(
      this.db,
      organizationId,
      importId,
    );
    return {
      id: batch.id,
      fileName: batch.fileName,
      sheet: batch.sheet,
      state: batch.state,
      mapping: batch.mapping,
      createdAt: batch.createdAt,
      summary: {
        total: reports.length,
        discarded: reports.filter((r) => r.decision === "DISCARD").length,
        pending: reports.filter((r) => r.pending).length,
        selected: reports.filter((r) => r.decision !== "DISCARD" && !r.pending)
          .length,
      },
      page,
      pageSize,
      rows: reports.slice((page - 1) * pageSize, page * pageSize),
    };
  }
  async revise(
    organizationId: string,
    importId: string,
    rowId: string,
    actorId: string,
    input: unknown,
  ) {
    await this.requireReady();
    const data = decisionSchema.parse(input);
    await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT organizacao_id FROM organizacoes.organizacoes WHERE organizacao_id = ${organizationId}::uuid FOR UPDATE`;
        const { batch, reports } = await this.load(
          tx,
          organizationId,
          importId,
        );
        assert(batch.state === "PREVIEW", 409, "Este lote já foi confirmado.");
        const row = reports.find((r) => r.id === rowId);
        assert(row, 404, "Linha não encontrada.");
        if (data.decision === "REPLACE") {
          const n = normalized(data.values);
          assert(
            data.replaceId &&
              (await tx.previousParticipant.findFirst({
                where: {
                  id: data.replaceId,
                  organizationId,
                  normalizedName: n.normalizedName,
                  birthDate: new Date(n.birth || "1900-01-01"),
                },
              })),
            422,
            "Escolha um cadastro correspondente desta organização.",
          );
        } else
          assert(!data.replaceId, 422, "Remova o cadastro de substituição.");
        await tx.participantImportRow.update({
          where: { id: rowId },
          data: {
            values: json(data.values),
            decision: data.decision,
            replaceId: data.replaceId,
            reviewed: true,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            action: "PARTICIPANT_IMPORT_REVIEW",
            entityId: rowId,
          },
        });
      },
      { timeout: 30000 },
    );
    return { saved: true };
  }
  async confirm(organizationId: string, importId: string, actorId: string) {
    await this.requireReady();
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT organizacao_id FROM organizacoes.organizacoes WHERE organizacao_id = ${organizationId}::uuid FOR UPDATE`;
        const { batch, reports, profiles } = await this.load(
          tx,
          organizationId,
          importId,
        );
        if (batch.state === "CONFIRMED")
          return { confirmed: true, id: batch.id };
        assert(
          !reports.some((r) => r.pending),
          422,
          "Revise ou descarte todas as linhas pendentes antes de confirmar.",
        );
        const selected = reports.filter((r) => r.decision !== "DISCARD");
        assert(
          selected.length,
          422,
          "Selecione pelo menos um cadastro para importar.",
        );
        const keys = new Set<string>(),
          replacements = new Set<string>();
        const existingKeys = new Map(
          profiles.map((p) => [
            `${p.normalizedName}|${p.birthDate.toISOString().slice(0, 10)}|${p.normalizedPhone}`,
            p.id,
          ]),
        );
        for (const row of selected) {
          const n = normalized(row.values as unknown as Values);
          assert(
            !n.errors.length && !keys.has(n.identity),
            422,
            "Há linhas com a mesma identificação. Escolha uma e descarte as repetidas.",
          );
          keys.add(n.identity);
          if (row.decision === "REPLACE") {
            assert(
              row.replaceId &&
                !replacements.has(row.replaceId) &&
                profiles.some(
                  (p) =>
                    p.id === row.replaceId &&
                    `${p.normalizedName}|${p.birthDate.toISOString().slice(0, 10)}` ===
                      n.nameBirth,
                ),
              422,
              "Confira os cadastros que serão atualizados.",
            );
            replacements.add(row.replaceId);
          }
          const collision = existingKeys.get(n.identity);
          assert(
            !collision || collision === row.replaceId,
            422,
            "Já existe um cadastro com esses dados. Escolha atualizar o cadastro existente ou descarte a linha.",
          );
        }
        const prepared = selected.map((row) => {
          const n = normalized(row.values as unknown as Values);
          const data = {
            id: row.replaceId ?? randomUUID(),
            organizationId,
            name: n.name,
            normalizedName: n.normalizedName,
            birthDate: new Date(n.birth),
            phone: n.phone,
            normalizedPhone: n.phone,
            city: n.city || null,
            sex: n.sex || null,
            shirt: n.shirt || null,
            responses: row.original as Prisma.InputJsonValue,
          };
          return { row, data };
        });
        const creates = prepared.filter((p) => p.row.decision === "KEEP");
        const updates = prepared.filter((p) => p.row.decision === "REPLACE");
        for (let start = 0; start < creates.length; start += 250)
          await tx.previousParticipant.createMany({
            data: creates.slice(start, start + 250).map((p) => p.data),
          });
        for (let start = 0; start < updates.length; start += 250) {
          const values = updates
            .slice(start, start + 250)
            .map(
              ({ data: p }) =>
                Prisma.sql`(${p.id}::uuid, ${p.name}::text, ${p.normalizedName}::text, ${p.birthDate.toISOString().slice(0, 10)}::date, ${p.phone}::text, ${p.city}::text, ${p.sex}::text, ${p.shirt}::text, ${JSON.stringify(p.responses)}::jsonb)`,
            );
          await tx.$executeRaw(
            Prisma.sql`UPDATE pessoas.cadastros_anteriores AS p SET nome=v.nome, nome_normalizado=v.nome_normalizado, data_nascimento=v.nascimento, telefone=v.telefone, telefone_normalizado=v.telefone, cidade=v.cidade, sexo=v.sexo, camiseta=v.camiseta, respostas_originais=v.respostas, atualizado_em=now() FROM (VALUES ${Prisma.join(values)}) AS v(id,nome,nome_normalizado,nascimento,telefone,cidade,sexo,camiseta,respostas) WHERE p.cadastro_id=v.id AND p.organizacao_id=${organizationId}::uuid`,
          );
        }
        for (let start = 0; start < prepared.length; start += 500) {
          const values = prepared
            .slice(start, start + 500)
            .map((p) => Prisma.sql`(${p.row.id}::uuid, ${p.data.id}::uuid)`);
          await tx.$executeRaw(
            Prisma.sql`UPDATE pessoas.linhas_importacao AS r SET cadastro_id=v.cadastro FROM (VALUES ${Prisma.join(values)}) AS v(linha,cadastro) WHERE r.linha_id=v.linha AND r.lote_id=${importId}::uuid AND r.organizacao_id=${organizationId}::uuid`,
          );
        }
        await tx.participantImport.update({
          where: { id: importId },
          data: { state: "CONFIRMED" },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            action: "PARTICIPANT_IMPORT_CONFIRM",
            entityId: importId,
          },
        });
        return { confirmed: true, id: importId };
      },
      { timeout: 60000 },
    );
  }
  async profiles(
    organizationId: string,
    search: string,
    page: number,
    pageSize: number,
  ) {
    await this.requireReady();
    const where = {
      organizationId,
      ...(search
        ? {
            normalizedName: {
              contains: normalized({
                name: search,
                birthDate: "",
                phone: "",
                city: "",
                sex: "",
                shirt: "",
              }).normalizedName,
            },
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.previousParticipant.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          birthDate: true,
          phone: true,
          city: true,
          sex: true,
          shirt: true,
          updatedAt: true,
        },
      }),
      this.db.previousParticipant.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  async profile(organizationId: string, profileId: string) {
    await this.requireReady();
    const profile = await this.db.previousParticipant.findFirst({
      where: { id: profileId, organizationId },
      include: {
        sourceRows: {
          select: {
            rowNumber: true,
            original: true,
            values: true,
            batch: {
              select: {
                id: true,
                fileName: true,
                sheet: true,
                createdAt: true,
              },
            },
          },
          orderBy: { rowNumber: "asc" },
        },
      },
    });
    assert(profile, 404, "Cadastro não encontrado.");
    return profile;
  }
  async prefill(draftId: string, token: string, input: unknown) {
    const draft = await this.registrations.authorizedDraft(draftId, token);
    assert(
      !draft.registration && campaignIsOpen(draft.campaign),
      409,
      "A inscrição não está aberta para alterações.",
    );
    const identity = z
      .object({
        name: z.string().max(150),
        birthDate: z.string().max(20),
        phone: z.string().max(30),
      })
      .strict()
      .parse(input);
    const n = normalized({ ...identity, city: "", sex: "", shirt: "" });
    if (
      n.errors.length ||
      !this.prefillEnabled ||
      !(await this.ready().catch(() => false))
    )
      return { payload: {} };
    const matches = await this.db.previousParticipant.findMany({
      where: {
        organizationId: draft.campaign.event.organizationId,
        normalizedName: n.normalizedName,
        birthDate: new Date(n.birth),
        normalizedPhone: n.phone,
      },
      take: 2,
      select: { city: true, sex: true, shirt: true },
    });
    if (matches.length !== 1) return { payload: {} };
    const config = draft.form.config as unknown as FormConfig;
    const payload: { shirt?: string; answers?: Record<string, string> } = {};
    const p = matches[0];
    if (p.shirt && fieldVisible(config, draft.campaign.kind, "base:shirt"))
      payload.shirt = p.shirt;
    const answers: Record<string, string> = {};
    for (const [key, value] of [
      ["cidade", p.city],
      ["sexo", p.sex],
    ]) {
      const question = config.questions.find((q) => q.id === key);
      if (
        value &&
        question &&
        fieldVisible(config, draft.campaign.kind, `question:${key}`) &&
        (question.type === "text" ||
          (question.type === "single" && question.options.includes(value)))
      )
        answers[key!] = value;
    }
    if (Object.keys(answers).length) payload.answers = answers;
    return { payload };
  }
}
