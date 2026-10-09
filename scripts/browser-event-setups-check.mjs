import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Teste do React real; Auth/API/Storage simulados somente neste navegador.
// Não envia e-mails nem cria eventos no banco do usuário.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5174";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Use a aplicação local.");
const authHost = "auth.encontro.invalid";
const id = "00000000-0000-4000-8000-000000000001";
const user = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "teste@example.com",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  email_confirmed_at: new Date().toISOString(),
};
const organization = {
  id,
  name: "Paróquia do teste de eventos",
  city: "Toledo",
  state: "PR",
  kind: "PARISH",
  active: true,
};
const now = Math.floor(Date.now() / 1000);
const jwt = [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
  Buffer.from(
    JSON.stringify({
      sub: user.id,
      aud: "authenticated",
      exp: now + 3600,
      iat: now,
    }),
  ).toString("base64url"),
  "fixture",
].join(".");
const session = {
  access_token: jwt,
  refresh_token: "fixture-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: now + 3600,
  user,
};
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32"
    ? {
        executablePath:
          process.env.CHROME_PATH ??
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
      }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1366, height: 1000 },
});
await context.addInitScript((value) => {
  if (["localhost", "127.0.0.1"].includes(location.hostname))
    localStorage.setItem("sb-auth-auth-token", JSON.stringify(value));
}, session);
let events = [],
  writes = 0;
const errors = [];
context.on("page", (page) =>
  page.on("pageerror", (error) => errors.push(error.message)),
);
const json = (route, value, status = 200, headers = {}) =>
  route.fulfill({
    status,
    headers,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
await context.route("**/*", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.hostname === authHost) {
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    };
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith("/user")) return json(route, user, 200, headers);
  }
  if (url.pathname === "/api/v1/config")
    return json(route, {
      supabaseUrl: `https://${authHost}`,
      supabaseAnonKey: "sb_publishable_test",
      eventsEnabled: false,
      eventManagementEnabled: true,
    });
  if (url.pathname === "/api/v1/me/access")
    return json(route, {
      account: {
        id: user.id,
        email: user.email,
        platformAdmin: false,
        profile: {},
      },
      organizations: [
        {
          id: "member",
          accountId: user.id,
          organizationId: id,
          organization,
          role: "ORGANIZER",
          active: true,
          healthEventIds: [],
        },
      ],
    });
  if (url.pathname === `/api/v1/organizations/${id}/event-setups`) {
    if (request.method() === "GET") return json(route, events);
    if (request.method() === "POST") {
      const body = request.postData();
      const match = body.match(/name="data"\r\n\r\n([^\r]+)\r\n/);
      assert(match, "O formulário precisa enviar os dados do evento.");
      const data = JSON.parse(match[1]);
      assert.deepEqual(data.departments, [
        { name: "MANUTENÇÃO", capacity: 5 },
        { name: "ANJO", capacity: 3 },
        { name: "LÍDER", capacity: 2 },
      ]);
      assert.equal(data.event.endsAt, "2027-01-12");
      assert.equal(data.campaigns[0].opensAt, "2026-11-20T09:00:00-03:00");
      assert.equal(data.campaigns[1].opensAt, "2026-11-01T09:00:00-03:00");
      assert(
        body.includes('filename="arte.png"'),
        "O arquivo precisa acompanhar os dados.",
      );
      writes++;
      events = [
        {
          ...data.event,
          id: "event-test",
          organizationId: id,
          status: "DRAFT",
          type: { name: "FAC" },
          departmentsReady: true,
          teams: data.departments.map((department, index) => ({
            ...department,
            id: `department-${index}`,
            eventId: "event-test",
            occupied: 0,
            available: department.capacity,
          })),
          imageUrl: null,
          campaigns: data.campaigns.map((c, index) => ({
            ...c,
            id: `campaign-${index}`,
            paused: false,
          })),
        },
      ];
      return json(route, events[0], 201);
    }
  }
  if (url.pathname.startsWith("/api/v1/")) {
    errors.push(`API inesperada: ${url.pathname}`);
    return json(route, {}, 400);
  }
  if (url.hostname === "fonts.googleapis.com")
    return route.fulfill({ status: 200, contentType: "text/css", body: "" });
  if (url.origin === new URL(target).origin) return route.continue();
  errors.push(`Destino inesperado: ${url.hostname}`);
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
mkdirSync(".local/screenshots", { recursive: true });
try {
  await page.goto(`${target}/organizacao/${id}`);
  await page.getByRole("link", { name: "Preparar eventos" }).click();
  await page.getByRole("button", { name: "Novo evento", exact: true }).click();
  await page
    .getByLabel("Nome do evento", { exact: false })
    .fill("FAC 2027 — Nossa comunidade");
  await page.getByLabel("O evento dura mais de um dia").check();
  for (const [label, value] of [
    ["Data de início", "2027-01-10"],
    ["Data de término", "2027-01-12"],
    ["Local do evento", "Chácara da comunidade"],
    [
      "Descrição",
      "Um encontro de fé, acolhimento e serviço para nossa comunidade.",
    ],
    ["Abertura — servos", "2026-11-20T09:00"],
    ["Encerramento — servos", "2026-12-01T18:00"],
    ["Abertura — campistas", "2026-11-01T09:00"],
    ["Encerramento — campistas", "2026-12-10T18:00"],
  ])
    await page.getByLabel(label, { exact: false }).fill(value);
  for (const [index, name, capacity] of [
    [1, "MANUTENÇÃO", "5"],
    [2, "ANJO", "3"],
    [3, "LÍDER", "2"],
  ]) {
    if (index > 1)
      await page
        .getByRole("button", { name: "Adicionar departamento" })
        .click();
    await page.getByLabel(new RegExp(`^Departamento ${index}`)).fill(name);
    await page
      .getByLabel(`Vagas — departamento ${index}`, { exact: false })
      .fill(capacity);
  }
  // PNG mínimo para validar seleção e prévia sem depender do Storage real.
  await page.getByLabel("Selecionar arte", { exact: false }).setInputFiles({
    name: "arte.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByAltText("Prévia da arte do evento").waitFor();
  await page.screenshot({
    path: ".local/screenshots/evento-formulario-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "O formulário não deve transbordar no celular.",
  );
  await page.screenshot({
    path: ".local/screenshots/evento-formulario-celular.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Salvar evento", exact: true })
    .click();
  await page
    .getByText(
      "Evento salvo em preparação, com departamentos, vagas e períodos de inscrição.",
    )
    .waitFor();
  await page
    .getByRole("heading", { name: "FAC 2027 — Nossa comunidade" })
    .waitFor();
  assert.equal(writes, 1);
  await page.getByRole("button", { name: "Editar evento" }).click();
  assert.equal(
    await page.getByLabel(/^Departamento 2/).inputValue(),
    "ANJO",
  );
  assert.equal(
    await page
      .getByLabel("Vagas — departamento 2", { exact: false })
      .inputValue(),
    "3",
  );
  assert.equal(
    await page.getByLabel("Abertura — servos", { exact: false }).inputValue(),
    "2026-11-20T09:00",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Cadastro e edição de evento, dois períodos, seleção de arte e layout móvel validados no navegador. Nenhum registro real criado.",
  );
} catch (error) {
  await page.screenshot({
    path: ".local/screenshots/evento-teste-falha.png",
    fullPage: true,
  });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
