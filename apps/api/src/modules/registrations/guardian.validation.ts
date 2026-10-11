import { z } from "zod";
import { ageAt, validCpf } from "./registrations.validation.js";

export function requiresGuardian(
  birthDate: string,
  eventDate: Date,
  now = new Date(),
) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(now);
  return (
    ageAt(birthDate, new Date(today)) < 18 || ageAt(birthDate, eventDate) < 18
  );
}
const text = z.string().trim().min(2).max(500);
const point = z
  .object({ x: z.number().min(0).max(1000), y: z.number().min(0).max(300) })
  .strict();
export const signatureSchema = z
  .array(z.array(point).min(2).max(400))
  .min(1)
  .max(40)
  .refine(
    (strokes) =>
      strokes.some((stroke) =>
        stroke.some(
          (p) => Math.hypot(p.x - stroke[0].x, p.y - stroke[0].y) >= 20,
        ),
      ),
    "Desenhe sua assinatura na tela.",
  );
export const guardianSignSchema = z
  .object({
    name: text,
    cpf: z
      .string()
      .max(20)
      .refine(validCpf, "Informe um CPF válido.")
      .transform((v) => v.replace(/\D/g, "")),
    relationship: text,
    phone: z
      .string()
      .max(20)
      .transform((v) => v.replace(/\D/g, ""))
      .pipe(z.string().regex(/^\d{10,13}$/)),
    email: z
      .union([z.string().trim().email().max(254), z.literal("")])
      .optional(),
    city: text,
    participantCity: text,
    participantCpf: z
      .union([
        z.literal(""),
        z.string().max(20).refine(validCpf, "Confira o CPF do participante."),
      ])
      .optional(),
    familyName: text,
    familyPhone: z
      .string()
      .max(20)
      .transform((v) => v.replace(/\D/g, ""))
      .pipe(z.string().regex(/^\d{10,13}$/)),
    hasMedication: z.boolean(),
    medication: z.string().trim().max(2000).default(""),
    hasAllergies: z.boolean(),
    allergies: z.string().trim().max(2000).default(""),
    participationAccepted: z.literal(true),
    responsibilityAccepted: z.literal(true),
    privacyAccepted: z.literal(true),
    imageAuthorized: z.boolean(),
    signature: signatureSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    for (const [flag, field] of [
      ["hasMedication", "medication"],
      ["hasAllergies", "allergies"],
    ] as const)
      if (data[flag] && data[field].length < 2)
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Descreva as informações marcadas como Sim.",
        });
  });
