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
    <meta name="description" content="3º FAC da Aparecida, de 5 a 9 de fevereiro de 2027, em Loanda, Paraná. Inscrições para campistas e orientações para o acampamento.">
    <title>3º FAC da Aparecida — Inscrições para campistas</title>
    <link rel="icon" href="/favicon.ico?v=encontro-1" sizes="16x16 32x32 48x48">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=encontro-1" sizes="any">
    <link rel="stylesheet" href="/pagina-temporaria.css?v=campistas-20261124-3">
    <script src="/musica.js?v=2" defer></script>
  </head>
  <body>
    <main class="poster-page">
      <h1 class="screen-reader-only">3º FAC da Aparecida — a melhor viagem da sua vida está chegando!</h1>
      <div class="poster-frame">
        <picture>
          <source type="image/webp" srcset="/fac-2027-720-v2.webp 720w, /fac-2027-1024-v2.webp 1024w"
            sizes="(max-width: 720px) calc(100vw - 40px), min(1024px, max(280px, calc((100vh - 40px) * 1024 / 1536)))">
        <img class="poster" src="/fac-2027.jpg?v=campistas-20261124-3" width="1024" height="1536"
          alt="3º FAC da Aparecida: a melhor viagem da sua vida está chegando! De 5 a 9 de fevereiro de 2027. Saída em 5 de fevereiro às 6h, na Quadra Esportiva do Colégio Santa Edwiges. Orientações sobre o que levar, roupas e medicações. Paróquia Nossa Senhora Aparecida, Loanda, Paraná, e Comunidade Santa Teresinha do Menino Jesus."
          fetchpriority="high" decoding="async">
        </picture>
        <a class="registration-link" href="https://docs.google.com/forms/d/e/1FAIpQLSe3R2cm8qVkqIzQhNlwC7PQH1s92pFVwJ8iMwcisBKeUAAgnA/viewform?pli=1"
          target="_blank" rel="noopener noreferrer" aria-label="INSCRIÇÕES PARA CAMPISTAS" title="Inscreva-se como campista (abre em uma nova aba)">
          <span>INSCRIÇÕES</span>
          <span>PARA CAMPISTAS</span>
        </a>
        <div class="music-player">
          <audio id="background-music" src="/lazaro.mp3" loop preload="none" hidden
            aria-label="Música de fundo: Lázaro"></audio>
          <div class="music-controls" hidden>
            <button id="music-toggle" type="button" aria-controls="background-music"
              aria-label="Ativar som da música" title="Ativar som da música" data-silent="true">
              <svg class="music-icon--on" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5Z"/>
                <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>
              </svg>
              <svg class="music-icon--off" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5ZM16 9l5 6M21 9l-5 6"/>
              </svg>
            </button>
          </div>
          <p id="music-status" role="status" hidden></p>
        </div>
      </div>
    </main>
  </body>
