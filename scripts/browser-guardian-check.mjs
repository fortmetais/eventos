import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { GuardianService } from "../apps/api/dist/modules/registrations/guardian.service.js";
import { guardianSignSchema } from "../apps/api/dist/modules/registrations/guardian.validation.js";

// React real e validação real, com API/SMTP substituídos somente no teste.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5174";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Use a prévia local.");
let prepared;
const organization = {
  name: "Comunidade do encontro",
  contact: "Secretaria da comunidade",
  city: "Toledo",
  state: "PR",
  cnpj: "11444777000161",
  legalName: "Associação Comunidade do Encontro",
  tradeName: "Comunidade do Encontro",
  postalCode: "85900100",
  street: "Rua Nossa Senhora Aparecida",
  number: "123",
  complement: "Salão paroquial",
  neighborhood: "Centro",
};
const legalHeader = [
  "ORGANIZAÇÃO RESPONSÁVEL",
  "Nome: Comunidade do encontro",
  "Razão social: Associação Comunidade do Encontro",
  "Nome fantasia: Comunidade do Encontro",
  "CNPJ: 11.444.777/0001-61",
  "Endereço: Rua Nossa Senhora Aparecida, 123, Salão paroquial, Centro, Toledo - PR",
  "CEP: 85900-100",
  "Contato: Secretaria da comunidade",
].join("\n");
await new GuardianService(null, null, "t".repeat(32), target).prepare(
  {
    guardianAuthorization: {
      async create({ data }) {
        prepared = data;
      },
    },
  },
  "00000000-0000-4000-8000-000000000002",
  {
    name: "Participante de demonstração",
    birthDate: "2012-01-01",
    phone: "44999999999",
    emergencyName: "Contato familiar",
    emergencyPhone: "44999997777",
    guardianName: "Maria de demonstração",
    guardianPhone: "44999998888",
    guardianRelationship: "Mãe",
    guardianEmail: "",
    answers: { cidade: "Toledo" },
  },
  {
    name: "Encontro 2027",
    location: "Chácara do encontro",
    city: "Toledo",
    startsAt: new Date("2027-06-01"),
    endsAt: new Date("2027-06-03"),
    organization,
  },
  "VOLUNTEER",
  "Respeite os horários e as orientações da equipe. A participação depende da análise da organização.",
  { hasMedication: false, medication: "", hasAllergies: false, allergies: "" },
);
assert.deepEqual(prepared.snapshot.event.organizationDetails, organization);
assert(prepared.termsText.includes(legalHeader));
const originalTermsText = prepared.termsText;
async function assertLegalHeader(page) {
  const terms = page.locator(".terms-text");
  await terms.waitFor();
  assert.equal(await terms.count(), 1);
  const text = await terms.textContent();
  assert.equal(text, originalTermsText);
  assert(text.includes(legalHeader));
  assert(text.indexOf(legalHeader) < text.indexOf("Autorizo o(a) menor"));
}
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
mkdirSync(".local/screenshots", { recursive: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1366, height: 1000 },
      hasTouch: mobile,
      isMobile: mobile,
    });
    const page = await context.newPage();
    const failures = [];
    page.on("pageerror", (e) => failures.push(e.message));
    let record = {
      id: prepared.id,
      protocol: "INS-DEMONSTRACAO",
      snapshot: {
        ...prepared.snapshot,
        participantCpf: mobile ? "11144477735" : "",
        familyPhone: "5544999997777",
      },
      termsText: prepared.termsText,
      signedAt: null,
      expiresAt: prepared.expiresAt,
      signedData: null,
      signature: null,
      receiptHash: null,
      health: prepared.health.create.data,
    };
    let signCount = 0;
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/config"))
        return route.fulfill({
          json: {
            supabaseUrl: null,
            supabaseAnonKey: null,
            eventsEnabled: true,
          },
        });
      if (path.endsWith("/view")) return route.fulfill({ json: record });
      if (path.endsWith("/sign")) {
        const body = route.request().postDataJSON();
        assert.equal(body.token, "t".repeat(43));
        assert.equal(body.data.familyPhone, "(44) 98888-7777");
        assert.equal(body.data.phone, "(44) 98777-6666");
        assert.equal(body.data.cpf, "529.982.247-25");
        assert.equal(
          body.data.participantCpf,
          mobile ? "111.444.777-35" : "",
        );
        assert.equal(body.data.city, "Toledo - PR");
        assert.equal(
          body.data.relationship,
          mobile ? "Responsável com guarda judicial" : "Tutor(a) legal",
        );
        const data = guardianSignSchema.parse(body.data);
        const {
          signature,
          hasMedication,
          medication,
          hasAllergies,
          allergies,
          ...signedData
        } = data;
        assert.equal(signedData.imageAuthorized, false);
        record = {
          ...record,
          signedAt: new Date().toISOString(),
          // A API pode retornar documentos e telefones sem pontuação.
          signedData: {
            ...signedData,
            cpf: signedData.cpf.replace(/\D/g, ""),
            participantCpf: signedData.participantCpf?.replace(/\D/g, ""),
          },
          signature,
          receiptHash: "a".repeat(64),
          health: { hasMedication, medication, hasAllergies, allergies },
        };
        signCount++;
        return route.fulfill({ json: record });
      }
      return route.fulfill({
        status: 404,
        json: { error: { message: "Rota inesperada do teste" } },
      });
    });
    await page.goto(
      `${target}/autorizacao/${prepared.id}#token=${"t".repeat(43)}`,
    );
    await page
      .getByRole("heading", { name: "Autorização do responsável" })
      .waitFor();
    await assertLegalHeader(page);
    assert.equal(signCount, 0);
    assert.equal(await page.evaluate(() => location.hash), "");
    const participantCpf = page.getByLabel("CPF do participante (opcional)");
    assert.equal(
      await participantCpf.inputValue(),
      mobile ? "111.444.777-35" : "",
    );
    await participantCpf.fill("");
    assert.equal(await participantCpf.inputValue(), "");
    if (mobile) {
      await participantCpf.fill("11144477735");
      assert.equal(await participantCpf.inputValue(), "111.444.777-35");
    }
    const familyPhone = page.getByLabel("Celular do contato com DDD");
    const guardianPhone = page.getByLabel("Celular do responsável com DDD");
    assert.equal(await familyPhone.inputValue(), "(44) 99999-7777");
    assert.equal(await guardianPhone.inputValue(), "(44) 99999-8888");
    await familyPhone.fill("5544988887777");
    await guardianPhone.fill("44987776666");
    assert.equal(await familyPhone.inputValue(), "(44) 98888-7777");
    assert.equal(await guardianPhone.inputValue(), "(44) 98777-6666");
    await page.getByLabel("CPF do responsável").fill("52998224725");
    assert.equal(
      await page.getByLabel("CPF do responsável").inputValue(),
      "529.982.247-25",
    );
    const relationship = page.getByLabel("Parentesco / vínculo legal");
    assert.equal(await relationship.getAttribute("name"), "relationship");
    assert.deepEqual(await relationship.locator("option").allTextContents(), [
      "Selecione",
      "Pai",
      "Mãe",
      "Tutor(a) legal",
      "Responsável com guarda judicial",
    ]);
    assert.equal(await relationship.inputValue(), "Mãe");
    await relationship.selectOption(
      mobile ? "Responsável com guarda judicial" : "Tutor(a) legal",
    );
    const signatureCity = page.getByRole("combobox", {
      name: "Cidade da assinatura",
    });
    await signatureCity.fill("Toledo");
    const cityOption = page.getByRole("option", {
      name: "Toledo - PR",
      exact: true,
    });
    await cityOption.waitFor();
    if (mobile) {
      await cityOption.tap();
    } else {
      // Toledo também existe em MG; selecione a sugestão do Paraná pelo teclado.
      const cityList = page.getByRole("listbox", {
        name: "Cidades brasileiras",
      });
      for (let index = 0; index < 20; index++) {
        await signatureCity.press("ArrowDown");
        if (
          (await cityList
            .getByRole("option", { selected: true })
            .textContent()) === "Toledo - PR"
        )
          break;
      }
      await signatureCity.press("Enter");
    }
    assert.equal(await signatureCity.inputValue(), "Toledo - PR");
    await page.getByLabel(/Declaro ser responsável legal/).check();
    await page.getByLabel(/Li o termo de responsabilidade/).check();
    await page.getByLabel(/Concordo com o tratamento/).check();
    await page
      .getByRole("button", { name: "Assinar e enviar autorização" })
      .click();
    await page.getByText("Desenhe sua assinatura antes de enviar.").waitFor();
    assert.equal(signCount, 0);
    const pad = page.getByRole("img", {
      name: "Área para desenhar a assinatura",
    });
    await pad.scrollIntoViewIfNeeded();
    const rect = await pad.boundingBox();
    assert(rect);
    const points = [
      [0.12, 0.55],
      [0.2, 0.25],
      [0.28, 0.7],
      [0.37, 0.35],
      [0.48, 0.6],
      [0.59, 0.32],
      [0.7, 0.5],
      [0.86, 0.3],
    ].map(([x, y]) => ({
      x: rect.x + x * rect.width,
      y: rect.y + y * rect.height,
    }));
    if (mobile) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [points[0]],
      });
      for (const point of points.slice(1))
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [point],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
      for (const point of points.slice(1))
        await page.mouse.move(point.x, point.y, { steps: 5 });
      await page.mouse.up();
    }
    assert.equal(await pad.locator("polyline").count(), 1);
    await page.screenshot({
      path: `.local/screenshots/guardian-${mobile ? "mobile" : "desktop"}-signature.png`,
    });
    await page.getByRole("button", { name: "Limpar assinatura" }).click();
    assert.equal(await pad.locator("polyline").count(), 0);
    // Segunda assinatura prova que limpar não impede um novo preenchimento.
    await pad.scrollIntoViewIfNeeded();
    const box = await pad.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, {
      steps: 15,
    });
    await page.mouse.up();
    await page
      .getByRole("button", { name: "Assinar e enviar autorização" })
      .click();
    await page.getByText(/Termo assinado em/).waitFor();
    assert.equal(signCount, 1);
    await assertLegalHeader(page);
    await page.getByText("529.982.247-25", { exact: true }).waitFor();
    await page.getByText("(44) 98888-7777", { exact: true }).waitFor();
    await page.getByText("(44) 98777-6666", { exact: true }).waitFor();
    await page
      .getByText(mobile ? "111.444.777-35" : "Não informado", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Assinar e enviar autorização" })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("img", { name: "Assinatura do responsável" })
        .count(),
      1,
    );
    await page.reload();
    await page.getByText(/Termo assinado em/).waitFor();
    assert.equal(signCount, 1);
    await assertLegalHeader(page);
    await page.getByText("529.982.247-25", { exact: true }).waitFor();
    await page
      .getByText(mobile ? "111.444.777-35" : "Não informado", { exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.screenshot({
      path: `.local/screenshots/guardian-${mobile ? "mobile" : "desktop"}-receipt.png`,
      fullPage: true,
    });
    assert.deepEqual(failures, []);
    await context.close();
  }
  console.info(
    "Autorização verificada em desktop e celular: identificação legal da organização no termo e comprovante preservada após assinatura e retomada, máscaras de telefone/CPF, CPF opcional, cidade por teclado/toque, parentesco, assinatura, aceites e envio sem duplicação.",
  );
} finally {
  await browser.close();
}
