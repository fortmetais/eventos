import { z } from "zod";
import { email, id } from "../../core/security.js";
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
    logoUrl: externalImage,
  })
  .strict();
export const invitationSchema = z
  .object({ email, role: z.enum(["ORGANIZER", "SECRETARY", "HEALTH"]) })
  .strict();
export const membershipSchema = z
  .object({
    role: z.enum(["ORGANIZER", "SECRETARY", "HEALTH"]),
    active: z.boolean(),
    healthEventIds: z.array(id).max(100).default([]),
  })
  .strict();
