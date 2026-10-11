import { z } from "zod";
export const organizationFunctionSchema = z
  .object({
    name: z
      .string()
      .transform((value) => value.normalize("NFKC").trim().replace(/\s+/g, " "))
      .pipe(z.string().min(2).max(80)),
    description: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .transform((value) => value || null),
    role: z.enum(["ORGANIZER", "SECRETARY", "HEALTH"]),
    active: z.boolean().default(true),
  })
  .strict();
export function functionNameKey(name: string) {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");
}
