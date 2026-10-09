import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5174";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Use somente a aplicação local.");
const authHost = "auth.encontro.invalid";
const token = "a".repeat(43);
const invitationPath = `/convite/${token}`;
const organizationId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "teste@example.com",
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
};
const organization = {
  id: organizationId,
  name: "Paróquia do teste de convite",
  city: "Toledo",
  state: "PR",
  kind: "PARISH",
  active: true,
};
const membership = {
  id: "member",
  organizationId,
  accountId: userId,
  role: "ORGANIZER",
  active: true,
  healthEventIds: [],
  organization,
};
const account = {
  id: userId,
  email: user.email,
  platformAdmin: false,
  profile: {},
};
let callback;
let accepted = false;
let acceptRequests = 0;
const errors = [];
let currentPage;
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
  viewport: { width: 1366, height: 900 },
});
context.on("page", (page) =>
  page.on("pageerror", (error) => errors.push(error.message)),
);
const json = (route, value, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.hostname === authHost) {
    if (request.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers":
            "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
          "access-control-allow-methods": "GET, POST, OPTIONS",
        },
      });
    if (url.pathname.endsWith("/otp")) {
      callback = url.searchParams.get("redirect_to");
      assert.equal(request.postDataJSON().email, user.email);
      assert.equal(new URL(callback).searchParams.get("next"), invitationPath);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: "{}",
      });
    }
    if (url.pathname.endsWith("/user"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(user),
      });
    errors.push(`Requisição Auth inesperada: ${url.pathname}`);
    return json(route, { error: "unexpected test request" }, 400);
  }
  if (url.pathname.startsWith("/api/v1/")) {
    if (url.pathname === "/api/v1/config")
      return json(route, {
        supabaseUrl: `https://${authHost}`,
        supabaseAnonKey: "sb_publishable_browser_fixture",
        eventsEnabled: false,
      });
    if (url.pathname === "/api/v1/me/access")
      return json(route, {
        account,
        organizations: accepted ? [membership] : [],
      });
    if (
      url.pathname === `/api/v1/invitations/${token}/accept` &&
      request.method() === "POST"
    ) {
      acceptRequests++;
      assert.equal(accepted, false);
      accepted = true;
      return json(route, membership);
    }
    errors.push(`Requisição API inesperada: ${url.pathname}`);
    return json(route, { error: { message: "unexpected test request" } }, 400);
  }
  if (url.hostname === "fonts.googleapis.com")
    return route.fulfill({ status: 200, contentType: "text/css", body: "" });
  // Somente arquivos da aplicação local podem sair das respostas simuladas.
  if (url.origin === new URL(target).origin) return route.continue();
  errors.push(`Destino externo inesperado: ${url.hostname}`);
  return route.abort();
});

try {
  const original = await context.newPage();
  currentPage = original;
  original.setDefaultTimeout(10000);
  await original.goto(`${target}${invitationPath}`);
  await original.getByRole("link", { name: "Entrar para aceitar" }).click();
  await original.getByRole("textbox", { name: /Seu e-mail/ }).fill(user.email);
  await original
    .getByRole("button", { name: "Receber acesso por e-mail" })
    .click();
  await original.getByRole("heading", { name: "Confira seu e-mail" }).waitFor();
  assert(callback, "O primeiro acesso precisa preservar o retorno ao convite.");
  const now = Math.floor(Date.now() / 1000);
  const jwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: userId,
        aud: "authenticated",
        role: "authenticated",
        email: user.email,
        iat: now,
        exp: now + 3600,
      }),
    ).toString("base64url"),
    "assinatura-apenas-da-fixture",
  ].join(".");
  const fragment = new URLSearchParams({
    access_token: jwt,
    refresh_token: "fixture-refresh-token",
    expires_in: "3600",
    token_type: "bearer",
    type: "signup",
  });
  // Confirmação do primeiro acesso em uma aba nova, sem sessionStorage da aba original.
  const confirmation = await context.newPage();
  currentPage = confirmation;
  confirmation.setDefaultTimeout(10000);
  await confirmation.goto(`${callback}#${fragment}`);
  await confirmation.getByRole("button", { name: "Aceitar convite" }).waitFor();
  assert.equal(new URL(confirmation.url()).pathname, invitationPath);
  assert.equal(
    acceptRequests,
    0,
    "Confirmar o e-mail não deve aceitar o convite automaticamente.",
  );
  await confirmation.getByRole("button", { name: "Aceitar convite" }).click();
  await confirmation
    .getByRole("heading", { name: organization.name })
    .waitFor();
  assert.equal(
    new URL(confirmation.url()).pathname,
    `/organizacao/${organizationId}`,
  );
  assert.equal(acceptRequests, 1);
  assert.equal(
    await confirmation.evaluate(() =>
      localStorage.getItem("encontro.pendingInvitation"),
    ),
    null,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Primeiro acesso confirmado em outra aba voltou ao convite e abriu a organização após o aceite. Supabase e API simulados apenas neste teste; nenhum e-mail ou registro real foi criado.",
  );
} catch (error) {
  mkdirSync(".local/screenshots", { recursive: true });
  await currentPage?.screenshot({
    path: ".local/screenshots/convite-teste-falha.png",
    fullPage: true,
  });
  console.error({
    path: currentPage ? new URL(currentPage.url()).pathname : "",
    errors,
  });
  throw error;
} finally {
  await browser.close();
}
