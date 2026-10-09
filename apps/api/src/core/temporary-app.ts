import express from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const page = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#020d20">
    <meta name="description" content="FAC 2027, de 5 a 9 de fevereiro, em Loanda, Paraná. Em breve: inscrições para servos.">
    <title>FAC 2027 — Inscrições em breve</title>
    <link rel="stylesheet" href="/pagina-temporaria.css">
  </head>
  <body>
    <main class="poster-page">
      <h1 class="screen-reader-only">FAC 2027 — o melhor carnaval da sua vida está chegando!</h1>
      <img class="poster" src="/fac-2027.jpg" width="1041" height="1510"
        alt="FAC: o melhor carnaval da sua vida está chegando! De 05 a 09 de fevereiro de 2027. Em breve: inscrições para servos. Paróquia Nossa Senhora Aparecida, Loanda, Paraná, e Comunidade Santa Teresinha do Menino Jesus."
        fetchpriority="high" decoding="async">
    </main>
  </body>
</html>`;

const styles = `
:root { color-scheme: dark; background: #020d20; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body { min-height: 100vh; min-height: 100svh; background: radial-gradient(ellipse at center, #082653 0%, #020d20 70%); }
.poster-page { min-height: 100vh; min-height: 100svh; display: grid; place-items: center; }
.poster { display: block; width: auto; height: auto; max-width: 100%; max-height: 100vh; max-height: 100svh; object-fit: contain; }
.screen-reader-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
`;

/** This server never creates the business API, Auth client, or database client. */
export function createTemporaryApp(
  options: { posterPath?: string; trustProxy?: number } = {},
) {
  const posterPath =
    options.posterPath ??
    fileURLToPath(new URL("../../public/fac-2027.jpg", import.meta.url));
  if (!existsSync(posterPath))
    throw new Error("A arte da página temporária não foi encontrada.");
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxy ?? 0);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'"],
          connectSrc: ["'none'"],
          fontSrc: ["'none'"],
        },
      },
    }),
  );
  app.get("/api/v1/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ status: "ok", service: "fac-temporary", mode: "temporary" });
  });
  app.use((req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
      res
        .status(503)
        .json({
          error: {
            code: "TEMPORARY_SITE",
            message: "As funcionalidades estarão disponíveis em breve.",
          },
        });
      return;
    }
    next();
  });
  app.get("/fac-2027.jpg", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(posterPath, { dotfiles: "allow" });
  });
  app.get("/pagina-temporaria.css", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("text/css").send(styles);
  });
  app.get("/favicon.ico", (_req, res) => res.status(204).end());
  app.use((req, res, next) => {
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      req.accepts("html") &&
      !req.path.split("/").some((segment) => segment.includes(".")) &&
      !req.path.startsWith("/assets/")
    ) {
      res.setHeader("Cache-Control", "no-store");
      res.type("html").send(page);
      return;
    }
    next();
  });
  app.use((_req, res) =>
    res
      .status(404)
      .json({
        error: { code: "NOT_FOUND", message: "Recurso não encontrado." },
      }),
  );
  return app;
}
