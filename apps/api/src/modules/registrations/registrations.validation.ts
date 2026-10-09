import { z } from "zod";
import { departmentSchema } from "../events/departments.validation.js";
import { dateOnly, type FormConfig } from "../events/events.validation.js";
import { assert } from "../../core/errors.js";
import { id } from "../../core/security.js";

const optionalText = z.string().max(500).optional();
export const draftPayloadSchema = z
  .object({
    name: optionalText,
    birthDate: z.string().max(10).optional(),
    phone: optionalText,
    email: optionalText,
    cpf: optionalText,
    address: optionalText,
    shirt: optionalText,
    photoAssetId: id.optional(),
    emergencyName: optionalText,
    emergencyPhone: optionalText,
    emergencyRelationship: optionalText,
    guardianName: optionalText,
    guardianPhone: optionalText,
    guardianRelationship: optionalText,
    guardianAuthorization: z.boolean().optional(),
    availability: z.string().max(1000).optional(),
    preferredTeamId: z.union([id, z.literal("")]).optional(),
    termsAccepted: z.boolean().optional(),
    imageAuthorized: z.boolean().optional(),
    answers: z
      .record(
        z.union([
          z.string().max(2000),
          z.number().finite(),
          z.boolean(),
          z.array(z.string().max(100)).max(30),
        ]),
      )
      .optional(),
  })
  .strict();
export const healthDraftSchema = z
  .object({
    hasAllergies: z.boolean().optional(),
    allergies: z.string().max(2000).optional(),
    hasMedication: z.boolean().optional(),
    medication: z.string().max(2000).optional(),
    hasDiet: z.boolean().optional(),
    diet: z.string().max(2000).optional(),
    hasCondition: z.boolean().optional(),
    condition: z.string().max(2000).optional(),
    hasNeeds: z.boolean().optional(),
    needs: z.string().max(2000).optional(),
  })
  .strict();
export const draftUpdateSchema = z
  .object({ payload: draftPayloadSchema, health: healthDraftSchema })
  .strict();
