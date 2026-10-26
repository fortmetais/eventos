import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { siteVisitsRoutes } from "../src/modules/site-visits/site-visits.routes.js";
import { createTemporaryApp } from "../src/core/temporary-app.js";

const origin = "https://facnsaloanda.com.br";
const path = "/api/v1/public/site-visits";
function application(db: PrismaClient, rateLimits = false) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    siteVisitsRoutes(db, {
      origin,
      rateLimits,
      now: () => new Date("2031-06-12T01:30:00Z"),
    }),
  );
  return app;
}
describe("Histórico agregado do cartaz", () => {
  const upsert = vi.fn().mockResolvedValue({});
  const app = () => {
    upsert.mockClear();
    return application({
      siteVisitDaily: { upsert },
    } as unknown as PrismaClient);
  };
  it("incrementa somente o contador solicitado e usa o dia de Brasília", async () => {
    const server = app();
    await request(server)
      .post(path)
      .set("Origin", origin)
      .send({ event: "view", screen: "SMALL" })
      .expect(204);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      where: {
        day_screen: { day: new Date("2031-06-11T00:00:00Z"), screen: "SMALL" },
      },
      create: { pageViews: 1, registrationClicks: 0 },
      update: { pageViews: { increment: 1 } },
    });
    await request(server)
      .post(path)
      .set("Origin", origin)
      .send({ event: "registration_click", screen: "LARGE" })
      .expect(204);
    expect(upsert.mock.calls[1][0]).toMatchObject({
      create: { pageViews: 0, registrationClicks: 1 },
      update: { registrationClicks: { increment: 1 } },
    });
  });
  it("recusa origem externa, origem ausente e dados pessoais ou campos arbitrários", async () => {
    const server = app();
    await request(server)
      .post(path)
      .send({ event: "view", screen: "SMALL" })
      .expect(403);
    await request(server)
      .post(path)
      .set("Origin", "https://externo.test")
      .send({ event: "view", screen: "SMALL" })
      .expect(403);
    await request(server)
      .post(path)
      .set("Origin", origin)
      .set("Sec-Fetch-Site", "cross-site")
      .send({ event: "view", screen: "SMALL" })
      .expect(403);
    for (const body of [
      { event: "view", screen: "SMALL", email: "nao@guardar.test" },
      { event: "view", screen: "SMALL", url: "/?token=secreto" },
      { event: "outro", screen: "SMALL" },
      { event: "view", screen: "qualquer" },
    ])
      await request(server)
        .post(path)
        .set("Origin", origin)
        .send(body)
        .expect(422);
    await request(server).get(path).expect(404);
    expect(upsert).not.toHaveBeenCalled();
  });
  it("ignora pré-carregamento e robôs conhecidos", async () => {
    const server = app();
    for (const [header, value] of [
      ["Purpose", "prefetch"],
      ["Sec-Purpose", "prefetch;prerender"],
      ["User-Agent", "Googlebot"],
      ["User-Agent", "WhatsApp/2.0"],
    ])
      await request(server)
        .post(path)
        .set("Origin", origin)
        .set(header, value)
        .send({ event: "view", screen: "SMALL" })
        .expect(204);
    expect(upsert).not.toHaveBeenCalled();
  });
  it("falha no banco não interfere na navegação nem retorna detalhes internos", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fail = vi
      .fn()
      .mockRejectedValue(new Error("private database details"));
    const server = application({
      siteVisitDaily: { upsert: fail },
    } as unknown as PrismaClient);
    try {
      for (let i = 0; i < 2; i++) {
        const result = await request(server)
          .post(path)
          .set("Origin", origin)
          .send({ event: "view", screen: "SMALL" })
          .expect(204);
        expect(result.text).toBe("");
      }
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).not.toContain("private");
    } finally {
      warn.mockRestore();
    }
  });
  it("limita requisições públicas antes de gravar e não grava IP ou cabeçalhos", async () => {
    const server = application(
      { siteVisitDaily: { upsert } } as unknown as PrismaClient,
      true,
    );
    upsert.mockClear();
    for (let i = 0; i < 30; i++)
      await request(server)
        .post(path)
        .set("Origin", origin)
        .send({ event: "view", screen: "MEDIUM" })
        .expect(204);
    await request(server)
      .post(path)
      .set("Origin", origin)
      .send({ event: "view", screen: "MEDIUM" })
      .expect(429);
    expect(upsert).toHaveBeenCalledTimes(30);
    expect(Object.keys(upsert.mock.calls[0][0].create).sort()).toEqual([
      "day",
      "pageViews",
      "registrationClicks",
      "screen",
    ]);
  });
  it("habilita o script e conexões somente ao próprio site, sem abrir a API no modo isolado", async () => {
    const enabled = createTemporaryApp({ trackVisits: true });
    const html = await request(enabled).get("/").expect(200);
    expect(html.text).toContain('<script src="/visitas-v1.js" defer>');
    expect(html.headers["content-security-policy"]).toContain(
      "connect-src 'self'",
    );
    await request(enabled)
      .get("/visitas-v1.js")
      .expect("Content-Type", /javascript/)
      .expect(200);
    await request(enabled)
      .post(path)
      .send({ event: "view", screen: "SMALL" })
      .expect(503);
    const disabled = await request(createTemporaryApp()).get("/").expect(200);
    expect(disabled.text).not.toContain("visitas-v1.js");
    expect(disabled.headers["content-security-policy"]).toContain(
      "connect-src 'none'",
    );
  });
});

