import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

// React real, API e autenticação simuladas. Não usa dados ou serviços de produção.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5174";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Use a prévia local.");
const orgId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const campaignId = "00000000-0000-4000-8000-000000000003";
const formId = "00000000-0000-4000-8000-000000000004";
const batchId = "00000000-0000-4000-8000-000000000005";
const userId = "00000000-0000-4000-8000-000000000006";
const authHost = "auth.encontro.invalid";
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
const session = {
  access_token: [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        aud: "authenticated",
        exp: now + 3600,
        iat: now,
      }),
    ).toString("base64url"),
    "fixture",
  ].join("."),
  refresh_token: "fixture-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: now + 3600,
  user,
};
const organization = {
  id: orgId,
  name: "Paróquia dos testes",
  city: "Loanda",
  state: "PR",
  kind: "PARISH",
  active: true,
};
const headers = [
  "Carimbo de data/hora",
  "Nome completo",
  "Sexo",
  "Celular",
  "Idade",
  "Data de nascimento",
  "Cidade",
  "Já fez ou serviu no FAC?",
  "Acampamento e edição",
  "Formação na saúde",
  "Cônjuge inscrito",
  "Paróquia",
  "Sacramentos",
  "Equipes desejadas",
  "Camiseta",
  "Instagram",
  "Formação para equipe",
  "Confirmação da inscrição",
];
const targets = [
  "metadata:submittedAt",
  "name",
  "question:sexo",
  "phone",
  "metadata:age",
  "birthDate",
  "question:cidade",
  "question:experiencia_evento",
  "question:acampamento_edicao",
  "question:formacao_saude",
  "question:conjuge",
  "question:paroquia",
  "question:sacramentos",
  "question:equipes_preferencia",
  "shirt",
  "metadata:instagram",
  "historical:training",
  "historical:confirmation",
];
const options = (values) => values.map((value) => ({ value, label: value }));
const catalog = targets.map((id, index) => ({
  id,
  label: headers[index],
  type:
    id === "question:sexo" || id === "shirt"
      ? "single"
      : ["question:sacramentos", "question:equipes_preferencia"].includes(id)
        ? "multiple"
        : id === "question:experiencia_evento"
          ? "boolean"
          : "text",
  historical: id.startsWith("metadata:") || id.startsWith("historical:"),
  ...(id === "shirt"
    ? { options: options(["PP", "P", "M", "G", "GG", "XG", "XGG", "ESP"]) }
    : id === "question:sexo"
      ? { options: options(["Feminino", "Masculino"]) }
      : id === "question:sacramentos"
        ? {
            options: options([
              "Batismo",
              "1ª Eucaristia",
              "Crisma",
              "Não possuo nenhum sacramento",
            ]),
          }
        : id === "question:equipes_preferencia"
          ? {
              options: options(["Anjos", "Cozinha", "Secretaria", "Recreação"]),
            }
          : {}),
}));
catalog.push({
  id: "historical",
  label: "Guardar somente no histórico",
  type: "text",
  historical: true,
});
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
    const rows = ["Maria Exemplo", "João Exemplo"].map((name, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
      rowNumber: index + 2,
      revision: 0,
      executionState: "PENDING",
      decision: "PENDING",
      reviewed: false,
      ready: false,
      needsReview: true,
      overrides: {},
      original: {
        headers,
        cells: [
          "2026/10/20 1:00:00 PM GMT-3",
          name,
          index ? "Masculino" : "feminino",
          index ? "123" : "44999999999",
          "26",
          "2000-01-01",
          "Loanda PR",
          "Sim!",
          "1º FAC do teste",
          "",
          "",
          "Paróquia dos testes",
          "BATISMO;CRISMA",
          "Anjos;Cozinha;Secretaria;Recreação",
          "Gg",
          "@exemplo",
          "Sim, estou de acordo",
          "Sim, estou de acordo",
        ],
      },
      payload: {
        name,
        birthDate: "2000-01-01",
        phone: index ? "123" : "44999999999",
        shirt: "GG",
        answers: {
          sexo: index ? "Masculino" : "Feminino",
          cidade: "Loanda PR",
          experiencia_evento: true,
          acampamento_edicao: "1º FAC do teste",
          sacramentos: ["Batismo", "Crisma"],
          equipes_preferencia: ["Anjos", "Cozinha", "Secretaria", "Recreação"],
        },
      },
      historical: {},
      errors: index ? ["Confira o celular com DDD."] : [],
      warnings: [],
      pending: ["Foto não informada", "Termos gerais atuais não confirmados"],
      duplicateRows: [],
      candidates: [],
      replaceId: null,
      registrationId: null,
    }));
    const batch = {
      id: batchId,
      mode: "EVENT",
      state: "MAPPING",
      step: 1,
      revision: 0,
      fileName: "servos-teste.csv",
      sheet: "CSV",
      campaign: {
        id: campaignId,
        event: {
          id: eventId,
          name: "FAC do teste — Servos",
          startsAt: "2027-02-05",
        },
      },
      formVersionId: formId,
      headers,
      columns: headers.map((_, column) => {
        const unique = [
          ...new Set(rows.map((row) => row.original.cells[column])),
        ];
        return {
          column,
          samples: unique,
          values: unique.map((value) => ({
            value,
            count: rows.filter((row) => row.original.cells[column] === value)
              .length,
          })),
        };
      }),
      catalog,
      mapping: targets.map((target, column) => ({
        column,
        target,
        confirmed: false,
      })),
      rules: [],
      summary: {},
      rows,
      page: 1,
      pageSize: 50,
    };
    let created = false,
      confirmations = 0;
    const errors = [],
      unexpected = [];
    function refresh() {
      batch.summary = {
        total: rows.length,
        selected: rows.filter(
          (row) => row.ready && row.executionState === "PENDING",
        ).length,
        discarded: 0,
        pending: rows.filter(
          (row) => row.executionState === "PENDING" && row.needsReview,
        ).length,
        imported: rows.filter((row) => row.executionState === "IMPORTED")
          .length,
      };
      return batch;
    }
    const metadata = () => ({
      ready: true,
      eventReady: true,
      prefillEnabled: false,
      destinations: [
        {
          campaignId,
          eventId,
          eventName: "FAC do teste — Servos",
          eventStatus: "PUBLISHED",
          forms: [{ id: formId, version: 2, publishedAt: "2026-10-01" }],
        },
      ],
      batches: created
        ? [
            {
              id: batchId,
              mode: "EVENT",
              fileName: batch.fileName,
              sheet: "CSV",
              state: batch.state,
              step: batch.step,
              revision: batch.revision,
              _count: { rows: rows.length },
            },
          ]
        : [],
    });
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1100 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript((value) => {
      if (["localhost", "127.0.0.1"].includes(location.hostname))
        localStorage.setItem("sb-auth-auth-token", JSON.stringify(value));
    }, session);
    context.on("page", (page) =>
      page.on("pageerror", (e) => errors.push(e.message)),
    );
    const base = `/api/v1/organizations/${orgId}/participant-imports`;
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname,
        method = request.method();
      const json = (body, status = 200, responseHeaders = {}) =>
        route.fulfill({ status, headers: responseHeaders, json: body });
      if (url.hostname === authHost) {
        const cors = {
          "access-control-allow-origin": "*",
          "access-control-allow-headers":
            "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        };
        return method === "OPTIONS"
          ? route.fulfill({ status: 204, headers: cors })
          : json(user, 200, cors);
      }
      if (path === "/api/v1/config")
        return json({
          supabaseUrl: `https://${authHost}`,
          supabaseAnonKey: "sb_publishable_test",
          eventsEnabled: false,
          eventManagementEnabled: true,
          volunteerRegistrationsEnabled: true,
          volunteerRegistrationsReady: true,
          camperRegistrationsEnabled: false,
          registrationPrefillEnabled: false,
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
      if (path === base) return json(metadata());
      if (path.includes("/previous-participants"))
        return json({ items: [], total: 0 });
      if (path === `${base}/event`) {
        assert.equal(method, "POST");
        assert(request.postData().includes('filename="servos-teste.csv"'));
        created = true;
        return json(refresh());
      }
      if (path === `${base}/${batchId}`) return json(refresh());
      if (path === `${base}/${batchId}/settings`) {
        const data = request.postDataJSON();
        assert.equal(data.revision, batch.revision);
        if (data.mapping) batch.mapping = data.mapping;
        if (data.rules) batch.rules = data.rules;
        if (data.step) batch.step = data.step;
        batch.revision++;
        if (batch.state !== "PARTIALLY_CONFIRMED")
          batch.state = batch.step >= 3 ? "REVIEW" : "MAPPING";
        return json(refresh());
      }
      if (path === `${base}/${batchId}/review`) {
        const data = request.postDataJSON();
        assert.equal(data.revision, batch.revision);
        for (const row of rows.filter((row) => data.rowIds.includes(row.id))) {
          assert.equal(row.errors.length, 0);
          row.reviewed = true;
          row.ready = true;
          row.needsReview = false;
          row.decision = "KEEP";
          row.revision++;
        }
        batch.revision++;
        return json(refresh());
      }
      if (path === `${base}/${batchId}/rows/${rows[1].id}`) {
        const data = request.postDataJSON();
        assert.equal(data.revision, rows[1].revision);
        assert.equal(data.overrides.phone, "44988888888");
        Object.assign(rows[1], {
          overrides: data.overrides,
          decision: data.decision,
          reviewed: true,
          ready: true,
          needsReview: false,
          errors: [],
          revision: rows[1].revision + 1,
        });
        rows[1].payload.phone = data.overrides.phone;
        batch.revision++;
        return json(refresh());
      }
      if (path === `${base}/${batchId}/confirm`) {
        const data = request.postDataJSON();
        assert.equal(data.revision, batch.revision);
        assert.equal(
          data.rowIds.length,
          1,
          "A confirmação parcial deve enviar apenas a linha selecionada.",
        );
        for (const row of rows.filter((row) => data.rowIds.includes(row.id))) {
          assert(row.ready);
          row.executionState = "IMPORTED";
          row.registrationId = `registration-${row.rowNumber}`;
          row.ready = false;
        }
        confirmations++;
        batch.revision++;
        batch.step = 6;
        batch.state = rows.every((row) => row.executionState === "IMPORTED")
          ? "CONFIRMED"
          : "PARTIALLY_CONFIRMED";
        return json(refresh());
      }
      if (path.startsWith("/api/")) {
        unexpected.push(`${method} ${path}`);
        return json({ error: { message: "API de teste não prevista" } }, 404);
      }
      if (url.origin === new URL(target).origin) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    const screenshots = `.local/screenshots/event-import-${mobile ? "mobile" : "desktop"}`;
    async function fits() {
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        "O assistente não deve causar rolagem horizontal da página.",
      );
    }
    await page.goto(
      `${target}/organizacao/${orgId}/cadastros-anteriores?modo=evento`,
    );
    await page
      .getByLabel(/Evento e campanha de servos/)
      .selectOption(campaignId);
    await page
      .getByLabel(/^Arquivo de candidaturas/)
      .setInputFiles({
        name: "servos-teste.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "Nome,Nascimento,Celular\nMaria Exemplo,2000-01-01,44999999999",
        ),
      });
    await page
      .getByRole("button", { name: "Salvar arquivo e associar colunas" })
      .click();
    await expect(
      page.getByRole("heading", { name: "2. Associar colunas" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Salvar associações e continuar" }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Confirmar associações exibidas" })
      .click();
    await expect(page.getByText(/18\/18 colunas conferidas/)).toBeVisible();
    await page
      .getByRole("heading", { name: "2. Associar colunas" })
      .scrollIntoViewIfNeeded();
    await fits();
    await page.screenshot({ path: `${screenshots}-mapping.png` });
    await page
      .getByRole("button", { name: "Salvar associações e continuar" })
      .click();
    await page.getByLabel("Campo para normalizar").selectOption("shirt");
    const shirtRow = page.getByRole("row").filter({ hasText: "Gg" });
    await shirtRow.getByLabel("Camiseta").selectOption("GG");
    await page
      .getByRole("button", { name: "Aplicar e conferir pessoas" })
      .click();
    assert.deepEqual(batch.rules, [{ target: "shirt", from: "Gg", to: "GG" }]);
    await page
      .getByRole("button", {
        name: "Conferir linhas sem conflitos desta página",
      })
      .click();
    await expect(
      page.getByText(/Linhas sem conflitos conferidas/),
    ).toBeVisible();
    await page
      .getByRole("heading", { name: "4. Conferir pessoas" })
      .scrollIntoViewIfNeeded();
    await fits();
    await page.screenshot({ path: `${screenshots}-review.png` });
    await page
      .getByRole("button", { name: "Continuar para confirmação" })
      .click();
    await expect(page.getByLabel("Importar linha 3")).toBeDisabled();
    await page.getByLabel("Importar linha 2").check();
    await page
      .getByRole("button", {
        name: "Confirmar 1 candidatura(s) selecionada(s)",
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "6. Resultado da importação" }),
    ).toBeVisible();
    assert.equal(batch.state, "PARTIALLY_CONFIRMED");
    assert.equal(confirmations, 1);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "6. Resultado da importação" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Revisar linhas restantes" })
      .click();
    await page.getByRole("button", { name: "Revisar linha 3" }).click();
    const editor = page.getByRole("region", {
      name: "Revisar candidatura da linha 3",
    });
    await editor.getByLabel("Celular", { exact: true }).fill("44988888888");
    await editor.getByLabel("Decisão para a candidatura").selectOption("KEEP");
    await editor
      .getByRole("button", { name: "Salvar revisão da candidatura" })
      .click();
    await expect(page.getByText(/Revisão salva/)).toBeVisible();
    assert.equal(
      rows[1].original.cells[3],
      "123",
      "O original deve permanecer intacto após a correção.",
    );
    assert.equal(
      rows[0].payload.answers.equipes_preferencia.length,
      4,
      "Preferências históricas acima de três devem ser preservadas.",
    );
    await page
      .getByRole("button", { name: "Continuar para confirmação" })
      .click();
    await expect(page.getByLabel("Importar linha 2")).toBeDisabled();
    await page.getByLabel("Importar linha 3").check();
    await page
      .getByRole("button", {
        name: "Confirmar 1 candidatura(s) selecionada(s)",
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "6. Resultado da importação" }),
    ).toBeVisible();
    assert.equal(batch.state, "CONFIRMED");
    assert.equal(confirmations, 2);
    await expect(
      page.getByRole("link", { name: "Abrir gestão de inscrições" }),
    ).toHaveAttribute(
      "href",
      `/organizacao/${orgId}/inscricoes?evento=${eventId}`,
    );
    await page
      .getByRole("heading", { name: "6. Resultado da importação" })
      .scrollIntoViewIfNeeded();
    await fits();
    await page.screenshot({ path: `${screenshots}-result.png` });
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await context.close();
    console.log(
      `Assistente ${mobile ? "celular" : "desktop"}: 18 associações, normalização, revisão, confirmação parcial, retomada, correção e resultado aprovados.`,
    );
  }
} finally {
  await browser.close();
}
