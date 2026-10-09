import { z } from "zod";

/** Read only the settings needed to start the public page or the application. */
export function runtimeSettings(environment: NodeJS.ProcessEnv = process.env) {
  const development = ["development", "test"].includes(
    environment.NODE_ENV ?? "",
  );
  return z
    .object({
      TEMPORARY_SITE: z
        .enum(["true", "false"])
        .default(development ? "false" : "true")
        .transform((value) => value === "true"),
      HOST: z.string().default(development ? "127.0.0.1" : "0.0.0.0"),
      PORT: z.coerce
        .number()
        .int()
        .min(1)
        .max(65535)
        .default(development ? 3085 : 3000),
      TRUST_PROXY: z.coerce
        .number()
        .int()
        .min(0)
        .max(5)
        .default(development ? 0 : 1),
    })
    .parse(environment);
}
