import { describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { createTemporaryApp } from "../src/core/temporary-app.js";
import { runtimeSettings } from "../src/core/runtime.js";

describe("página temporária do FAC", () => {
  const app = createTemporaryApp();
  const registrationUrl =
    "https://docs.google.com/forms/d/e/1FAIpQLSe3R2cm8qVkqIzQhNlwC7PQH1s92pFVwJ8iMwcisBKeUAAgnA/viewform?pli=1";
  it.each(["/", "/entrar", "/admin", "/inscricao/123", "/convite/abc"])(
    "exibe a nova arte e o acesso à inscrição de campistas no caminho %s",
    async (path) => {
      const response = await request(app)
        .get(path)
        .set("Accept", "text/html")
        .expect(200);
      expect(response.text).toContain(
        'aria-label="Quero me inscrever como campista"',
      );
      expect(response.text).toContain(
        'class="screen-reader-only">QUERO ME INSCREVER</span>',
      );
      expect(response.text).toContain(`href="${registrationUrl}"`);
      expect(response.text).toContain('class="registration-link"');
      expect(response.text).toContain('target="_blank"');
      expect(response.text).toContain('rel="noopener noreferrer"');
      expect(response.text).not.toContain("INSCRIÇÕES PARA SERVOS ENCERRADAS");
      expect(response.text).not.toMatch(
        /class="registration-link"[^>]*disabled/,
      );
      expect(response.text).toContain('width="1024" height="1536"');
      expect(response.text).toContain('src="/musica.js?v=2" defer');
      expect(response.text).toContain('id="background-music"');
      expect(response.headers["cache-control"]).toBe("no-store");
    },
  );
  it("entrega a arte enviada e o estilo responsivo", async () => {
    const image = await request(app)
      .get("/fac-2027.jpg")
      .expect("Content-Type", /image\/jpeg/)
      .expect(200);
    expect(await sharp(image.body).metadata()).toMatchObject({
      width: 1024,
      height: 1536,
    });
    const css = await request(app).get("/pagina-temporaria.css").expect(200);
    expect(css.text).toContain("object-fit: contain");
    expect(css.text).toContain("1024 / 1536");
    expect(css.text).toContain(":focus-visible");
    expect(css.text).toContain("prefers-reduced-motion");
    expect(css.text).toContain("box-shadow");
  });
  it("oferece o panorama decorativo de computador sem substituir a arte original", async () => {
    const page = await request(app).get("/").expect(200);
    expect(page.text).toContain('class="poster-panorama" aria-hidden="true"');
    expect(page.text).toContain("/pagina-temporaria.css?v=viagem-20261125-v4");
    expect(page.text).toContain('src="/fac-2027.jpg?v=viagem-20261125-v3"');
    const response = await request(app)
      .get("/fac-2027-panorama-v3.webp")
      .expect("Content-Type", /image\/webp/)
      .expect(200);
    expect(response.headers["cache-control"]).toContain("31536000");
    expect(await sharp(response.body).metadata()).toMatchObject({
      width: 2172,
      height: 724,
    });
  });
  it("oferece cartazes WebP responsivos com cache e JPEG como alternativa", async () => {
    const page = await request(app).get("/").expect(200);
    expect(page.text).toContain("/fac-2027-720-v3.webp 720w");
    expect(page.text).toContain("/fac-2027-1024-v3.webp 1024w");
    expect(page.text).toContain('src="/fac-2027.jpg?v=viagem-20261125-v3"');
    expect(page.text).not.toContain("Quadra Esportiva");
    for (const width of [720, 1024]) {
      const response = await request(app)
        .get(`/fac-2027-${width}-v3.webp`)
        .expect("Content-Type", /image\/webp/)
        .expect(200);
      expect(response.headers["cache-control"]).toContain("31536000");
      expect(await sharp(response.body).metadata()).toMatchObject({
        width,
        height: width * 1.5,
      });
    }
    for (const width of [720, 1041])
      await request(app)
        .get(`/fac-2027-${width}-v1.webp`)
        .expect("Content-Type", /image\/webp/)
        .expect(200);
    for (const width of [720, 1024])
      await request(app)
        .get(`/fac-2027-${width}-v2.webp`)
        .expect("Content-Type", /image\/webp/)
        .expect(200);
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
  it("libera os testes somente quando solicitado explicitamente", () => {
    expect(
      runtimeSettings({ NODE_ENV: "production" }).APPLICATION_TEST_ACCESS,
    ).toBe(false);
    expect(
      runtimeSettings({ APPLICATION_TEST_ACCESS: "true" })
        .APPLICATION_TEST_ACCESS,
    ).toBe(true);
    expect(() => runtimeSettings({ APPLICATION_TEST_ACCESS: "yes" })).toThrow();
  });
});
