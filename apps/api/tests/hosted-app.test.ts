import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createHostedApp } from "../src/core/hosted-app.js";

describe("React e API no mesmo servidor de produção", () => {
  let temporaryRoot: string;
  let root: string;
  const api = express();
  api.use(express.json());
  api.get("/api/v1/health", (_req, res) => res.json({ status: "ok" }));
  api.post("/api/v1/echo", (req, res) => res.json(req.body));
  api.use((_req, res) =>
    res.status(404).json({ error: { code: "NOT_FOUND" } }),
  );
  beforeAll(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), "encontro-hosted-"));
    root = join(temporaryRoot, ".deployment", "web");
    mkdirSync(join(root, "assets"), { recursive: true });
    writeFileSync(
      join(root, "index.html"),
      "<!doctype html><title>Encontro</title>",
    );
    writeFileSync(
      join(root, "assets", "app-a1b2.js"),
      'console.log("encontro");',
    );
    writeFileSync(join(root, ".env"), "DADO_PRIVADO=exemplo");
  });
  afterAll(() => {
    const target = resolve(temporaryRoot);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("encontro-hosted-")
    )
      throw new Error("Diretório temporário de teste inesperado.");
    rmSync(target, { recursive: true, force: true });
  });
  const hosted = () =>
    createHostedApp(api, {
      webRoot: root,
      supabaseUrl: "https://auth.example.test",
      trustProxy: 1,
    });

  it.each(["/", "/entrar", "/convite/abc", "/organizacao/123/eventos"])(
    "permite abrir e atualizar diretamente a tela %s",
    async (path) => {
      const response = await request(hosted())
        .get(path)
        .set("Accept", "text/html");
      expect(response.status).toBe(200);
      expect(response.type).toBe("text/html");
      expect(response.text).toContain("<title>Encontro</title>");
      expect(response.headers["cache-control"]).toBe("no-cache");
    },
  );
  it("preserva os caminhos e o processamento JSON da API", async () => {
    const app = hosted();
    const health = await request(app).get("/api/v1/health").expect(200);
    expect(health.body.status).toBe("ok");
    const echo = await request(app)
      .post("/api/v1/echo")
      .send({ value: "teste" })
      .expect(200);
    expect(echo.body).toEqual({ value: "teste" });
  });
  it("mantém o erro JSON em uma rota desconhecida da API", async () => {
    const response = await request(hosted())
      .get("/api/v1/inexistente")
      .set("Accept", "text/html")
      .expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.type).toBe("application/json");
  });
  it("serve os arquivos de build com cache e não substitui assets ausentes por HTML", async () => {
    const app = hosted();
    const asset = await request(app).get("/assets/app-a1b2.js").expect(200);
    expect(asset.text).toContain('console.log("encontro")');
    expect(asset.headers["cache-control"]).toContain("immutable");
    await request(app)
      .get("/assets/ausente.js")
      .set("Accept", "text/html")
      .expect(404);
    await request(app)
      .get("/assets/ausente")
      .set("Accept", "text/html")
      .expect(404);
  });
  it.each(["/.env", "/.git/config", "/apps/api/.env"])(
    "não publica arquivos privados pelo caminho %s",
    async (path) => {
      const response = await request(hosted())
        .get(path)
        .set("Accept", "text/html");
      expect(response.status).toBe(404);
      expect(response.text).not.toContain("DADO_PRIVADO");
    },
  );
  it("permite autenticação Supabase e prévia de fotos mantendo a proteção de scripts", async () => {
    const response = await request(hosted()).get("/").expect(200);
    const policy = response.headers["content-security-policy"] as string;
    expect(policy).toContain(
      "connect-src 'self' https://auth.example.test wss://auth.example.test",
    );
    expect(policy).toContain("img-src 'self' https: data: blob:");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("unsafe-eval");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
  it("impede iniciar a publicação sem a interface compilada", () => {
    expect(() =>
      createHostedApp(api, { webRoot: join(root, "ausente") }),
    ).toThrow(/interface compilada/);
  });
});
