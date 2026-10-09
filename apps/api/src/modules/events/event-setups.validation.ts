import { z } from "zod";
import { eventSchema } from "./events.validation.js";
import { departmentsSchema } from "./departments.validation.js";

const period = z
  .object({
    kind: z.enum(["VOLUNTEER", "CAMPER"]),
    opensAt: z.string().datetime({ offset: true }),
    closesAt: z.string().datetime({ offset: true }),
    capacity: z.number().int().positive().max(100000).nullable().default(null),
    allowWaitlist: z.boolean().default(false),
  })
  .strict()
  .refine((value) => Date.parse(value.closesAt) > Date.parse(value.opensAt), {
    path: ["closesAt"],
    message: "O encerramento deve ser posterior à abertura.",
  });

export const eventSetupSchema = z
  .object({
    event: eventSchema,
    departments: departmentsSchema.optional(),
    campaigns: z
      .array(period)
      .length(2)
      .refine(
        (values) => new Set(values.map((value) => value.kind)).size === 2,
        "Informe os períodos de servos e campistas, uma vez cada.",
      ),
  })
  .strict();