const phone = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{10,13}$/, "Informe um telefone válido com DDD."));
const requiredText = z.string().trim().min(2, "Preencha este campo.").max(500);
export const fullPayloadSchema = draftPayloadSchema.extend({
  name: requiredText,
  birthDate: dateOnly.refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    "Data de nascimento inválida.",
  ),
  phone,
  email: z
    .union([
      z
        .string()
        .trim()
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      z.literal(""),
    ])
    .optional(),
  photoAssetId: id,
  emergencyName: requiredText,
  emergencyPhone: phone,
  emergencyRelationship: requiredText,
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "Aceite os termos para enviar." }),
  }),
  imageAuthorized: z.boolean().default(false),
  answers: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .default({}),
});
export function ageAt(birth: string, eventDate: Date) {
  const birthDate = new Date(birth);
  let age = eventDate.getUTCFullYear() - birthDate.getUTCFullYear();
  if (
    eventDate.getUTCMonth() < birthDate.getUTCMonth() ||
    (eventDate.getUTCMonth() === birthDate.getUTCMonth() &&
      eventDate.getUTCDate() < birthDate.getUTCDate())
  )
    age--;
  return age;
}
export function validCpf(input: string) {
  const cpf = input.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  return [9, 10].every((size) => {
    const sum = cpf
      .slice(0, size)
      .split("")
      .reduce((total, digit, i) => total + Number(digit) * (size + 1 - i), 0);
    const digit = (sum * 10) % 11;
    return (digit === 10 ? 0 : digit) === Number(cpf[size]);
  });
}
export function validateSubmission(
  payload: unknown,
  healthInput: unknown,
  form: FormConfig,
  eventDate: Date,
  kind: string,
) {
  const data = fullPayloadSchema.parse(payload);
  assert(
    ageAt(data.birthDate, eventDate) >= 0 &&
      ageAt(data.birthDate, eventDate) <= 120,
    422,
    "Confira a data de nascimento.",
  );
  if (data.cpf)
    assert(form.askCpf && validCpf(data.cpf), 422, "Confira o CPF informado.");
  if (!form.askCpf) data.cpf = undefined;
  if (!form.askAddress) data.address = undefined;
  if (!form.askShirt) data.shirt = undefined;
  if (data.shirt)
    assert(
      ["PP", "P", "M", "G", "GG", "XG", "XGG", "ESP"].includes(data.shirt),
      422,
      "Tamanho de camiseta inválido.",
    );
  if (form.volunteer) {
    assert(
      kind === "VOLUNTEER",
      422,
      "Esta ficha é exclusiva para candidaturas de servos.",
    );
    assert(data.shirt, 422, "Informe o tamanho da camiseta.");
  }
  if (ageAt(data.birthDate, eventDate) < 18) {
    assert(
      data.guardianName &&
        data.guardianName.trim().length >= 2 &&
        data.guardianRelationship &&
        data.guardianAuthorization,
      422,
      "Informe o responsável legal e sua autorização.",
    );
    phone.parse(data.guardianPhone);
  }
  if (kind === "VOLUNTEER")
    assert(
      data.availability && data.availability.trim().length >= 3,
      422,
      "Informe sua disponibilidade para servir.",
    );
  const health = healthDraftSchema.parse(healthInput);
  for (const [flag, detail] of [
    ["hasAllergies", "allergies"],
    ["hasMedication", "medication"],
    ["hasDiet", "diet"],
    ["hasCondition", "condition"],
    ["hasNeeds", "needs"],
  ] as const) {
    assert(
      typeof health[flag] === "boolean",
      422,
      "Responda todas as perguntas de saúde e emergência.",
    );
    assert(
      !health[flag] || (health[detail]?.trim().length ?? 0) >= 2,
      422,
      "Descreva as informações de saúde marcadas como “Sim”.",
    );
    if (!health[flag]) health[detail] = "";
  }
  const allowedIds = new Set(form.questions.map((q) => q.id));
  assert(
    Object.keys(data.answers).every((key) => allowedIds.has(key)),
    422,
    "Respostas incompatíveis com esta versão da ficha.",
  );
  for (const question of form.questions) {
    const answer = data.answers[question.id];
    const missing =
      answer === undefined ||
      answer === "" ||
      (Array.isArray(answer) && !answer.length);
    assert(!question.required || !missing, 422, `Responda: ${question.label}`);
    if (missing) continue;
    let valid = false;
    switch (question.type) {
      case "text":
        valid =
          typeof answer === "string" &&
          answer.length <= 2000 &&
          (!question.required || answer.trim().length > 0);
        break;
      case "number":
        valid = typeof answer === "number" && Number.isFinite(answer);
        break;
      case "date":
        valid = dateOnly.safeParse(answer).success;
        break;
      case "boolean":
        valid = typeof answer === "boolean";
        break;
      case "single":
        valid = typeof answer === "string" && question.options.includes(answer);
        break;
      case "multiple":
        valid =
          Array.isArray(answer) &&
          answer.every((v) => question.options.includes(v)) &&
          new Set(answer).size === answer.length;
        break;
    }
    assert(valid, 422, `Confira a resposta: ${question.label}`);
    if (question.mustBeTrue)
      assert(answer === true, 422, `Confirme o aceite: ${question.label}`);
    if (Array.isArray(answer) && question.maxSelections)
      assert(
        answer.length <= question.maxSelections,
        422,
        `Selecione até ${question.maxSelections} opções: ${question.label}`,
      );
    if (
      Array.isArray(answer) &&
      question.exclusiveOption &&
      answer.includes(question.exclusiveOption)
    )
      assert(
        answer.length === 1,
        422,
        `A opção “${question.exclusiveOption}” não pode ser combinada com outras respostas.`,
      );
  }
  return { payload: data, health };
}
export const statusSchema = z
  .object({
    status: z.enum([
      "REVIEW",
      "APPROVED",
      "CONFIRMED",
      "WAITLIST",
      "REJECTED",
      "CANCELLED",
    ]),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const teamSchema = departmentSchema.omit({ id: true });
export const assignmentSchema = z.object({ teamId: id }).strict();
export const manualLinkSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .transform((v) => v.toLowerCase()),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export const transitions: Record<string, string[]> = {
  RECEIVED: ["REVIEW", "REJECTED", "CANCELLED"],
  REVIEW: ["APPROVED", "WAITLIST", "REJECTED", "CANCELLED"],
  APPROVED: ["CONFIRMED", "WAITLIST", "REJECTED", "CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  WAITLIST: ["REVIEW", "APPROVED", "CANCELLED", "REJECTED"],
  REJECTED: [],
  CANCELLED: [],
};