</html>`;

const styles = `
:root { color-scheme: dark; background: #020d20; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body { min-height: 100vh; min-height: 100svh; background: radial-gradient(ellipse at center, #082653 0%, #020d20 70%); }
.poster-page { min-height: 100vh; min-height: 100svh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; padding: 20px; }
.poster-frame { position: relative; width: min(100%, 1024px, max(280px, calc((100vh - 40px) * 1024 / 1536))); width: min(100%, 1024px, max(280px, calc((100svh - 40px) * 1024 / 1536))); aspect-ratio: 1024 / 1536; }
.poster { display: block; width: 100%; height: auto; object-fit: contain; }
.registration-link { position: absolute; left: 59%; top: 14.5%; width: 36.5%; height: 5.6%; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 2px; border: 1px solid #f5d68c; border-radius: clamp(4px, 1vw, 10px); background: linear-gradient(135deg, #ffe7a3, #d8a335); color: #07152b; font: 800 clamp(10px, min(2.6vw, 2vh), 18px)/1.05 system-ui, sans-serif; letter-spacing: 0.01em; text-align: center; text-decoration: none; box-shadow: 0 4px 16px #0006; }
.registration-link span { white-space: nowrap; }
.registration-link::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: max(100%, 44px); transform: translateY(-50%); }
.registration-link:hover { background: #ffe7a3; }
.registration-link:focus-visible { outline: 3px solid #fff; outline-offset: 5px; }
.music-player { position: absolute; top: -4px; right: 1.5%; width: 44px; font: 14px/1.4 system-ui, sans-serif; }
.music-controls { display: flex; align-items: center; justify-content: center; min-height: 44px; }
.music-controls[hidden] { display: none; }
.music-controls button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 8px; border: 1px solid #b3c7e6; border-radius: 50%; background: #102849; color: #fff; cursor: pointer; }
.music-controls button:hover { background: #1c3b63; }
.music-controls button:focus-visible { outline: 3px solid #ffe7a3; outline-offset: 3px; }
.music-controls svg { display: block; width: 24px; height: 24px; }
.music-controls .music-icon--off, .music-controls [data-silent="true"] .music-icon--on { display: none; }
.music-controls [data-silent="true"] .music-icon--off { display: block; }
#music-status { position: fixed; bottom: 16px; right: 16px; width: min(240px, calc(100vw - 40px)); margin: 0; padding: 8px; border-radius: 8px; background: #020d20; color: #dbe7f8; text-align: center; pointer-events: none; }
.screen-reader-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
`;

/** This server never creates the business API, Auth client, or database client. */
export function createTemporaryApp(
  options: {
    posterPath?: string;
    musicPath?: string;
    trustProxy?: number;
    trackVisits?: boolean;
  } = {},
) {
  const posterPath =
    options.posterPath ??
    fileURLToPath(new URL("../../public/fac-2027.jpg", import.meta.url));
  if (!existsSync(posterPath))
    throw new Error("A arte da página temporária não foi encontrada.");
  const musicPath =
    options.musicPath ??
    fileURLToPath(new URL("../../public/lazaro.mp3", import.meta.url));
  const musicScriptPath = fileURLToPath(
    new URL("../../public/musica.js", import.meta.url),
  );
  const faviconRoot = fileURLToPath(
    new URL("../../../web/public/", import.meta.url),
  );
  if (!existsSync(musicPath) || !existsSync(musicScriptPath))
    throw new Error(
      "Os arquivos da música da página temporária não foram encontrados.",
    );
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxy ?? 0);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'"],
          mediaSrc: ["'self'"],
          connectSrc: [options.trackVisits ? "'self'" : "'none'"],
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
      res.status(503).json({
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
  for (const variant of ["720-v1", "1041-v1", "720-v2", "1024-v2"]) {
    app.get(`/fac-2027-${variant}.webp`, (_req, res) => {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res
        .type("image/webp")
        .sendFile(
          fileURLToPath(
            new URL(`../../public/fac-2027-${variant}.webp`, import.meta.url),
          ),
          { dotfiles: "allow" },
        );
    });
  }
  app.get("/pagina-temporaria.css", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("text/css").send(styles);
  });
  app.get("/lazaro.mp3", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("audio/mpeg").sendFile(musicPath, { dotfiles: "allow" });
  });
  app.get("/musica.js", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res
      .type("application/javascript")
      .sendFile(musicScriptPath, { dotfiles: "allow" });
  });
  if (options.trackVisits)
    app.get("/visitas-v1.js", (_req, res) => {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res
        .type("application/javascript")
        .sendFile(
          fileURLToPath(new URL("../../public/visitas-v1.js", import.meta.url)),
          { dotfiles: "allow" },
        );
    });
  for (const [file, type] of [
    ["favicon.svg", "image/svg+xml"],
    ["favicon.ico", "image/x-icon"],
  ]) {
    app.get(`/${file}`, (_req, res) => {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.type(type).sendFile(file, { root: faviconRoot, dotfiles: "allow" });
    });
  }
  app.use((req, res, next) => {
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      req.accepts("html") &&
      !req.path.split("/").some((segment) => segment.includes(".")) &&
      !req.path.startsWith("/assets/")
    ) {
      res.setHeader("Cache-Control", "no-store");
      res
        .type("html")
        .send(
          options.trackVisits
            ? page.replace(
                "</head>",
                '    <script src="/visitas-v1.js" defer></script>\n  </head>',
              )
            : page,
        );
      return;
    }
    next();
  });
  app.use((_req, res) =>
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Recurso não encontrado." },
    }),
  );
  return app;
}
