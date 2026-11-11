import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import {
  defaultMessageTemplate,
  messageFields,
} from "../apps/api/dist/modules/registrations/event-messages.service.js";

// Browser-only mocks. Never uses the production database, credentials or messaging providers.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5186";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Use somente a prévia local.");
const org = "00000000-0000-4000-8000-000000000001",
  event = "00000000-0000-4000-8000-000000000002",
  account = "00000000-0000-4000-8000-000000000003";
const noticeId = "00000000-0000-4000-8000-000000000004";
const token = Buffer.alloc(32, 129).toString("base64url");
const code = Buffer.concat([
  Buffer.from(noticeId.replaceAll("-", ""), "hex"),
  Buffer.from(token, "base64url"),
]).toString("base64url");
const user = {
  id: account,
  email: "organizador@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
};
const now = Math.floor(Date.now() / 1000);
const session = {
  access_token: [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: account,
        aud: "authenticated",
        exp: now + 3600,
        iat: now,
      }),
    ).toString("base64url"),
    "fixture",
  ].join("."),
  refresh_token: "fixture",
  expires_in: 3600,
  expires_at: now + 3600,
  token_type: "bearer",
  user,
};
const organization = {
  id: org,
  name: "Paróquia Testes",
  city: "Loanda",
  state: "PR",
  kind: "PARISH",
  active: true,
};
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32"
    ? {
        executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      }
    : {}),
});
mkdirSync(".local/screenshots", { recursive: true });
try {
  for (const mobile of [false, true]) {
    const errors = [];
    const settings = {
      ready: true,
      event: { id: event, name: "FAC dos testes" },
      revision: 0,
      template: defaultMessageTemplate,
      defaultTemplate: defaultMessageTemplate,
      customized: false,
      fields: messageFields,
      previewValues: {
        ...Object.fromEntries(messageFields.map((f) => [f.key, f.example])),
        evento: "FAC dos testes",
        organizacao: organization.name,
        link: `${target}/r#${code}`,
      },
    };
    let saves = 0,
      confirmations = 0,
      confirmedAt = null;
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(
      (value) =>
        localStorage.setItem("sb-auth-auth-token", JSON.stringify(value)),
      session,
    );
    await context.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      const json = (value) => route.fulfill({ json: value });
      if (url.hostname === "auth.encontro.invalid")
        return route.fulfill({
          status: req.method() === "OPTIONS" ? 204 : 200,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers":
              "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
            "access-control-allow-methods": "GET,POST,OPTIONS",
          },
          ...(req.method() === "OPTIONS" ? {} : { json: user }),
        });
      if (path === "/api/v1/config")
        return json({
          supabaseUrl: "https://auth.encontro.invalid",
          supabaseAnonKey: "sb_publishable_test",
          eventsEnabled: false,
          eventManagementEnabled: true,
          volunteerRegistrationsEnabled: true,
          volunteerRegistrationsReady: true,
        });
      if (path === "/api/v1/me/access")
        return json({
          account: {
            id: account,
            email: user.email,
            profile: {},
            platformAdmin: false,
          },
          organizations: [
            {
              id: "membership",
              accountId: account,
              organizationId: org,
              organization,
              role: "ORGANIZER",
              active: true,
              healthEventIds: [],
            },
          ],
        });
      if (path === `/api/v1/organizations/${org}/events`)
        return json([{ id: event, name: settings.event.name }]);
      if (
        path === `/api/v1/organizations/${org}/events/${event}/accept-message`
      ) {
        if (req.method() === "PUT") {
          const body = req.postDataJSON();
          assert.equal(body.revision, settings.revision);
          settings.template = body.template ?? defaultMessageTemplate;
          settings.customized = body.template !== null;
          settings.revision++;
          saves++;
        }
        return json(settings);
      }
      if (
        path === `/api/v1/public/decision-responses/${noticeId}/view` ||
        path === `/api/v1/public/decision-responses/${noticeId}`
      ) {
        assert.equal(req.postDataJSON().token, token);
        if (!path.endsWith("/view")) {
          confirmations++;
          confirmedAt = new Date().toISOString();
        }
        return json({
          kind: "ACEITE",
          candidateName: "Maria",
          confirmedAt,
          expiresAt: "2027-01-30T12:00:00Z",
          event: {
            name: settings.event.name,
            startsAt: "2027-02-05",
            endsAt: "2027-02-09",
            organization: organization.name,
          },
        });
      }
      if (path.startsWith("/api/")) {
        errors.push(`${req.method()} ${path}`);
        return route.fulfill({ status: 404, json: {} });
      }
      if (url.origin === new URL(target).origin) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${target}/organizacao/${org}/mensagens?evento=${event}`);
    const editor = page.getByRole("textbox", { name: /Texto da mensagem/ });
    await expect(editor).toHaveValue(defaultMessageTemplate);
    await editor.fill(
      "Paz e bem, {{nome}}! Você foi escolhido para {{evento}}. Confirme em {{link}} até {{validade}}.\nDepartamento: ",
    );
    await editor.focus();
    await editor.evaluate((input) =>
      input.setSelectionRange(input.value.length, input.value.length),
    );
    await page
      .getByRole("button", { name: "Inserir departamento alocado" })
      .click();
    await expect(editor).toHaveValue(/Departamento: \{\{departamento\}\}$/);
    await expect(
      page.getByRole("region", { name: "Prévia da mensagem" }),
    ).toContainText("Departamento: SECRETARIA");
    assert.equal(saves, 0);
    await page.getByRole("button", { name: "Salvar mensagem" }).click();
    await expect(
      page.getByText(/Mensagem salva para este evento/),
    ).toBeVisible();
    assert.equal(saves, 1);
    await page.reload();
    await expect(editor).toHaveValue(settings.template);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `.local/screenshots/event-messages-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Restaurar texto padrão" }).click();
    await expect(editor).toHaveValue(defaultMessageTemplate);
    assert.equal(saves, 1);
    await page.getByRole("button", { name: "Salvar mensagem" }).click();
    await expect(
      page.getByText(/Mensagem salva para este evento/),
    ).toBeVisible();
    assert.equal(saves, 2);
    await page.goto(`${target}/r#${code}`);
    await expect(
      page.getByRole("button", { name: "Confirmar minha presença" }),
    ).toBeVisible();
    assert.equal(new URL(page.url()).pathname, `/resposta/${noticeId}`);
    assert.equal(new URL(page.url()).hash, "");
    assert.equal(confirmations, 0);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Confirmar minha presença" }),
    ).toBeVisible();
    assert.equal(confirmations, 0);
    await page
      .getByRole("button", { name: "Confirmar minha presença" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sua presença está confirmada!" }),
    ).toBeVisible();
    assert.equal(confirmations, 1);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `Mensagens ${mobile ? "celular" : "desktop"}: edição, informação no cursor, prévia, salvamento, retomada, restauração e link compacto aprovados.`,
    );
  }
} finally {
  await browser.close();
}
