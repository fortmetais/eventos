import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { orderedFields, shirtSizes, stepIds } from "@fac/form-layout";
import { api, ApiError } from "../lib/api";
import { formatBrazilianCpf } from "../lib/cpf";
import { formatBrazilianPhone } from "../lib/phone";
import type { EventImportValue } from "../lib/participant-imports";
import type { FormConfig, Question, Registration } from "../lib/types";
import { EmergencyRelationshipSelect } from "./EmergencyRelationshipSelect";
import { GuardianRelationshipSelect } from "./GuardianRelationshipSelect";
import { ImportValueControl } from "./ImportValueControl";
import { Field, Notice } from "./ui";

const acceptedQuestions = new Set([
  "aceite_formacao",
  "aceite_regras",
  "aceite_orientacoes",
]);
const fieldLabels: Record<string, string> = {
  name: "Nome completo",
  birthDate: "Data de nascimento",
  phone: "Telefone/WhatsApp",
  email: "E-mail de contato",
  cpf: "CPF",
  address: "Endereço",
  shirt: "Tamanho da camiseta",
  availability: "Sua disponibilidade",
  emergencyName: "Nome do contato de emergência",
  emergencyPhone: "Telefone do contato de emergência com DDD",
  emergencyAlternativePhone: "Telefone alternativo de emergência",
  emergencyRelationship: "Parentesco / relação do contato de emergência",
  guardianName: "Nome do responsável",
  guardianPhone: "Telefone do responsável com DDD",
  guardianEmail: "E-mail do responsável",
  guardianRelationship: "Parentesco do responsável",
};
const guardianFields = [
  "guardianName",
  "guardianPhone",
  "guardianEmail",
  "guardianRelationship",
];
const phoneFields = new Set([
  "phone",
  "emergencyPhone",
  "emergencyAlternativePhone",
  "guardianPhone",
]);
const groupLabels = {
  identification: "Identificação e contato",
  photo: "",
  about: "Participação e respostas gerais",
  care: "Contatos de emergência e responsável",
  review: "Respostas gerais",
};
const defaultConfig: FormConfig = {
  askCpf: false,
  askAddress: false,
  askShirt: false,
  questions: [],
  terms: "",
};
function equalValue(
  target: string,
  first: EventImportValue,
  second: EventImportValue,
) {
  const normalized = (value: EventImportValue) => {
    if (value == null || value === "") return "";
    if (phoneFields.has(target))
      return formatBrazilianPhone(String(value)).replace(/\D/g, "");
    if (target === "cpf") return String(value).replace(/\D/g, "");
    return value;
  };
  return (
    JSON.stringify(normalized(first)) === JSON.stringify(normalized(second))
  );
}
function minorAtEvent(birthDate: string, eventDate: string) {
  const birth = new Date(birthDate);
  const event = new Date(eventDate);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(event.getTime()))
    return false;
  let age = event.getUTCFullYear() - birth.getUTCFullYear();
  if (
    event.getUTCMonth() < birth.getUTCMonth() ||
    (event.getUTCMonth() === birth.getUTCMonth() &&
      event.getUTCDate() < birth.getUTCDate())
  )
    age--;
  return age < 18;
}