describe("Sinais de visitas reais do navegador", () => {
  const script = readFileSync(
    new URL("../public/visitas-v1.js", import.meta.url),
    "utf8",
  );
  function browser(
    width: number,
    state = "visible",
    prerendering = false,
    fails = false,
  ) {
    const callbacks: Record<string, () => void> = {};
    const link = {
      addEventListener: (event: string, fn: () => void) => {
        callbacks[`link:${event}`] = fn;
      },
    };
    const document = {
      visibilityState: state,
      prerendering,
      querySelector: () => link,
      addEventListener: (event: string, fn: () => void) => {
        callbacks[event] = fn;
      },
    };
    const fetch = vi.fn(() =>
      fails ? Promise.reject(new Error("offline")) : Promise.resolve({}),
    );
    runInNewContext(script, { document, window: { innerWidth: width }, fetch });
    return { document, callbacks, fetch };
  }
  it.each([
    [390, "SMALL"],
    [900, "MEDIUM"],
    [1366, "LARGE"],
  ])(
    "registra uma visualização na tela %s sem identificadores nem cookies",
    (width, screen) => {
      const b = browser(Number(width));
      b.callbacks.visibilitychange();
      b.callbacks.visibilitychange();
      expect(b.fetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(b.fetch.mock.calls[0][1].body)).toEqual({
        event: "view",
        screen,
      });
      expect(b.fetch.mock.calls[0][1]).toMatchObject({
        credentials: "omit",
        keepalive: true,
      });
    },
  );
  it("conta apenas quando a aba fica visível e registra o clique sem bloquear a inscrição", async () => {
    const b = browser(390, "hidden");
    expect(b.fetch).not.toHaveBeenCalled();
    b.document.visibilityState = "visible";
    b.callbacks.visibilitychange();
    b.callbacks["link:click"]();
    expect(b.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(b.fetch.mock.calls[1][1].body)).toEqual({
      event: "registration_click",
      screen: "SMALL",
    });
    const offline = browser(390, "visible", false, true);
    expect(() => offline.callbacks["link:click"]()).not.toThrow();
    await Promise.resolve();
  });
  it("ignora a renderização antecipada e não usa temporizador para gerar acessos", () => {
    const b = browser(390, "visible", true);
    expect(b.fetch).not.toHaveBeenCalled();
    b.document.prerendering = false;
    b.callbacks.prerenderingchange();
    expect(b.fetch).toHaveBeenCalledTimes(1);
    expect(script).not.toMatch(
      /setInterval|setTimeout|localStorage|sessionStorage|document\.cookie/,
    );
  });
});

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("Contadores persistidos em PostgreSQL", () => {
  if (url && new URL(url).pathname !== "/fac_tests")
    throw new Error("Use apenas fac_tests isolado.");
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_tests",
  });
  const server = application(db);
  beforeAll(async () => {
    await db.siteVisitDaily.deleteMany({
      where: { day: new Date("2031-06-11T00:00:00Z") },
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it("incrementa acessos concorrentes na mesma linha sem perder contagens e mantém RLS", async () => {
    await Promise.all(
      Array.from({ length: 12 }, () =>
        request(server)
          .post(path)
          .set("Origin", origin)
          .send({ event: "view", screen: "SMALL" })
          .expect(204),
      ),
    );
    await request(server)
      .post(path)
      .set("Origin", origin)
      .send({ event: "registration_click", screen: "SMALL" })
      .expect(204);
    const rows = await db.siteVisitDaily.findMany({
      where: { day: new Date("2031-06-11T00:00:00Z") },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      screen: "SMALL",
      pageViews: 12,
      registrationClicks: 1,
    });
    const [rls] = await db.$queryRaw<
      { enabled: boolean }[]
    >`SELECT relrowsecurity AS enabled FROM pg_class WHERE oid='acesso.visitas_site'::regclass`;
    expect(rls.enabled).toBe(true);
  });
});
