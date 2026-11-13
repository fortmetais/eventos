import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

// Isolated browser fixtures: no messages or real invitations are created.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5186";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Use somente a prévia local.");
const org = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const authHost = "auth.encontro.invalid";
const user = {
  id: accountId,
  email: "gestor@example.test",
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
      canCopyLink: false,
      ...extra,
    });
    const invitations = [
      make("new", "novo@example.test", { canCopyLink: true }),
      make("old", "antigo@example.test"),
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
    const functions = [
      {
        id: "function",
        name: "Organizador",
        role: "ORGANIZER",
        defaultRole: "ORGANIZER",
        active: true,
      },
    ];
    const link = (id) =>
      `${target}/convite/${(id === "new" ? "n" : "o").repeat(43)}`;
    const calls = [],
      errors = [];
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
            platformAdmin: false,
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
          functions,
          invitations,
          invitationLinksReady: true,
          events: [],
        });
      const match = path.match(/\/invitations\/(new|old)\/link$/);
      if (match && req.method() === "POST") {
        const id = match[1],
          body = req.postDataJSON();
        calls.push({ id, body });
        const item = invitations.find((value) => value.id === id);
        const regenerated = !item.canCopyLink;
        assert(
          !regenerated || body.regenerate === true,
          "Legado exige confirmação antes da geração.",
        );
        item.canCopyLink = true;
        return json({ link: link(id), expiresAt: item.expiresAt, regenerated });
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
    await page.goto(`${target}/organizacao/${org}/membros`);
    const row = (email) =>
      page.locator(".invitation-list-row").filter({ hasText: email });
    const newRow = row("novo@example.test"),
      oldRow = row("antigo@example.test");
    await newRow
      .getByRole("button", { name: "Copiar link do convite" })
      .click();
    await expect(newRow.getByText("Link do convite copiado.")).toBeVisible();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      link("new"),
    );
    await expect(newRow.getByRole("textbox")).toHaveCount(0);
    await oldRow
      .getByRole("button", { name: "Gerar link para copiar" })
      .click();
    await expect(
      oldRow.getByText(/Gerar um novo link invalida o anterior/),
    ).toBeVisible();
    assert.equal(calls.filter((value) => value.id === "old").length, 0);
    await oldRow.getByRole("button", { name: "Cancelar geração" }).click();
    await oldRow
      .getByRole("button", { name: "Gerar link para copiar" })
      .click();
    await oldRow
      .getByRole("button", { name: "Gerar novo link e copiar" })
      .click();
    await expect(oldRow.getByText(/Novo link gerado e copiado/)).toBeVisible();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      link("old"),
    );
    assert.deepEqual(
      calls.filter((value) => value.id === "old"),
      [{ id: "old", body: { regenerate: true } }],
    );
    for (const email of [
      "aceito@example.test",
      "revogado@example.test",
      "expirado@example.test",
    ]) {
      await expect(
        row(email).getByRole("button", { name: /Copiar link|Gerar link/ }),
      ).toHaveCount(0);
    }
    await page.reload();
    await expect(
      oldRow.getByRole("button", { name: "Copiar link do convite" }),
    ).toBeVisible();
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Bloqueado no teste");
          },
        },
      }),
    );
    await newRow
      .getByRole("button", { name: "Copiar link do convite" })
      .click();
    await expect(
      newRow.getByText(/O navegador não permitiu copiar/),
    ).toBeVisible();
    await newRow
      .getByRole("button", { name: "Exibir link para copiar manualmente" })
      .click();
    await expect(
      newRow.getByRole("textbox", {
        name: "Link do convite para novo@example.test",
      }),
    ).toHaveValue(link("new"));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `.local/screenshots/invitation-links-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await context.close();
    console.info(
      `Convites ${mobile ? "celular" : "computador"}: cópia, confirmação de novo link, retomada, inativos e cópia manual aprovados.`,
    );
  }
} finally {
  await browser.close();
}
