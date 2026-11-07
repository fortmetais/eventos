import { Link } from "react-router-dom";
import type { EventImportRow } from "../lib/participant-imports";
import { date, statusLabels, type RegistrationStatus } from "../lib/types";

export function ImportDuplicateReferences({
  row,
  organizationId,
  eventId,
  busy,
  onOpenRow,
}: {
  row: EventImportRow;
  organizationId: string;
  eventId: string;
  busy: boolean;
  onOpenRow: (rowId: string, batchId?: string) => void;
}) {
  const registrationLink = (id: string) =>
    `/organizacao/${organizationId}/inscricoes?evento=${eventId}&inscricao=${id}`;
  const identity = (data: EventImportRow["payload"]) => (
    <p>
      {data.name || "Sem nome"} · Nascimento:{" "}
      {data.birthDate ? date(data.birthDate) : "Não informado"} · Telefone:{" "}
      {data.phone || "Não informado"}
    </p>
  );
  return (
    <section
      className="previous-review"
      aria-label={`Possíveis duplicidades da linha ${row.rowNumber}`}
    >
      <h4>Comparar possíveis duplicidades</h4>
      <p>
        A correspondência considera nome e nascimento, inclusive identidades
        anteriores de candidaturas importadas. Confira os dados antes de decidir
        se é a mesma pessoa.
      </p>
      <strong>Esta resposta: linha {row.rowNumber}</strong>
      {identity(row.payload)}
      {row.registrationId && (
        <Link to={registrationLink(row.registrationId)}>
          Abrir candidatura desta linha
        </Link>
      )}
      {row.distinctReason && (
        <p>Justificativa registrada: {row.distinctReason}</p>
      )}
      {(row.relatedRows ?? []).map((other) => (
        <div key={other.id} className="previous-review">
          <strong>
            Linha {other.rowNumber} deste arquivo ·{" "}
            {other.executionState === "IMPORTED"
              ? "Já incorporada"
              : "Ainda não incorporada"}
          </strong>
          {identity(other.payload)}
          {other.distinctReason && (
            <p>Justificativa registrada: {other.distinctReason}</p>
          )}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => onOpenRow(other.id)}
          >
            Conferir linha {other.rowNumber}
          </button>
        </div>
      ))}
      {!row.relatedRows?.length && row.duplicateRows.length > 0 && (
        <p>Possível repetição nas linhas: {row.duplicateRows.join(", ")}.</p>
      )}
      {row.candidates.map((candidate) => (
        <div key={candidate.id} className="previous-review">
          <strong>Candidatura {candidate.protocol || candidate.id}</strong>
          {identity(candidate)}
          <p>
            {statusLabels[candidate.status as RegistrationStatus] ??
              candidate.status}{" "}
            ·{" "}
            {candidate.origin === "IMPORT"
              ? "Importada"
              : "Enviada pela aplicação"}{" "}
            ·{" "}
            {candidate.same
              ? "Mesmas respostas nos campos importados"
              : "Respostas divergentes"}
          </p>
          {candidate.sources?.map((source) => (
            <p key={source.rowId}>
              Origem: {source.fileName} · {source.sheet} · linha{" "}
              {source.rowNumber}{" "}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => onOpenRow(source.rowId, source.batchId)}
              >
                Consultar origem da linha {source.rowNumber}
              </button>
            </p>
          ))}
          <Link to={registrationLink(candidate.id)}>
            Abrir candidatura {candidate.protocol || candidate.id}
          </Link>
        </div>
      ))}
    </section>
  );
}
