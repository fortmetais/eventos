import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await newContext(...args);
    context.on("page", (page) => {
      const screenshot = page.screenshot.bind(page);
      page.screenshot = async (options = {}) => {
        const result = await screenshot(options);
        const match = String(options.path ?? "").match(/event-messages-layout-(mobile|desktop)\.png$/);
        if (!match) return result;
        const editor = page.getByRole("textbox", { name: /Texto da mensagem/ });
        const select = page.getByRole("combobox", { name: "Evento", exact: true });
        const original = await editor.inputValue(), eventId = await select.inputValue();
        const originalViewport = page.viewportSize();
        const openOrganizationMenu = async () => {
          const button = page.getByRole("button", { name: "Menu da organização", exact: true });
          if (await button.isVisible() && await button.getAttribute("aria-expanded") !== "true") await button.click();
        };
        // Create a real SPA history entry while clean, without changing to an unrelated module.
        await openOrganizationMenu();
        await page.getByRole("link", { name: "Mensagens", exact: true }).click();
        await expect(select).toHaveValue("");
        await select.selectOption(eventId);
        await expect(editor).toHaveValue(original);
        const currentUrl = page.url(), draft = original + "\nRASCUNHO LOCAL PARA TESTE";
        await editor.fill(draft);
        await select.selectOption("");
        let dialog = page.getByRole("dialog", { name: "Alterações não salvas", exact: true });
        await expect(dialog).toBeVisible();
        await screenshot({ path: `.local/screenshots/ui-ux-unsaved-message-${match[1]}.png`, fullPage: false });
        await dialog.getByRole("button", { name: "Continuar editando", exact: true }).click();
        await expect(editor).toHaveValue(draft);
        await expect(select).toHaveValue(eventId);
        // A native browser back must restore URL and preserve the unsaved editor.
        await page.evaluate(() => history.back());
        dialog = page.getByRole("dialog", { name: "Alterações não salvas", exact: true });
        await expect(dialog).toBeVisible();
        await page.waitForURL(currentUrl);
        await dialog.getByRole("button", { name: "Continuar editando", exact: true }).click();
        await expect(editor).toHaveValue(draft);
        assert.equal(page.url(), currentUrl);
        // A menu navigation must be blocked before changing modules.
        await openOrganizationMenu();
        await page.getByRole("link", { name: "Visão geral", exact: true }).click();
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Continuar editando", exact: true }).click();
        await expect(editor).toHaveValue(draft);
        assert.equal(page.url(), currentUrl);
        await select.selectOption("");
        await dialog.getByRole("button", { name: "Descartar alterações", exact: true }).click();
        await expect(editor).toHaveCount(0);
        await select.selectOption(eventId);
        await expect(editor).toHaveValue(original);
        for (const width of [320, 360, 390, 430, 768, 1280, 1536]) {
          await page.setViewportSize({ width, height: 900 });
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          if (width <= 850) {
            const toggle = page.locator(".site-menu-toggle");
            await expect(page.getByRole("button", { name: "Abrir menu principal", exact: true })).toBeVisible();
            await toggle.click();
            await expect(toggle).toHaveAttribute("aria-expanded", "true");
            await page.keyboard.press("Escape");
            await expect(toggle).toHaveAttribute("aria-expanded", "false");
            await expect(toggle).toBeFocused();
          }
        }
        if (originalViewport) await page.setViewportSize(originalViewport);
        await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
        console.log(JSON.stringify({ probe: "ui-ux-unsaved-and-navigation", device: match[1], eventSelection: "passed", nativeBack: "passed", menuNavigation: "passed", responsiveWidths: [320, 360, 390, 430, 768, 1280, 1536], keyboard: "passed" }));
        return result;
      };
    });
    return context;
  };
  return browser;
};
await import(pathToFileURL(resolve("scripts/browser-event-messages-check.mjs")).href + "?ui-ux-behavior");
