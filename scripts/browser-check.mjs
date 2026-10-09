import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5174";
if (!["127.0.0.1", "localhost"].includes(new URL(target).hostname))
  throw new Error("A revisão visual deve usar somente a aplicação local.");
const directory = resolve(".local/screenshots");
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32"
    ? {
        executablePath:
          process.env.CHROME_PATH ??
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
      }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(target, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Eventos abertos/ }).waitFor();
  await page.getByRole("heading", { name: /2º Acampamento FAC/ }).waitFor();
  const desktopOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (desktopOverflow)
    throw new Error("A página ultrapassa a largura no desktop.");
  await page.screenshot({
    path: resolve(directory, "eventos-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "Buscar evento ou paróquia" })
    .fill("Mariano");
  await page.getByRole("heading", { name: /Acampamento Mariano/ }).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".event-card").length === 1,
  );
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".event-card").length === 6,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(directory, "eventos-celular.png"),
    fullPage: true,
  });
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
  )
    throw new Error("A página ultrapassa a largura no celular.");
  const link = page.getByRole("link", { name: /Participar do evento/ }).first();
  await link.click();
  await page.getByRole("button", { name: "Começar inscrição" }).click();
  await page.getByLabel("Nome completo").fill("Pessoa de teste visual");
  await page.getByLabel("Telefone / WhatsApp com DDD").fill("44999998888");
  await page.getByLabel("Data de nascimento").fill("1990-01-01");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page
    .getByRole("heading", { name: "Uma foto para reconhecer você" })
    .waitFor();
  await page.screenshot({
    path: resolve(directory, "inscricao-celular.png"),
    fullPage: true,
  });
  const saved = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith("fac:draft:"))
      .map(([, value]) => JSON.parse(value)),
  );
  if (
    saved.some((value) =>
      Object.keys(value).some(
        (key) => !["id", "token", "expiresAt"].includes(key),
      ),
    )
  )
    throw new Error("O navegador guardou informações além da credencial.");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Nome completo").waitFor();
  if (
    (await page.getByLabel("Nome completo").inputValue()) !==
    "Pessoa de teste visual"
  )
    throw new Error("O rascunho não foi retomado.");
  if (errors.length)
    throw new Error(`Falhas da interface: ${errors.join(", ")}`);
  console.info(
    "Revisão visual concluída: desktop, celular, filtros, início da inscrição e retomada sem dados pessoais no armazenamento local.",
  );
} finally {
  await context.close();
  await browser.close();
}
