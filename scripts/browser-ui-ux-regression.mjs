import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, webkit } from "@playwright/test";

const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5195";
assert(["localhost", "127.0.0.1"].includes(new URL(target).hostname), "Use somente a prévia local.");
const engine = process.env.UI_UX_ENGINE ?? "chromium";
assert(["chromium", "webkit"].includes(engine));
const output = resolve(process.env.UI_UX_OUTPUT ?? `.local/ui-ux-${engine}`);
const scriptRoot = resolve(process.env.UI_UX_SUITE_ROOT ?? ".");
const requested = process.argv.slice(2);
const suites = requested.length ? requested : [
  "browser-event-dashboard-check.mjs", "browser-event-setups-check.mjs",
  "browser-password-access-check.mjs", "browser-event-messages-check.mjs",
  "browser-event-import-check.mjs", "browser-review-registrations-check.mjs",
  "browser-registration-corrections-check.mjs", "browser-guardian-check.mjs",
  "browser-volunteer-check.mjs", "browser-invitation-check.mjs",
  "browser-invitation-links-check.mjs",
];
for (const suite of suites) assert(/^browser-[a-z-]+-check\.mjs$/.test(suite));
mkdirSync(join(output, "screenshots"), { recursive: true });
mkdirSync(join(output, "protected"), { recursive: true });
process.env.PREVIEW_URL = target;
const captures = [], results = [];
let currentSuite = "";
const originalLaunch = chromium.launch.bind(chromium);
chromium.launch = async (options = {}) => {
  const browser = engine === "webkit"
    ? await webkit.launch({ headless: options.headless ?? true })
    : await originalLaunch(options);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await newContext(...args);
    context.on("page", (page) => {
      const shot = page.screenshot.bind(page);
      page.screenshot = async (options = {}) => {
        const file = basename(String(options.path ?? `capture-${captures.length}.png`));
        const path = join(output, "screenshots", file);
        const captured = await shot({ ...options, path });
        const metrics = await page.evaluate(() => ({
          viewport: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          standardScope: Boolean(document.querySelector("main.ui-standard")),
          protectedScope: Boolean(document.querySelector(".registrations-workspace")) &&
            !document.querySelector("main")?.classList.contains("ui-standard"),
        }));
        captures.push({ suite: currentSuite, engine, file, path, ...metrics });
        if (/^evento-formulario-(desktop|celular)\.png$/.test(file)) {
          const focused = await page.evaluateHandle(() => document.activeElement);
          await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
          const neutralFile = "neutral-" + file;
          await shot({ ...options, path: join(output, "screenshots", neutralFile) });
          captures.push({ suite: currentSuite, engine, file: neutralFile, path: join(output, "screenshots", neutralFile), neutralFocus: true, ...metrics });
          await focused.evaluate((element) => { if (element instanceof HTMLElement && element.isConnected) element.focus({ preventScroll: true }); });
          await focused.dispose();
        }
        if (/^review-(registrations-|desktop-cards-)/.test(file)) {
          const panel = page.locator("#review-registrations-panel");
          if (await panel.count()) {
            await panel.screenshot({ path: join(output, "protected", file), animations: "disabled", style: ".skip-link { visibility: hidden !important; }" });
            const contract = await panel.evaluate((element) => ({
              text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
              controls: Array.from(element.querySelectorAll("button,select,input,a")).map((control) => ({
                tag: control.tagName,
                name: control.getAttribute("aria-label") ?? (control.textContent ?? "").replace(/\s+/g, " ").trim(),
                disabled: control.hasAttribute("disabled"),
                ariaDisabled: control.getAttribute("aria-disabled"),
                value: control instanceof HTMLSelectElement || control instanceof HTMLInputElement ? control.value : null,
                options: control instanceof HTMLSelectElement ? Array.from(control.options).map((option) => ({ value: option.value, label: option.text })) : null,
              })),
            }));
            writeFileSync(join(output, "protected", file.replace(/\.png$/, ".json")), JSON.stringify(contract, null, 2));
          }
        }
        return captured;
      };
    });
    return context;
  };
  return browser;
};
try {
  for (const suite of suites) {
    currentSuite = suite;
    const started = Date.now();
    try {
      await import(pathToFileURL(join(scriptRoot, "scripts", suite)).href);
      results.push({ suite, status: "passed", durationMs: Date.now() - started });
    } catch (error) {
      results.push({ suite, status: "failed", durationMs: Date.now() - started, error: String(error?.stack ?? error) });
      console.error(`FALHA ${suite}: ${String(error).split("\n")[0]}`);
    }
    writeFileSync(join(output, "results.json"), JSON.stringify({ target, engine, results, captures }, null, 2));
  }
} finally {
  writeFileSync(join(output, "results.json"), JSON.stringify({ target, engine, results, captures }, null, 2));
}
console.log(JSON.stringify({ output, engine, passed: results.filter((r) => r.status === "passed").length, failed: results.filter((r) => r.status === "failed").length, screenshots: captures.length }));
if (results.some((r) => r.status === "failed")) process.exitCode = 1;
