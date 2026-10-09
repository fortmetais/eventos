import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5174";
if (!["127.0.0.1", "localhost"].includes(new URL(target).hostname))
  throw new Error("Use somente a aplicação local.");
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  const readiness = await page.request.get(`${target}/api/v1/readiness`);
  if (!readiness.ok()) throw new Error("A API não está pronta.");
  if ((await readiness.json()).eventsEnabled !== false)
    throw new Error("Esta verificação exige a etapa administrativa.");
  await page.goto(target, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Bem-vindo ao Encontro." }).waitFor();
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Página ultrapassa a largura no desktop.");
  await page.screenshot({
    path: resolve(directory, "administracao-inicio.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Página ultrapassa a largura no celular.");
  await page.screenshot({
    path: resolve(directory, "administracao-celular.png"),
    fullPage: true,
  });
  await page.goto(`${target}/admin`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Vamos caminhar juntos" }).waitFor();
  if (!page.url().includes("/entrar"))
    throw new Error("Área administrativa não redirecionou ao login.");
  await page.getByRole("textbox", { name: "Seu e-mail" }).waitFor();
  await page.screenshot({
    path: resolve(directory, "login-inicial-celular.png"),
    fullPage: true,
  });
  if (errors.length)
    throw new Error(`Falhas no navegador: ${errors.join("; ")}`);
  console.log(
    "Etapa administrativa conferida no desktop/celular, com API pronta e login protegido. Nenhum cadastro ou e-mail foi enviado.",
  );
} finally {
  await browser.close();
}
