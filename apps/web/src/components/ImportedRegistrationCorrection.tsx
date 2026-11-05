import { useEffect, useState, type FormEvent } from "react";
import { fieldVisible, shirtSizes } from "@fac/form-layout";
import { api, ApiError } from "../lib/api";
import { formatBrazilianPhone } from "../lib/phone";
import type { EventImportValue } from "../lib/participant-imports";
import type { Question, Registration } from "../lib/types";
import { Field, Notice } from "./ui";

function QuestionCorrection({
  question,
  value,
  onChange,
  disabled,
}: {
  question: Question;
  value: EventImportValue;
  onChange: (value: EventImportValue) => void;
  disabled: boolean;
}) {
  if (question.type === "single" || question.type === "multiple")
    return (
      <select
        aria-label={question.label}
        multiple={question.type === "multiple"}
        size={
          question.type === "multiple"
            ? Math.min(6, question.options.length)
            : undefined
        }
        value={
          question.type === "multiple"
            ? Array.isArray(value)
              ? value
              : []
            : String(value ?? "")
        }
        disabled={disabled}
        onChange={(event) =>
          onChange(
            question.type === "multiple"
              ? Array.from(
                  event.target.selectedOptions,
                  (option) => option.value,
                )
              : event.target.value || null,
          )
        }
      >
        {question.type === "single" && <option value="">Não informado</option>}
        {question.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  if (question.type === "boolean")
    return (
      <select
        aria-label={question.label}
        value={value === true ? "true" : value === false ? "false" : ""}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? null : event.target.value === "true",
          )
        }
      >
        <option value="">Não informado</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  return (
    <input
      aria-label={question.label}
      type={
        question.type === "date"
          ? "date"
          : question.type === "number"
            ? "number"
            : "text"
      }
      value={String(value ?? "")}
      disabled={disabled}
      onChange={(event) =>
        onChange(
          question.type === "number"
            ? event.target.value === ""
              ? null
              : Number(event.target.value)
            : event.target.value,
        )
      }
    />
  );
}

export function ImportedRegistrationCorrection({
  registration,
  organizationId,
  onSaved,
}: {
  registration: Registration & { updatedAt?: string };
  organizationId: string;
  onSaved: (registration: Registration) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, EventImportValue>>(
    {},
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  useEffect(() => {
    setOverrides({});
    setReason("");
    setError("");
  }, [registration.id, registration.updatedAt]);
  if (registration.origin !== "IMPORT") return null;
  const config = registration.form?.config;
  const kind = registration.campaign.kind;
  const questions =
    config?.questions.filter(
      (question) =>
        !question.mustBeTrue &&
        !["aceite_formacao", "aceite_regras"].includes(question.id) &&
        fieldVisible(config, kind, `question:${question.id}`),
    ) ?? [];
  const current = (target: string): EventImportValue =>
    target in overrides
      ? overrides[target]
      : target.startsWith("question:")
        ? (registration.snapshot.answers?.[target.slice(9)] ?? null)
        : (registration.snapshot[
            target as "name" | "birthDate" | "phone" | "shirt"
          ] ?? null);
  const change = (target: string, value: EventImportValue) =>
    setOverrides((previous) => ({ ...previous, [target]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !registration.updatedAt ||
      !Object.keys(overrides).length ||
      reason.trim().length < 3
    )
      return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const value = await api<Registration>(
        `/organizations/${organizationId}/registrations/${registration.id}/imported-data`,
        {
          method: "PATCH",
          body: {
            updatedAt: registration.updatedAt,
            overrides,
            reason: reason.trim(),
          },
        },
      );
      await onSaved(value);
      setOverrides({});
      setReason("");
      setOpen(false);
      setInfo("Correção registrada no histórico da candidatura.");
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? `${e.message} Recarregue a candidatura antes de corrigir novamente.`
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="previous-review"
      aria-label="Correção da candidatura importada"
    >
      <h3>Dados importados</h3>
      <p>
        Corrija informações após a conferência. A resposta original ficará
        preservada e a alteração exigirá uma justificativa.
      </p>
      {error && <Notice>{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      {!open ? (
        <button className="button outline" onClick={() => setOpen(true)}>
          Corrigir dados importados
        </button>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <Field label="Nome completo">
              <input
                value={String(current("name") ?? "")}
                disabled={busy}
                onChange={(event) => change("name", event.target.value)}
              />
            </Field>
            <Field label="Data de nascimento">
              <input
                type="date"
                value={String(current("birthDate") ?? "")}
                disabled={busy}
                onChange={(event) => change("birthDate", event.target.value)}
              />
            </Field>
            <Field label="Telefone/WhatsApp">
              <input
                type="tel"
                placeholder="(00) 00000-0000"
                value={formatBrazilianPhone(String(current("phone") ?? ""))}
                disabled={busy}
                onChange={(event) =>
                  change("phone", formatBrazilianPhone(event.target.value))
                }
              />
            </Field>
            {config?.askShirt && fieldVisible(config, kind, "base:shirt") && (
              <Field label="Tamanho da camiseta">
                <select
                  value={String(current("shirt") ?? "")}
                  disabled={busy}
                  onChange={(event) =>
                    change("shirt", event.target.value || null)
                  }
                >
                  <option value="">Não informado</option>
                  {shirtSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {questions.map((question) => (
              <Field
                key={question.id}
                label={question.label}
                hint={
                  question.id === "equipes_preferencia"
                    ? "Preferências importadas podem conter mais de três equipes. Esta correção não altera a alocação."
                    : undefined
                }
              >
                <QuestionCorrection
                  question={question}
                  value={current(`question:${question.id}`)}
                  onChange={(value) => change(`question:${question.id}`, value)}
                  disabled={busy}
                />
              </Field>
            ))}
          </div>
          <Field label="Motivo da correção" required>
            <textarea
              value={reason}
              disabled={busy}
              minLength={3}
              required
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {!registration.updatedAt && (
            <Notice kind="info">
              Recarregue a candidatura para obter a versão atual antes de
              salvar.
            </Notice>
          )}
          <div className="previous-actions">
            <button
              className="button primary"
              disabled={
                busy ||
                !registration.updatedAt ||
                !Object.keys(overrides).length ||
                reason.trim().length < 3
              }
            >
              {busy
                ? "Salvando correção…"
                : "Salvar correção dos dados importados"}
            </button>
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setOverrides({});
                setReason("");
              }}
            >
              Cancelar correção
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
