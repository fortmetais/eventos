import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createPreviewApp } from "../src/core/preview-app.js";

describe("Testes autenticados com a página pública temporária", () => {
  let temporaryRoot: string;
  let webRoot: string;
  const api = express();
  api.use(express.json());
  api.get("/api/v1/config", (_req, res) => res.json({ marker: "business-config" }));
  api.get("/api/v1/health", (_req, res) => res.json({ service: "business-api" }));
  api.get("/api/v1/public/events", (_req, res) => res.json({ leaked: true }));
  api.get("/api/v1/openapi", (_req, res) => res.json({ leaked: true }));
  api.post("/api/v1/admin/example", (req, res) => {
    if (req.header("Authorization") !== "Bearer test-identity") {
      res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
      return;
    }
    res.json({ accepted: req.body });
  });
  api.use((_req, res) => res.status(404).json({ error: { code: "API_NOT_FOUND" } }));

  beforeAll(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), "encontro-preview-"));
    webRoot = join(temporaryRoot, ".deployment", "web");
    mkdirSync(join(webRoot, "assets"), { recursive: true });
    writeFileSync(
      join(webRoot, "index.html"),
      '<!doctype html><html lang="pt-BR"><title>Test application</title></html>',
    );
    writeFileSync(join(webRoot, "assets", "app-a1b2.js"), 'console.log("test");');
    writeFileSync(join(webRoot, ".env"), "PRIVATE_TEST_VALUE=hidden");
  });
  afterAll(() => {
    const target = resolve(temporaryRoot);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("encontro-preview-")
    ) throw new Error("Diretório temporário de teste inesperado.");
    rmSync(target, { recursive: true, force: true });
  });
  const preview = () => createPreviewApp(api, {
    webRoot,
    supabaseUrl: "https://auth.example.test",
    trustProxy: 1,
  });

  it("mantém arte, inscrição externa e música no início com a CSP do cartaz", async () => {
    const response = await request(preview()).get("/?source=test").expect(200);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain('class="poster-page"');
    expect(response.text).toContain("docs.google.com/forms/");
    expect(response.text).toContain('src="/lazaro.mp3"');
    expect(response.text).not.toContain("Test application");
    expect(response.headers["content-security-policy"]).toContain("connect-src 'none'");
    expect(response.headers["cache-control"]).toBe("no-store");
    await request(preview()).head("/").expect(200);
  });

  it.each([
    "/entrar?next=%2Fadmin",
    "/ENTRAR/",
    "/nova-senha",
    "/convite/test-token",
    "/meu-perfil",
    "/admin/organizacoes/test/membros",
    "/ADMIN/",
    "/organizacao/test/eventos",
    "/organizacao",
  ])("serve React em %s com CSP de autenticação e o indicador de início temporário", async (path) => {
    const response = await request(preview()).get(path).set("Accept", "text/html").expect(200);
    expect(response.text).toContain("Test application");
    expect(response.text).toContain('data-temporary-home="true"');
    expect(response.text).not.toContain('class="poster-page"');
    expect(response.headers["content-security-policy"]).toContain(
      "connect-src 'self' https://auth.example.test wss://auth.example.test",
    );
    expect(response.headers["content-security-policy"]).not.toContain("connect-src 'none'");
    expect(response.headers["cache-control"]).toBe("no-cache");
    await request(preview()).head(path).expect(200);
  });

  it("serve apenas arquivos compilados e mantém erros de assets ausentes", async () => {
    const response = await request(preview()).get("/assets/app-a1b2.js").expect(200);
    expect(response.text).toContain('console.log("test")');
    expect(response.headers["cache-control"]).toContain("immutable");
    await request(preview()).get("/assets/missing.js").set("Accept", "text/html").expect(404);
    await request(preview()).get("/assets/missing").set("Accept", "text/html").expect(404);
  });

  it.each([
    "/fac-2027.jpg",
    "/pagina-temporaria.css",
    "/lazaro.mp3",
    "/musica.js",
    "/favicon.svg?v=test",
    "/favicon.ico",
  ])("preserva o recurso público %s", async (path) => {
    const response = await request(preview()).head(path).expect(200);
    expect(response.headers["content-security-policy"]).toContain("connect-src 'none'");
  });

  it("preserva a API de configuração e saúde, inclusive com letras maiúsculas", async () => {
    const app = preview();
    const settings = await request(app).get("/api/v1/config").expect(200);
    expect(settings.body).toEqual({ marker: "business-config" });
    const health = await request(app).get("/API/v1/health").expect(200);
    expect(health.body).toEqual({ service: "business-api" });
    const missing = await request(app).get("/api/v1/missing").set("Accept", "text/html").expect(404);
    expect(missing.body.error.code).toBe("API_NOT_FOUND");
  });

  it("não contorna autenticação nem transforma uma operação administrativa em HTML", async () => {
    const app = preview();
    const rejected = await request(app).post("/api/v1/admin/example").send({ example: true }).expect(401);
    expect(rejected.body.error.code).toBe("AUTH_REQUIRED");
    const accepted = await request(app).post("/api/v1/admin/example")
      .set("Authorization", "Bearer test-identity").send({ example: true }).expect(200);
    expect(accepted.body).toEqual({ accepted: { example: true } });
  });

  it.each([
    "/api/v1/public/events",
    "/API/v1/PUBLIC/events?test=1",
    "/api/v1/%70ublic/events",
    "/api/v1/public",
    "/api/v1/public/campaigns/test/drafts",
    "/api/v1/openapi",
    "/API/v1/OPENAPI/",
  ])("bloqueia o endpoint público %s em qualquer método", async (path) => {
    const app = preview();
    for (const method of ["get", "post", "head"] as const) {
      const response = await request(app)[method](path).set("Accept", "text/html").expect(503);
      expect(response.type).toBe("application/json");
      expect(response.headers["cache-control"]).toBe("no-store");
      if (method !== "head") {
        expect(response.body.error.code).toBe("TEMPORARY_SITE");
        expect(response.body.leaked).toBeUndefined();
        expect(response.text).not.toContain("Test application");
      }
    }
  });

  it.each([
    "/index.html",
    "/INDEX.HTML",
    "/.env",
    "/.git/config",
    "/apps/api/.env",
    "/admin/.env",
    "/organizacao/.git/config",
    "/assets/.env",
    "/assets/%2e%2e%2findex.html",
    "/assets/%2e%2e%5cindex.html",
    "/eventos/test",
    "/inscricao/test",
    "/entrar/other",
    "/meu-perfil/other",
    "/admin-other",
    "/organizacao-other",
  ])("não libera HTML nem arquivos privados pelo caminho %s", async (path) => {
    const response = await request(preview()).get(path).set("Accept", "text/html").expect(404);
    expect(response.type).toBe("application/json");
    expect(response.text).not.toContain("PRIVATE_TEST_VALUE");
    expect(response.text).not.toContain("Test application");
    expect(response.text).not.toContain('class="poster-page"');
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
