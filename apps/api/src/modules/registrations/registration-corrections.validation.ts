import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  fieldCatalog,
  fieldVisible,
  emergencyRelationships,
  guardianRelationships,
  shirtSizes,
  healthFields,
} from "@fac/form-layout";
import { AppError } from "../../core/errors.js";
import { dateOnly, type FormConfig } from "../events/events.validation.js";
import { ageAt, validCpf } from "./registrations.validation.js";
import { requiresGuardian } from "./guardian.validation.js";

const value = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(100)).max(100),
  z.null(),
]);
export const registrationCorrectionSchema = z
  .object({
    updatedAt: z.iso.datetime(),
    overrides: z
      .record(z.string().min(1).max(120), value)
      .refine(
        (v) => Object.keys(v).length > 0 && Object.keys(v).length <= 100,
        "Informe entre um e cem campos para corrigir.",
      ),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const correctionBaseLabels: Record<string, string> = {
  name: "Nome completo",
  birthDate: "Data de nascimento",
  phone: "Telefone/WhatsApp",
  email: "E-mail de contato",
  cpf: "CPF",
  address: "Endereço",
  shirt: "Tamanho da camiseta",
  availability: "Disponibilidade",
  emergencyName: "Nome do contato de emergência",
  emergencyPhone: "Telefone do contato de emergência",
  emergencyAlternativePhone: "Telefone alternativo de emergência",
  emergencyRelationship: "Parentesco do contato de emergência",
  guardianName: "Nome do responsável",
  guardianPhone: "Telefone do responsável",
  guardianEmail: "E-mail do responsável",
  guardianRelationship: "Parentesco do responsável",
};
export const asCorrectionObject = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
const empty = (value: unknown) =>
  value == null || value === "" || (Array.isArray(value) && value.length === 0);
const protectedQuestions = new Set([
  "aceite_formacao",
  "aceite_regras",
  "aceite_orientacoes",
]);
function invalid(target: string, message: string): never {
  throw new AppError(422, message, "CORRECTION_VALIDATION", {
    fieldErrors: { [target]: [message] },
  });
}
function text(target: string, value: unknown, max = 500) {
  if (typeof value !== "string" || value.trim().length > max)
    invalid(target, "Confira o texto informado.");
  return value.trim();
}
function phone(target: string, value: unknown) {
  const digits = text(target, value).replace(/\D/g, "");
  if (!/^\d{10,13}$/.test(digits))
    invalid(target, "Informe um telefone válido com DDD.");
  return digits;
}

export function validateRegistrationCorrections(
  overrides: Record<string, z.infer<typeof value>>,
  context: {
    current: unknown;
    form: FormConfig;
    kind: "VOLUNTEER" | "CAMPER";
    origin: string;
    eventStartsAt: Date;
    teams: { id: string; name: string }[];
  },
) {
  const current = asCorrectionObject(context.current);
  const snapshot: Record<string, any> & { answers: Record<string, any> } = {
    ...current,
    answers: { ...asCorrectionObject(current.answers) },
  };
  const form = { ...context.form, questions: context.form.questions ?? [] };
  const catalog = fieldCatalog(form, context.kind);
  const visible = (key: string) => fieldVisible(form, context.kind, key);
  const fields = new Map(catalog.map((entry) => [entry.key, entry]));
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const labels: string[] = [];
  const importOrigin = context.origin === "IMPORT";
  const guardian =
    requiresGuardian(
      String(overrides.birthDate ?? current.birthDate),
      context.eventStartsAt,
    ) ||
    Object.keys(current).some(
      (key) => key.startsWith("guardian") && current[key],
    );
  for (const [target, raw] of Object.entries(overrides)) {
    const question = target.startsWith("question:")
      ? form.questions.find((q) => `question:${q.id}` === target)
      : undefined;
    const base = !target.startsWith("question:");
    const guardianField = target.startsWith("guardian");
    const key = base ? `base:${guardianField ? "guardian" : target}` : target;
    const baseVisible =
      visible(key) ||
      (target === "emergencyAlternativePhone" &&
        visible("base:emergencyPhone"));
    if (
      base
        ? !Object.hasOwn(correctionBaseLabels, target) ||
          !baseVisible ||
          (guardianField && !guardian)
        : !question ||
          question.mustBeTrue ||
          protectedQuestions.has(question.id) ||
          !visible(key)
    )
      invalid(
        target,
        "Corrija somente os campos disponíveis; saúde, aceites e autorizações têm seu próprio fluxo.",
      );
    const previous = base
      ? target === "email"
        ? (current.contactEmail ?? current.email)
        : current[target]
      : snapshot.answers[question!.id];
    const trimmed = typeof raw === "string" ? raw.trim() : raw;
    const required =
      ["name", "birthDate", "phone"].includes(target) ||
      (!importOrigin &&
        (question?.required ||
          (guardianField
            ? [
                "guardianName",
                "guardianPhone",
                "guardianRelationship",
              ].includes(target) &&
              requiresGuardian(
                String(overrides.birthDate ?? current.birthDate),
                context.eventStartsAt,
              )
            : fields.get(key)?.required)));
    let normalized: unknown = undefined;
    if (empty(trimmed)) {
      if (required)
        invalid(target, "Este campo é obrigatório e não pode ser apagado.");
      if (target === "email") normalized = "";
    } else if (question) {
      switch (question.type) {
        case "text":
          normalized = text(target, trimmed, 2000);
          break;
        case "date": {
          const parsed = dateOnly.safeParse(trimmed);
          if (!parsed.success) invalid(target, "Informe uma data válida.");
          normalized = parsed.data;
          break;
        }
        case "number":
          if (typeof trimmed !== "number" || !Number.isFinite(trimmed))
            invalid(target, "Informe um número válido.");
          normalized = trimmed;
          break;
        case "boolean":
          if (typeof trimmed !== "boolean")
            invalid(target, "Selecione Sim ou Não.");
          normalized = trimmed;
          break;
        case "single":
        case "multiple": {
          const entries = question.type === "multiple" ? trimmed : [trimmed];
          if (
            !Array.isArray(entries) ||
            entries.some((entry) => typeof entry !== "string")
          )
            invalid(target, "Selecione opções válidas.");
          const selected = (entries as string[]).map((entry) => {
            if (question.id === "equipes_preferencia") {
              const team = context.teams.find(
                (team) => team.id === entry || team.name === entry,
              );
              if (team) return team.name;
            }
            if (!question.options.includes(entry))
              invalid(target, "Selecione uma opção desta versão da ficha.");
            return entry;
          });
          if (new Set(selected).size !== selected.length)
            invalid(target, "Selecione cada opção somente uma vez.");
          if (
            question.exclusiveOption &&
            selected.includes(question.exclusiveOption) &&
            selected.length > 1
          )
            invalid(
              target,
              "A opção exclusiva não pode ser combinada com outras respostas.",
            );
          const limit =
            question.maxSelections ??
            (question.id === "equipes_preferencia" ? 3 : undefined);
          if (
            limit &&
            selected.length > limit &&
            !(importOrigin && question.id === "equipes_preferencia")
          )
            invalid(target, `Selecione até ${limit} opções.`);
          normalized = question.type === "multiple" ? selected : selected[0];
          break;
        }
      }
    } else if (target === "name") {
      normalized = text(target, trimmed, 150).replace(/\s+/g, " ");
      if ((normalized as string).length < 2)
        invalid(target, "Informe o nome completo.");
    } else if (target === "birthDate") {
      const parsed = dateOnly.safeParse(trimmed);
      if (
        !parsed.success ||
        parsed.data > new Date().toISOString().slice(0, 10) ||
        ageAt(parsed.data, context.eventStartsAt) < 0 ||
        ageAt(parsed.data, context.eventStartsAt) > 120
      )
        invalid(target, "Confira a data de nascimento.");
      normalized = parsed.data;
    } else if (
      [
        "phone",
        "emergencyPhone",
        "emergencyAlternativePhone",
        "guardianPhone",
      ].includes(target)
    )
      normalized = phone(target, trimmed);
    else if (["email", "guardianEmail"].includes(target)) {
      const parsed = z.string().trim().email().max(254).safeParse(trimmed);
      if (!parsed.success) invalid(target, "Informe um e-mail válido.");
      normalized = parsed.data.toLowerCase();
    } else if (target === "cpf") {
      const digits = text(target, trimmed).replace(/\D/g, "");
      if (!validCpf(digits)) invalid(target, "Confira o CPF informado.");
      normalized = digits;
    } else if (target === "shirt") {
      if (typeof trimmed !== "string" || !shirtSizes.includes(trimmed))
        invalid(target, "Selecione um tamanho de camiseta válido.");
      normalized = trimmed;
    } else if (
      ["emergencyRelationship", "guardianRelationship"].includes(target)
    ) {
      normalized = text(target, trimmed);
      const options =
        target === "guardianRelationship"
          ? guardianRelationships
          : emergencyRelationships;
      if (!options.includes(normalized as string) && normalized !== previous)
        invalid(target, "Selecione um parentesco/relação válido.");
    } else
      normalized = text(
        target,
        trimmed,
        target === "availability" ? 1000 : 500,
      );
    if (
      base &&
      required &&
      typeof normalized === "string" &&
      [
        "availability",
        "emergencyName",
        "emergencyRelationship",
        "guardianName",
        "guardianRelationship",
      ].includes(target) &&
      normalized.length < (target === "availability" ? 3 : 2)
    )
      invalid(target, "Preencha este campo com informações completas.");
    if (isDeepStrictEqual(previous ?? null, normalized ?? null)) continue;
    if (base) {
      const property = target === "email" ? "contactEmail" : target;
      if (normalized === undefined) delete snapshot[property];
      else snapshot[property] = normalized;
    } else if (normalized === undefined) delete snapshot.answers[question!.id];
    else snapshot.answers[question!.id] = normalized;
    changes[target] = { before: previous ?? null, after: normalized ?? null };
    labels.push(question?.label ?? correctionBaseLabels[target]);
  }
  if (!Object.keys(changes).some((key) => key.startsWith("question:"))) {
    if (Object.hasOwn(current, "answers")) snapshot.answers = current.answers;
    else delete (snapshot as Record<string, any>).answers;
  }
  return { snapshot, changes, labels };
}

export function correctionImportPending(context: {
  previous: unknown;
  snapshot: Record<string, any>;
  form: FormConfig;
  kind: "VOLUNTEER" | "CAMPER";
  startsAt: Date;
  health: unknown;
  accepted: boolean;
  guardianSigned: boolean;
  changed: string[];
}) {
  const form = { ...context.form, questions: context.form.questions ?? [] };
  const visible = (key: string) => fieldVisible(form, context.kind, key);
  const pending = Array.isArray(context.previous)
    ? context.previous.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  const standardized = new Set([
    "Adicionar foto do participante.",
    "Informar o tamanho da camiseta.",
    "Aceitar os termos atuais da inscrição.",
    "Termos gerais atuais não confirmados",
    "Informar responsável e obter autorização para menor de idade.",
  ]);
  for (const [field, label] of [
    ["emergencyName", "Nome do contato de emergência"],
    ["emergencyPhone", "Telefone do contato de emergência"],
    ["emergencyRelationship", "Parentesco do contato de emergência"],
    ["availability", "Disponibilidade"],
  ])
    standardized.add(`Informar: ${label}`);
  for (const [, , label] of healthFields)
    standardized.add(`Responder saúde: ${label}`);
  for (const q of form.questions) {
    standardized.add(`Responder: ${q.label}`);
    standardized.add(`Confirmar: ${q.label}`);
  }
  const retained = pending.filter(
    (entry) =>
      !standardized.has(entry) &&
      !context.changed.some((target) =>
        target === "shirt"
          ? entry.startsWith("Camiseta:")
          : target === "question:cidade"
            ? entry.startsWith("Conferir a cidade:")
            : target.startsWith("question:") &&
              entry.includes(
                form.questions.find((q) => q.id === target.slice(9))?.label ??
                  "\u0000",
              ),
      ),
  );
  const data = context.snapshot,
    answers = asCorrectionObject(data.answers),
    health = asCorrectionObject(context.health);
  if (visible("base:photoAssetId") && !data.photoAssetId)
    retained.push("Adicionar foto do participante.");
  if (visible("base:shirt") && form.askShirt && !data.shirt)
    retained.push("Informar o tamanho da camiseta.");
  for (const [field, label] of [
    ["emergencyName", "Nome do contato de emergência"],
    ["emergencyPhone", "Telefone do contato de emergência"],
    ["emergencyRelationship", "Parentesco do contato de emergência"],
    ["availability", "Disponibilidade"],
  ])
    if (visible(`base:${field}`) && empty(data[field]))
      retained.push(`Informar: ${label}`);
  for (const [flag, detail, label] of healthFields)
    if (
      visible(`health:${flag}`) &&
      (typeof health[flag] !== "boolean" ||
        (health[flag] && empty(health[detail])))
    )
      retained.push(`Responder saúde: ${label}`);
  for (const q of form.questions)
    if (visible(`question:${q.id}`)) {
      if (q.mustBeTrue || protectedQuestions.has(q.id)) {
        if (answers[q.id] !== true) retained.push(`Confirmar: ${q.label}`);
      } else if (q.required && empty(answers[q.id]))
        retained.push(`Responder: ${q.label}`);
    }
  if (!context.accepted)
    retained.push(
      "Aceitar os termos atuais da inscrição.",
      "Termos gerais atuais não confirmados",
    );
  if (
    requiresGuardian(String(data.birthDate), context.startsAt) &&
    !context.guardianSigned
  )
    retained.push(
      "Informar responsável e obter autorização para menor de idade.",
    );
  return [...new Set(retained)];
}
