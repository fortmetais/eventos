import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

// Isolated fixtures only: never grants access, changes passwords or sends mail
// against a real API or Auth provider. Every API/Auth request is intercepted.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5186";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Use somente a prévia local.");
const org = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const invitationId = "00000000-0000-4000-8000-000000000003";
const authHost = "auth.encontro.invalid";
const recipient = "convidado@example.test";
const password = "S3nh@Temporaria-SomenteTeste123!";
const loginUrl = `${target}/entrar?modo=senha`;
const reason =
  "Destinatário não recebeu o e-mail e identidade conferida pela administração.";
const conflictMessage =
  "Esta liberação já foi processada. Feche e abra novamente para solicitar outra senha temporária.";
const user = {
  id: accountId,
  email: "administrador@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
};
const organization = {
  id: org,
  name: "Paróquia Testes",
  city: "Loanda",
  state: "PR",
  kind: "PARISH",
  active: true,
};
const now = Math.floor(Date.now() / 1000);
const session = {
  access_token: [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: accountId,
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
    for (const admin of [true, false]) {
      const errors = [],
        calls = [];
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1366, height: 900 },
        permissions: ["clipboard-read", "clipboard-write"],
      });
      await context.addInitScript(
        (value) =>
          localStorage.setItem("sb-auth-auth-token", JSON.stringify(value)),
        session,
      );
      const make = (id, email, extra = {}) => ({
        id,
        email,
        role: "ORGANIZER",
        expiresAt: "2099-01-01T00:00:00Z",
        acceptedAt: null,
        revokedAt: null,
        canCopyLink: true,
        ...extra,
      });
      const invitations = [
        make(invitationId, recipient),
        make("accepted", "aceito@example.test", {
          acceptedAt: "2026-10-01T12:00:00Z",
        }),
        make("revoked", "revogado@example.test", {
          revokedAt: "2026-10-01T12:00:00Z",
        }),
        make("expired", "expirado@example.test", {
          expiresAt: "2020-01-01T00:00:00Z",
        }),
      ];
      await context.route("**/*", async (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          path = url.pathname;
        const json = (value) => route.fulfill({ json: value });
        if (url.hostname === authHost)
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
            supabaseUrl: `https://${authHost}`,
            supabaseAnonKey: "sb_publishable_test",
            eventsEnabled: false,
            eventManagementEnabled: false,
          });
        if (path === "/api/v1/me/access")
          return json({
            account: {
              id: accountId,
              email: user.email,
              profile: {},
              platformAdmin: admin,
            },
            organizations: [
              {
                id: "member",
                organizationId: org,
                accountId,
                organization,
                role: "ORGANIZER",
                active: true,
                healthEventIds: [],
              },
            ],
          });
        if (path === `/api/v1/organizations/${org}/members`)
          return json({
            members: [],
            functions: [
              {
                id: "function",
                name: "Organizador",
                role: "ORGANIZER",
                defaultRole: "ORGANIZER",
                active: true,
              },
            ],
            invitations,
            invitationLinksReady: true,
            events: [],
          });
        if (
          path ===
            `/api/v1/admin/organizations/${org}/invitations/${invitationId}/temporary-access` &&
          req.method() === "POST"
        ) {
          assert(
            admin,
            "Organizador comum não pode solicitar liberação administrativa.",
          );
          const body = req.postDataJSON();
          assert.equal(body.reason, reason);
          assert.equal(body.acknowledgeEmailBypass, true);
          assert.match(
            body.requestId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          );
          assert.deepEqual(Object.keys(body).sort(), [
            "acknowledgeEmailBypass",
            "reason",
            "requestId",
          ]);
          calls.push(body);
          if (calls.length > 1)
            return route.fulfill({
              status: 409,
              json: {
                error: {
                  code: "TEMPORARY_ACCESS_ALREADY_GRANTED",
                  message: conflictMessage,
                },
              },
            });
          return json({
            email: recipient,
            temporaryPassword: password,
            loginUrl,
            mustChangePassword: true,
            emailsSent: false,
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
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(
        admin
          ? `${target}/admin/organizacoes/${org}/membros`
          : `${target}/organizacao/${org}/membros`,
      );
      const row = (email) =>
        page.locator(".invitation-list-row").filter({ hasText: email });
      await expect(row(recipient)).toBeVisible();
      const action = row(recipient).getByRole("button", {
        name: "Liberar acesso com senha temporária",
      });
      if (!admin) {
        await expect(
          page.getByRole("button", {
            name: "Liberar acesso com senha temporária",
          }),
        ).toHaveCount(0);
        assert.equal(calls.length, 0);
        assert.deepEqual(errors, []);
        await context.close();
        continue;
      }
      await expect(action).toBeVisible();
      for (const email of [
        "aceito@example.test",
        "revogado@example.test",
        "expirado@example.test",
      ])
        await expect(
          row(email).getByRole("button", {
            name: "Liberar acesso com senha temporária",
          }),
        ).toHaveCount(0);
      const dialog = page.getByRole("dialog", {
        name: "Liberar acesso com senha temporária",
      });
      await action.click();
      await expect(dialog).toBeVisible();
      assert.equal(calls.length, 0);
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      assert.equal(calls.length, 0);
      await action.click();
      const submit = dialog.getByRole("button", {
        name: "Liberar acesso",
        exact: true,
      });
      await expect(submit).toBeDisabled();
      await dialog.getByLabel("Motivo da liberação").fill("curto");
      await dialog.getByRole("checkbox").check();
      await expect(submit).toBeDisabled();
      await dialog.getByRole("checkbox").uncheck();
      await dialog.getByLabel("Motivo da liberação").fill(reason);
      await expect(submit).toBeDisabled();
      await dialog.getByRole("checkbox").check();
      assert.equal(calls.length, 0);
      await submit.click();
      await expect(
        dialog.getByLabel("Senha temporária", { exact: true }),
      ).toHaveValue(password);
      await expect(
        dialog.getByLabel("E-mail de acesso", { exact: true }),
      ).toHaveValue(recipient);
      await expect(
        dialog.getByLabel("Link para entrar", { exact: true }),
      ).toHaveValue(loginUrl);
      assert.equal(calls.length, 1);
      await dialog
        .getByRole("button", { name: "Copiar senha", exact: true })
        .click();
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        password,
      );
      await dialog
        .getByRole("button", { name: "Copiar instruções", exact: true })
        .click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert(
        copied.includes(password) &&
          copied.includes(recipient) &&
          copied.includes(loginUrl),
      );
      const persisted = await page.evaluate(() =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
          href: location.href,
        }),
      );
      assert(
        !persisted.includes(password),
        "A senha não pode ir para armazenamento ou URL.",
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      const dialogBox = await dialog.boundingBox();
      const viewport = page.viewportSize();
      assert(dialogBox && viewport);
      assert(
        dialogBox.height <= viewport.height - 16,
        "O diálogo deve caber na altura da tela com rolagem interna.",
      );
      await dialog.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({
        path: `.local/screenshots/temporary-access-${mobile ? "mobile" : "desktop"}.png`,
        fullPage: false,
      });
      await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      assert(!(await page.locator("body").innerText()).includes(password));
      await action.click();
      await expect(dialog.getByLabel("Motivo da liberação")).toHaveValue("");
      await expect(
        dialog.getByLabel("Senha temporária", { exact: true }),
      ).toHaveCount(0);
      await dialog.getByLabel("Motivo da liberação").fill(reason);
      await dialog.getByRole("checkbox").check();
      await submit.click();
      await expect(
        dialog.getByText(/Esta operação pode já ter sido aplicada/),
      ).toBeVisible();
      assert.equal(
        calls.length,
        2,
        "Conflito não pode repetir a operação automaticamente.",
      );
      assert.notEqual(
        calls[0].requestId,
        calls[1].requestId,
        "Reabrir o diálogo deve iniciar uma solicitação explícita nova.",
      );
      await expect(
        dialog.getByLabel("Senha temporária", { exact: true }),
      ).toHaveCount(0);
      await expect(submit).toBeDisabled();
      assert(!page.url().includes(password));
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.info(
      `Acesso temporário ${mobile ? "celular" : "computador"}: somente administrador, confirmação explícita, credenciais copiáveis, limpeza, conflito e ausência de envios reais aprovados.`,
    );
  }
} finally {
  await browser.close();
}
