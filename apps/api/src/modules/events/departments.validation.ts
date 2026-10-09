import { z } from "zod";
import { departmentName } from "./departments.repository.js";
export const departmentSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(100).transform(departmentName),
    capacity: z.number().int().min(0).max(100000),
  })
  .strict();
export const departmentsSchema = z
  .array(departmentSchema)
  .min(1, "Cadastre pelo menos um departamento e suas vagas.")
  .max(30)
  .superRefine((rows, ctx) => {
    if (new Set(rows.map((row) => row.name)).size !== rows.length)
      ctx.addIssue({
        code: "custom",
        message: "Os departamentos devem ter nomes diferentes.",
      });
    const ids = rows.flatMap((row) => (row.id ? [row.id] : []));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Um departamento não pode aparecer duas vezes.",
      });
  });
export const departmentCapacitySchema = z
  .object({ capacity: z.number().int().min(0).max(100000) })
  .strict();
