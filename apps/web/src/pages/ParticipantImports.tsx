import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useOrganization } from "./Organization";
import { Field, Notice, PageHeading } from "../components/ui";
import {
  importFields,
  importLabels,
  type ImportField,
  type ImportMapping,
  type ImportRow,
  type ImportBatch,
  type OriginalAnswers,
  type PreviousParticipant,
} from "../lib/participant-imports";

type Sheet = {
  name: string;
  headers: string[];
  rowCount: number;
  mapping: ImportMapping;
};
type Metadata = {
  ready: boolean;
  prefillEnabled: boolean;
  batches: {
    id: string;
    fileName: string;
    sheet: string;
    state: string;
    _count: { rows: number };
  }[];
};
const decisions = {
  KEEP: "Manter cadastro",
  DISCARD: "Descartar linha",
  REPLACE: "Atualizar cadastro existente",
  PENDING: "Aguardando revisão",
};
function Original({ answers }: { answers: OriginalAnswers }) {
  return (
    <dl className="previous-answers">
      {answers.headers.map((header, i) => (
        <div key={i}>
          <dt>{header || `Coluna ${i + 1}`}</dt>
          <dd>{answers.cells[i] || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function ParticipantImports() {
  const org = useOrganization();
  if (org.membership.role !== "ORGANIZER")
    return <Notice>A importação é restrita ao organizador.</Notice>;
  return (
    <ImportPanel key={org.organizationId} organizationId={org.organizationId} />
  );
}
function ImportPanel({ organizationId }: { organizationId: string }) {
  const [params, setParams] = useSearchParams();
  const base = `/organizations/${organizationId}/participant-imports`;
  const profileBase = `/organizations/${organizationId}/previous-participants`;
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [editing, setEditing] = useState<ImportRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [search, setSearch] = useState("");
  const [profilePage, setProfilePage] = useState(1);
  const [profiles, setProfiles] = useState<{
    items: PreviousParticipant[];
    total: number;
  } | null>(null);
  const [detail, setDetail] = useState<PreviousParticipant | null>(null);
  const sheet = sheets.find((s) => s.name === sheetName);
  async function refresh() {
    setMetadata(await api<Metadata>(base));
  }
  async function openBatch(id: string, page = 1) {
    setBatch(await api<ImportBatch>(`${base}/${id}?page=${page}&pageSize=50`));
    setEditing(null);
    setParams({ lote: id }, { replace: true });
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void api<Metadata>(base)
      .then((value) => {
        if (active) setMetadata(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    const id = params.get("lote");
    if (id)
      void api<ImportBatch>(`${base}/${id}?pageSize=50`)
        .then((value) => {
          if (active) setBatch(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [base]);
  useEffect(() => {
    if (!metadata?.ready) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api<{ items: PreviousParticipant[]; total: number }>(
        `${profileBase}?search=${encodeURIComponent(search)}&page=${profilePage}&pageSize=20`,
        { signal: controller.signal },
      )
        .then(setProfiles)
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [metadata, search, profilePage, profileBase]);
  const requiredMapped =
    mapping &&
    [mapping.name, mapping.birthDate, mapping.phone].every(
      (v) => v !== null && v >= 0,
    );
  return (
    <div className="previous-participants">
      <PageHeading title="Cadastros anteriores">
        Importe respostas antigas e confira os dados antes de reutilizá-los em
        novas fichas.
      </PageHeading>
      {error && <Notice>{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      {metadata && !metadata.ready && (
        <Notice kind="info">
          A importação aguarda a configuração dos cadastros anteriores.
        </Notice>
      )}
      {metadata?.ready && !metadata.prefillEnabled && (
        <Notice kind="info">
          O autopreenchimento público está desativado. Importe e revise o
          primeiro lote antes de ativá-lo.
        </Notice>
      )}
      <section className="panel">
        <h2>Importar planilha</h2>
        <Field
          label="Arquivo Excel"
          hint="Formato XLSX, até 10 MB e 5.000 registros."
        >
          <input
            type="file"
            accept=".xlsx"
            disabled={busy || !metadata?.ready}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setSheets([]);
              setMapping(null);
            }}
          />
        </Field>
        <button
          className="button outline"
          disabled={!file || busy || !metadata?.ready}
          onClick={() =>
            void run(async () => {
              if (!file) return;
              if (file.size > 10 * 1024 * 1024)
                throw new Error("Escolha uma planilha com até 10 MB.");
              const body = new FormData();
              body.append("file", file);
              const result = await api<{ sheets: Sheet[] }>(`${base}/inspect`, {
                method: "POST",
                body,
              });
              setSheets(result.sheets);
              setSheetName(result.sheets[0].name);
              setMapping(result.sheets[0].mapping);
            })
          }
        >
          Ler planilha
        </button>
        {sheet && mapping && (
          <>
            <Field label="Aba da planilha">
              <select
                value={sheetName}
                disabled={busy}
                onChange={(e) => {
                  setSheetName(e.target.value);
                  setMapping(
                    sheets.find((s) => s.name === e.target.value)!.mapping,
                  );
                }}
              >
                {sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.rowCount} respostas)
                  </option>
                ))}
              </select>
            </Field>
            <p>
              Confira qual coluna representa cada informação. As demais
              respostas serão preservadas para consulta no painel.
            </p>
            <div className="form-grid">
              {importFields.map((field) => (
                <Field
                  key={field}
                  label={importLabels[field]}
                  required={["name", "birthDate", "phone"].includes(field)}
                >
                  <select
                    value={mapping[field] ?? -1}
                    disabled={busy}
                    onChange={(e) =>
                      setMapping({
                        ...mapping,
                        [field]:
                          Number(e.target.value) < 0
                            ? null
                            : Number(e.target.value),
                      })
                    }
                  >
                    <option value={-1}>Não importar este campo</option>
                    {sheet.headers.map((header, i) => (
                      <option key={i} value={i}>
                        {i + 1}. {header || "Sem título"}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <button
              className="button primary"
              disabled={busy || !requiredMapped}
              onClick={() =>
                void run(async () => {
                  const body = new FormData();
                  body.append("file", file!);
                  body.append("sheet", sheetName);
                  body.append("mapping", JSON.stringify(mapping));
                  const result = await api<ImportBatch>(`${base}/preview`, {
                    method: "POST",
                    body,
                  });
                  setBatch(result);
                  setEditing(null);
                  setParams({ lote: result.id }, { replace: true });
                  await refresh();
                  setInfo(
                    result.state === "CONFIRMED"
                      ? "Este arquivo já foi importado. Nenhum cadastro foi duplicado."
                      : "Prévia preparada. Confira as linhas antes de confirmar.",
                  );
                })
              }
            >
              Preparar prévia
            </button>
          </>
        )}
      </section>
      {!!metadata?.batches.length && (
        <section className="panel">
          <h2>Importações</h2>
          <Field label="Consultar lote">
            <select
              disabled={busy}
              value={batch?.id ?? ""}
              onChange={(e) => {
                if (e.target.value) void run(() => openBatch(e.target.value));
              }}
            >
              <option value="">Selecione uma importação</option>
              {metadata.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fileName} · {b.sheet} ·{" "}
                  {b.state === "CONFIRMED" ? "Confirmado" : "Em revisão"}
                </option>
              ))}
            </select>
          </Field>
        </section>
      )}
      {batch && (
        <section className="panel">
          <h2>Revisão: {batch.sheet}</h2>
          <p>
            {batch.summary.total} linhas · {batch.summary.selected} selecionadas
            · {batch.summary.pending} pendentes · {batch.summary.discarded}{" "}
            descartadas
          </p>
          {batch.state === "CONFIRMED" && (
            <Notice kind="success">
              Lote confirmado. Os cadastros e suas origens foram preservados.
            </Notice>
          )}
          <div className="previous-table">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Nome</th>
                  <th>Celular</th>
                  <th>Revisão</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.rowNumber}</td>
                    <td>{row.values.name}</td>
                    <td>{row.values.phone}</td>
                    <td>
                      {row.pending ? "Pendente" : decisions[row.decision]}
                      {!!row.errors.length && (
                        <small>{row.errors.join(" ")}</small>
                      )}
                      {!!row.duplicateRows.length && (
                        <small>
                          Mesmo nome e nascimento: linhas{" "}
                          {row.duplicateRows.join(", ")}.
                        </small>
                      )}
                      {!!row.candidates.length && (
                        <small>Há cadastros anteriores correspondentes.</small>
                      )}
                      {row.warnings.map((w, i) => (
                        <small key={i}>{w}</small>
                      ))}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          setEditing({ ...row, values: { ...row.values } })
                        }
                      >
                        {batch.state === "CONFIRMED" ? "Consultar" : "Revisar"}{" "}
                        linha {row.rowNumber}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              {Math.max(1, Math.ceil(batch.summary.total / batch.pageSize))}
            </span>
            <button
              className="button outline"
              disabled={
                busy || batch.page * batch.pageSize >= batch.summary.total
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
              aria-label={`Revisar linha ${editing.rowNumber}`}
            >
              <h3>Linha {editing.rowNumber}</h3>
              <div className="form-grid">
                {importFields.map((field) => (
                  <Field
                    key={field}
                    label={importLabels[field]}
                    hint={
                      field === "birthDate"
                        ? "AAAA-MM-DD ou DD/MM/AAAA"
                        : undefined
                    }
                  >
                    <input
                      value={editing.values[field]}
                      disabled={busy || batch.state === "CONFIRMED"}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          values: {
                            ...editing.values,
                            [field]: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
              {batch.state !== "CONFIRMED" && (
                <>
                  <Field label="Decisão para esta linha">
                    <select
                      disabled={busy}
                      value={editing.decision}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          decision: e.target.value as ImportRow["decision"],
                          replaceId: null,
                        })
                      }
                    >
                      {Object.entries(decisions)
                        .filter(
                          ([key]) =>
                            key !== "REPLACE" || editing.candidates.length,
                        )
                        .map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                    </select>
                  </Field>
                  {editing.decision === "REPLACE" && (
                    <Field label="Cadastro a atualizar">
                      <select
                        disabled={busy}
                        value={editing.replaceId ?? ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            replaceId: e.target.value || null,
                          })
                        }
                      >
                        <option value="">Selecione um cadastro</option>
                        {editing.candidates.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name} · {p.birthDate} · {p.phone}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      (editing.decision === "REPLACE" && !editing.replaceId)
                    }
                    onClick={() =>
                      void run(async () => {
                        await api(`${base}/${batch.id}/rows/${editing.id}`, {
                          method: "PUT",
                          body: {
                            values: editing.values,
                            decision: editing.decision,
                            replaceId: editing.replaceId,
                          },
                        });
                        await openBatch(batch.id, batch.page);
                        setInfo("Revisão salva.");
                      })
                    }
                  >
                    Salvar revisão
                  </button>
                </>
              )}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Fechar revisão
              </button>
              <details>
                <summary>Respostas originais da linha</summary>
                <Original answers={editing.original} />
              </details>
            </section>
          )}
          {batch.state !== "CONFIRMED" && (
            <button
              className="button primary"
              disabled={
                busy ||
                batch.summary.pending > 0 ||
                batch.summary.selected === 0
              }
              onClick={() =>
                void run(async () => {
                  await api(`${base}/${batch.id}/confirm`, { method: "POST" });
                  await openBatch(batch.id, batch.page);
                  await refresh();
                  setInfo(
                    "Importação concluída. Nenhuma inscrição ou aceite foi criado.",
                  );
                })
              }
            >
              Confirmar importação
            </button>
          )}
        </section>
      )}
      {metadata?.ready && (
        <section className="panel">
          <h2>Cadastros importados</h2>
          <Field label="Buscar cadastro pelo nome">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setProfilePage(1);
                setDetail(null);
              }}
            />
          </Field>
          <p>{profiles?.total ?? 0} cadastros encontrados.</p>
          <div className="previous-table">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Nascimento</th>
                  <th>Celular</th>
                  <th>Cidade</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {profiles?.items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.birthDate.slice(0, 10)}</td>
                    <td>{p.phone}</td>
                    <td>{p.city || "—"}</td>
                    <td>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () =>
                            setDetail(
                              await api<PreviousParticipant>(
                                `${profileBase}/${p.id}`,
                              ),
                            ),
                          )
                        }
                      >
                        Consultar {p.name}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="previous-actions">
            <button
              className="button outline"
              disabled={busy || profilePage <= 1}
              onClick={() => setProfilePage((p) => p - 1)}
            >
              Cadastros anteriores
            </button>
            <span>Página {profilePage}</span>
            <button
              className="button outline"
              disabled={busy || profilePage * 20 >= (profiles?.total ?? 0)}
              onClick={() => setProfilePage((p) => p + 1)}
            >
              Próximos cadastros
            </button>
          </div>
          {detail && (
            <section className="previous-review">
              <h3>{detail.name}</h3>
              <p>Código do cadastro: {detail.id}</p>
              <h4>Dados aprovados</h4>
              <dl className="previous-answers">
                {importFields.map((field) => (
                  <div key={field}>
                    <dt>{importLabels[field]}</dt>
                    <dd>
                      {field === "birthDate"
                        ? detail.birthDate.slice(0, 10)
                        : detail[field] || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
              <button className="text-button" onClick={() => setDetail(null)}>
                Fechar cadastro
              </button>
              {detail.sourceRows?.map((row, i) => (
                <details key={i} open={i === detail.sourceRows!.length - 1}>
                  <summary>
                    {row.batch.fileName} · {row.batch.sheet} · linha{" "}
                    {row.rowNumber}
                  </summary>
                  <Original answers={row.original} />
                </details>
              ))}
            </section>
          )}
        </section>
      )}
    </div>
  );
}
