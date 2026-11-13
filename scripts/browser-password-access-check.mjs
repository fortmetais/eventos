import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

// Test-only Auth/API responses. No real users, passwords or emails are changed.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5186";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Use somente a prévia local.");
const authHost = "auth.encontro.invalid";
const userId = "00000000-0000-4000-8000-000000000001";
const invitation = `/convite/${"a".repeat(43)}`;
const temporaryPassword = "Temporaria9";
const personalPassword = "SenhaPessoalDeTeste123";
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
    for (const scenario of ["signup", "temporary"]) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1366, height: 900 },
      });
      let required = true,
        signupCalls = 0,
        passwordChanges = 0,
        acceptances = 0,
        signIns = 0;
      const errors = [];
      const user = () => ({
        id: userId,
        email: "pessoa@example.test",
        email_confirmed_at: new Date().toISOString(),
        aud: "authenticated",
        role: "authenticated",
        app_metadata: { must_change_password: required },
        user_metadata: {},
      });
      const session = () => {
        const now = Math.floor(Date.now() / 1000);
        const access_token = [
          Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
          Buffer.from(
            JSON.stringify({
              sub: userId,
              aud: "authenticated",
              role: "authenticated",
              email: user().email,
              iat: now,
              exp: now + 3600,
            }),
          ).toString("base64url"),
          "fixture",
        ].join(".");
        return {
          access_token,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          refresh_token: "fixture",
          user: user(),
        };
      };
      await context.route("**/*", async (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          path = url.pathname;
        const json = (value) =>
          route.fulfill({
            json: value,
            headers:
              url.hostname === authHost
                ? { "access-control-allow-origin": "*" }
                : {},
          });
        if (url.hostname === authHost) {
          if (req.method() === "OPTIONS")
            return route.fulfill({
              status: 204,
              headers: {
                "access-control-allow-origin": "*",
                "access-control-allow-headers":
                  "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
                "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
              },
            });
          if (path.endsWith("/signup")) {
            signupCalls++;
            const body = req.postDataJSON();
            assert.equal(body.email, user().email);
            assert.equal(body.password, personalPassword);
            const callback = new URL(url.searchParams.get("redirect_to"));
            assert.equal(callback.origin, new URL(target).origin);
            assert.equal(callback.searchParams.get("next"), invitation);
            return json({
              user: { ...user(), email_confirmed_at: null },
              session: null,
            });
          }
          if (
            path.endsWith("/token") &&
            url.searchParams.get("grant_type") === "password"
          ) {
            const body = req.postDataJSON();
            assert.equal(
              body.password,
              required ? temporaryPassword : personalPassword,
            );
            signIns++;
            return json(session());
          }
          if (path.endsWith("/user") && req.method() === "GET")
            return json(user());
          if (path.endsWith("/logout")) return json({});
          errors.push(`Unexpected Auth ${req.method()} ${path}`);
          return route.fulfill({ status: 400, json: {} });
        }
        if (path === "/api/v1/config")
          return json({
            supabaseUrl: `https://${authHost}`,
            supabaseAnonKey: "sb_publishable_test",
            eventsEnabled: false,
            eventManagementEnabled: false,
          });
        if (path === "/api/v1/me/access")
          return json({
            account: {
              id: userId,
              email: user().email,
              platformAdmin: false,
              profile: {},
            },
            organizations: [],
            passwordChangeRequired: required,
          });
        if (path === "/api/v1/me/first-password" && req.method() === "POST") {
          assert(required);
          assert.deepEqual(req.postDataJSON(), { password: personalPassword });
          required = false;
          passwordChanges++;
          return json({ passwordChanged: true, signInAgain: true });
        }
        if (path.includes("/invitations/") && path.endsWith("/accept")) {
          acceptances++;
          return route.fulfill({ status: 400, json: {} });
        }
        if (path.startsWith("/api/")) {
          errors.push(`Unexpected API ${req.method()} ${path}`);
          return route.fulfill({ status: 404, json: {} });
        }
        if (url.origin === new URL(target).origin) return route.continue();
        return route.abort();
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      if (scenario === "signup") {
        await page.goto(
          `${target}/entrar?next=${encodeURIComponent(invitation)}`,
        );
        await page
          .getByRole("button", { name: "Criar conta com senha" })
          .click();
        await page.getByLabel(/Seu e-mail/).fill(user().email);
        await page.getByLabel(/^Criar senha/).fill(personalPassword);
        await page.getByLabel(/^Confirmar senha/).fill(personalPassword);
        await page.screenshot({
          path: `.local/screenshots/password-signup-${mobile ? "mobile" : "desktop"}.png`,
          fullPage: true,
        });
        await page
          .getByRole("button", { name: "Criar conta e confirmar e-mail" })
          .click();
        await expect(
          page.getByRole("heading", { name: "Confira seu e-mail" }),
        ).toBeVisible();
        assert.equal(signupCalls, 1);
        assert.equal(signIns, 0);
        assert.equal(acceptances, 0);
      } else {
        await page.goto(
          `${target}/entrar?modo=senha&next=${encodeURIComponent(invitation)}`,
        );
        await page.getByLabel(/Seu e-mail/).fill(user().email);
        await page.getByLabel(/^Senha/).fill(temporaryPassword);
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
        await expect(
          page.getByText(/substitua a senha temporária/),
        ).toBeVisible();
        assert.equal(new URL(page.url()).pathname, "/nova-senha");
        assert.equal(acceptances, 0);
        await page.goto(`${target}/organizacao`);
        await expect(
          page.getByText(/substitua a senha temporária/),
        ).toBeVisible();
        await page.goto(target + invitation);
        await expect(
          page.getByText(/substitua a senha temporária/),
        ).toBeVisible();
        assert.equal(new URL(page.url()).searchParams.get("next"), invitation);
        await page
          .getByLabel("Nova senha", { exact: true })
          .fill(personalPassword);
        await page.getByLabel("Confirmar nova senha").fill(personalPassword);
        await page.screenshot({
          path: `.local/screenshots/password-required-${mobile ? "mobile" : "desktop"}.png`,
          fullPage: true,
        });
        await page.getByRole("button", { name: "Salvar senha" }).click();
        await expect(
          page.getByRole("heading", { name: "Senha atualizada" }),
        ).toBeVisible();
        assert.equal(passwordChanges, 1);
        assert.equal(acceptances, 0);
        assert.equal(signupCalls, 0);
        await page
          .getByRole("link", { name: "Entrar com a nova senha" })
          .click();
        await page.getByLabel(/Seu e-mail/).fill(user().email);
        await page.getByLabel(/^Senha/).fill(personalPassword);
        await page.getByRole("button", { name: "Entrar", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "Aceitar convite" }),
        ).toBeVisible();
        assert.equal(acceptances, 0);
        assert.equal(signIns, 2);
      }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      assert.deepEqual(errors, []);
      await context.close();
      console.info(
        `Senha ${scenario} ${mobile ? "celular" : "computador"}: fluxo e retorno preservados, sem contas ou e-mails reais.`,
      );
    }
  }
} finally {
  await browser.close();
}
