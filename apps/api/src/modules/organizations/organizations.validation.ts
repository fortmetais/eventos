import { z } from "zod";
import { email, id } from "../../core/security.js";
import { normalizeCnpj, validCnpj } from "./cnpj.js";
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();
const externalImage = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), "Use uma URL HTTPS.")
  .nullable()
  .optional();
export const organizationSchema = z
  .object({
    name: z.string().trim().min(3).max(150),
    kind: z.enum(["PARISH", "COMMUNITY", "ORGANIZATION"]),
    city: z.string().trim().min(2).max(100),
    state: z.string().regex(/^[A-Z]{2}$/),
    contact: z.string().trim().min(3).max(200),
    cnpj: z
      .string()
      .trim()
      .max(18)
      .refine(
        (value) => !value || validCnpj(normalizeCnpj(value)),
        "Informe um CNPJ válido.",
      )
      .transform((value) => normalizeCnpj(value) || null)
      .nullable()
      .optional(),
    legalName: optionalText(200),
    tradeName: optionalText(150),
    postalCode: z
      .string()
      .trim()
      .max(9)
      .refine(
        (value) => !value || /^\d{5}-?\d{3}$/.test(value),
        "Informe um CEP com 8 dígitos.",
      )
      .transform((value) => value.replace(/-/g, "") || null)
      .nullable()
      .optional(),
    street: optionalText(200),
    number: optionalText(30),
    complement: optionalText(150),
    neighborhood: optionalText(100),
    logoUrl: externalImage,
  })
  .strict();
export const invitationSchema = z
  .object({
    email,
    functionId: id.optional(),
    role: z.enum(["ORGANIZER", "SECRETARY", "HEALTH"]).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.functionId) !== Boolean(value.role),
    "Informe somente a função cadastrada (ou o perfil legado).",
  );
export const membershipSchema = z
  .object({
    role: z.enum(["ORGANIZER", "SECRETARY", "HEALTH"]).optional(),
    functionId: id.optional(),
    active: z.boolean(),
    healthEventIds: z.array(id).max(100).default([]),
  })
  .strict()
  .refine(
    (value) => Boolean(value.functionId) !== Boolean(value.role),
    "Informe somente a função cadastrada (ou o perfil legado).",
  );
