import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import ExcelJS from "exceljs";
import { normalized } from "../apps/api/dist/modules/participant-imports/workbook.js";
import { camperTemplate } from "../apps/api/dist/modules/events/camper-template.js";
import { formSchema } from "../apps/api/dist/modules/events/events.validation.js";
import { validateSubmission } from "../apps/api/dist/modules/registrations/registrations.validation.js";

// Navegador de teste com React real; não cria inscrições nem envia mensagens reais.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5174";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Use a prévia local.");
const ids = [1, 2, 3, 4, 5, 6, 7].map(
  (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
);
const [orgId, userId, eventId, campaignId, draftId, registrationId, photoId] =
  ids;
const authHost = "auth.encontro.invalid",
  token = "t".repeat(43);
const user = {
  id: userId,
  email: "organizador@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  email_confirmed_at: new Date().toISOString(),
};
const now = Math.floor(Date.now() / 1000);
const jwt = [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
  Buffer.from(
    JSON.stringify({
      sub: userId,
      aud: "authenticated",
      exp: now + 3600,
      iat: now,
    }),
  ).toString("base64url"),
  "fixture",
].join(".");
const session = {
  access_token: jwt,
  refresh_token: "fixture",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: now + 3600,
  user,
};
const png = await sharp({
  create: { width: 400, height: 400, channels: 3, background: "#6553c7" },
})
  .png()
  .toBuffer();
const banner = await sharp({
  create: { width: 1600, height: 400, channels: 3, background: "#253251" },
})
  .png()
  .toBuffer();
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
const importWorkbook = new ExcelJS.Workbook();
const importSheet = importWorkbook.addWorksheet("Respostas");
importSheet.addRow([
  "Nome",
  "Nascimento",
  "Celular",
  "Cidade",
  "Sexo",
  "Camiseta",
  "Paróquia",
]);
importSheet.addRow([
  "Maria Teste",
  "2000-01-01",
  "123",
  "Loanda",
  "Feminino",
  "G",
  "Resposta reservada",
]);
const xlsx = Buffer.from(await importWorkbook.xlsx.writeBuffer());
try {
  for (const mobile of [false, true]) {
    const importId = "00000000-0000-4000-8000-000000000008";
    const rowId = "00000000-0000-4000-8000-000000000009";
    const previousId = "00000000-0000-4000-8000-000000000010";
    const importRow = {
      id: rowId,
      rowNumber: 2,
      values: {
        name: "Maria Teste",
        birthDate: "2000-01-01",
        phone: "123",
        city: "Loanda",
        sex: "Feminino",
        shirt: "G",
      },
      original: { headers: ["Paróquia"], cells: ["Resposta reservada"] },
      decision: "PENDING",
      reviewed: false,
      replaceId: null,
      pending: true,
      errors: ["Confira o celular com DDD."],
      warnings: [],
      duplicateRows: [],
      candidates: [],
    };
    const importBatch = {
      id: importId,
      fileName: "antigos.xlsx",
      sheet: "Respostas",
      state: "PREVIEW",
      page: 1,
      pageSize: 50,
      summary: { total: 1, selected: 0, pending: 1, discarded: 0 },
      rows: [importRow],
    };
    const organization = {
      id: orgId,
      name: "Comunidade do encontro",
      kind: "PARISH",
      city: "Loanda",
      state: "PR",
      active: true,
    };
    const campaign = {
      id: campaignId,
      kind: "CAMPER",
      opensAt: "2026-10-01T12:00:00Z",
      closesAt: "2027-05-31T21:00:00Z",
      capacity: 30,
      allowWaitlist: false,
      paused: false,
      open: true,
    };
    const event = {
      id: eventId,
      organizationId: orgId,
      name: "Encontro 2027 — Campistas",
      description: "Encontro de fé e comunidade",
      location: "Chácara do encontro",
      city: "Loanda",
      startsAt: "2027-06-01",
      endsAt: "2027-06-03",
      status: "DRAFT",
      type: { name: "FAC" },
      organization,
      teams: [],
      campaigns: [campaign],
    };
    const template = camperTemplate("FAC");
    let form = null,
      payload = {},
      health = {},
      submitted = false,
      submissions = 0;
    const failure = [];
    const options = {
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1366, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    };
    const adminContext = await browser.newContext(options);
    const visitorContext = await browser.newContext(options);
    await adminContext.addInitScript((value) => {
      if (["localhost", "127.0.0.1"].includes(location.hostname))
        localStorage.setItem("sb-auth-auth-token", JSON.stringify(value));
    }, session);
    async function fixtures(context) {
      context.on("page", (page) =>
        page.on("pageerror", (e) => failure.push(e.message)),
      );
      await context.route("**/*", async (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          path = url.pathname,
          method = req.method();
        const json = (body, status = 200, headers = {}) =>
          route.fulfill({ status, headers, json: body });
        if (path.startsWith("/storage-test/"))
          return route.fulfill({
            contentType: "image/png",
            body: path.endsWith("banner.png") ? banner : png,
          });
        if (url.hostname === authHost) {
          const headers = {
            "access-control-allow-origin": "*",
            "access-control-allow-headers":
              "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
            "access-control-allow-methods": "GET,POST,OPTIONS",
          };
          return method === "OPTIONS"
            ? route.fulfill({ status: 204, headers })
            : json(user, 200, headers);
        }
        if (path === "/api/v1/config")
          return json({
            supabaseUrl: `https://${authHost}`,
            supabaseAnonKey: "sb_publishable_test",
            eventsEnabled: false,
            eventManagementEnabled: true,
            volunteerRegistrationsEnabled: true,
            volunteerRegistrationsReady: true,
            camperRegistrationsEnabled: true,
            camperRegistrationsReady: true,
            registrationPrefillEnabled: true,
          });
        if (path === "/api/v1/me/access")
          return json({
            account: {
              id: userId,
              email: user.email,
              platformAdmin: false,
              profile: {},
            },
            organizations: [
              {
                id: "member",
                accountId: userId,
                organizationId: orgId,
                organization,
                role: "ORGANIZER",
                active: true,
                healthEventIds: [],
              },
            ],
          });
        if (
          path ===
          `/api/v1/organizations/${orgId}/events/${eventId}/camper-form`
        ) {
          if (method === "POST") {
            const multipart = req
              .headers()
              ["content-type"]?.startsWith("multipart/form-data");
            const config = formSchema.parse(
              multipart
                ? JSON.parse(
                    req
                      .postData()
                      .match(/name="data"\r\n\r\n([\s\S]*?)\r\n--/)[1],
                  )
                : req.postDataJSON(),
            );
            assert.equal(config.layout.kind, "CAMPER");
            assert(!config.volunteer);
            if (multipart)
              config.banner = {
                url: `${target}/storage-test/banner.png`,
                bucket: "test",
                key: "banner.webp",
                width: 1600,
                height: 400,
              };
            form = {
              id: "form-1",
              version: 1,
              publishedAt: new Date().toISOString(),
              config,
            };
            event.status = "PUBLISHED";
            return json({ form, campaignId, link: `/inscricao/${campaignId}` });
          }
          return json({
            event,
            campaign,
            form,
            template,
            departmentsReady: false,
            departments: [],
          });
        }
        if (
          path === `/api/v1/organizations/${orgId}/events/${eventId}/campaigns`
        ) {
          Object.assign(campaign, req.postDataJSON());
          return json(campaign);
        }
        if (
          path === `/api/v1/organizations/${orgId}/events` ||
          path === `/api/v1/organizations/${orgId}/event-setups`
        )
          return json([event]);
        if (path === `/api/v1/public/campaigns/${campaignId}`)
          return json({ ...campaign, event, form });
        if (path === `/api/v1/public/campaigns/${campaignId}/drafts`) {
          assert.equal(req.headers().authorization, undefined);
          return json(
            { id: draftId, token, expiresAt: campaign.closesAt },
            201,
          );
        }
        if (path === `/api/v1/public/drafts/${draftId}`) {
          assert.equal(req.headers()["x-draft-token"], token);
          if (method === "PUT") ({ payload, health } = req.postDataJSON());
          return json({
            id: draftId,
            campaignId,
            payload,
            health,
            form,
            submitted,
            registration: submitted
              ? {
                  id: registrationId,
                  protocol: "INS-CAMPISTA-TESTE",
                  status: "RECEIVED",
                }
              : null,
          });
        }
        const importBase = `/api/v1/organizations/${orgId}/participant-imports`;
        if (path.startsWith(importBase)) {
          assert.equal(req.headers().authorization, `Bearer ${jwt}`);
          if (path === importBase)
            return json({
              ready: true,
              prefillEnabled: false,
              batches: [
                {
                  id: importId,
                  fileName: "antigos.xlsx",
                  sheet: "Respostas",
                  state: importBatch.state,
                  _count: { rows: 1 },
                },
              ],
            });
          if (path.endsWith("/inspect"))
            return json({
              sheets: [
                {
                  name: "Respostas",
                  headers: [
                    "Nome",
                    "Nascimento",
                    "Celular",
                    "Cidade",
                    "Sexo",
                    "Camiseta",
                    "Paróquia",
                  ],
                  rowCount: 1,
                  mapping: {
                    name: 0,
                    birthDate: 1,
                    phone: 2,
                    city: 3,
                    sex: 4,
                    shirt: 5,
                  },
                },
              ],
            });
          if (path.endsWith("/preview")) {
            assert(req.postDataBuffer().toString().includes('"phone":2'));
            return json(importBatch);
          }
          if (path.endsWith(`/rows/${rowId}`)) {
            const body = req.postDataJSON();
            assert.deepEqual(normalized(body.values).errors, []);
            assert.equal(body.decision, "KEEP");
            importRow.values = body.values;
            importRow.pending = false;
            importRow.decision = "KEEP";
            importRow.errors = [];
            importBatch.summary.pending = 0;
            importBatch.summary.selected = 1;
            return json({ saved: true });
          }
          if (path.endsWith("/confirm")) {
            assert.equal(importBatch.summary.pending, 0);
            importBatch.state = "CONFIRMED";
            return json({ confirmed: true });
          }
          return json(importBatch);
        }
        if (
          path.startsWith(
            `/api/v1/organizations/${orgId}/previous-participants`,
          )
        ) {
          assert.equal(req.headers().authorization, `Bearer ${jwt}`);
          if (path.endsWith(previousId))
            return json({
              id: previousId,
              ...importRow.values,
              sourceRows: [
                {
                  rowNumber: 2,
                  original: importRow.original,
                  values: importRow.values,
                  batch: {
                    id: importId,
                    fileName: "antigos.xlsx",
                    sheet: "Respostas",
                    createdAt: new Date().toISOString(),
                  },
                },
              ],
            });
          return json({
            items:
              importBatch.state === "CONFIRMED"
                ? [{ id: previousId, ...importRow.values }]
                : [],
            total: importBatch.state === "CONFIRMED" ? 1 : 0,
          });
        }
        if (path === `/api/v1/public/drafts/${draftId}/prefill`) {
          assert.equal(req.headers()["x-draft-token"], token);
          return json({
            payload: { shirt: "M", answers: { cidade: "Loanda - PR" } },
          });
        }
        if (path === `/api/v1/public/drafts/${draftId}/photo`)
          return json(
            { id: photoId, url: `${target}/storage-test/photo.png` },
            201,
          );
        if (path === `/api/v1/public/drafts/${draftId}/photos/${photoId}`)
          return json({ url: `${target}/storage-test/photo.png` });
        if (path === `/api/v1/public/drafts/${draftId}/submit`) {
          validateSubmission(
            payload,
            health,
            form.config,
            new Date(event.startsAt),
            "CAMPER",
          );
          assert.equal(payload.answers.estado, "PR");
          assert.equal(payload.answers.aceite_orientacoes, true);
          assert.equal(payload.answers.observacoes, undefined);
          assert.equal(health.hasAllergies, true);
          assert.equal(health.allergies, "Amendoim");
          assert.equal(payload.imageAuthorized ?? false, false);
          submitted = true;
          submissions++;
          return json({
            id: registrationId,
            protocol: "INS-CAMPISTA-TESTE",
            status: "RECEIVED",
            guardian: mobile
              ? {
                  id: "guardian",
                  signedAt: null,
                  expiresAt: campaign.closesAt,
                  emailStatus: "SEM_CONFIGURACAO",
                  email: "responsavel@example.test",
                  link: `${target}/autorizacao/guardian#token=${token}`,
                  whatsappLink: "https://wa.me/5544999998888?text=autorizacao",
                }
              : null,
          });
        }
        if (path === "/api/v1/public/parishes") return json([]);
        if (path.startsWith("/api/v1/")) {
          failure.push(`API inesperada: ${path}`);
          return json({}, 404);
        }
        if (url.hostname === "fonts.googleapis.com")
          return route.fulfill({ contentType: "text/css", body: "" });
        if (url.origin === new URL(target).origin) return route.continue();
        return route.abort();
      });
    }
    await fixtures(adminContext);
    await fixtures(visitorContext);
    const admin = await adminContext.newPage();
    await admin.goto(
      `${target}/organizacao/${orgId}/eventos/${eventId}/ficha-campistas`,
    );
    await admin
      .getByRole("heading", { name: "Organizar campos da ficha" })
      .waitFor();
    await admin
      .getByLabel("Banner da ficha (opcional)", { exact: false })
      .setInputFiles({
        name: "banner.png",
        mimeType: "image/png",
        buffer: banner,
      });
    await admin
      .getByRole("textbox", { name: /^Descrição/ })
      .fill("Viva uma experiência de fé e comunidade neste encontro.");
    await admin
      .getByRole("button", {
        name: "Ocultar Há alguma observação que deseja comunicar à organização?",
        exact: true,
      })
      .click();
    const cityRow = admin.locator('[data-field-key="question:cidade"]');
    await cityRow.getByRole("button", { name: /Mover .* para cima/ }).click();
    await admin.getByRole("button", { name: "Visualizar campos" }).click();
    await admin
      .getByRole("heading", { name: "Campos da ficha", exact: true })
      .waitFor();
    await admin
      .getByRole("button", { name: "Publicar ficha de campistas" })
      .click();
    await admin
      .getByLabel("Link da ficha de campistas", { exact: true })
      .waitFor();
    assert.equal(
      await admin
        .getByText("Departamentos para preferência", { exact: true })
        .count(),
      0,
    );
    await admin.screenshot({
      path: `.local/screenshots/camper-${mobile ? "mobile" : "desktop"}-setup.png`,
      fullPage: true,
    });
    await admin.goto(`${target}/organizacao/${orgId}/cadastros-anteriores`);
    await admin
      .getByLabel("Arquivo Excel", { exact: false })
      .setInputFiles({
        name: "antigos.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: xlsx,
      });
    await admin.getByRole("button", { name: "Ler planilha" }).click();
    await admin.getByLabel("Aba da planilha").waitFor();
    await admin.getByRole("button", { name: "Preparar prévia" }).click();
    assert(
      await admin
        .getByRole("button", { name: "Confirmar importação" })
        .isDisabled(),
    );
    await admin.getByRole("button", { name: "Revisar linha 2" }).click();
    const editor = admin.getByRole("region", { name: "Revisar linha 2" });
    await editor.getByLabel("Celular", { exact: true }).fill("44999999999");
    await editor.getByLabel("Decisão para esta linha").selectOption("KEEP");
    await editor.getByRole("button", { name: "Salvar revisão" }).click();
    await admin.getByText("Revisão salva.", { exact: true }).waitFor();
    await admin.getByRole("button", { name: "Confirmar importação" }).click();
    await admin.getByText(/Lote confirmado/).waitFor();
    await admin.getByRole("button", { name: "Consultar Maria Teste" }).click();
    await admin.getByText("Resposta reservada", { exact: true }).waitFor();
    await admin.screenshot({
      path: `.local/screenshots/import-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    assert(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
    );
    const visitor = await visitorContext.newPage();
    await visitor.goto(`${target}/inscricao/${campaignId}`);
    await visitor
      .getByRole("heading", { name: "Regras para participar" })
      .waitFor();
    await visitor.screenshot({
      path: `.local/screenshots/camper-${mobile ? "mobile" : "desktop"}-intro.png`,
      fullPage: true,
    });
    await visitor.getByRole("button", { name: "Começar inscrição" }).click();
    const continuing = () =>
      visitor.getByRole("button", { name: "Continuar", exact: true }).click();
    await visitor
      .getByLabel("Nome completo", { exact: false })
      .fill("Campista de demonstração");
    await visitor
      .getByLabel("Telefone / WhatsApp", { exact: false })
      .fill("44999999999");
    await visitor
      .getByLabel("Data de nascimento", { exact: false })
      .fill(mobile ? "2012-01-01" : "1990-01-01");
    await visitor
      .getByText("Dados anteriores preenchidos. Confira antes de continuar.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await visitor
        .getByRole("combobox", { name: "Cidade onde mora", exact: true })
        .inputValue(),
      "Loanda - PR",
    );
    await visitor
      .getByRole("combobox", { name: "Cidade onde mora", exact: true })
      .fill("Loanda");
    await visitor
      .getByRole("option", { name: "Loanda - PR", exact: true })
      .click();
    await visitor
      .getByLabel("Estado onde mora", { exact: false })
      .selectOption("PR");
    await continuing();
    await visitor
      .getByLabel("Arquivo da foto de identificação")
      .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png });
    await visitor.getByRole("button", { name: "Usar esta foto" }).click();
    await continuing();
    await visitor
      .getByLabel("Endereço (opcional)", { exact: true })
      .fill("Rua do encontro, 100");
    await visitor
      .getByLabel("Tamanho da camiseta", { exact: false })
      .selectOption("M");
    await visitor
      .getByLabel(/Já participou de acampamentos/)
      .selectOption("false");
    await visitor
      .getByLabel(/O que espera viver/)
      .fill("Viver uma experiência de fé e amizade.");
    await visitor
      .getByLabel(/Como pretende chegar/)
      .fill("Carona com familiares");
    await visitor
      .getByLabel(/Precisa de informações sobre transporte/)
      .selectOption("false");
    assert.equal(await visitor.getByLabel(/Há alguma observação/).count(), 0);
    await continuing();
    await visitor
      .getByLabel("Nome do contato de emergência", { exact: false })
      .fill("Contato da família");
    await visitor
      .getByLabel("Telefone do contato de emergência com DDD", { exact: false })
      .fill("44999997777");
    await visitor
      .getByLabel("Telefone alternativo de emergência (opcional)", {
        exact: true,
      })
      .fill("44988886666");
    await visitor.getByLabel(/Parentesco \/ relação/).selectOption("Mãe");
    for (const name of [
      "Usa medicamentos regularmente?",
      "Possui restrição alimentar?",
      "Há uma condição de saúde que precisamos conhecer?",
      "Precisa de algum apoio ou adaptação?",
    ])
      await visitor.getByLabel(name, { exact: false }).selectOption("false");
    await visitor
      .getByLabel("Possui alguma alergia?", { exact: false })
      .selectOption("true");
    await visitor.getByLabel("Descreva", { exact: false }).fill("Amendoim");
    if (mobile) {
      await visitor
        .getByLabel("Nome do responsável", { exact: false })
        .fill("Responsável de demonstração");
      await visitor
        .getByLabel("Telefone do responsável", { exact: false })
        .fill("44999998888");
      await visitor
        .getByLabel("E-mail do responsável (opcional)", { exact: true })
        .fill("responsavel@example.test");
      await visitor
        .getByRole("combobox", { name: /Parentesco do responsável/ })
        .selectOption("Mãe");
      assert.equal(
        await visitor.getByRole("checkbox", { name: /Autorizo o uso/ }).count(),
        0,
      );
    }
    await continuing();
    await visitor.reload();
    await visitor.getByRole("button", { name: "Continuar inscrição" }).click();
    assert.equal(
      await visitor.getByLabel("Nome completo", { exact: false }).inputValue(),
      "Campista de demonstração",
    );
    for (let i = 0; i < 4; i++) await continuing();
    await visitor.getByRole("heading", { name: "Está tudo certo?" }).waitFor();
    await visitor
      .getByRole("checkbox", { name: /Conferi minhas informações/ })
      .check();
    await visitor
      .getByRole("checkbox", { name: /Li e aceito os termos/ })
      .check();
    await visitor.screenshot({
      path: `.local/screenshots/camper-${mobile ? "mobile" : "desktop"}-review.png`,
      fullPage: true,
    });
    await visitor.getByRole("button", { name: "Enviar inscrição" }).click();
    await visitor
      .getByRole("heading", { name: "Recebemos sua inscrição!" })
      .waitFor();
    assert.equal(submissions, 1);
    if (mobile)
      await visitor
        .getByRole("link", { name: "Enviar ao responsável pelo WhatsApp" })
        .waitFor();
    assert.equal(
      await visitor.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await visitor.screenshot({
      path: `.local/screenshots/camper-${mobile ? "mobile" : "desktop"}-received.png`,
      fullPage: true,
    });
    assert.deepEqual(failure, []);
    await adminContext.close();
    await visitorContext.close();
  }
  console.info(
    "Desktop e celular verificados: importação, revisão, consulta privada, autopreenchimento, ficha de campistas, foto, saúde, rascunho e responsável.",
  );
} finally {
  await browser.close();
}
