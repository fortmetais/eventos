import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createPreviewApp } from "../src/core/preview-app.js";

describe("Fluxos públicos e painéis com o cartaz no início", () => {
  let temporaryRoot: string;
  let webRoot: string;
  const api = express();
  api.use(express.json());
  api.get("/api/v1/config", (_req, res) =>
    res.json({ marker: "business-config" }),
  );
  api.get("/api/v1/health", (_req, res) =>
    res.json({ service: "business-api" }),
  );
  api.get("/api/v1/public/events", (_req, res) =>
    res.json({ marker: "public-events" }),
  );
  api.get("/api/v1/public/events/test", (_req, res) =>
    res.json({ marker: "public-event" }),
  );
  api.get("/api/v1/public/campaigns/test", (_req, res) =>
    res.json({ marker: "public-campaign" }),
  );
  api.post("/api/v1/public/campaigns/test/drafts", (_req, res) =>
    res.status(201).json({ id: "draft", token: "draft-test" }),
  );
  api.get("/api/v1/public/drafts/test", (req, res) => {
    if (req.header("X-Draft-Token") !== "draft-test") {
      res.status(403).json({ error: { code: "DRAFT_TOKEN_REQUIRED" } });
      return;
    }
    res.json({ marker: "private-draft" });
  });
  for (const purpose of ["decision-responses", "guardian-authorizations"]) {
    api.post(`/api/v1/public/${purpose}/test/view`, (req, res) => {
      if (req.body.token !== "link-test") {
        res.status(403).json({ error: { code: "LINK_TOKEN_REQUIRED" } });
        return;
      }
      res.json({ marker: purpose });
    });
  }
  api.get("/api/v1/openapi", (_req, res) => res.json({ leaked: true }));
  api.post("/api/v1/admin/example", (req, res) => {
    if (req.header("Authorization") !== "Bearer test-identity") {
      res.status(401).json({ error: { code: "AUTH_REQUIRED" } });
      return;
    }
    res.json({ accepted: req.body });
  });
  api.use((_req, res) =>
    res.status(404).json({ error: { code: "API_NOT_FOUND" } }),
  );

  beforeAll(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), "encontro-preview-"));
    webRoot = join(temporaryRoot, ".deployment", "web");
    mkdirSync(join(webRoot, "assets"), { recursive: true });
    writeFileSync(
      join(webRoot, "index.html"),
      '<!doctype html><html lang="pt-BR"><title>Test application</title></html>',
    );
    writeFileSync(
      join(webRoot, "assets", "app-a1b2.js"),
      'console.log("test");',
    );
    writeFileSync(join(webRoot, ".env"), "PRIVATE_TEST_VALUE=hidden");
  });
  afterAll(() => {
    const target = resolve(temporaryRoot);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("encontro-preview-")
    )
      throw new Error("Diretório temporário de teste inesperado.");
    rmSync(target, { recursive: true, force: true });
  });
  const preview = () =>
    createPreviewApp(api, {
      webRoot,
      supabaseUrl: "https://auth.example.test",
      trustProxy: 1,
    });

  it("entrega os cartazes WebP no modo de testes", async () => {
    const app = createPreviewApp(api, { webRoot });
    for (const width of [720, 1041])
      await request(app)
        .get(`/fac-2027-${width}-v1.webp`)
        .expect("Content-Type", /image\/webp/)
        .expect(200);
  });
  it("mantém arte, inscrição externa e música no início com a CSP do cartaz", async () => {
    const response = await request(preview()).get("/?source=test").expect(200);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain('class="poster-page"');
    expect(response.text).toContain("docs.google.com/forms/");
    expect(response.text).toContain('src="/lazaro.mp3"');
    expect(response.text).not.toContain("Test application");
    expect(response.headers["content-security-policy"]).toContain(
      "connect-src 'none'",
    );
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
    "/eventos",
    "/eventos/test",
    "/inscricao/test?source=event",
    "/INSCRICAO/test/",
    "/resposta/test",
    "/autorizacao/test",
  ])(
    "serve React em %s com CSP de autenticação e o indicador de início temporário",
    async (path) => {
      const response = await request(preview())
        .get(path)
        .set("Accept", "text/html")
        .expect(200);
      expect(response.text).toContain("Test application");
      expect(response.text).toContain('data-temporary-home="true"');
      expect(response.text).not.toContain('class="poster-page"');
      expect(response.headers["content-security-policy"]).toContain(
        "connect-src 'self' https://auth.example.test wss://auth.example.test",
      );
      expect(response.headers["content-security-policy"]).not.toContain(
        "connect-src 'none'",
      );
      expect(response.headers["cache-control"]).toBe("no-cache");
      await request(preview()).head(path).expect(200);
    },
  );

  it("serve apenas arquivos compilados e mantém erros de assets ausentes", async () => {
    const response = await request(preview())
      .get("/assets/app-a1b2.js")
      .expect(200);
    expect(response.text).toContain('console.log("test")');
    expect(response.headers["cache-control"]).toContain("immutable");
    await request(preview())
      .get("/assets/missing.js")
      .set("Accept", "text/html")
      .expect(404);
    await request(preview())
      .get("/assets/missing")
      .set("Accept", "text/html")
      .expect(404);
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
    expect(response.headers["content-security-policy"]).toContain(
      "connect-src 'none'",
    );
  });

  it("preserva a API de configuração e saúde, inclusive com letras maiúsculas", async () => {
    const app = preview();
    const settings = await request(app).get("/api/v1/config").expect(200);
    expect(settings.body).toEqual({ marker: "business-config" });
    const health = await request(app).get("/API/v1/health").expect(200);
    expect(health.body).toEqual({ service: "business-api" });
    const missing = await request(app)
      .get("/api/v1/missing")
      .set("Accept", "text/html")
      .expect(404);
    expect(missing.body.error.code).toBe("API_NOT_FOUND");
  });

  it("não contorna autenticação nem transforma uma operação administrativa em HTML", async () => {
    const app = preview();
    const rejected = await request(app)
      .post("/api/v1/admin/example")
      .send({ example: true })
      .expect(401);
    expect(rejected.body.error.code).toBe("AUTH_REQUIRED");
    const accepted = await request(app)
      .post("/api/v1/admin/example")
      .set("Authorization", "Bearer test-identity")
      .send({ example: true })
      .expect(200);
    expect(accepted.body).toEqual({ accepted: { example: true } });
  });

  it.each(["/api/v1/openapi", "/API/v1/OPENAPI/"])(
    "mantém a documentação da API bloqueada em %s",
    async (path) => {
      const app = preview();
      for (const method of ["get", "post", "head"] as const) {
        const response = await request(app)
          [method](path)
          .set("Accept", "text/html")
          .expect(503);
        expect(response.type).toBe("application/json");
        expect(response.headers["cache-control"]).toBe("no-store");
        if (method !== "head") {
          expect(response.body.error.code).toBe("TEMPORARY_SITE");
          expect(response.body.leaked).toBeUndefined();
          expect(response.text).not.toContain("Test application");
        }
      }
    },
  );

  it.each([
    ["/api/v1/public/events", "public-events"],
    ["/API/v1/PUBLIC/events?test=1", "public-events"],
    ["/api/v1/public/events/test", "public-event"],
    ["/api/v1/public/campaigns/test", "public-campaign"],
  ])("encaminha a consulta pública %s para a API", async (path, marker) => {
    const app = preview();
    const response = await request(app)
      .get(path)
      .set("Accept", "text/html")
      .expect(200);
    expect(response.type).toBe("application/json");
    expect(response.body).toEqual({ marker });
    expect(response.headers.location).toBeUndefined();
    expect(response.text).not.toContain("Test application");
    await request(app).head(path).expect(200);
  });

  it("permite iniciar inscrição e mantém a proteção do rascunho por credencial", async () => {
    const app = preview();
    const created = await request(app)
      .post("/api/v1/public/campaigns/test/drafts")
      .send({})
      .expect(201);
    expect(created.body).toEqual({ id: "draft", token: "draft-test" });
    await request(app).get("/api/v1/public/drafts/test").expect(403);
    const authorized = await request(app)
      .get("/api/v1/public/drafts/test")
      .set("X-Draft-Token", "draft-test")
      .expect(200);
    expect(authorized.body.marker).toBe("private-draft");
  });

  it.each(["decision-responses", "guardian-authorizations"])(
    "encaminha %s mantendo a verificação do token pela API",
    async (purpose) => {
      const app = preview();
      const path = `/api/v1/public/${purpose}/test/view`;
      await request(app).post(path).send({}).expect(403);
      const response = await request(app)
        .post(path)
        .send({ token: "link-test" })
        .expect(200);
      expect(response.body.marker).toBe(purpose);
      expect(response.type).toBe("application/json");
      expect(response.headers.location).toBeUndefined();
    },
  );

  it("preserva erros JSON para rotas públicas inexistentes", async () => {
    for (const path of [
      "/api/v1/public",
      "/api/v1/public/missing",
      "/api/v1/%70ublic/events",
    ]) {
      const response = await request(preview())
        .get(path)
        .set("Accept", "text/html")
        .expect(404);
      expect(response.body.error.code).toBe("API_NOT_FOUND");
      expect(response.type).toBe("application/json");
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
    "/inscricao/.env",
    "/resposta/.git/config",
    "/autorizacao/.env",
    "/inscricao-other/test",
    "/resposta-other/test",
    "/autorizacao-other/test",
    "/entrar/other",
    "/meu-perfil/other",
    "/admin-other",
    "/organizacao-other",
  ])("não libera HTML nem arquivos privados pelo caminho %s", async (path) => {
    const response = await request(preview())
      .get(path)
      .set("Accept", "text/html")
      .expect(404);
    expect(response.type).toBe("application/json");
    expect(response.text).not.toContain("PRIVATE_TEST_VALUE");
    expect(response.text).not.toContain("Test application");
    expect(response.text).not.toContain('class="poster-page"');
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
