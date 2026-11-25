import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import express from "express";
import { chromium, expect } from "@playwright/test";
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
const viewports = [
  [1366, 900, "LARGE"],
  [390, 844, "SMALL"],
  [320, 568, "SMALL"],
  [844, 390, "MEDIUM"],
  [1920, 1080, "LARGE"],
  [2560, 1080, "LARGE"],
  [1024, 768, "LARGE"],
];
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
  for (const [width, height, screen] of viewports) {
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
    const errors = [],
      assetRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => assetRequests.push(request.url()));
    const start = writes.length;
    await page.goto(origin, { waitUntil: "load" });
    await count(start + 1);
    assert.equal(writes[start].create.screen, screen);
    assert.equal(writes[start].create.pageViews, 1);
    const notice = page.getByRole("link", {
      name: "Quero me inscrever como campista",
      exact: true,
    });
    assert.equal(await notice.getAttribute("href"), registrationUrl);
    assert.equal(await notice.getAttribute("target"), "_blank");
    assert.equal(await notice.getAttribute("rel"), "noopener noreferrer");
    assert.equal(await notice.count(), 1);
    const musicControl = await page.locator("#music-toggle").boundingBox();
    assert(
      musicControl && musicControl.width >= 44 && musicControl.height >= 44,
    );
    assert(
      musicControl.y >= 0 && musicControl.x + musicControl.width <= width,
      "O controle de música deve permanecer inteiro na tela.",
    );
    const panorama = page.locator(".poster-panorama");
    assert.equal(await panorama.getAttribute("aria-hidden"), "true");
    assert.equal(
      await panorama.evaluate(
        (element) => getComputedStyle(element).pointerEvents,
      ),
      "none",
    );
    const showPanorama = width >= 1024 && width / height >= 4 / 3;
    assert.equal(await panorama.isVisible(), showPanorama);
    assert.equal(
      assetRequests.some((url) => url.endsWith("/fac-2027-panorama-v3.webp")),
      showPanorama,
      "O panorama deve ser baixado apenas nas telas grandes horizontais.",
    );
    const panoramaSides = await panorama.evaluate((element) =>
      ["::before", "::after"].map((pseudo) => {
        const style = getComputedStyle(element, pseudo);
        return {
          backgroundImage: style.backgroundImage,
          backgroundSize: style.backgroundSize,
        };
      }),
    );
    assert(
      panoramaSides.every((side) =>
        showPanorama
          ? side.backgroundImage.includes("/fac-2027-panorama-v3.webp") &&
            side.backgroundSize === "300% 100%"
          : side.backgroundImage === "none",
      ),
      "O fundo deve usar apenas os terços laterais seguros, sem repetir o centro da arte.",
    );
    const overlayMetrics = await notice.evaluate((button) => {
      const bounds = button.getBoundingClientRect(),
        style = getComputedStyle(button);
      const lines = [...button.querySelectorAll("span")].map((line) =>
        line.getBoundingClientRect().toJSON(),
      );
      return {
        lines,
        bounds: bounds.toJSON(),
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        font: style.font,
        lineHeight: style.lineHeight,
        clientWidth: button.clientWidth,
        clientHeight: button.clientHeight,
        scrollWidth: button.scrollWidth,
        scrollHeight: button.scrollHeight,
      };
    });
    writeFileSync(
      `.local/poster-viagem-button-metrics-${width}x${height}.json`,
      JSON.stringify(overlayMetrics, null, 2),
    );
    assert.equal(overlayMetrics.backgroundColor, "rgba(0, 0, 0, 0)");
    assert.equal(overlayMetrics.backgroundImage, "none");
    assert.equal(overlayMetrics.lines.length, 1);
    assert(
      overlayMetrics.lines.every((line) => line.width <= 2 && line.height <= 2),
      "O texto acessível não deve duplicar visualmente o botão impresso na arte.",
    );
    assert.equal((await notice.textContent()).trim(), "QUERO ME INSCREVER");
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const box = await notice.boundingBox();
    const poster = await page.locator(".poster").boundingBox();
    assert(box && poster);
    assert.equal(
      await page.locator(".poster").getAttribute("src"),
      "/fac-2027.jpg?v=viagem-20261125-v3",
    );
    if (showPanorama) {
      assert(Math.abs(poster.height - height) < 1);
      assert(Math.abs(poster.y) < 1);
      assert(Math.abs(poster.width / poster.height - 2 / 3) < 0.001);
      assert(Math.abs(poster.x + poster.width / 2 - width / 2) < 1);
      const backdrop = await panorama.boundingBox();
      assert(
        backdrop &&
          Math.abs(backdrop.width - width) < 1 &&
          Math.abs(backdrop.height - height) < 1,
      );
    }
    assert(Math.abs((box.x - poster.x) / poster.width - 0.203) < 0.005);
    assert(Math.abs((box.y - poster.y) / poster.height - 0.682) < 0.005);
    assert(Math.abs(box.width / poster.width - 0.594) < 0.005);
    assert(Math.abs(box.height / poster.height - 0.083) < 0.005);
    assert(box.x + box.width <= poster.x + poster.width);
    assert(box.y + box.height < poster.y + poster.height * 0.77);
    assert(
      await notice.evaluate((link) => {
        const touchArea = getComputedStyle(link, "::after");
        return Number.parseFloat(touchArea.height) >= 44;
      }),
      "A área de toque deve ter pelo menos 44 px sem ampliar o desenho do botão.",
    );
    await page.screenshot({
      path: `.local/screenshots/poster-viagem-${width}x${height}.png`,
      fullPage: true,
    });
    if (width === 1366) {
      const idleShadow = await notice.evaluate(
        (link) => getComputedStyle(link).boxShadow,
      );
      await notice.hover();
      await expect
        .poll(() => notice.evaluate((link) => getComputedStyle(link).boxShadow))
        .not.toBe(idleShadow);
      await page.waitForTimeout(250);
      await page.screenshot({
        path: ".local/screenshots/poster-viagem-hover-desktop.png",
        fullPage: true,
      });
      await page.mouse.move(0, 0);
      await page.keyboard.press("Tab");
      await expect(notice).toBeFocused();
      assert(await notice.evaluate((link) => link.matches(":focus-visible")));
      assert(
        await notice.evaluate(
          (link) => Number.parseFloat(getComputedStyle(link).outlineWidth) >= 2,
        ),
      );
      await expect
        .poll(() => notice.evaluate((link) => getComputedStyle(link).boxShadow))
        .not.toBe(idleShadow);
      await page.screenshot({
        path: ".local/screenshots/poster-viagem-focus-desktop.png",
        fullPage: true,
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert(
        await notice.evaluate((link) =>
          [link, "::before"].every((target) => {
            const style =
              typeof target === "string"
                ? getComputedStyle(link, target)
                : getComputedStyle(target);
            return [style.transitionDuration, style.animationDuration].every(
              (value) =>
                value
                  .split(",")
                  .every((duration) => Number.parseFloat(duration) === 0),
            );
          }),
        ),
        "O efeito deve respeitar a preferência por movimento reduzido.",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.keyboard.press("Tab");
    }
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
      path: `.local/screenshots/poster-viagem-audio-fallback-${width}x${height}.png`,
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
      name: "Quero me inscrever como campista",
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
  assert.equal(requests.length, viewports.length * 4);
  writeFileSync(
    ".local/poster-visits-requests.json",
    JSON.stringify(requests, null, 2),
  );
  assert.equal(
    requests.filter((request) => request.body.event === "view").length,
    viewports.length * 2,
  );
  assert.equal(
    requests.filter((request) => request.body.event === "registration_click")
      .length,
    viewports.length * 2,
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
    "Novo cartaz validado em sete larguras de computador e celular: panorama decorativo apenas em telas grandes horizontais e retrato original preservado; área clicável alinhada à arte, sem texto duplicado; brilho em hover/foco e movimento reduzido; mouse/toque/teclado, falha de áudio sem bloquear inscrição, nova aba sem opener, URL correta e visitas/cliques sem cookies ou banco real. Google Forms foi simulado, sem acesso externo.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
