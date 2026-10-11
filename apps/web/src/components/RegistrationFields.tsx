import { useState } from "react";
import {
  orderedFields,
  healthFields,
  stepIds,
  stepLabels,
  type FormKind,
  type StepId,
} from "@fac/form-layout";
import type { FormConfig, Payload, Health } from "../lib/types";
import { Field, Notice } from "./ui";
import { Questions } from "./Questions";
import { PhotoPicker } from "./PhotoPicker";

export function RegistrationFields({
  form,
  kind,
  step,
  minor,
  payload,
  health,
  onPayload,
  onHealth,
  errors = {},
  photo,
  preview = false,
  teams = [],
}: {
  form: FormConfig;
  kind: FormKind;
  step: StepId;
  minor: boolean;
  payload: Payload;
  health: Health;
  onPayload: (patch: Partial<Payload>) => void;
  onHealth: (patch: Partial<Health>) => void;
  errors?: Record<string, string>;
  preview?: boolean;
  teams?: { id: string; name: string }[];
  photo?: {
    endpoint: string;
    draftToken: string;
    currentUrl: string;
    onUploaded: (id: string, url: string) => void;
  };
}) {
  function input(
    key: keyof Payload,
    label: string,
    type = "text",
    required = false,
  ) {
    return (
      <Field label={label} required={required} error={errors[key]}>
        <input
          name={key}
          type={type}
          required={required}
          value={String(payload[key] ?? "")}
          maxLength={type === "email" ? 254 : 500}
          max={
            type === "date" ? new Date().toISOString().slice(0, 10) : undefined
          }
          inputMode={type === "tel" ? "tel" : undefined}
          onChange={(event) => onPayload({ [key]: event.target.value })}
        />
      </Field>
    );
  }
  return (
    <>
      {orderedFields(form, kind, step, minor).map((field) => {
        const [source, key] = field.key.split(":");
        let content;
        if (source === "question") {
          const question = form.questions.find((item) => item.id === key)!;
          content = (
            <Questions
              questions={[question]}
              cityAutocomplete={!preview}
              answers={payload.answers ?? {}}
              errors={errors}
              onChange={(id, answer) =>
                onPayload({ answers: { ...payload.answers, [id]: answer } })
              }
            />
          );
        } else if (source === "health") {
          const [flag, detail, label] = healthFields.find(
            ([flag]) => flag === key,
          )!;
          content = (
            <div className="health-question">
              <Field label={label} required error={errors[flag]}>
                <select
                  name={flag}
                  value={health[flag] === undefined ? "" : String(health[flag])}
                  onChange={(event) =>
                    onHealth({
                      [flag]:
                        event.target.value === ""
                          ? undefined
                          : event.target.value === "true",
                      [detail]:
                        event.target.value === "false" ? "" : health[detail],
                    })
                  }
                >
                  <option value="">Selecione</option>
                  <option value="false">Não</option>
                  <option value="true">Sim</option>
                </select>
              </Field>
              {health[flag] && (
                <Field label="Descreva" required error={errors[detail]}>
                  <textarea
                    name={detail}
                    maxLength={2000}
                    value={health[detail] ?? ""}
                    onChange={(event) =>
                      onHealth({ [detail]: event.target.value })
                    }
                  />
                </Field>
              )}
            </div>
          );
        } else if (key === "photoAssetId") {
          content = preview ? (
            <Field label="Foto">
              <div className="photo-preview-placeholder">
                O candidato poderá tirar ou enviar uma foto.
              </div>
            </Field>
          ) : (
            <>
              {errors.photoAssetId && <Notice>{errors.photoAssetId}</Notice>}
              {photo && <PhotoPicker {...photo} />}
            </>
          );
        } else if (key === "guardian") {
          content = (
            <section className="guardian-fields">
              <h3>Responsável legal</h3>
              <p className="muted">
                Precisamos que o responsável legal preencha e assine o termo.
                Após enviar a ficha, um link pessoal será criado para ele.
              </p>
              {input("guardianName", "Nome do responsável", "text", true)}
              {input("guardianPhone", "Telefone do responsável", "tel", true)}
              {input(
                "guardianEmail",
                "E-mail do responsável (opcional)",
                "email",
              )}
              {input(
                "guardianRelationship",
                "Parentesco do responsável",
                "text",
                true,
              )}
            </section>
          );
        } else if (key === "shirt" || key === "preferredTeamId") {
          content = (
            <Field
              label={field.label}
              required={field.required}
              error={errors[key]}
            >
              <select
                name={key}
                value={payload[key] ?? ""}
                onChange={(event) => onPayload({ [key]: event.target.value })}
              >
                <option value="">
                  {key === "shirt" ? "Selecione" : "Sem preferência"}
                </option>
                {key === "shirt"
                  ? ["PP", "P", "M", "G", "GG", "XG", "XGG", "ESP"].map(
                      (size) => <option key={size}>{size}</option>,
                    )
                  : teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
              </select>
            </Field>
          );
        } else if (key === "availability" || key === "address") {
          content = (
            <Field
              label={field.label}
              required={field.required}
              error={errors[key]}
            >
              <textarea
                name={key}
                maxLength={key === "availability" ? 1000 : 500}
                value={payload[key] ?? ""}
                onChange={(event) => onPayload({ [key]: event.target.value })}
              />
            </Field>
          );
        } else if (key === "termsAccepted" || key === "imageAuthorized") {
          content = (
            <>
              <label className="checkbox">
                <input
                  name={key}
                  type="checkbox"
                  checked={payload[key] ?? false}
                  onChange={(event) =>
                    onPayload({ [key]: event.target.checked })
                  }
                />
                {key === "termsAccepted"
                  ? "Li e aceito os termos desta inscrição e declaro que as informações são verdadeiras."
                  : "Autorizo o uso de minha imagem conforme os termos (opcional)."}
              </label>
              {errors[key] && <Notice>{errors[key]}</Notice>}
            </>
          );
        } else {
          content = input(
            key as keyof Payload,
            field.label,
            key === "birthDate"
              ? "date"
              : key === "email"
                ? "email"
                : ["phone", "emergencyPhone"].includes(key)
                  ? "tel"
                  : "text",
            field.required,
          );
        }
        return (
          <div key={field.key} data-registration-field={field.key}>
            {content}
          </div>
        );
      })}
    </>
  );
}

export function FormLayoutPreview({
  form,
  kind,
}: {
  form: FormConfig;
  kind: FormKind;
}) {
  const [minor, setMinor] = useState(false);
  return (
    <div className="layout-preview">
      <div className="button-row" aria-label="Público da prévia">
        <button
          type="button"
          className="button outline"
          aria-pressed={!minor}
          onClick={() => setMinor(false)}
        >
          Pessoa adulta
        </button>
        <button
          type="button"
          className="button outline"
          aria-pressed={minor}
          onClick={() => setMinor(true)}
        >
          Menor de idade
        </button>
      </div>
      {stepIds.map((step, index) => {
        if (!orderedFields(form, kind, step, minor).length) return null;
        return (
          <section key={step}>
            <h3>{stepLabels[index]}</h3>
            {step === "care" && minor && (
              <p className="muted">
                O bloco do responsável aparece somente para menores.
              </p>
            )}
            {step === "review" && (
              <div className="terms-text">{form.terms}</div>
            )}
            <fieldset disabled className="form-preview">
              <RegistrationFields
                form={form}
                kind={kind}
                step={step}
                minor={minor}
                payload={{}}
                health={{}}
                onPayload={() => {}}
                onHealth={() => {}}
                preview
              />
            </fieldset>
          </section>
        );
      })}
    </div>
  );
}
