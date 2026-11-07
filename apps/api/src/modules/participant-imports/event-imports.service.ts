import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError, assert } from "../../core/errors.js";
import { id, json } from "../../core/security.js";
import type { FormConfig } from "../events/events.validation.js";
import { registrationInclude } from "../registrations/registrations.repository.js";
import {
  readImportFile,
  eventImportCatalog,
  suggestEventMapping,
  validateEventMapping,
  normalizeEventRow,
  type EventImportNormalizedRow,
} from "./event-import-domain.js";
import { normalizeName, normalizePhone } from "./workbook.js";

type Tx = Prisma.TransactionClient;
const value = z.union([
  z.string().max(20000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(20000)).max(100),
  z.null(),
]);
const mappingSchema = z
  .array(
    z
      .object({
        column: z.number().int().min(0).max(99),
        target: z.string().min(1).max(120),
        confirmed: z.boolean(),
      })
      .strict(),
  )
  .max(100);
const rulesSchema = z
  .array(
    z
      .object({
        target: z.string().min(1).max(120),
        from: z.string().max(20000),
        to: value,
      })
      .strict(),
  )
  .max(5000);
const settingsSchema = z
  .object({
    revision: z.number().int().min(0),
    step: z.number().int().min(1).max(6).optional(),
    mapping: mappingSchema.optional(),
    rules: rulesSchema.optional(),
  })
  .strict();