export function RegistrationCorrection({
  registration,
  organizationId,
  guardianApplicable = false,
  onSaved,
  onDirtyChange,
  onError,
  onCancel,
}: {
  registration: Registration;
  organizationId: string;
  guardianApplicable?: boolean;
  onSaved: (registration: Registration) => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, EventImportValue>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const errorArea = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const saving = useRef(false);
  const callbacks = useRef({ onDirtyChange, onError });
  callbacks.current = { onDirtyChange, onError };
  useLayoutEffect(() => {
    callbacks.current.onDirtyChange?.(
      busy || Object.keys(overrides).length > 0,
    );
  }, [busy, overrides]);
  useEffect(() => () => callbacks.current.onDirtyChange?.(false), []);
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    setOverrides({});
    setError("");
    setFieldErrors({});
  }, [registration.id, registration.updatedAt]);
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => {
      const first = Object.keys(fieldErrors)[0];
      const control = first
        ? Array.from(form.current?.elements ?? []).find(
            (element) => element.getAttribute("name") === first,
          )
        : null;
      if (control instanceof HTMLElement) control.focus();
      else errorArea.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [error, fieldErrors]);
  const config = registration.form?.config ?? defaultConfig;
  const kind = registration.campaign.kind;
  const original = (target: string): EventImportValue =>
    target === "email"
      ? (registration.snapshot.contactEmail ??
        registration.snapshot.email ??
        registration.person.email ??
        null)
      : target.startsWith("question:")
        ? (registration.snapshot.answers?.[target.slice(9)] ?? null)
        : (((registration.snapshot as Record<string, unknown>)[target] as
            EventImportValue | undefined) ?? null);
  const current = (target: string): EventImportValue =>
    target in overrides ? overrides[target] : original(target);
  function change(target: string, value: EventImportValue) {
    setOverrides((previous) => {
      const next = { ...previous };
      if (equalValue(target, value, original(target))) delete next[target];
      else next[target] = value;
      return next;
    });
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[target];
      return next;
    });
    setInfo("");
  }
  const showGuardian =
    guardianApplicable ||
    guardianFields.some((target) => !!current(target)) ||
    minorAtEvent(
      String(current("birthDate") ?? ""),
      registration.campaign.event.startsAt,
    );
  function renderBase(target: string): ReactNode {
    const label = fieldLabels[target];
    if (!label) return null;
    if (
      (target === "cpf" && !config.askCpf) ||
      (target === "address" && !config.askAddress) ||
      (target === "shirt" && !config.askShirt)
    )
      return null;
    const value = String(current(target) ?? "");
    const problem = fieldErrors[target];
    if (target === "emergencyRelationship")
      return (
        <EmergencyRelationshipSelect
          key={target}
          value={value}
          label={label}
          required={false}
          error={problem}
          onChange={(next) => change(target, next || null)}
        />
      );
    if (target === "guardianRelationship")
      return (
        <GuardianRelationshipSelect
          key={target}
          value={value}
          label={label}
          error={problem}
          onChange={(next) => change(target, next || null)}
        />
      );
    return (
      <Field
        key={target}
        label={label}
        error={problem}
        hint={
          target === "email"
            ? "Altera somente o contato desta ficha. Não muda o e-mail de login."
            : undefined
        }
      >
        {target === "shirt" ? (
          <select
            aria-label={label}
            aria-invalid={!!problem || undefined}
            name={target}
            value={value}
            onChange={(event) => change(target, event.target.value || null)}
          >
            <option value="">Não informado</option>
            {value && !shirtSizes.includes(value) && (
              <option value={value}>{value} (resposta anterior)</option>
            )}
            {shirtSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        ) : ["address", "availability"].includes(target) ? (
          <textarea
            aria-label={label}
            aria-invalid={!!problem || undefined}
            name={target}
            value={value}
            onChange={(event) => change(target, event.target.value)}
          />
        ) : (
          <input
            aria-label={label}
            aria-invalid={!!problem || undefined}
            name={target}
            type={
              target === "birthDate"
                ? "date"
                : phoneFields.has(target)
                  ? "tel"
                  : ["email", "guardianEmail"].includes(target)
                    ? "email"
                    : "text"
            }
            inputMode={target === "cpf" ? "numeric" : undefined}
            placeholder={
              phoneFields.has(target) ? "(00) 00000-0000" : undefined
            }
            value={
              phoneFields.has(target)
                ? formatBrazilianPhone(value)
                : target === "cpf"
                  ? formatBrazilianCpf(value)
                  : value
            }
            onChange={(event) =>
              change(
                target,
                phoneFields.has(target)
                  ? formatBrazilianPhone(event.target.value)
                  : target === "cpf"
                    ? formatBrazilianCpf(event.target.value)
                    : event.target.value,
              )
            }
          />
        )}
      </Field>
    );
  }
  function renderQuestion(question: Question): ReactNode {
    if (question.mustBeTrue || acceptedQuestions.has(question.id)) return null;
    const target = `question:${question.id}`;
    const limit =
      registration.origin === "IMPORT" && question.id === "equipes_preferencia"
        ? undefined
        : (question.maxSelections ??
          (question.id === "equipes_preferencia" ? 3 : undefined));
    return (
      <Field
        key={target}
        label={question.label}
        group={
          question.type === "multiple" ||
          ["cidade", "paroquia"].includes(question.id)
        }
        error={fieldErrors[target]}
        hint={
          question.id === "equipes_preferencia"
            ? registration.origin === "IMPORT"
              ? "Preferências importadas podem conter mais de três equipes. A correção não altera a alocação."
              : `Selecione até ${limit} equipes. A correção não altera a alocação.`
            : question.hint
        }
      >
        <ImportValueControl
          target={{
            id: target,
            label: question.label,
            type: question.type,
            options: question.options.map((value) => ({ value, label: value })),
            exclusiveOption: question.exclusiveOption,
          }}
          value={current(target)}
          disabled={busy}
          onChange={(next) => {
            if (limit && Array.isArray(next) && next.length > limit) {
              setFieldErrors((previous) => ({
                ...previous,
                [target]: `Selecione até ${limit} opções.`,
              }));
              return;
            }
            change(target, next);
          }}
        />
      </Field>
    );
  }
  const groups = stepIds.map((step) => {
    const content: ReactNode[] = [];
    for (const entry of orderedFields(config, kind, step)) {
      if (entry.key === "base:guardian") {
        if (showGuardian)
          content.push(...guardianFields.map((target) => renderBase(target)));
      } else if (entry.key.startsWith("base:"))
        content.push(renderBase(entry.key.slice(5)));
      else if (entry.key.startsWith("question:")) {
        const question = config.questions.find(
          (item) => `question:${item.id}` === entry.key,
        );
        if (question) content.push(renderQuestion(question));
      }
    }
    if (step === "care") {
      const fields = orderedFields(config, kind, step);
      if (
        fields.some((entry) => entry.key === "base:emergencyPhone") &&
        !fields.some((entry) => entry.key === "base:emergencyAlternativePhone")
      )
        content.push(renderBase("emergencyAlternativePhone"));
      if (
        showGuardian &&
        !orderedFields(config, kind, step).some(
          (entry) => entry.key === "base:guardian",
        )
      )
        content.push(...guardianFields.map((target) => renderBase(target)));
    }
    const fields = content.filter(Boolean);
    return fields.length ? (
      <div key={step} className="registration-correction-group">
        <h4>{groupLabels[step]}</h4>
        <div className="form-grid">{fields}</div>
      </div>
    ) : null;
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      saving.current ||
      !registration.updatedAt ||
      !Object.keys(overrides).length
    )
      return;
    saving.current = true;
    setBusy(true);
    setError("");
    setInfo("");
    setFieldErrors({});
    try {
      const corrected = await api<Registration>(
        `/organizations/${organizationId}/registrations/${registration.id}/corrections`,
        {
          method: "PATCH",
          body: {
            updatedAt: registration.updatedAt,
            overrides,
            reason: "Correção da ficha pela organização.",
          },
        },
      );
      await onSaved(corrected);
      setOverrides({});
      setInfo("Correção registrada no histórico da ficha.");
    } catch (failure) {
      const message =
        failure instanceof ApiError &&
        failure.status === 409 &&
        [
          "REGISTRATION_REVISION_CONFLICT",
          "REGISTRATION_CORRECTION_CONFLICT",
        ].includes(failure.code ?? "")
          ? `${failure.message} Recarregue a ficha antes de corrigir novamente.`
          : (failure as Error).message;
      if (failure instanceof ApiError) {
        const details = failure.fields?.fieldErrors ?? {};
        setFieldErrors(
          Object.fromEntries(
            Object.entries(details).map(([key, messages]) => [
              key.replace(/^overrides\./, ""),
              messages.join(" "),
            ]),
          ),
        );
      }
      setError(message);
      callbacks.current.onError?.(message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="registration-correction"
      ref={form}
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-label="Editar ficha"
    >
      <header className="registration-correction-toolbar">
        <h3 ref={heading} tabIndex={-1}>
          Editar ficha
        </h3>
        <div className="button-row">
          <button
            type="submit"
            className="button primary"
            disabled={
              busy || !registration.updatedAt || !Object.keys(overrides).length
            }
          >
            {busy ? "Salvando…" : "Salvar alterações"}
          </button>
          <button
            type="button"
            className="button outline"
            disabled={busy}
            onClick={() => {
              setOverrides({});
              setError("");
              setInfo("");
              setFieldErrors({});
              onCancel?.();
            }}
          >
            Cancelar
          </button>
        </div>
      </header>
      <p>As alterações ficam registradas no histórico, com autor e data.</p>
      {error && (
        <div ref={errorArea} tabIndex={-1}>
          <Notice>{error}</Notice>
        </div>
      )}
      {info && <Notice kind="success">{info}</Notice>}
      <fieldset disabled={busy} className="registration-correction-fields">
        {groups}
        {!registration.updatedAt && (
          <Notice kind="info">
            Recarregue a ficha para obter a versão atual antes de salvar.
          </Notice>
        )}
      </fieldset>
    </form>
  );
}
