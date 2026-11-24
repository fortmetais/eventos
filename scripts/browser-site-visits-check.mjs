import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import express from "express";
import { chromium } from "@playwright/test";
import { createPreviewApp } from "../apps/api/dist/core/preview-app.js";
import { siteVisitsRoutes } from "../apps/api/dist/modules/site-visits/site-visits.routes.js";

// Use only a local server and a fake database. No production calls or stored visitor data.
const api = express();
api.use(express.json());
const application = express();
application.use((_req, res, next) => {
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    // This fixture uses HTTP loopback. WebKit otherwise upgrades local assets
    // to HTTPS; retain all remaining production CSP directives.
    const header =
      name.toLowerCase() === "content-security-policy"
        ? String(value)
            .split(";")
            .filter(
              (directive) => directive.trim() !== "upgrade-insecure-requests",
            )
            .join(";")
        : value;
    return setHeader(name, header);
  };
  next();
});
application.use(createPreviewApp(api, { trackVisits: true }));
const writes = [],
  requests = [];
const server = application.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const registrationUrl =
  "https://docs.google.com/forms/d/e/1FAIpQLSe3R2cm8qVkqIzQhNlwC7PQH1s92pFVwJ8iMwcisBKeUAAgnA/viewform?pli=1";
mkdirSync(".local/screenshots", { recursive: true });
api.use("/api/v1", (req, _res, next) => {
  requests.push({
    origin: req.header("Origin"),
    cookiePresent: req.header("Cookie") !== undefined,
    fetchSite: req.header("Sec-Fetch-Site"),
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
    const externalRequests = [];
    await context.route(
      (url) => url.origin !== origin,
      async (route) => {
        const url = route.request().url();
        if (url !== registrationUrl) return route.abort();
        externalRequests.push(url);
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: '<!doctype html><meta charset="utf-8"><title>Formulário simulado</title><p>Teste local</p>',
        });
      },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const start = writes.length;
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await count(start + 1);
    assert.equal(writes[start].create.screen, screen);
    assert.equal(writes[start].create.pageViews, 1);
    const notice = page.getByRole("link", {
      name: "INSCRIÇÕES PARA CAMPISTAS",
      exact: true,
    });
    assert.equal(await notice.getAttribute("href"), registrationUrl);
    assert.equal(await notice.getAttribute("target"), "_blank");
    assert.equal(await notice.getAttribute("rel"), "noopener noreferrer");
    const textMetrics = await notice.evaluate((button) => {
      const bounds = button.getBoundingClientRect(),
        style = getComputedStyle(button);
      const lines = [...button.querySelectorAll("span")].map((line) =>
        line.getBoundingClientRect().toJSON(),
      );
      const fits = [...button.querySelectorAll("span")].every((line) => {
        const text = line.getBoundingClientRect();
        return (
          text.left >= bounds.left &&
          text.right <= bounds.right &&
          text.top >= bounds.top &&
          text.bottom <= bounds.bottom
        );
      });
      return {
        fits,
        lines,
        bounds: bounds.toJSON(),
        font: style.font,
        lineHeight: style.lineHeight,
        clientWidth: button.clientWidth,
        clientHeight: button.clientHeight,
        scrollWidth: button.scrollWidth,
        scrollHeight: button.scrollHeight,
      };
    });
    writeFileSync(
      `.local/poster-button-metrics-${width}x${height}.json`,
      JSON.stringify(textMetrics, null, 2),
    );
    if (!textMetrics.fits)
      await page.screenshot({
        path: `.local/screenshots/poster-campistas-overflow-${width}x${height}.png`,
        fullPage: true,
      });
    assert(
      textMetrics.fits,
      `O texto do botão deve caber sem corte em ${width} × ${height}.`,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const box = await notice.boundingBox();
    const poster = await page.locator(".poster").boundingBox();
    assert(box && poster);
    assert(Math.abs((box.x - poster.x) / poster.width - 0.59) < 0.01);
    assert(Math.abs((box.y - poster.y) / poster.height - 0.145) < 0.01);
    assert(box.x + box.width <= poster.x + poster.width);
    assert(box.y + box.height < poster.y + poster.height * 0.205);
    assert(
      await notice.evaluate((link) => {
        const touchArea = getComputedStyle(link, "::after");
        return Number.parseFloat(touchArea.height) >= 44;
      }),
      "A área de toque deve ter pelo menos 44 px sem cobrir o texto do ingresso.",
    );
    await page.screenshot({
      path: `.local/screenshots/poster-campistas-${width}x${height}.png`,
      fullPage: true,
    });
    await page.locator("#background-music").evaluate((audio) => {
      audio.pause();
      audio.dispatchEvent(new Event("error"));
    });
    const musicError = page.getByRole("status");
    assert(await musicError.isVisible());
    assert.equal(
      await musicError.textContent(),
      "Não foi possível tocar a música. Tente novamente.",
    );
    const errorBounds = await musicError.boundingBox();
    assert(errorBounds);
    assert(
      errorBounds.y >= box.y + box.height ||
        errorBounds.y + errorBounds.height <= box.y ||
        errorBounds.x >= box.x + box.width ||
        errorBounds.x + errorBounds.width <= box.x,
      "O aviso de falha da música não pode cobrir o botão de inscrição.",
    );
    assert.equal(
      await musicError.evaluate(
        (message) => getComputedStyle(message).pointerEvents,
      ),
      "none",
    );
    await page.screenshot({
      path: `.local/screenshots/poster-campistas-audio-fallback-${width}x${height}.png`,
      fullPage: true,
    });
    const popupOpened = page.waitForEvent("popup");
    if (width === 844) {
      await notice.focus();
      await page.keyboard.press("Enter");
    } else if (width < 768)
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const popup = await popupOpened;
    await popup.waitForLoadState("domcontentloaded");
    assert.equal(popup.url(), registrationUrl);
    assert.equal(await popup.title(), "Formulário simulado");
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.deepEqual(externalRequests, [registrationUrl]);
    await count(start + 2);
    assert.equal(writes[start + 1].create.registrationClicks, 1);
    assert.equal(writes[start + 1].create.pageViews, 0);
    await popup.close();
    assert.equal(context.pages().length, 1);
    assert.equal(page.url(), `${origin}/`);
    // Use a fresh context that has never enabled request interception to verify
    // credentials omission on the browser's native network with an existing cookie.
    const nativeContext = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 768,
    });
    await nativeContext.addCookies([
      { name: "existing_cookie", value: "fixture", url: origin },
    ]);
    const nativePage = await nativeContext.newPage();
    nativePage.on("pageerror", (error) => errors.push(error.message));
    await nativePage.goto(origin, { waitUntil: "domcontentloaded" });
    await count(start + 3);
    assert.equal(writes[start + 2].create.pageViews, 1);
    const nativeLink = nativePage.getByRole("link", {
      name: "INSCRIÇÕES PARA CAMPISTAS",
      exact: true,
    });
    await nativeLink.evaluate((link) =>
      link.addEventListener("click", (event) => event.preventDefault(), {
        once: true,
      }),
    );
    await nativeLink.click();
    await count(start + 4);
    assert.equal(writes[start + 3].create.registrationClicks, 1);
    assert.equal(writes[start + 3].create.pageViews, 0);
    assert.equal(nativeContext.pages().length, 1);
    assert.equal(nativePage.url(), `${origin}/`);
    await nativeContext.close();
    assert.deepEqual(errors, []);
    await context.close();
  }
  assert.equal(requests.length, 16);
  writeFileSync(
    ".local/poster-visits-requests.json",
    JSON.stringify(requests, null, 2),
  );
  assert.equal(
    requests.filter((request) => request.body.event === "view").length,
    8,
  );
  assert.equal(
    requests.filter((request) => request.body.event === "registration_click")
      .length,
    8,
  );
  assert(
    requests.every((request) => request.origin === origin),
    "Todas as visitas e cliques devem vir da mesma origem local.",
  );
  assert(
    requests.every((request) => request.cookiePresent === false),
    "O navegador deve respeitar credentials: omit, sem enviar o cookie da fixture.",
  );
  assert(
    requests.every(
      (request) =>
        Object.keys(request.body).sort().join(",") === "event,screen",
    ),
  );
  console.log(
    "Cartaz e inscrições de campistas validados em computador e celular: botão na área indicada, texto legível, mouse/toque/teclado, falha de áudio sem bloquear a inscrição, nova aba sem opener, URL correta e visitas/cliques sem cookies ou banco real. Google Forms foi simulado, sem acesso externo.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
