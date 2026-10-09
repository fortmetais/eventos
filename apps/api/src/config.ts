import "dotenv/config";
import { z } from "zod";
import { supabaseKeys } from "./core/supabase-keys.js";

const environment = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3085),
    HOST: z.string().default("127.0.0.1"),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    WEB_URL: z.string().url().default("http://localhost:5173"),
    DATABASE_URL: z.string().optional(),
    EVENTS_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    EVENT_MANAGEMENT_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    VOLUNTEER_REGISTRATIONS_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    REGISTRATION_LINK_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
    SUPABASE_SECRET_KEY: z.string().optional(),
    SUPABASE_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_PRIVATE_BUCKET: z.string().default("identificacao"),
    SUPABASE_ARTWORK_BUCKET: z.string().default("artes-eventos"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().optional(),
  })
  .parse(process.env);
export const config = {
  ...environment,
  ...supabaseKeys(environment),
};
if (
  config.NODE_ENV === "production" &&
  (!config.DATABASE_URL ||
    !config.SUPABASE_URL ||
    !config.SUPABASE_ANON_KEY ||
    !config.SUPABASE_SERVICE_ROLE_KEY ||
    !config.WEB_URL.startsWith("https://"))
) {
  throw new Error(
    "Produção exige banco, Supabase e WEB_URL com HTTPS configurados.",
  );
}
