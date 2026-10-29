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
  for (const [width, height, screen] of [
    [1366, 900, "LARGE"],
    [390, 844, "SMALL"],
    [320, 568, "SMALL"],
    [844, 390, "MEDIUM"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 768,
    });
    await context.addCookies([
      { name: "existing_cookie", value: "fixture", url: origin },
    ]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const start = writes.length;
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await count(start + 1);
    assert.equal(writes[start].create.screen, screen);
    assert.equal(writes[start].create.pageViews, 1);
    const notice = page.getByRole("button", {
      name: "INSCRIÇÕES PARA SERVOS ENCERRADAS",
      exact: true,
    });
    assert(await notice.isDisabled());
    assert.equal(
      await page.locator('a[href*="docs.google.com/forms"]').count(),
      0,
    );
    assert(
      await notice.evaluate(
        (button) =>
          button.scrollHeight <= button.clientHeight &&
          button.scrollWidth <= button.clientWidth,
      ),
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const box = await notice.boundingBox();
    assert(box);
    if (width < 768)
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // A disabled notice cannot open a form or record an enrollment click.
    assert.equal(context.pages().length, 1);
    assert.equal(page.url(), `${origin}/`);
    assert.equal(writes.length, start + 1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await count(start + 2);
    assert.equal(writes[start + 1].create.pageViews, 1);
    assert.deepEqual(errors, []);
    await context.close();
  }
  assert.equal(requests.length, 8);
  assert(requests.every((request) => request.body.event === "view"));
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
    "Inscrições encerradas e visitas validadas em computador e celular: botão sem ação, texto legível, sem cliques de inscrição, cookies ou banco real.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
