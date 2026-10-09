import express, { type Express } from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Serves the compiled React app alongside the API on a single Node.js host. */
export function createHostedApp(
  api: Express,
  options: {
    webRoot?: string;
    supabaseUrl?: string;
    trustProxy?: number;
  } = {},
) {
  const webRoot =
    options.webRoot ??
    fileURLToPath(new URL("../../../web/dist/", import.meta.url));
  const indexFile = join(webRoot, "index.html");
  if (!existsSync(indexFile)) {
    throw new Error(
      "A interface compilada não foi encontrada. Execute npm run build antes de iniciar com SERVE_WEB=true.",
    );
  }
  const connectSources = ["'self'"];
  if (options.supabaseUrl) {
    const origin = new URL(options.supabaseUrl);
    connectSources.push(origin.origin);
    origin.protocol = origin.protocol === "https:" ? "wss:" : "ws:";
    connectSources.push(origin.origin);
  }
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxy ?? 0);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          connectSrc: connectSources,
          imgSrc: ["'self'", "https:", "data:", "blob:"],
        },
      },
    }),
  );
  // Delegate before serving files. API paths must always keep their API response.
  app.use((req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) {
      api(req, res, next);
      return;
    }
    next();
  });
  app.use(
    express.static(webRoot, {
      dotfiles: "deny",
      index: false,
      setHeaders(res, filePath) {
        const isAsset = /[/\\]assets[/\\]/.test(filePath);
        res.setHeader(
          "Cache-Control",
          isAsset ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    }),
  );
  app.use((req, res, next) => {
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      req.accepts("html") &&
      !req.path.startsWith("/assets/") &&
      !extname(req.path) &&
      !req.path.split("/").some((segment) => segment.startsWith("."))
    ) {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile("index.html", { root: webRoot });
      return;
    }
    next();
  });
  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Recurso não encontrado." },
    });
  });
  return app;
}
