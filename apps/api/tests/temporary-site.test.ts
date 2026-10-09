import { describe, expect, it } from "vitest";
import request from "supertest";
import { createTemporaryApp } from "../src/core/temporary-app.js";
import { runtimeSettings } from "../src/core/runtime.js";

describe("página temporária do FAC", () => {
  const app = createTemporaryApp();
  it.each(["/", "/entrar", "/admin", "/inscricao/123", "/convite/abc"])(
    "exibe a arte e o acesso à inscrição no caminho %s",
    async (path) => {
      const response = await request(app)
        .get(path)
        .set("Accept", "text/html")
        .expect(200);
      expect(response.text).toContain("FAC 2027 — Inscrição");
      expect(response.text).toContain('src="/fac-2027.jpg"');
      expect(response.text).toContain('src="/musica.js?v=1" defer');
      expect(response.text).toContain('id="background-music"');
      expect(response.headers["cache-control"]).toBe("no-store");
    },
  );
  it("entrega a arte enviada e o estilo responsivo", async () => {
    await request(app)
      .get("/fac-2027.jpg")
      .expect("Content-Type", /image\/jpeg/)
      .expect(200);
    const css = await request(app).get("/pagina-temporaria.css").expect(200);
    expect(css.text).toContain("object-fit: contain");
    expect(css.text).toContain("max-height: calc(100svh - 184px)");
  });
  it("bloqueia consultas e alterações da API de negócio", async () => {
    for (const path of [
      "/api/v1/config",
      "/api/v1/readiness",
      "/api/v1/public/events",
      "/api/v1/organizations",
    ]) {
      const response = await request(app).get(path).expect(503);
      expect(response.body.error.code).toBe("TEMPORARY_SITE");
    }
    await request(app)
      .post("/api/v1/organizations")
      .send({ name: "Exemplo" })
      .expect(503);
  });
  it("responde ao monitoramento sem consultar banco ou autenticação", async () => {
    const response = await request(app).get("/api/v1/health").expect(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "fac-temporary",
      mode: "temporary",
    });
  });
  it.each([
    "/.env",
    "/.git/config",
    "/apps/api/.env",
    "/assets/app.js",
    "/assets/app",
  ])(
    "mantém arquivos e interface da aplicação indisponíveis em %s",
    async (path) => {
      await request(app).get(path).set("Accept", "text/html").expect(404);
    },
  );
  it("recusa iniciar sem a arte", () => {
    expect(() =>
      createTemporaryApp({ posterPath: "arquivo-inexistente.jpg" }),
    ).toThrow(/arte/);
  });
  it("restringe scripts e conexões na página pública", async () => {
    const response = await request(app).get("/").expect(200);
    expect(response.headers["content-security-policy"]).toContain(
      "script-src 'self'",
    );
    expect(response.headers["content-security-policy"]).toContain(
      "connect-src 'none'",
    );
  });
});

describe("ativação da página temporária", () => {
  it("usa a página temporária por padrão na produção sem exigir banco", () => {
    expect(runtimeSettings({ NODE_ENV: "production" }).TEMPORARY_SITE).toBe(
      true,
    );
    expect(runtimeSettings({}).TEMPORARY_SITE).toBe(true);
  });
  it("preserva o desenvolvimento local e permite ativar ou liberar explicitamente", () => {
    expect(runtimeSettings({ NODE_ENV: "development" }).TEMPORARY_SITE).toBe(
      false,
    );
    expect(
      runtimeSettings({ NODE_ENV: "development", TEMPORARY_SITE: "true" })
        .TEMPORARY_SITE,
    ).toBe(true);
    expect(
      runtimeSettings({ NODE_ENV: "production", TEMPORARY_SITE: "false" })
        .TEMPORARY_SITE,
    ).toBe(false);
  });
  it("recusa configuração ambígua em vez de liberar a aplicação", () => {
    expect(() => runtimeSettings({ TEMPORARY_SITE: "yes" })).toThrow();
  });
});
