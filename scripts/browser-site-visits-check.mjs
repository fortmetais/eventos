import assert from "node:assert/strict";
import express from "express";
import { chromium } from "@playwright/test";
import { createPreviewApp } from "../apps/api/dist/core/preview-app.js";
import { siteVisitsRoutes } from "../apps/api/dist/modules/site-visits/site-visits.routes.js";

// Use only a local server and a fake database. No production calls or stored visitor data.
const api = express();
api.use(express.json());
const application = createPreviewApp(api, { trackVisits: true });
const writes = [],
  requests = [];
const server = application.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
api.use("/api/v1", (req, _res, next) => {
  requests.push({
    origin: req.header("Origin"),
    cookie: req.header("Cookie"),
    body: req.body,
  });
  next();
});
api.use(
  "/api/v1",
  siteVisitsRoutes(
    {
      siteVisitDaily: {
        async upsert(input) {
          writes.push(input);
          return {};
        },
      },
    },
    { origin, rateLimits: false },
  ),
);
let browser;
async function count(total) {
  for (let i = 0; i < 50 && writes.length < total; i++)
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(writes.length, total);
}
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.platform === "win32"
      ? {
          executablePath:
            process.env.CHROME_PATH ??
            "C:/Program Files/Google/Chrome/Application/chrome.exe",
        }
      : {}),
  });
  for (const [width, screen] of [
    [1366, "LARGE"],
    [390, "SMALL"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    await context.addCookies([
      { name: "existing_cookie", value: "fixture", url: origin },
    ]);
    await context.route("https://docs.google.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Formulário simulado</h1>",
      }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const start = writes.length;
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await count(start + 1);
    assert.equal(writes[start].create.screen, screen);
    assert.equal(writes[start].create.pageViews, 1);
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.locator(".registration-link").click(),
    ]);
    await count(start + 2);
    assert.equal(writes[start + 1].create.registrationClicks, 1);
    await popup.close();
    // Returning from the form does not register a second view of the same document.
    assert.equal(writes.length, start + 2);
    await page.reload({ waitUntil: "domcontentloaded" });
    await count(start + 3);
    assert.equal(writes[start + 2].create.pageViews, 1);
    assert.deepEqual(errors, []);
    await context.close();
  }
  assert.equal(requests.length, 6);
  assert(
    requests.every(
      (request) => request.origin === origin && request.cookie === undefined,
    ),
  );
  assert(
    requests.every(
      (request) =>
        Object.keys(request.body).sort().join(",") === "event,screen",
    ),
  );
  console.log(
    "Visitas e cliques validados no navegador em computador e celular: origem correta, sem cookies e sem banco real.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
