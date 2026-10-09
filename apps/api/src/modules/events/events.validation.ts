import { z } from "zod";
import { id } from "../../core/security.js";
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Data inválida.",
  );
export const eventSchema = z
  .object({
    typeName: z.string().trim().min(2).max(80),
    name: z.string().trim().min(3).max(150),
    description: z.string().trim().min(10).max(5000),
    imageUrl: z
      .string()
      .url()
      .refine((value) => value.startsWith("https://"))
      .nullable()
      .optional(),
    location: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(100),
    startsAt: dateOnly,
    endsAt: dateOnly,
  })
  .strict()
  .refine((value) => value.endsAt >= value.startsAt, {
    path: ["endsAt"],
    message: "O término deve ser igual ou posterior ao início.",
  });
export const campaignSchema = z
  .object({
    kind: z.enum(["CAMPER", "VOLUNTEER"]),
    opensAt: z.string().datetime({ offset: true }),
    closesAt: z.string().datetime({ offset: true }),
    paused: z.boolean().default(false),
    capacity: z.number().int().positive().max(100000).nullable().default(null),
    allowWaitlist: z.boolean().default(false),
  })
  .strict()
  .refine((value) => new Date(value.closesAt) > new Date(value.opensAt), {
    path: ["closesAt"],
    message: "O encerramento deve ser posterior à abertura.",
  })
  .refine((value) => value.kind !== "CAMPER" || value.capacity !== null, {
    path: ["capacity"],
    message: "Informe a quantidade de vagas de campistas.",
  });
export const questionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    label: z.string().trim().min(3).max(200),
    type: z.enum(["text", "number", "date", "boolean", "single", "multiple"]),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
    hint: z.string().max(2000).optional(),
    maxSelections: z.number().int().min(1).max(30).optional(),
    exclusiveOption: z.string().max(100).optional(),
    mustBeTrue: z.boolean().optional(),
  })
  .strict()
  .superRefine((question, ctx) => {
    if (
      ["single", "multiple"].includes(question.type) &&
      question.options.length < 1
    )
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Informe pelo menos uma opção.",
      });
    if (new Set(question.options).size !== question.options.length)
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "As opções devem ser diferentes.",
      });
    if (question.maxSelections !== undefined && question.type !== "multiple")
      ctx.addIssue({
        code: "custom",
        path: ["maxSelections"],
        message: "O limite é exclusivo para seleção múltipla.",
      });
    if (
      question.exclusiveOption &&
      (question.type !== "multiple" ||
        !question.options.includes(question.exclusiveOption))
    )
      ctx.addIssue({
        code: "custom",
        path: ["exclusiveOption"],
        message: "A opção exclusiva precisa constar na seleção múltipla.",
      });
    if (question.mustBeTrue && question.type !== "boolean")
      ctx.addIssue({
        code: "custom",
        path: ["mustBeTrue"],
        message: "O aceite deve ser uma pergunta de sim/não.",
      });
  });
export const formSchema = z
  .object({
    askCpf: z.boolean(),
    askAddress: z.boolean(),
    askShirt: z.boolean(),
    questions: z.array(questionSchema).max(30),
    terms: z.string().trim().min(20).max(10000),
    volunteer: z
      .object({
        template: z.literal("VOLUNTEER_INTENTION_V1"),
        requirements: z.string().trim().min(10).max(5000),
        training: z.string().trim().min(10).max(5000),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.questions.map((q) => q.id)).size === value.questions.length,
    {
      path: ["questions"],
      message: "As perguntas precisam de identificadores únicos.",
    },
  );
export type FormConfig = z.infer<typeof formSchema>;
export const eventStatusSchema = z
  .object({ status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]) })
  .strict();
export const publicFilters = z.object({
  q: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  organizationId: id.optional(),
});
export function campaignIsOpen(
  campaign: {
    paused: boolean;
    opensAt: Date;
    closesAt: Date;
    event: { status: string; organization: { active: boolean } };
  },
  now = new Date(),
) {
  return (
    campaign.event.status === "PUBLISHED" &&
    campaign.event.organization.active &&
    !campaign.paused &&
    campaign.opensAt <= now &&
    campaign.closesAt > now
  );
}