const revisionSchema = z.object({ revision: z.number().int().min(0) }).strict();
const rowSchema = z
  .object({
    revision: z.number().int().min(0),
    decision: z.enum(["KEEP", "DISCARD", "REPLACE", "PENDING"]),
    overrides: z.record(z.string().max(120), value).default({}),
    replaceId: id.nullable().optional(),
    distinctReason: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
const confirmSchema = z
  .object({
    revision: z.number().int().min(0),
    rowIds: z.array(id).min(1).max(5000),
  })
  .strict();
const batchInclude = {
  rows: { orderBy: { rowNumber: "asc" as const } },
  campaign: { include: { event: { include: { teams: true } } } },
  form: true,
} satisfies Prisma.ParticipantImportInclude;
type Batch = Prisma.ParticipantImportGetPayload<{
  include: typeof batchInclude;
}>;
type Candidate = Prisma.RegistrationGetPayload<{ include: { person: true } }>;
type Mapping = z.infer<typeof mappingSchema>;
type Rules = z.infer<typeof rulesSchema>;
type Overrides = z.infer<typeof rowSchema>["overrides"];
const mutable = (batch: Batch) =>
  assert(
    !["CANCELLED", "CONFIRMED"].includes(batch.state),
    409,
    "Este lote já foi encerrado.",
  );
// JSONB can reorder object keys; compare structure, never serialization order.
const same = isDeepStrictEqual;
const asObject = (x: unknown): Record<string, any> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, any>)
    : {};
const originalOf = (row: Batch["rows"][number]) =>
  row.original as unknown as { headers: string[]; cells: string[] };
function identityOf(candidate: Candidate) {
  return `${normalizeName(candidate.person.name)}|${candidate.person.birthDate.toISOString().slice(0, 10)}`;
}
function candidateMatches(candidate: Candidate, nameBirth: string) {
  if (identityOf(candidate) === nameBirth) return true;
  if (candidate.origin !== "IMPORT") return false;
  const data = asObject(candidate.importData),
    baseline = asObject(data.baseline);
  const baselineIdentity =
    typeof baseline.name === "string" && typeof baseline.birthDate === "string"
      ? `${normalizeName(baseline.name)}|${baseline.birthDate}`
      : "";
  return (
    baselineIdentity === nameBirth ||
    (Array.isArray(data.identityAliases) &&
      data.identityAliases.includes(nameBirth))
  );
}
function incomingMatches(current: unknown, incoming: unknown): boolean {
  const a = asObject(current),
    b = asObject(incoming);
  return Object.keys(b).every((key) =>
    key === "answers"
      ? Object.entries(asObject(b.answers)).every(([k, v]) =>
          same(asObject(a.answers)[k], v),
        )
      : same(a[key], b[key]),
  );
}
/** Keep later edits: an import update only replaces an unchanged imported baseline. */
function protectedMerge(
  current: unknown,
  baseline: unknown,
  incoming: unknown,
) {
  const result = { ...asObject(current) };
  const old = asObject(baseline);
  const nextBaseline = { ...old };
  const mayReplace = (
    present: Record<string, any>,
    previous: Record<string, any>,
    key: string,
  ) =>
    Object.hasOwn(previous, key)
      ? same(present[key], previous[key])
      : !Object.hasOwn(present, key);
  for (const [key, next] of Object.entries(asObject(incoming))) {
    if (key === "answers") {
      const answers = { ...asObject(result.answers) },
        previous = asObject(old.answers),
        baselineAnswers = { ...previous };
      for (const [answer, val] of Object.entries(asObject(next))) {
        if (mayReplace(answers, previous, answer)) {
          answers[answer] = val;
          baselineAnswers[answer] = val;
        }
      }
      result.answers = answers;
      nextBaseline.answers = baselineAnswers;
    } else if (mayReplace(result, old, key)) {
      result[key] = next;
      nextBaseline[key] = next;
    }
  }
  return { snapshot: result, baseline: nextBaseline };
}

export class EventImportsService {
  constructor(private db: PrismaClient) {}
  async ready() {
    const result = await this.db.$queryRaw<
      { ready: boolean }[]
    >`SELECT count(*)=3 AS ready FROM information_schema.columns WHERE (table_schema,table_name,column_name) IN (('pessoas','lotes_importacao','modo'),('pessoas','linhas_importacao','execucao'),('inscricoes','inscricoes','dados_importacao'))`;
    return result[0]?.ready === true;
  }
  async requireReady() {
    assert(
      await this.ready(),
      503,
      "A importação de candidaturas aguarda a atualização 16 do banco.",
      "EVENT_IMPORT_SETUP_REQUIRED",
    );
  }
  async mode(organizationId: string, importId: string) {
    if (!(await this.ready().catch(() => false))) return "HISTORY";
    const batch = await this.db.participantImport.findFirst({
      where: { id: importId, organizationId },
      select: { mode: true },
    });
    return batch?.mode ?? "HISTORY";
  }
  async metadata(organizationId: string) {
    const eventReady = await this.ready().catch(() => false);
    if (!eventReady) return { eventReady, destinations: [] };
    const [destinations, batches] = await Promise.all([
      this.db.campaign.findMany({
        where: {
          kind: "VOLUNTEER",
          event: {
            organizationId,
            status: { notIn: ["CANCELLED", "COMPLETED"] },
          },
        },
        include: {
          event: { select: { id: true, name: true, status: true } },
          forms: {
            where: { publishedAt: { not: null } },
            orderBy: { version: "desc" },
            select: { id: true, version: true, publishedAt: true },
          },
        },
        orderBy: { event: { startsAt: "desc" } },
      }),
      this.db.participantImport.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          mode: true,
          campaignId: true,
          fileName: true,
          sheet: true,
          state: true,
          step: true,
          revision: true,
          createdAt: true,
          _count: { select: { rows: true } },
        },
      }),
    ]);
    return {
      eventReady,
      batches,
      destinations: destinations.map((c) => ({
        campaignId: c.id,
        eventId: c.event.id,
        eventName: c.event.name,
        eventStatus: c.event.status,
        forms: c.forms,
      })),
    };
  }
  private async load(
    db: PrismaClient | Tx,
    organizationId: string,
    importId: string,
  ) {
    const batch = await db.participantImport.findFirst({
      where: { id: importId, organizationId, mode: "EVENT" },
      include: batchInclude,
    });
    assert(
      batch?.campaign && batch.form,
      404,
      "Lote de candidaturas não encontrado.",
    );
    assert(
      batch.campaign.event.organizationId === organizationId &&
        batch.form.campaignId === batch.campaignId,
      409,
      "Confira o destino deste lote.",
    );
    return batch;
  }
  private available(batch: Batch) {
    assert(
      batch.campaign?.kind === "VOLUNTEER" &&
        !["CANCELLED", "COMPLETED"].includes(batch.campaign.event.status),
      409,
      "Este evento não aceita candidaturas importadas.",
    );
  }
  private async lock(tx: Tx, organizationId: string, importId: string) {
    await tx.$queryRaw`SELECT organizacao_id FROM organizacoes.organizacoes WHERE organizacao_id=${organizationId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT lote_id FROM pessoas.lotes_importacao WHERE lote_id=${importId}::uuid AND organizacao_id=${organizationId}::uuid FOR UPDATE`;
    const batch = await this.load(tx, organizationId, importId);
    // Keep event -> campaign lock ordering used by department/publication operations.
    await tx.$queryRaw`SELECT evento_id FROM eventos.eventos WHERE evento_id=${batch.campaign!.eventId}::uuid FOR UPDATE`;
    return this.load(tx, organizationId, importId);
  }
  private checkRevision(actual: number, expected: number) {
    assert(
      actual === expected,
      409,
      "Este registro foi alterado em outra tela. Atualize a página antes de continuar.",
      "IMPORT_REVISION_CONFLICT",
    );
  }
  private async audit(
    tx: Tx,
    organizationId: string,
    actorId: string,
    entityId: string,
    action: string,
  ) {
    await tx.auditLog.create({
      data: { organizationId, actorId, entityId, action },
    });
  }
  async create(
    organizationId: string,
    actorId: string,
    file: { buffer: Buffer; originalname: string },
    input: unknown,
  ) {
    await this.requireReady();
    const data = z
      .object({
        campaignId: id,
        formVersionId: id,
        sheet: z.string().min(1).max(100).optional(),
      })
      .strict()
      .parse(input);
    const sheets = await readImportFile(file.buffer, file.originalname);
    const sheet = data.sheet
      ? sheets.find((s) => s.name === data.sheet)
      : sheets[0];
    assert(sheet?.rows.length, 422, "Selecione uma aba com respostas.");
    const fileHash = createHash("sha256").update(file.buffer).digest("hex");
    const importId = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT organizacao_id FROM organizacoes.organizacoes WHERE organizacao_id=${organizationId}::uuid FOR UPDATE`;
        const form = await tx.formVersion.findFirst({
          where: {
            id: data.formVersionId,
            campaignId: data.campaignId,
            publishedAt: { not: null },
            campaign: { kind: "VOLUNTEER", event: { organizationId } },
          },
          include: {
            campaign: { include: { event: { include: { teams: true } } } },
          },
        });
        assert(
          form,
          422,
          "Selecione uma ficha publicada de servos desta organização.",
        );
        await tx.$queryRaw`SELECT evento_id FROM eventos.eventos WHERE evento_id=${form.campaign.eventId}::uuid FOR UPDATE`;
        const currentEvent = await tx.event.findUniqueOrThrow({
          where: { id: form.campaign.eventId },
          include: { teams: true },
        });
        form.campaign.event = currentEvent;
        assert(
          !["CANCELLED", "COMPLETED"].includes(form.campaign.event.status),
          409,
          "Este evento não aceita candidaturas importadas.",
        );
        const existing = await tx.participantImport.findUnique({
          where: {
            organizationId_fileHash_sheet_destinationKey: {
              organizationId,
              fileHash,
              sheet: sheet.name,
              destinationKey: data.campaignId,
            },
          },
        });
        if (existing) {
          assert(
            existing.formVersionId === data.formVersionId,
            409,
            "Este arquivo já tem um lote para esta campanha com outra versão. Retome-o para conferir.",
          );
          return existing.id;
        }
        const config = form.config as unknown as FormConfig;
        const catalog = eventImportCatalog(config, form.campaign.event.teams);
        const batch = await tx.participantImport.create({
          data: {
            organizationId,
            createdBy: actorId,
            fileHash,
            fileName: file.originalname.slice(0, 255),
            sheet: sheet.name,
            mode: "EVENT",
            destinationKey: data.campaignId,
            campaignId: data.campaignId,
            formVersionId: data.formVersionId,
            state: "MAPPING",
            step: 1,
            mapping: json(suggestEventMapping(sheet.headers, catalog)),
          },
        });
        await tx.participantImportRow.createMany({
          data: sheet.rows.map((r) => ({
            importId: batch.id,
            organizationId,
            rowNumber: r.rowNumber,
            original: json({ headers: sheet.headers, cells: r.cells }),
            values: {},
            decision: "PENDING",
          })),
        });
        await this.audit(
          tx,
          organizationId,
          actorId,
          batch.id,
          "EVENT_IMPORT_UPLOADED",
        );
        return batch.id;
      },
      { timeout: 30000 },
    );
    return this.batch(organizationId, importId);
  }
  private async reports(db: PrismaClient | Tx, batch: Batch) {
    const form = batch.form!.config as unknown as FormConfig;
    const departments = batch.campaign!.event.teams;
    const mapping = batch.mapping as unknown as Mapping,
      rules = batch.rules as unknown as Rules;
    const candidates = await db.registration.findMany({
      where: { campaignId: batch.campaignId!, status: { not: "CANCELLED" } },
      include: { person: true },
    });
    let mappingComplete = true;
    try {
      validateEventMapping(
        mapping,
        originalOf(batch.rows[0]).headers,
        eventImportCatalog(form, departments),
      );
    } catch {
      mappingComplete = false;
    }
    const results = batch.rows.map((row) => {
      const saved = asObject(row.values);
      if (row.executionState === "IMPORTED" && saved.normalized)
        return { row, result: saved.normalized as EventImportNormalizedRow };
      const original = originalOf(row);
      // Suggestions can be previewed before confirmation; no line is incorporable until the real mapping is complete.
      const provisionalMapping = original.headers.map((_, column) => ({
        ...(mapping.find((m) => m.column === column) ?? {
          column,
          target: `historical:${column}`,
        }),
        confirmed: true,
      }));
      try {
        return {
          row,
          result: normalizeEventRow(
            original,
            provisionalMapping,
            rules,
            form,
            departments,
            batch.campaign!.event.startsAt,
            row.overrides as unknown as Overrides,
          ),
        };
      } catch (error) {
        if (
          !(error instanceof AppError) ||
          error.status !== 422 ||
          mappingComplete
        )
          throw error;
        const result: EventImportNormalizedRow = {
          payload: { name: "", birthDate: "", phone: "", answers: {} },
          historical: {},
          metadata: {
            submittedAt: null,
            reportedAge: null,
            ageAtSubmission: null,
            ageAtEvent: null,
            instagram: null,
          },
          errors: [
            "Associe nome completo, nascimento e telefone para preparar esta resposta.",
          ],
          warnings: [],
          pending: [],
          identity: "",
          nameBirth: "",
          normalizedName: "",
          departmentIds: [],
          preferences: [],
          submittedAt: null,
          reportedAge: null,
        };
        return { row, result };
      }
    });
    return results.map(({ row, result }) => {
      const duplicateRows = results
        .filter(
          (o) =>
            o.row.id !== row.id &&
            o.row.decision !== "DISCARD" &&
            o.row.executionState !== "DISCARDED" &&
            !(
              row.registrationId && o.row.registrationId === row.registrationId
            ) &&
            !o.result.errors.length &&
            o.result.nameBirth === result.nameBirth,
        )
        .map((o) => o.row.rowNumber);
      const matches = candidates.filter(
        (c) =>
          candidateMatches(c, result.nameBirth) && c.id !== row.registrationId,
      );
      const needsReview =
        row.executionState === "PENDING" &&
        row.decision !== "DISCARD" &&
        (!mappingComplete ||
          !row.reviewed ||
          row.decision === "PENDING" ||
          result.errors.length > 0 ||
          ((duplicateRows.length > 0 || matches.length > 0) &&
            row.decision === "KEEP" &&
            !row.distinctReason));
      return {
        ...row,
        replaceId: row.replacementRegistrationId,
        ...result,
        original: originalOf(row),
        duplicateRows,
        candidates: matches.map((c) => ({
          id: c.id,
          protocol: c.protocol,
          name: c.person.name,
          birthDate: c.person.birthDate.toISOString().slice(0, 10),
          phone: c.person.phone,
          status: c.status,
          origin: c.origin,
          same: incomingMatches(c.snapshot, result.payload),
        })),
        ready: !needsReview && row.decision !== "DISCARD",
        needsReview,
      };
    });
  }
  async batch(
    organizationId: string,
    importId: string,
    page = 1,
    pageSize = 50,
    view: "all" | "duplicates" = "all",
    rowId?: string,
  ) {
    await this.requireReady();
    const batch = await this.load(this.db, organizationId, importId);
    const rows = await this.reports(this.db, batch);
    // Filter the whole batch before pagination, including frozen/imported rows.
    const duplicateRows = rows.filter(
      (r) =>
        r.decision !== "DISCARD" &&
        r.executionState !== "DISCARDED" &&
        (r.duplicateRows.length > 0 || r.candidates.length > 0),
    );
    const visibleRows = view === "duplicates" ? duplicateRows : rows;
    if (rowId) {
      const index = visibleRows.findIndex((row) => row.id === rowId);
      assert(index >= 0, 404, "Linha não encontrada neste lote e filtro.");
      page = Math.floor(index / pageSize) + 1;
    }
    const pageRows = visibleRows.slice((page - 1) * pageSize, page * pageSize);
    const candidateIds = [
      ...new Set(pageRows.flatMap((r) => r.candidates.map((c) => c.id))),
    ];
    const sources = candidateIds.length
      ? await this.db.participantImportRow.findMany({
          where: {
            organizationId,
            registrationId: { in: candidateIds },
            executionState: "IMPORTED",
            batch: { mode: "EVENT", campaignId: batch.campaignId },
          },
          select: {
            id: true,
            rowNumber: true,
            importId: true,
            registrationId: true,
            batch: { select: { fileName: true, sheet: true } },
          },
          orderBy: { rowNumber: "asc" },
        })
      : [];
    const headers = batch.rows.length ? originalOf(batch.rows[0]).headers : [];
    const columns = headers.map((_, column) => {
      const values = new Map<string, number>();
      for (const row of batch.rows) {
        const cell = originalOf(row).cells[column] ?? "";
        values.set(cell, (values.get(cell) ?? 0) + 1);
      }
      const sorted = [...values].sort((a, b) => b[1] - a[1]);
      return {
        column,
        samples: sorted.slice(0, 3).map(([v]) => v),
        values: sorted
          .slice(0, 500)
          .map(([value, count]) => ({ value, count })),
        distinctCount: sorted.length,
        truncated: sorted.length > 500,
      };
    });
    return {
      id: batch.id,
      mode: "EVENT",
      state: batch.state,
      step: batch.step,
      revision: batch.revision,
      fileName: batch.fileName,
      sheet: batch.sheet,
      campaign: {
        id: batch.campaignId,
        event: {
          id: batch.campaign!.event.id,
          name: batch.campaign!.event.name,
          startsAt: batch.campaign!.event.startsAt,
        },
      },
      formVersionId: batch.formVersionId,
      headers,
      columns,
      catalog: eventImportCatalog(
        batch.form!.config as unknown as FormConfig,
        batch.campaign!.event.teams,
      ),
      mapping: batch.mapping,
      rules: batch.rules,
      summary: {
        total: rows.length,
        selected: rows.filter(
          (r) =>
            r.executionState === "PENDING" &&
            r.decision !== "DISCARD" &&
            r.ready,
        ).length,
        discarded: rows.filter((r) => r.decision === "DISCARD").length,
        pending: rows.filter((r) => r.needsReview).length,
        imported: rows.filter((r) => r.executionState === "IMPORTED").length,
      },
      page,
      pageSize,
      view,
      filteredTotal: visibleRows.length,
      duplicateCount: duplicateRows.length,
      rows: pageRows.map((row) => ({
        ...row,
        relatedRows: rows
          .filter((other) => row.duplicateRows.includes(other.rowNumber))
          .map((other) => ({
            id: other.id,
            rowNumber: other.rowNumber,
            payload: {
              name: other.payload.name,
              birthDate: other.payload.birthDate,
              phone: other.payload.phone,
            },
            executionState: other.executionState,
            registrationId: other.registrationId,
            distinctReason: other.distinctReason,
          })),
        candidates: row.candidates.map((candidate) => ({
          ...candidate,
          sources: sources
            .filter((source) => source.registrationId === candidate.id)
            .map((source) => ({
              batchId: source.importId,
              rowId: source.id,
              rowNumber: source.rowNumber,
              fileName: source.batch.fileName,
              sheet: source.batch.sheet,
            })),
        })),
      })),
    };
  }
  async settings(
    organizationId: string,
    importId: string,
    actorId: string,
    input: unknown,
  ) {
    await this.requireReady();
    const data = settingsSchema.parse(input);
    await this.db.$transaction(
      async (tx) => {
        const batch = await this.lock(tx, organizationId, importId);
        mutable(batch);
        this.available(batch);
        this.checkRevision(batch.revision, data.revision);
        const headers = originalOf(batch.rows[0]).headers;
        const catalog = eventImportCatalog(
          batch.form!.config as unknown as FormConfig,
          batch.campaign!.event.teams,
        );
        const mapping = data.mapping ?? (batch.mapping as unknown as Mapping);
        const changed =
          (data.mapping !== undefined && !same(data.mapping, batch.mapping)) ||
          (data.rules !== undefined && !same(data.rules, batch.rules));
        const ids = new Set(catalog.map((c) => c.id));
        if ((data.step ?? batch.step) >= 3)
          validateEventMapping(mapping, headers, catalog);
        else
          assert(
            mapping.every(
              (m) =>
                m.column < headers.length &&
                (ids.has(m.target) ||
                  m.target === "historical" ||
                  /^historical:\d+$/.test(m.target)),
            ),
            422,
            "Confira os campos associados.",
          );
        if (data.rules) {
          assert(
            data.rules.every(
              (r) =>
                ids.has(r.target) ||
                r.target === "historical" ||
                /^historical:\d+$/.test(r.target),
            ),
            422,
            "Uma equivalência referencia um campo desconhecido.",
          );
          const keys = data.rules.map((r) => `${r.target}\u0000${r.from}`);
          assert(
            new Set(keys).size === keys.length,
            422,
            "Há equivalências repetidas para o mesmo valor.",
          );
        }
        if (changed) {
          assert(
            !batch.rows.some((r) => r.executionState === "IMPORTED"),
            409,
            "As associações de um lote parcialmente incorporado ficam preservadas. Corrija somente as linhas restantes.",
          );
          await tx.participantImportRow.updateMany({
            where: {
              importId,
              executionState: "PENDING",
              decision: { not: "DISCARD" },
            },
            data: { reviewed: false, revision: { increment: 1 } },
          });
        }
        await tx.participantImport.update({
          where: { id: importId },
          data: {
            ...(data.mapping !== undefined
              ? { mapping: json(data.mapping) }
              : {}),
            ...(data.rules !== undefined ? { rules: json(data.rules) } : {}),
            step: data.step ?? batch.step,
            state:
              batch.state === "PARTIALLY_CONFIRMED"
                ? batch.state
                : (data.step ?? batch.step) >= 3
                  ? "REVIEW"
                  : "MAPPING",
            revision: { increment: 1 },
          },
        });
        await this.audit(
          tx,
          organizationId,
          actorId,
          importId,
          "EVENT_IMPORT_SETTINGS_REVIEWED",
        );
      },
      { timeout: 30000 },
    );
    return this.batch(organizationId, importId);
  }
  async revise(
    organizationId: string,
    importId: string,
    rowId: string,
    actorId: string,
    input: unknown,
  ) {
    await this.requireReady();
    const data = rowSchema.parse(input);
    await this.db.$transaction(
      async (tx) => {
        const batch = await this.lock(tx, organizationId, importId);
        mutable(batch);
        this.available(batch);
        const row = batch.rows.find((r) => r.id === rowId);
        assert(row, 404, "Linha não encontrada.");
        assert(
          row.executionState !== "IMPORTED",
          409,
          "Esta linha já foi incorporada. Abra a candidatura para conferir alterações.",
        );
        this.checkRevision(row.revision, data.revision);
        const allowed = new Set(
          eventImportCatalog(
            batch.form!.config as unknown as FormConfig,
            batch.campaign!.event.teams,
          ).map((c) => c.id),
        );
        assert(
          Object.keys(data.overrides).every(
            (k) => allowed.has(k) || /^historical:\d+$/.test(k),
          ),
          422,
          "Uma correção referencia um campo desconhecido.",
        );
        let replacementRegistrationId: string | null = null;
        if (data.decision === "REPLACE") {
          assert(
            data.replaceId,
            422,
            "Selecione a candidatura que será atualizada.",
          );
          const replacement = await tx.registration.findFirst({
            where: {
              id: data.replaceId,
              campaignId: batch.campaignId!,
              campaign: { event: { organizationId } },
              status: { not: "CANCELLED" },
            },
            include: { person: true },
          });
          const normal = normalizeEventRow(
            originalOf(row),
            batch.mapping as unknown as Mapping,
            batch.rules as unknown as Rules,
            batch.form!.config as unknown as FormConfig,
            batch.campaign!.event.teams,
            batch.campaign!.event.startsAt,
            data.overrides,
          );
          assert(
            replacement && candidateMatches(replacement, normal.nameBirth),
            422,
            "Escolha uma candidatura correspondente deste evento.",
          );
          assert(
            replacement.origin !== "IMPORT" ||
              replacement.formVersionId === batch.formVersionId,
            409,
            "A candidatura utiliza outra versão da ficha. Revise a importação usando a mesma versão antes de atualizar.",
            "IMPORT_FORM_VERSION_CONFLICT",
          );
          replacementRegistrationId = replacement.id;
        } else
          assert(!data.replaceId, 422, "Remova a candidatura de substituição.");
        const reviewSnapshot =
          data.decision === "DISCARD"
            ? {}
            : normalizeEventRow(
                originalOf(row),
                batch.mapping as unknown as Mapping,
                batch.rules as unknown as Rules,
                batch.form!.config as unknown as FormConfig,
                batch.campaign!.event.teams,
                batch.campaign!.event.startsAt,
                data.overrides,
              );
        await tx.participantImportRow.update({
          where: { id: rowId },
          data: {
            overrides: json(data.overrides),
            decision: data.decision,
            reviewed: true,
            distinctReason: data.distinctReason || null,
            replacementRegistrationId,
            executionState: "PENDING",
            values: json({ reviewedResult: reviewSnapshot }),
            revision: { increment: 1 },
          },
        });
        await tx.participantImport.update({
          where: { id: importId },
          data: { revision: { increment: 1 } },
        });
        await this.audit(
          tx,
          organizationId,
          actorId,
          rowId,
          "EVENT_IMPORT_ROW_REVIEWED",
        );
      },
      { timeout: 30000 },
    );
    return this.batch(organizationId, importId);
  }
  async review(
    organizationId: string,
    importId: string,
    actorId: string,
    input: unknown,
  ) {
    await this.requireReady();
    const data = confirmSchema.parse(input);
    assert(
      new Set(data.rowIds).size === data.rowIds.length,
      422,
      "Não repita linhas na revisão.",
    );
    await this.db.$transaction(
      async (tx) => {
        const batch = await this.lock(tx, organizationId, importId);
        mutable(batch);
        this.available(batch);
        this.checkRevision(batch.revision, data.revision);
        validateEventMapping(
          batch.mapping as unknown as Mapping,
          originalOf(batch.rows[0]).headers,
          eventImportCatalog(
            batch.form!.config as unknown as FormConfig,
            batch.campaign!.event.teams,
          ),
        );
        const reports = await this.reports(tx, batch),
          selected = reports.filter((r) => data.rowIds.includes(r.id));
        assert(
          selected.length === data.rowIds.length,
          422,
          "Selecione somente linhas deste lote.",
        );
        for (const row of selected) {
          assert(
            row.executionState === "PENDING" &&
              row.decision !== "DISCARD" &&
              !row.errors.length &&
              !row.duplicateRows.length &&
              !row.candidates.length,
            422,
            "Confira individualmente as linhas com erros ou coincidências.",
          );
          const {
            payload,
            historical,
            metadata,
            errors,
            warnings,
            pending,
            identity,
            nameBirth,
            normalizedName,
            departmentIds,
            preferences,
            submittedAt,
            reportedAge,
          } = row;
          await tx.participantImportRow.update({
            where: { id: row.id },
            data: {
              decision: "KEEP",
              reviewed: true,
              values: json({
                reviewedResult: {
                  payload,
                  historical,
                  metadata,
                  errors,
                  warnings,
                  pending,
                  identity,
                  nameBirth,
                  normalizedName,
                  departmentIds,
                  preferences,
                  submittedAt,
                  reportedAge,
                },
              }),
              revision: { increment: 1 },
            },
          });
          await this.audit(
            tx,
            organizationId,
            actorId,
            row.id,
            "EVENT_IMPORT_ROW_REVIEWED",
          );
        }
        await tx.participantImport.update({
          where: { id: importId },
          data: { revision: { increment: 1 } },
        });
      },
      { timeout: 30000 },
    );
    return this.batch(organizationId, importId);
  }
  async confirm(
    organizationId: string,
    importId: string,
    actorId: string,
    input: unknown,
  ) {
    await this.requireReady();
    const data = confirmSchema.parse(input);
    assert(
      new Set(data.rowIds).size === data.rowIds.length,
      422,
      "Não repita linhas na confirmação.",
    );
    await this.db.$transaction(
      async (tx) => {
        const batch = await this.lock(tx, organizationId, importId);
        assert(batch.state !== "CANCELLED", 409, "Este lote foi cancelado.");
        this.available(batch);
        const selected = batch.rows.filter((r) => data.rowIds.includes(r.id));
        assert(
          selected.length === data.rowIds.length,
          422,
          "Selecione somente linhas deste lote.",
        );
        // A retry after a committed request is harmless, even with an old revision.
        if (selected.every((r) => r.executionState === "IMPORTED")) return;
        this.checkRevision(batch.revision, data.revision);
        assert(batch.state !== "CONFIRMED", 409, "Este lote já foi encerrado.");
        validateEventMapping(
          batch.mapping as unknown as Mapping,
          originalOf(batch.rows[0]).headers,
          eventImportCatalog(
            batch.form!.config as unknown as FormConfig,
            batch.campaign!.event.teams,
          ),
        );
        await tx.$queryRaw`SELECT campanha_id FROM eventos.campanhas WHERE campanha_id=${batch.campaignId}::uuid FOR UPDATE`;
        const currentCampaign = await tx.campaign.findFirst({
          where: { id: batch.campaignId!, event: { organizationId } },
          include: { event: { include: { teams: true } } },
        });
        assert(
          currentCampaign &&
            !["CANCELLED", "COMPLETED"].includes(currentCampaign.event.status),
          409,
          "Este evento não aceita candidaturas importadas.",
        );
        batch.campaign = currentCampaign;
        const reports = await this.reports(tx, batch);
        const selectedReports = reports.filter(
          (r) => data.rowIds.includes(r.id) && r.executionState !== "IMPORTED",
        );
        const replacementIds = selectedReports
          .map((r) => r.replacementRegistrationId)
          .filter(Boolean);
        assert(
          new Set(replacementIds).size === replacementIds.length,
          422,
          "Duas linhas não podem atualizar a mesma candidatura nesta confirmação.",
        );
        for (const row of selectedReports) {
          assert(
            row.ready && !row.errors.length,
            422,
            `Confira a resposta ${row.rowNumber} antes de incorporar.`,
          );
          const reviewed = asObject(asObject(row.values).reviewedResult);
          assert(
            same(reviewed.payload, row.payload) &&
              same(reviewed.departmentIds, row.departmentIds) &&
              same(reviewed.pending, row.pending),
            409,
            "Os dados ou departamentos mudaram desde a revisão. Confira novamente a resposta.",
            "IMPORT_REVIEW_CHANGED",
          );
          const source = {
            batchId: importId,
            rowId: row.id,
            fileName: batch.fileName,
            submittedAt: row.submittedAt,
          };
          const pending = [
            ...new Set([
              ...row.pending,
              "Termos gerais atuais não confirmados",
            ]),
          ];
          const importData = {
            source,
            original: row.original,
            historical: row.historical,
            pending,
            departmentIds: row.departmentIds,
            baseline: row.payload,
            identityAliases: [row.nameBirth],
          };
          let registrationId: string;
          if (row.decision === "REPLACE") {
            assert(
              row.replacementRegistrationId,
              422,
              "Selecione a candidatura de destino.",
            );
            await tx.$queryRaw`SELECT inscricao_id FROM inscricoes.inscricoes WHERE inscricao_id=${row.replacementRegistrationId}::uuid FOR UPDATE`;
            const target = await tx.registration.findFirst({
              where: {
                id: row.replacementRegistrationId,
                campaignId: batch.campaignId!,
                campaign: { event: { organizationId } },
                status: { not: "CANCELLED" },
              },
              include: { person: true },
            });
            assert(
              target && candidateMatches(target, row.nameBirth),
              409,
              "A candidatura correspondente mudou. Revise novamente.",
            );
            assert(
              target.origin !== "IMPORT" ||
                target.formVersionId === batch.formVersionId,
              409,
              "A candidatura utiliza outra versão da ficha. Revise a importação usando a mesma versão antes de atualizar.",
              "IMPORT_FORM_VERSION_CONFLICT",
            );
            const previous = asObject(target.importData);
            const { snapshot, baseline } = protectedMerge(
              target.snapshot,
              previous.baseline,
              row.payload,
            );
            const departmentsApplied = same(
              asObject(snapshot.answers).equipes_preferencia,
              row.payload.answers.equipes_preferencia,
            );
            const updatedImportData = {
              ...previous,
              ...importData,
              source: previous.source,
              original: previous.original,
              latestSource: source,
              latestOriginal: row.original,
              identityAliases: [
                ...new Set([
                  ...(Array.isArray(previous.identityAliases)
                    ? previous.identityAliases
                    : []),
                  identityOf(target),
                  row.nameBirth,
                ]),
              ],
              baseline,
              departmentIds: departmentsApplied
                ? row.departmentIds
                : (previous.departmentIds ?? []),
              ...(target.accountId || target.status === "CONFIRMED"
                ? { pending: previous.pending ?? pending }
                : {}),
              sources: [
                ...(Array.isArray(previous.sources)
                  ? previous.sources
                  : [previous.source]
                ).filter(Boolean),
                source,
              ],
            };
            // Native submissions are immutable: only associate the external source row.
            if (target.origin === "IMPORT") {
              await tx.$queryRaw`SELECT set_config('fac.import_correction','on',true)`;
              await tx.registration.update({
                where: { id: target.id },
                data: {
                  snapshot: json(snapshot),
                  importData: json(updatedImportData),
                },
              });
            }
            await tx.statusHistory.create({
              data: {
                registrationId: target.id,
                actorId,
                fromStatus: target.status,
                toStatus: target.status,
                reason:
                  target.origin === "IMPORT"
                    ? "Atualização expressamente revisada na importação de candidaturas."
                    : "Resposta externa associada após revisão; ficha original preservada.",
              },
            });
            registrationId = target.id;
          } else {
            const person = await tx.person.create({
              data: {
                organizationId,
                name: row.payload.name,
                birthDate: new Date(row.payload.birthDate),
                phone: row.payload.phone,
              },
            });
            const registration = await tx.registration.create({
              data: {
                origin: "IMPORT",
                importData: json(importData),
                protocol: `INS-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
                personId: person.id,
                campaignId: batch.campaignId!,
                formVersionId: batch.formVersionId!,
                snapshot: json(row.payload),
                status: "RECEIVED",
                history: {
                  create: {
                    actorId,
                    fromStatus: "RECEIVED",
                    toStatus: "RECEIVED",
                    reason:
                      "Candidatura incorporada após revisão do arquivo externo.",
                  },
                },
              },
            });
            registrationId = registration.id;
          }
          const {
            payload,
            historical,
            metadata,
            errors,
            warnings,
            identity,
            nameBirth,
            normalizedName,
            departmentIds,
            preferences,
            submittedAt,
            reportedAge,
          } = row;
          await tx.participantImportRow.update({
            where: { id: row.id },
            data: {
              registrationId,
              executionState: "IMPORTED",
              values: json({
                payload,
                historical,
                pending,
                normalized: {
                  payload,
                  historical,
                  metadata,
                  errors,
                  warnings,
                  pending,
                  identity,
                  nameBirth,
                  normalizedName,
                  departmentIds,
                  preferences,
                  submittedAt,
                  reportedAge,
                },
              }),
              revision: { increment: 1 },
            },
          });
          await this.audit(
            tx,
            organizationId,
            actorId,
            registrationId,
            row.decision === "REPLACE"
              ? "REGISTRATION_IMPORT_UPDATED"
              : "REGISTRATION_IMPORTED",
          );
        }
        await tx.participantImportRow.updateMany({
          where: { importId, decision: "DISCARD", executionState: "PENDING" },
          data: { executionState: "DISCARDED" },
        });
        const remaining = await tx.participantImportRow.count({
          where: { importId, executionState: "PENDING" },
        });
        await tx.participantImport.update({
          where: { id: importId },
          data: {
            revision: { increment: 1 },
            step: 6,
            state: remaining ? "PARTIALLY_CONFIRMED" : "CONFIRMED",
          },
        });
        await this.audit(
          tx,
          organizationId,
          actorId,
          importId,
          "EVENT_IMPORT_CONFIRMED",
        );
      },
      { timeout: 60000 },
    );
    return this.batch(organizationId, importId);
  }
  async updateRegistration(
    organizationId: string,
    registrationId: string,
    actorId: string,
    input: unknown,
  ) {
    await this.requireReady();
    const data = z
      .object({
        updatedAt: z.iso.datetime(),
        overrides: z.record(z.string().max(120), value),
        reason: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(input);
    assert(
      Object.keys(data.overrides).length > 0,
      422,
      "Informe ao menos um campo para corrigir.",
    );
    await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT organizacao_id FROM organizacoes.organizacoes WHERE organizacao_id=${organizationId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT inscricao_id FROM inscricoes.inscricoes WHERE inscricao_id=${registrationId}::uuid FOR UPDATE`;
        const registration = await tx.registration.findFirst({
          where: {
            id: registrationId,
            origin: "IMPORT",
            campaign: { event: { organizationId } },
          },
          include: {
            form: true,
            campaign: { include: { event: { include: { teams: true } } } },
          },
        });
        assert(registration, 404, "Candidatura importada não encontrada.");
        assert(
          registration.updatedAt.getTime() === Date.parse(data.updatedAt),
          409,
          "Esta candidatura foi alterada em outra tela. Atualize antes de corrigir.",
          "IMPORT_REVISION_CONFLICT",
        );
        const previous = asObject(registration.importData),
          source = asObject(previous.source);
        const batch = await tx.participantImport.findFirst({
          where: {
            id: source.batchId ?? "00000000-0000-0000-0000-000000000000",
            organizationId,
            mode: "EVENT",
            campaignId: registration.campaignId,
            formVersionId: registration.formVersionId,
          },
        });
        assert(
          batch &&
            Array.isArray(previous.original?.headers) &&
            Array.isArray(previous.original?.cells),
          409,
          "A origem desta candidatura precisa de conferência antes da correção.",
        );
        const form = registration.form.config as unknown as FormConfig;
        const catalog = eventImportCatalog(
          form,
          registration.campaign.event.teams,
        );
        const allowed = new Set(
          catalog
            .filter(
              (target) =>
                !target.hidden &&
                !target.historical &&
                (["name", "birthDate", "phone", "shirt"].includes(target.id) ||
                  target.id.startsWith("question:")),
            )
            .map((target) => target.id),
        );
        assert(
          Object.keys(data.overrides).every((target) => allowed.has(target)),
          422,
          "Corrija somente os dados básicos e perguntas disponíveis. Aceites e autorizações têm seu próprio fluxo.",
        );
        const current = asObject(registration.snapshot),
          answers = asObject(current.answers);
        const overrides: Overrides = {};
        for (const target of allowed) {
          if (target.startsWith("question:")) {
            const key = target.slice(9);
            if (Object.hasOwn(answers, key)) overrides[target] = answers[key];
          } else if (Object.hasOwn(current, target))
            overrides[target] = current[target];
        }
        Object.assign(overrides, data.overrides);
        const normalized = normalizeEventRow(
          previous.original,
          batch.mapping as unknown as Mapping,
          batch.rules as unknown as Rules,
          form,
          registration.campaign.event.teams,
          registration.campaign.event.startsAt,
          overrides,
        );
        assert(!normalized.errors.length, 422, normalized.errors.join(" "));
        const snapshot: Record<string, any> & { answers: Record<string, any> } =
          {
            ...current,
            ...normalized.payload,
            answers: { ...answers, ...normalized.payload.answers },
          };
        // An explicit clearing is a correction too, and must remain cleared on reimport.
        for (const target of Object.keys(data.overrides)) {
          if (target.startsWith("question:")) {
            const key = target.slice(9);
            if (!Object.hasOwn(normalized.payload.answers, key))
              delete snapshot.answers[key];
          } else if (!Object.hasOwn(normalized.payload, target))
            delete snapshot[target];
        }
        const now = new Date(
          Math.max(Date.now(), registration.updatedAt.getTime() + 1),
        );
        const changes = Object.fromEntries(
          Object.keys(data.overrides).map((target) => {
            const key = target.startsWith("question:")
              ? target.slice(9)
              : target;
            return [
              target,
              {
                before:
                  (target.startsWith("question:")
                    ? answers[key]
                    : current[key]) ?? null,
                after: data.overrides[target],
              },
            ];
          }),
        );
        const pending = [
          ...new Set([
            ...normalized.pending,
            "Termos gerais atuais não confirmados",
          ]),
        ];
        await tx.$queryRaw`SELECT set_config('fac.import_correction','on',true)`;
        await tx.registration.update({
          where: { id: registrationId },
          data: {
            snapshot: json(snapshot),
            updatedAt: now,
            importData: json({
              ...previous,
              pending,
              departmentIds: normalized.departmentIds,
              identityAliases: [
                ...new Set([
                  ...(Array.isArray(previous.identityAliases)
                    ? previous.identityAliases
                    : []),
                  `${normalizeName(String(current.name ?? ""))}|${String(current.birthDate ?? "")}`,
                  normalized.nameBirth,
                ]),
              ],
              corrections: [
                ...(Array.isArray(previous.corrections)
                  ? previous.corrections
                  : []),
                {
                  actorId,
                  at: now.toISOString(),
                  reason: data.reason,
                  changes,
                },
              ],
            }),
          },
        });
        await tx.person.update({
          where: { id: registration.personId },
          data: {
            name: normalized.payload.name,
            birthDate: new Date(normalized.payload.birthDate),
            phone: normalized.payload.phone,
          },
        });
        await tx.statusHistory.create({
          data: {
            registrationId,
            actorId,
            fromStatus: registration.status,
            toStatus: registration.status,
            reason: `Correção de dados importados: ${data.reason}`,
          },
        });
        await this.audit(
          tx,
          organizationId,
          actorId,
          registrationId,
          "REGISTRATION_IMPORT_CORRECTED",
        );
      },
      { timeout: 30000 },
    );
    return this.db.registration.findFirstOrThrow({
      where: { id: registrationId, campaign: { event: { organizationId } } },
      include: { ...registrationInclude, form: true, consent: true },
    });
  }
  async cancel(
    organizationId: string,
    importId: string,
    actorId: string,
    input: unknown,
  ) {
    await this.requireReady();
    const data = revisionSchema.parse(input);
    await this.db.$transaction(async (tx) => {
      const batch = await this.lock(tx, organizationId, importId);
      this.checkRevision(batch.revision, data.revision);
      mutable(batch);
      assert(
        !batch.rows.some((r) => r.executionState === "IMPORTED"),
        409,
        "Este lote já incorporou candidaturas. Faça correções pela gestão de inscrições.",
      );
      await tx.participantImport.update({
        where: { id: importId },
        data: { state: "CANCELLED", revision: { increment: 1 } },
      });
      await this.audit(
        tx,
        organizationId,
        actorId,
        importId,
        "EVENT_IMPORT_CANCELLED",
      );
    });
    return this.batch(organizationId, importId);
  }
}
