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
    <meta name="description" content="FAC 2027, de 5 a 9 de fevereiro, em Loanda, Paraná. Acesse o formulário de inscrição.">
    <title>FAC 2027 — Inscrição</title>
    <link rel="stylesheet" href="/pagina-temporaria.css?v=musica-1">
    <script src="/musica.js?v=1" defer></script>
  </head>
  <body>
    <main class="poster-page">
      <h1 class="screen-reader-only">FAC 2027 — o melhor carnaval da sua vida está chegando!</h1>
      <img class="poster" src="/fac-2027.jpg" width="1041" height="1510"
        alt="FAC: o melhor carnaval da sua vida está chegando! De 05 a 09 de fevereiro de 2027. Em breve: inscrições para servos. Paróquia Nossa Senhora Aparecida, Loanda, Paraná, e Comunidade Santa Teresinha do Menino Jesus."
        fetchpriority="high" decoding="async">
      <a class="registration-link"
        href="https://docs.google.com/forms/d/e/1FAIpQLSfLJ440VZ0P-7V405JhBBys9uXtFSjv7VRryltkQOROb93Cjw/viewform?pli=1"
        target="_blank" rel="noopener noreferrer"
        aria-label="INSCRIÇÃO — abrir formulário em nova aba">INSCRIÇÃO</a>
      <div class="music-player">
        <audio id="background-music" src="/lazaro.mp3" controls loop preload="none"
          aria-label="Música de fundo: Lázaro"></audio>
        <div class="music-controls" hidden>
          <button id="music-toggle" type="button" aria-controls="background-music"
            aria-pressed="false">Ouvir música</button>
          <label class="music-volume" for="music-volume">Volume
            <input id="music-volume" type="range" min="0" max="100" value="35"
              aria-label="Volume da música">
          </label>
        </div>
        <p id="music-status" role="status" hidden></p>
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
.poster { display: block; width: auto; height: auto; max-width: 100%; max-height: calc(100vh - 184px); max-height: calc(100svh - 184px); object-fit: contain; }
.registration-link { display: inline-flex; align-items: center; justify-content: center; min-height: 56px; width: min(100%, 320px); padding: 14px 28px; border: 1px solid #f5d68c; border-radius: 12px; background: linear-gradient(135deg, #ffe7a3, #d8a335); color: #07152b; font: 800 18px/1.4 system-ui, sans-serif; letter-spacing: 0.08em; text-decoration: none; box-shadow: 0 8px 24px #0006; }
.registration-link:hover { background: #ffe7a3; }
.registration-link:focus-visible { outline: 3px solid #fff; outline-offset: 5px; }
.music-player { width: min(100%, 320px); font: 14px/1.4 system-ui, sans-serif; }
.music-player audio { width: 100%; height: 48px; }
.music-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; }
.music-controls[hidden] { display: none; }
.music-controls button { min-height: 44px; padding: 10px 12px; border: 1px solid #b3c7e6; border-radius: 10px; background: #102849; color: #fff; font: inherit; cursor: pointer; }
.music-controls button:hover { background: #1c3b63; }
.music-controls button:focus-visible, .music-volume input:focus-visible { outline: 3px solid #ffe7a3; outline-offset: 3px; }
.music-volume { display: flex; align-items: center; gap: 8px; color: #dbe7f8; }
.music-volume input { width: 90px; min-height: 44px; margin: 0; accent-color: #eac15f; }
#music-status { margin: 8px 0 0; color: #dbe7f8; text-align: center; }
.screen-reader-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
`;

/** This server never creates the business API, Auth client, or database client. */
export function createTemporaryApp(
  options: { posterPath?: string; musicPath?: string; trustProxy?: number } = {},
) {
  const posterPath =
    options.posterPath ??
    fileURLToPath(new URL("../../public/fac-2027.jpg", import.meta.url));
  if (!existsSync(posterPath))
    throw new Error("A arte da página temporária não foi encontrada.");
  const musicPath = options.musicPath ?? fileURLToPath(new URL("../../public/lazaro.mp3", import.meta.url));
  const musicScriptPath = fileURLToPath(new URL("../../public/musica.js", import.meta.url));
  if (!existsSync(musicPath) || !existsSync(musicScriptPath))
    throw new Error("Os arquivos da música da página temporária não foram encontrados.");
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
  app.get("/lazaro.mp3", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("audio/mpeg").sendFile(musicPath, { dotfiles: "allow" });
  });
  app.get("/musica.js", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/javascript").sendFile(musicScriptPath, { dotfiles: "allow" });
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
