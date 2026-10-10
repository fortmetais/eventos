import express, { type Express } from "express";
import helmet from "helmet";
import { createHostedApp } from "./hosted-app.js";
import { createTemporaryApp } from "./temporary-app.js";

const posterAssets = new Set([
  "/fac-2027.jpg",
  "/pagina-temporaria.css",
  "/lazaro.mp3",
  "/musica.js",
  "/favicon.svg",
  "/favicon.ico",
]);

function within(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Keeps the public poster while allowing the authenticated application to be tested. */
export function createPreviewApp(
  api: Express,
  options: {
    webRoot?: string;
    supabaseUrl?: string;
    trustProxy?: number;
  } = {},
) {
  const temporary = createTemporaryApp({ trustProxy: options.trustProxy });
  const hosted = createHostedApp(api, { ...options, temporaryHome: true });
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxy ?? 0);

  // Select the response owner before applying its CSP; the poster forbids Auth connections.
  app.use((req, res, next) => {
    let path: string;
    try {
      path = decodeURIComponent(req.path).toLowerCase();
    } catch {
      next();
      return;
    }
    // A decoded traversal must not let static serving escape the allowed /assets prefix.
    if (
      path.includes("\\") ||
      path.split("/").some((segment) => segment.startsWith("."))
    ) {
      next();
      return;
    }
    if (within(path, "/api")) {
      if (
        within(path, "/api/v1/public") ||
        within(path, "/api/v1/openapi")
      ) {
        next();
        return;
      }
      // The API keeps its own authentication, authorization, errors and unknown-route responses.
      api(req, res, next);
      return;
    }
    if (path === "/" || posterAssets.has(path)) {
      temporary(req, res, next);
      return;
    }
    const withoutTrailingSlash = path.replace(/\/+$/, "");
    if (
      ["/entrar", "/nova-senha", "/meu-perfil"].includes(withoutTrailingSlash) ||
      ["/convite", "/admin", "/organizacao"].some((prefix) => within(path, prefix)) ||
      path.startsWith("/assets/")
    ) {
      hosted(req, res, next);
      return;
    }
    next();
  });

  // Only blocked/unknown paths reach this middleware, so it cannot replace the React CSP.
  app.use(helmet());
  app.use((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (within(req.path.toLowerCase(), "/api")) {
      res.status(503).json({
        error: {
          code: "TEMPORARY_SITE",
          message: "As funcionalidades estarão disponíveis em breve.",
        },
      });
      return;
    }
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Recurso não encontrado." },
    });
  });
  return app;
}
