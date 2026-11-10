import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { Registration } from "../lib/types";
import type {
  EventImportBatch,
  EventImportMapping,
  EventImportRow,
  EventImportRule,
  EventImportValue,
  ImportMetadata,
} from "../lib/participant-imports";
import { Field, Loading, Notice } from "./ui";
import { ImportValueControl as ValueControl } from "./ImportValueControl";
import { ImportDuplicateReferences } from "./ImportDuplicateReferences";

const steps = [
  "Destino e arquivo",
  "Associar colunas",
  "Normalizar respostas",
  "Conferir pessoas",
  "Confirmar importação",
  "Resultado",
  "Possíveis duplicidades",
];
const stateLabels: Record<string, string> = {
  MAPPING: "Associar colunas",
  REVIEW: "Em revisão",
  PARTIALLY_CONFIRMED: "Parcialmente confirmado",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
};
const show = (value: unknown): string =>
  value == null
    ? ""
    : Array.isArray(value)
      ? value.join("; ")
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
function effectiveValue(row: EventImportRow, target: string): EventImportValue {
  if (target in row.overrides) return row.overrides[target];
  if (target.startsWith("question:"))
    return row.payload.answers?.[target.slice(9)] ?? null;
  return (row.payload[target] as EventImportValue) ?? null;
}
export function EventParticipantImportWizard({
  organizationId,
  metadata,
  initialBatchId,
  onRefresh,
}: {
  organizationId: string;
  metadata: ImportMetadata;
  initialBatchId?: string | null;
  onRefresh: () => Promise<void>;
}) {
  const base = `/organizations/${organizationId}/participant-imports`;
  const [params, setParams] = useSearchParams();
  const [batch, setBatch] = useState<EventImportBatch | null>(null);
  const [loading, setLoading] = useState(!!initialBatchId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [formVersionId, setFormVersionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<{ name: string; rowCount: number }[]>(
    [],
  );
  const [sheet, setSheet] = useState("");
  const [mapping, setMapping] = useState<EventImportMapping[]>([]);
  const [rules, setRules] = useState<EventImportRule[]>([]);
  const [normalizing, setNormalizing] = useState("shirt");
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<EventImportRow | null>(null);
  const [distinctReason, setDistinctReason] = useState("");
  const [comparison, setComparison] = useState<Registration | null>(null);
  const [comparisonError, setComparisonError] = useState("");
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [cancelCheck, setCancelCheck] = useState(false);
  const [consultingRow, setConsultingRow] = useState(false);
  const destination = metadata.destinations?.find(
    (d) => d.campaignId === campaignId,
  );
  const nativeReplacement =
    editing?.decision === "REPLACE" &&
    editing.candidates.some(
      (candidate) =>
        candidate.id === editing.replaceId && candidate.origin !== "IMPORT",
    );
  const frozen = batch?.state === "CONFIRMED" || batch?.state === "CANCELLED";
  const step =
    batch?.view === "duplicates"
      ? 7
      : consultingRow
        ? 4
        : batch
          ? Math.max(2, Math.min(6, batch.step))
          : 1;
  const allMapped =
    !!batch &&
    batch.headers.every((_, column) =>
      mapping.some((m) => m.column === column && m.target && m.confirmed),
    ) &&
    ["name", "birthDate", "phone"].every((target) =>
      mapping.some((m) => m.target === target),
    );
  const eventBatches = metadata.batches.filter((b) => b.mode === "EVENT");
  const canImport = (row: EventImportRow) =>
    row.executionState === "PENDING" &&
    (row.ready ??
      (!["PENDING", "DISCARD"].includes(row.decision) &&
        !row.errors.length &&
        (!row.candidates.length ||
          row.decision === "REPLACE" ||
          row.reviewed)));

  function adopt(value: EventImportBatch, rowId?: string) {
    setBatch(value);
    setMapping(value.mapping ?? []);
    setRules(value.rules ?? []);
    if (!value.mapping.some((m) => m.target === normalizing))
      setNormalizing(
        value.catalog.find(
          (t) => !t.historical && value.mapping.some((m) => m.target === t.id),
        )?.id ?? "",
      );
    const openedRow = rowId ? value.rows.find((row) => row.id === rowId) : null;
    setEditing(openedRow ? structuredClone(openedRow) : null);
    setDistinctReason(openedRow?.distinctReason ?? "");
    setConsultingRow(!!openedRow);
    setCampaignId(value.campaign.id);
    setParams(
      {
        modo: "evento",
        lote: value.id,
        ...(value.view === "duplicates" ? { etapa: "7" } : {}),
        ...(rowId ? { linha: rowId } : {}),
      },
      { replace: true },
    );
    setSelected((current) =>
      batch && batch.id !== value.id
        ? []
        : current.filter((id) => {
            const row = value.rows.find((row) => row.id === id);
            return !row || canImport(row);
          }),
    );
  }
  async function openBatch(
    id: string,
    page = 1,
    view: "all" | "duplicates" = "all",
    rowId?: string,
  ) {
    const value = await api<EventImportBatch>(
      `${base}/${id}?page=${page}&pageSize=50${view === "duplicates" ? "&view=duplicates" : ""}${rowId ? `&rowId=${rowId}` : ""}`,
    );
    adopt(value, rowId);
  }
  function openRelatedRow(rowId: string, batchId = batch!.id) {
    void run(() => openBatch(batchId, 1, "all", rowId));
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? `${e.message} Recarregue o lote para conferir as alterações mais recentes.`
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings(settings: {
    mapping?: EventImportMapping[];
    rules?: EventImportRule[];
    step?: number;
  }) {
    if (!batch) return;
    adopt(
      await api<EventImportBatch>(`${base}/${batch.id}/settings`, {
        method: "PUT",
        body: { revision: batch.revision, ...settings },
      }),
    );
    await onRefresh();
  }
  useEffect(() => {
    if (!initialBatchId) return;
    let active = true;
    setLoading(true);
    const initialRow = params.get("linha") ?? undefined;
    const duplicateView = params.get("etapa") === "7";
    void api<EventImportBatch>(
      `${base}/${initialBatchId}?page=1&pageSize=50${duplicateView ? "&view=duplicates" : ""}${initialRow ? `&rowId=${initialRow}` : ""}`,
    )
      .then((value) => {
        if (active) adopt(value, initialRow);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, initialBatchId]);
  useEffect(() => {
    setComparison(null);
    setComparisonError("");
    const replacementId = editing?.replaceId;
    if (!replacementId) {
      setComparisonLoading(false);
      return;
    }
    const controller = new AbortController();
    setComparisonLoading(true);
    void api<Registration>(
      `/organizations/${organizationId}/registrations/${replacementId}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setComparison(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setComparisonError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setComparisonLoading(false);
      });
    return () => controller.abort();
  }, [organizationId, editing?.replaceId]);

  const displayedRows = useMemo(
    () =>
      batch?.rows.filter(
        (row) =>
          filter === "ALL" ||
          (filter === "NOT_IMPORTED" && row.executionState !== "IMPORTED") ||
          (filter === "READY" && canImport(row)) ||
          (filter === "PENDING" &&
            (row.errors.length > 0 ||
              row.pending.length > 0 ||
              row.decision === "PENDING")) ||
          (filter === "DUPLICATE" &&
            (row.duplicateRows.length > 0 || row.candidates.length > 0)) ||
          (filter === "DISCARDED" &&
            (row.decision === "DISCARD" ||
              row.executionState === "DISCARDED")) ||
          (filter === "IMPORTED" && row.executionState === "IMPORTED"),
      ) ?? [],
    [batch, filter],
  );
  const normalizationTarget = batch?.catalog.find((t) => t.id === normalizing);
  const normalizationColumn = mapping.find(
    (m) => m.target === normalizing,
  )?.column;
  const normalizationValues = batch?.columns?.find(
    (c) => c.column === normalizationColumn,
  );
  const values =
    normalizationValues?.values ??
    Array.from(
      new Set(
        batch?.rows.map(
          (row) => row.original.cells[normalizationColumn ?? -1] ?? "",
        ) ?? [],
      ),
    )
      .filter(Boolean)
      .map((value) => ({
        value,
        count: batch!.rows.filter(
          (row) => row.original.cells[normalizationColumn ?? -1] === value,
        ).length,
      }));
  function changeRule(from: string, to: EventImportValue) {
    setRules((current) => [
      ...current.filter(
        (rule) => rule.target !== normalizing || rule.from !== from,
      ),
      { target: normalizing, from, to },
    ]);
  }

  return (
    <div className="event-import-wizard">
      <Notice kind="info">
        Importe candidaturas para avaliar e distribuir vagas. Dados obrigatórios
        ausentes ficarão pendentes antes da confirmação final. Todas as
        preferências antigas de equipes serão preservadas.
      </Notice>
      <ol className="event-import-steps" aria-label="Etapas da importação">
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={step === index + 1 ? "step" : undefined}
          >
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {error && <Notice>{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      {loading && <Loading />}
      {metadata.eventReady === false && (
        <Notice>
          A importação de candidaturas aguarda a atualização do banco de dados.
        </Notice>
      )}
      {eventBatches.length > 0 && (
        <section className="panel">
          <Field label="Retomar importação de candidaturas">
            <select
              value={batch?.id ?? ""}
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) void run(() => openBatch(e.target.value));
              }}
            >
              <option value="">Selecione um lote</option>
              {eventBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fileName} · {stateLabels[b.state] ?? b.state} ·{" "}
                  {b._count.rows} respostas
                </option>
              ))}
            </select>
          </Field>
          {batch && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setBatch(null);
                setSelected([]);
                setFile(null);
                setSheets([]);
                setParams({ modo: "evento" }, { replace: true });
              }}
            >
              Iniciar outra importação
            </button>
          )}
        </section>
      )}
      {!batch && !loading && (
        <section className="panel">
          <h2>1. Destino e arquivo</h2>
          <div className="form-grid">
            <Field label="Evento e campanha de servos" required>
              <select
                value={campaignId}
                disabled={busy || metadata.eventReady === false}
                onChange={(e) => {
                  setCampaignId(e.target.value);
                  setFormVersionId(
                    metadata.destinations?.find(
                      (d) => d.campaignId === e.target.value,
                    )?.forms[0]?.id ?? "",
                  );
                }}
              >
                <option value="">Selecione o evento</option>
                {metadata.destinations
                  ?.filter(
                    (d) => !["CANCELLED", "COMPLETED"].includes(d.eventStatus),
                  )
                  .map((d) => (
                    <option key={d.campaignId} value={d.campaignId}>
                      {d.eventName}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="Versão da ficha para associação"
              required
              hint="Identifica os campos de destino; não representa aceite desta versão no Google Forms."
            >
              <select
                value={formVersionId}
                disabled={busy || !destination}
                onChange={(e) => setFormVersionId(e.target.value)}
              >
                <option value="">Selecione a versão</option>
                {destination?.forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    Versão {f.version}
                    {f.publishedAt ? " · publicada" : " · não publicada"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label="Arquivo de candidaturas"
            hint="CSV ou XLSX, até 10 MB, 100 colunas e 5.000 respostas."
          >
            <input
              type="file"
              accept=".csv,.xlsx"
              disabled={busy || metadata.eventReady === false}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setSheets([]);
                setSheet("");
              }}
            />
          </Field>
          {sheets.length > 1 && (
            <Field label="Aba para importar">
              <select
                value={sheet}
                disabled={busy}
                onChange={(e) => setSheet(e.target.value)}
              >
                {sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.rowCount} respostas)
                  </option>
                ))}
              </select>
            </Field>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              !file ||
              !campaignId ||
              !formVersionId ||
              metadata.eventReady === false
            }
            onClick={() =>
              void run(async () => {
                if (!file) return;
                if (file.size > 10 * 1024 * 1024)
                  throw new Error("Escolha um arquivo com até 10 MB.");
                if (!/\.(csv|xlsx)$/i.test(file.name))
                  throw new Error("Escolha um arquivo CSV ou XLSX.");
                if (!sheets.length && /\.xlsx$/i.test(file.name)) {
                  const inspect = new FormData();
                  inspect.append("file", file);
                  const result = await api<{
                    sheets: { name: string; rowCount: number }[];
                  }>(`${base}/inspect`, { method: "POST", body: inspect });
                  setSheets(result.sheets);
                  setSheet(result.sheets[0]?.name ?? "");
                  if (result.sheets.length > 1) {
                    setInfo("Escolha a aba e continue para salvar o lote.");
                    return;
                  }
                }
                const body = new FormData();
                body.append("file", file);
                body.append("campaignId", campaignId);
                body.append("formVersionId", formVersionId);
                if (sheet) body.append("sheet", sheet);
                adopt(
                  await api<EventImportBatch>(`${base}/event`, {
                    method: "POST",
                    body,
                  }),
                );
                await onRefresh();
                setInfo(
                  "Arquivo salvo. Você pode sair e retomar esta importação.",
                );
              })
            }
          >
            {busy ? "Salvando arquivo…" : "Salvar arquivo e associar colunas"}
          </button>
        </section>
      )}
      {batch && (
        <>
          <section className="panel event-import-summary">
            <h2>{batch.campaign.event.name}</h2>
            <p>
              {batch.fileName} · {batch.sheet} · {batch.summary.total} respostas
              · {stateLabels[batch.state]}
            </p>
            <p>
              {batch.summary.imported} incorporadas · {batch.summary.selected}{" "}
              prontas para incorporar · {batch.summary.pending} pendentes de
              revisão · {batch.summary.discarded} descartadas
            </p>
            <div className="previous-actions">
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    openBatch(
                      batch.id,
                      batch.page,
                      batch.view,
                      consultingRow ? editing?.id : undefined,
                    ),
                  )
                }
              >
                Recarregar lote
              </button>
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  void run(() => openBatch(batch.id, 1, "duplicates"))
                }
              >
                7. Conferir possíveis duplicidades
                {batch.duplicateCount !== undefined
                  ? ` (${batch.duplicateCount})`
                  : ""}
              </button>
              {!frozen && batch.summary.imported === 0 && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setCancelCheck(!cancelCheck)}
                >
                  Cancelar lote
                </button>
              )}
            </div>
            {cancelCheck && !frozen && (
              <Notice kind="info">
                Deseja cancelar este lote? As respostas originais continuarão
                preservadas, sem gerar candidaturas.{" "}
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      adopt(
                        await api<EventImportBatch>(
                          `${base}/${batch.id}/cancel`,
                          {
                            method: "POST",
                            body: { revision: batch.revision },
                          },
                        ),
                      );
                      setCancelCheck(false);
                      await onRefresh();
                    })
                  }
                >
                  Confirmar cancelamento do lote
                </button>
              </Notice>
            )}
          </section>
          {batch.state === "CANCELLED" ? (
            <Notice kind="info">
              Lote cancelado. As respostas e as candidaturas anteriormente
              incorporadas continuam preservadas.
            </Notice>
          ) : (
            <>
              {step === 2 && (
                <section className="panel">
                  <h2>2. Associar colunas</h2>
                  <p>
                    {mapping.filter((m) => m.confirmed && m.target).length}/
                    {batch.headers.length} colunas conferidas. Confira também os
                    destinos sugeridos antes de continuar.
                  </p>
                  <div className="event-import-mappings">
                    {batch.headers.map((header, column) => {
                      const item = mapping.find((m) => m.column === column);
                      const source = batch.columns?.find(
                        (c) => c.column === column,
                      );
                      return (
                        <section className="event-import-mapping" key={column}>
                          <h3>
                            {column + 1}. {header || "Sem título"}
                          </h3>
                          <p className="event-import-sample">
                            Exemplos:{" "}
                            {(
                              source?.samples ??
                              batch.rows
                                .slice(0, 3)
                                .map((row) => row.original.cells[column])
                            )
                              .filter(Boolean)
                              .join(" · ") || "Sem resposta"}
                          </p>
                          <Field label={`Destino da coluna ${column + 1}`}>
                            <select
                              disabled={busy || frozen}
                              value={item?.target ?? ""}
                              onChange={(e) =>
                                setMapping((current) => [
                                  ...current.filter((m) => m.column !== column),
                                  {
                                    column,
                                    target: e.target.value,
                                    confirmed: false,
                                  },
                                ])
                              }
                            >
                              <option value="">Escolha o destino</option>
                              {batch.catalog.map((t) => (
                                <option value={t.id} key={t.id}>
                                  {t.label}
                                  {t.hidden ? " · oculto na ficha" : ""}
                                  {t.historical ? " · histórico" : ""}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={item?.confirmed ?? false}
                              disabled={busy || frozen || !item?.target}
                              onChange={(e) =>
                                setMapping((current) =>
                                  current.map((m) =>
                                    m.column === column
                                      ? { ...m, confirmed: e.target.checked }
                                      : m,
                                  ),
                                )
                              }
                            />
                            Conferi a associação da coluna {column + 1}
                          </label>
                        </section>
                      );
                    })}
                  </div>
                  <div className="previous-actions">
                    <button
                      className="button outline"
                      disabled={
                        busy ||
                        frozen ||
                        mapping.filter((m) => m.target).length !==
                          batch.headers.length
                      }
                      onClick={() =>
                        setMapping((current) =>
                          current.map((m) => ({ ...m, confirmed: true })),
                        )
                      }
                    >
                      Confirmar associações exibidas
                    </button>
                    <button
                      className="button outline"
                      disabled={busy || frozen}
                      onClick={() =>
                        void run(() => saveSettings({ mapping, step: 2 }))
                      }
                    >
                      Salvar e continuar depois
                    </button>
                    <button
                      className="button primary"
                      disabled={busy || frozen || !allMapped}
                      onClick={() =>
                        void run(() => saveSettings({ mapping, step: 3 }))
                      }
                    >
                      Salvar associações e continuar
                    </button>
                  </div>
                </section>
              )}
              {step === 3 && (
                <section className="panel">
                  <h2>3. Normalizar respostas</h2>
                  <p>
                    Confira equivalências antes de aplicá-las às ocorrências
                    iguais. Correções individuais já salvas serão preservadas.
                  </p>
                  <Field label="Campo para normalizar">
                    <select
                      value={normalizing}
                      disabled={busy}
                      onChange={(e) => setNormalizing(e.target.value)}
                    >
                      {batch.catalog
                        .filter(
                          (t) =>
                            mapping.some((m) => m.target === t.id) &&
                            !t.historical,
                        )
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                    </select>
                  </Field>
                  {normalizationValues?.truncated && (
                    <Notice kind="info">
                      Mostrando os valores mais frequentes deste campo. Os
                      demais podem ser conferidos na revisão das pessoas.
                    </Notice>
                  )}
                  {normalizationTarget && (
                    <div className="previous-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Resposta original</th>
                            <th>Ocorrências</th>
                            <th>Equivalência</th>
                          </tr>
                        </thead>
                        <tbody>
                          {values.map(({ value, count }) => (
                            <tr key={value}>
                              <td className="event-import-cell">
                                {value || "Sem resposta"}
                              </td>
                              <td>{count}</td>
                              <td>
                                <ValueControl
                                  target={normalizationTarget}
                                  disabled={busy || frozen}
                                  value={
                                    rules.find(
                                      (rule) =>
                                        rule.target === normalizing &&
                                        rule.from === value,
                                    )?.to ?? null
                                  }
                                  onChange={(to) => changeRule(value, to)}
                                />
                                <small>
                                  Sem equivalência explícita, aplica-se apenas a
                                  normalização reconhecida pelo sistema.
                                </small>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p>
                    {rules.length} equivalências definidas. A resposta original
                    continuará preservada.
                  </p>
                  <div className="previous-actions">
                    <button
                      className="button outline"
                      disabled={busy || frozen}
                      onClick={() => void run(() => saveSettings({ step: 2 }))}
                    >
                      Voltar às associações
                    </button>
                    <button
                      className="button outline"
                      disabled={busy || frozen}
                      onClick={() =>
                        void run(() => saveSettings({ rules, step: 3 }))
                      }
                    >
                      Salvar equivalências
                    </button>
                    <button
                      className="button primary"
                      disabled={busy || frozen}
                      onClick={() =>
                        void run(() => saveSettings({ rules, step: 4 }))
                      }
                    >
                      Aplicar e conferir pessoas
                    </button>
                  </div>
                </section>
              )}
              {(step === 4 || step === 5) && (
                <section className="panel">
                  <h2>
                    {step === 4
                      ? "4. Conferir pessoas"
                      : "5. Confirmar importação"}
                  </h2>
                  <Notice kind="info">
                    Pendências complementares permitem importar, avaliar e
                    reservar vagas. Erros de identificação ou duplicidades sem
                    decisão precisam de revisão. Nenhuma mensagem será enviada
                    na importação.
                  </Notice>
                  {step === 4 && !frozen && (
                    <button
                      className="button outline"
                      disabled={
                        busy ||
                        !batch.rows.some(
                          (row) =>
                            row.executionState === "PENDING" &&
                            !row.reviewed &&
                            !row.errors.length &&
                            !row.duplicateRows.length &&
                            !row.candidates.length,
                        )
                      }
                      onClick={() =>
                        void run(async () => {
                          const rowIds = batch.rows
                            .filter(
                              (row) =>
                                row.executionState === "PENDING" &&
                                !row.reviewed &&
                                !row.errors.length &&
                                !row.duplicateRows.length &&
                                !row.candidates.length,
                            )
                            .map((row) => row.id);
                          adopt(
                            await api<EventImportBatch>(
                              `${base}/${batch.id}/review`,
                              {
                                method: "POST",
                                body: { revision: batch.revision, rowIds },
                              },
                            ),
                          );
                          setInfo(
                            "Linhas sem conflitos conferidas. As pendências complementares continuam registradas.",
                          );
                        })
                      }
                    >
                      Conferir linhas sem conflitos desta página
                    </button>
                  )}
                  <Field label="Filtrar linhas desta página">
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="ALL">Todas</option>
                      <option value="NOT_IMPORTED">Não incorporadas</option>
                      <option value="READY">Prontas para importar</option>
                      <option value="PENDING">Com pendências</option>
                      <option value="DUPLICATE">Possíveis duplicados</option>
                      <option value="DISCARDED">Descartadas</option>
                      <option value="IMPORTED">Já incorporadas</option>
                    </select>
                  </Field>
                  {step === 5 && (
                    <div className="previous-actions">
                      <button
                        className="button outline"
                        disabled={busy}
                        onClick={() =>
                          setSelected((current) =>
                            Array.from(
                              new Set([
                                ...current,
                                ...displayedRows
                                  .filter(canImport)
                                  .map((row) => row.id),
                              ]),
                            ),
                          )
                        }
                      >
                        Selecionar prontas desta página
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setSelected([])}
                      >
                        Limpar seleção
                      </button>
                      <span>{selected.length} linhas selecionadas</span>
                    </div>
                  )}
                  <div className="previous-table event-import-review-table">
                    <table>
                      <thead>
                        <tr>
                          {step === 5 && <th>Selecionar</th>}
                          <th>Linha</th>
                          <th>Nome</th>
                          <th>Telefone</th>
                          <th>Conferência</th>
                          <th>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRows.map((row) => (
                          <tr key={row.id}>
                            {step === 5 && (
                              <td data-label="Selecionar">
                                <input
                                  type="checkbox"
                                  aria-label={`Importar linha ${row.rowNumber}`}
                                  checked={selected.includes(row.id)}
                                  disabled={busy || !canImport(row)}
                                  onChange={(e) =>
                                    setSelected((current) =>
                                      e.target.checked
                                        ? [...current, row.id]
                                        : current.filter((id) => id !== row.id),
                                    )
                                  }
                                />
                              </td>
                            )}
                            <td data-label="Linha">{row.rowNumber}</td>
                            <td data-label="Nome">
                              {row.payload.name || "Sem nome"}
                            </td>
                            <td data-label="Telefone">
                              {row.payload.phone || "Não informado"}
                            </td>
                            <td data-label="Conferência">
                              {row.executionState === "IMPORTED"
                                ? "Incorporada"
                                : row.executionState === "DISCARDED" ||
                                    row.decision === "DISCARD"
                                  ? "Descartada"
                                  : row.errors.length
                                    ? "Revisar identificação"
                                    : row.decision === "PENDING"
                                      ? "Aguardando decisão"
                                      : "Pronta"}
                              {row.errors.map((e, i) => (
                                <small key={`e${i}`}>{e}</small>
                              ))}
                              {row.warnings.map((w, i) => (
                                <small key={`w${i}`}>{w}</small>
                              ))}
                              {row.pending.length > 0 && (
                                <small>
                                  Pendências complementares:{" "}
                                  {row.pending.join("; ")}
                                </small>
                              )}
                              {row.duplicateRows.length > 0 && (
                                <small>
                                  Possível repetição: linhas{" "}
                                  {row.duplicateRows.join(", ")}
                                </small>
                              )}
                              {row.candidates.length > 0 && (
                                <small>
                                  {row.candidates.length} candidatura(s)
                                  correspondente(s) no evento.
                                </small>
                              )}
                            </td>
                            <td data-label="Ação">
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() => {
                                  setEditing(structuredClone(row));
                                  setDistinctReason(row.distinctReason ?? "");
                                }}
                              >
                                {row.executionState === "PENDING"
                                  ? "Revisar"
                                  : "Consultar"}{" "}
                                linha {row.rowNumber}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!displayedRows.length && (
                      <p>Nenhuma linha neste filtro da página.</p>
                    )}
                  </div>
                  <div className="previous-actions">
                    <button
                      className="button outline"
                      disabled={busy || batch.page <= 1}
                      onClick={() =>
                        void run(() => openBatch(batch.id, batch.page - 1))
                      }
                    >
                      Linhas anteriores
                    </button>
                    <span>
                      Página {batch.page} de{" "}
                      {Math.max(
                        1,
                        Math.ceil(batch.summary.total / batch.pageSize),
                      )}
                    </span>
                    <button
                      className="button outline"
                      disabled={
                        busy ||
                        batch.page * batch.pageSize >= batch.summary.total
                      }
                      onClick={() =>
                        void run(() => openBatch(batch.id, batch.page + 1))
                      }
                    >
                      Próximas linhas
                    </button>
                  </div>
                  {editing && (
                    <section
                      className="previous-review"
                      aria-label={`Revisar candidatura da linha ${editing.rowNumber}`}
                    >
                      <h3>Linha {editing.rowNumber}</h3>
                      {(editing.duplicateRows.length > 0 ||
                        editing.candidates.length > 0) && (
                        <ImportDuplicateReferences
                          row={editing}
                          organizationId={organizationId}
                          eventId={batch.campaign.event.id}
                          busy={busy}
                          onOpenRow={openRelatedRow}
                        />
                      )}
                      <div className="form-grid">
                        {batch.catalog
                          .filter(
                            (t) =>
                              !t.historical &&
                              t.id !== "historical" &&
                              mapping.some((m) => m.target === t.id),
                          )
                          .map((target) => (
                            <Field
                              key={target.id}
                              label={target.label}
                              group={
                                target.type === "multiple" ||
                                [
                                  "question:cidade",
                                  "question:paroquia",
                                ].includes(target.id)
                              }
                              hint={
                                target.hidden
                                  ? "Oculto na ficha atual; a resposta original será preservada."
                                  : undefined
                              }
                            >
                              <ValueControl
                                target={target}
                                value={effectiveValue(editing, target.id)}
                                disabled={
                                  busy || editing.executionState !== "PENDING"
                                }
                                onChange={(value) =>
                                  setEditing({
                                    ...editing,
                                    overrides: {
                                      ...editing.overrides,
                                      [target.id]: value,
                                    },
                                  })
                                }
                              />
                            </Field>
                          ))}
                      </div>
                      {editing.executionState === "PENDING" && (
                        <>
                          <Field label="Decisão para a candidatura">
                            <select
                              value={editing.decision}
                              disabled={busy}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  decision: e.target
                                    .value as EventImportRow["decision"],
                                  replaceId: null,
                                })
                              }
                            >
                              <option value="PENDING">Manter pendente</option>
                              <option value="KEEP">Criar candidatura</option>
                              <option value="DISCARD">
                                Descartar esta resposta
                              </option>
                              {editing.candidates.length > 0 && (
                                <option value="REPLACE">
                                  Associar / atualizar candidatura existente
                                </option>
                              )}
                            </select>
                          </Field>
                          {editing.decision === "REPLACE" && (
                            <Field label="Candidatura existente">
                              <select
                                value={editing.replaceId ?? ""}
                                disabled={busy}
                                onChange={(e) =>
                                  setEditing({
                                    ...editing,
                                    replaceId: e.target.value || null,
                                  })
                                }
                              >
                                <option value="">
                                  Selecione a candidatura
                                </option>
                                {editing.candidates.map((candidate) => (
                                  <option
                                    key={candidate.id}
                                    value={candidate.id}
                                  >
                                    {candidate.name} ·{" "}
                                    {candidate.birthDate.slice(0, 10)} ·{" "}
                                    {candidate.phone} ·{" "}
                                    {candidate.same
                                      ? "mesmas respostas"
                                      : "respostas divergentes"}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          )}
                          {editing.decision === "REPLACE" &&
                            editing.replaceId && (
                              <section
                                aria-label="Comparar candidatura existente"
                                className="previous-review"
                              >
                                <h4>Comparar com a candidatura existente</h4>
                                {nativeReplacement && (
                                  <Notice kind="info">
                                    Esta inscrição foi enviada pela aplicação.
                                    Suas respostas serão preservadas; a
                                    importação será associada como origem
                                    complementar.
                                  </Notice>
                                )}
                                {comparisonLoading && <Loading />}
                                {comparisonError && (
                                  <Notice>{comparisonError}</Notice>
                                )}
                                {comparison && (
                                  <>
                                    {!nativeReplacement && (
                                      <p>
                                        A situação, o departamento e o vínculo
                                        com a conta serão preservados. Confira
                                        os valores que devem ser reaproveitados.
                                      </p>
                                    )}
                                    <dl className="previous-answers">
                                      {batch.catalog
                                        .filter(
                                          (target) =>
                                            !target.historical &&
                                            mapping.some(
                                              (item) =>
                                                item.target === target.id,
                                            ),
                                        )
                                        .map((target) => {
                                          const currentValue =
                                            target.id.startsWith("question:")
                                              ? comparison.snapshot.answers?.[
                                                  target.id.slice(9)
                                                ]
                                              : comparison.snapshot[
                                                  target.id as
                                                    | "name"
                                                    | "birthDate"
                                                    | "phone"
                                                    | "shirt"
                                                ];
                                          return (
                                            <div key={target.id}>
                                              <dt>{target.label}</dt>
                                              <dd>
                                                Na candidatura:{" "}
                                                {show(currentValue) ||
                                                  "Não informado"}
                                                <br />
                                                No arquivo após a conferência:{" "}
                                                {show(
                                                  effectiveValue(
                                                    editing,
                                                    target.id,
                                                  ),
                                                ) || "Não informado"}
                                                {currentValue !== undefined &&
                                                  !nativeReplacement && (
                                                    <div>
                                                      <button
                                                        className="text-button"
                                                        disabled={busy}
                                                        onClick={() =>
                                                          setEditing(
                                                            (previous) =>
                                                              previous &&
                                                              previous.replaceId ===
                                                                comparison.id
                                                                ? {
                                                                    ...previous,
                                                                    overrides: {
                                                                      ...previous.overrides,
                                                                      [target.id]:
                                                                        currentValue,
                                                                    },
                                                                  }
                                                                : previous,
                                                          )
                                                        }
                                                      >
                                                        Manter valor atual de{" "}
                                                        {target.label}
                                                      </button>
                                                    </div>
                                                  )}
                                              </dd>
                                            </div>
                                          );
                                        })}
                                    </dl>
                                  </>
                                )}
                              </section>
                            )}
                          {(editing.candidates.length > 0 ||
                            editing.duplicateRows.length > 0) &&
                            editing.decision === "KEEP" && (
                              <Field
                                label="Justificativa para manter pessoa distinta"
                                hint="Confirme que são pessoas distintas; sem comprovação, mantenha pendente ou descarte a repetição."
                              >
                                <textarea
                                  value={distinctReason}
                                  disabled={busy}
                                  onChange={(e) =>
                                    setDistinctReason(e.target.value)
                                  }
                                />
                              </Field>
                            )}
                          <button
                            className="button primary"
                            disabled={
                              busy ||
                              (editing.decision === "REPLACE" &&
                                !editing.replaceId)
                            }
                            onClick={() =>
                              void run(async () => {
                                const response = await api<EventImportBatch>(
                                  `${base}/${batch.id}/rows/${editing.id}`,
                                  {
                                    method: "PUT",
                                    body: {
                                      revision: editing.revision,
                                      decision: editing.decision,
                                      overrides: editing.overrides,
                                      replaceId: editing.replaceId,
                                      distinctReason:
                                        distinctReason || undefined,
                                    },
                                  },
                                );
                                adopt(response);
                                setInfo(
                                  "Revisão salva. O original foi preservado.",
                                );
                              })
                            }
                          >
                            Salvar revisão da candidatura
                          </button>
                        </>
                      )}
                      <button
                        className="text-button"
                        onClick={() => setEditing(null)}
                      >
                        Fechar revisão
                      </button>
                      <details>
                        <summary>Comparar com respostas originais</summary>
                        <dl className="previous-answers">
                          {editing.original.headers.map((header, i) => (
                            <div key={i}>
                              <dt>{header}</dt>
                              <dd>
                                {editing.original.cells[i] || "Não informado"}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    </section>
                  )}
                  <div className="previous-actions">
                    <button
                      className="button outline"
                      disabled={busy || frozen}
                      onClick={() =>
                        void run(() =>
                          saveSettings({ step: step === 4 ? 3 : 4 }),
                        )
                      }
                    >
                      {step === 4
                        ? "Voltar à normalização"
                        : "Voltar à conferência"}
                    </button>
                    {step === 4 ? (
                      <button
                        className="button primary"
                        disabled={busy || frozen}
                        onClick={() =>
                          void run(() => saveSettings({ step: 5 }))
                        }
                      >
                        Continuar para confirmação
                      </button>
                    ) : (
                      <button
                        className="button primary"
                        disabled={busy || frozen || !selected.length}
                        onClick={() =>
                          void run(async () => {
                            adopt(
                              await api<EventImportBatch>(
                                `${base}/${batch.id}/confirm`,
                                {
                                  method: "POST",
                                  body: {
                                    revision: batch.revision,
                                    rowIds: selected,
                                  },
                                },
                              ),
                            );
                            setSelected([]);
                            await onRefresh();
                            setInfo(
                              "Linhas selecionadas incorporadas. Nenhum e-mail ou aceite foi gerado.",
                            );
                          })
                        }
                      >
                        Confirmar {selected.length} candidatura(s)
                        selecionada(s)
                      </button>
                    )}
                  </div>
                </section>
              )}
              {step === 7 && (
                <section
                  className="panel"
                  aria-label="Conferência de possíveis duplicidades"
                >
                  <h2>7. Possíveis duplicidades</h2>
                  <Notice kind="info">
                    Esta conferência inclui linhas já incorporadas e
                    candidaturas existentes na campanha. Criar uma candidatura
                    como pessoa distinta mantém a coincidência visível com sua
                    justificativa. Confira antes de alterar uma candidatura na
                    gestão de inscrições.
                  </Notice>
                  <p>
                    {batch.duplicateCount ?? batch.filteredTotal ?? 0} respostas
                    com possíveis duplicidades neste lote.
                  </p>
                  {batch.rows.map((row) => (
                    <section
                      className="previous-review"
                      key={row.id}
                      aria-label={`Duplicidades da linha ${row.rowNumber}`}
                    >
                      <h3>
                        Linha {row.rowNumber} ·{" "}
                        {row.executionState === "IMPORTED"
                          ? "Já incorporada"
                          : "Ainda não incorporada"}
                      </h3>
                      <ImportDuplicateReferences
                        row={row}
                        organizationId={organizationId}
                        eventId={batch.campaign.event.id}
                        busy={busy}
                        onOpenRow={openRelatedRow}
                      />
                      <button
                        className="button outline"
                        disabled={busy}
                        onClick={() => openRelatedRow(row.id)}
                      >
                        {row.executionState === "IMPORTED"
                          ? "Consultar"
                          : "Revisar"}{" "}
                        linha {row.rowNumber}
                      </button>
                    </section>
                  ))}
                  {!batch.rows.length && (
                    <p>Nenhuma possível duplicidade encontrada neste lote.</p>
                  )}
                  <div className="previous-actions">
                    <button
                      className="button outline"
                      disabled={busy || batch.page <= 1}
                      onClick={() =>
                        void run(() =>
                          openBatch(batch.id, batch.page - 1, "duplicates"),
                        )
                      }
                    >
                      Duplicidades anteriores
                    </button>
                    <span>
                      Página {batch.page} de{" "}
                      {Math.max(
                        1,
                        Math.ceil((batch.filteredTotal ?? 0) / batch.pageSize),
                      )}
                    </span>
                    <button
                      className="button outline"
                      disabled={
                        busy ||
                        batch.page * batch.pageSize >=
                          (batch.filteredTotal ?? 0)
                      }
                      onClick={() =>
                        void run(() =>
                          openBatch(batch.id, batch.page + 1, "duplicates"),
                        )
                      }
                    >
                      Próximas duplicidades
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void run(() => openBatch(batch.id))}
                    >
                      Voltar ao lote
                    </button>
                  </div>
                </section>
              )}
              {step === 6 && (
                <section className="panel">
                  <h2>6. Resultado da importação</h2>
                  <p>
                    {batch.summary.imported} candidaturas incorporadas,{" "}
                    {batch.summary.discarded} respostas descartadas e{" "}
                    {Math.max(
                      0,
                      batch.summary.total -
                        batch.summary.imported -
                        batch.summary.discarded,
                    )}{" "}
                    linhas ainda não incorporadas ({batch.summary.pending}{" "}
                    pendentes de revisão).
                  </p>
                  <Notice kind="success">
                    As candidaturas incorporadas estão disponíveis para
                    avaliação e distribuição de vagas. A confirmação final exige
                    resolver as informações obrigatórias pendentes.
                  </Notice>
                  <div className="previous-actions">
                    <button
                      className="button outline"
                      disabled={busy}
                      onClick={() =>
                        void run(() => openBatch(batch.id, 1, "duplicates"))
                      }
                    >
                      Continuar para etapa 7
                    </button>
                    <Link
                      className="button primary"
                      to={`/organizacao/${organizationId}/inscricoes?evento=${batch.campaign.event.id}`}
                    >
                      Abrir gestão de inscrições
                    </Link>
                    {batch.state === "PARTIALLY_CONFIRMED" && (
                      <button
                        className="button outline"
                        disabled={busy}
                        onClick={() =>
                          void run(() => saveSettings({ step: 4 }))
                        }
                      >
                        Revisar linhas restantes
                      </button>
                    )}
                  </div>
                  <details>
                    <summary>Consultar linhas e origens deste lote</summary>
                    <div className="previous-answers">
                      {batch.rows.map((row) => (
                        <p key={row.id}>
                          Linha {row.rowNumber}:{" "}
                          {row.payload.name || "Sem nome"} ·{" "}
                          {row.executionState === "IMPORTED"
                            ? "Incorporada"
                            : row.executionState === "DISCARDED"
                              ? "Descartada"
                              : "Pendente"}
                        </p>
                      ))}
                    </div>
                  </details>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
