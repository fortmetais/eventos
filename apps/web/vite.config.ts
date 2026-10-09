import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  // Configuração executada pelo Node. Somente PORT/WEB_URL são repassados.
  // parseEnv não modifica NODE_ENV do Vite nem inclui segredos no bundle.
  const apiEnvPath = fileURLToPath(new URL("../api/.env", import.meta.url));
  const apiEnvironment = existsSync(apiEnvPath)
    ? parseEnv(readFileSync(apiEnvPath, "utf8"))
    : {};
  const webOrigin =
    process.env.WEB_URL ?? apiEnvironment.WEB_URL ?? "http://localhost:5173";
  return {
    plugins: [react()],
    server: {
      port: Number(new URL(webOrigin).port || "5173"),
      strictPort: true,
      proxy: {
        "/api": {
          target:
            process.env.API_PROXY_TARGET ??
            `http://127.0.0.1:${apiEnvironment.PORT || "3085"}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test-setup.ts"],
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  };
});
