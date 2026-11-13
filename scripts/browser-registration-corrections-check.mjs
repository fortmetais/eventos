import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import { defaultLayout } from "@fac/form-layout";

// Interface real, sessão e serviços fictícios. Nenhuma chamada usa dados reais.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5174";
const origin = new URL(target).origin;
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Execute somente contra a aplicação local.");
const screenshots = process.env.SCREENSHOT_DIR ?? ".local/screenshots";
mkdirSync(screenshots, { recursive: true });
const orgId = "00000000-0000-4000-8000-000000000401";
const eventId = "00000000-0000-4000-8000-000000000402";
const campaignId = "00000000-0000-4000-8000-000000000403";
const authHost = "auth.encontro.invalid";
const user = {
  id: "00000000-0000-4000-8000-000000000404",
  email: "organizadora@corrections.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  email_confirmed_at: "2026-11-13T12:00:00.000Z",
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
  name: "Organização fictícia de correções",
  city: "Cidade fictícia",
  state: "PR",
  kind: "PARISH",
  active: true,
};
const teams = ["Anjos", "Secretaria", "Recreação", "Manutenção"].map(
  (name, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 410).padStart(12, "0")}`,
    eventId,
    name,
    capacity: 10,
    occupied: 1,
    available: 9,
  }),
);
const event = {
  id: eventId,
  organizationId: orgId,
  name: "FAC fictício de correções",
  description: "Evento para validação local",
  location: "Local fictício",
  city: "Cidade fictícia",
  startsAt: "2028-02-05",
  endsAt: "2028-02-09",
  status: "PUBLISHED",
  type: { name: "FAC" },
  departmentsReady: true,
  teams,
  campaigns: [
    {
      id: campaignId,
      kind: "VOLUNTEER",
      allowWaitlist: true,
      _count: { registrations: 2 },
    },
  ],
};
const form = {
  askCpf: true,
  askAddress: true,
  askShirt: true,
  terms: "Termos fictícios da inscrição original para preservar.",
  volunteer: {
    template: "VOLUNTEER_INTENTION_V1",
    description: "",
    requirements: "Requisitos fictícios",
    training: "Formação fictícia",
  },
  questions: [
    {
      id: "experiencia",
      label: "Experiência para servir",
      type: "text",
      required: false,
      options: [],
    },
    {
      id: "participou",
      label: "Já participou anteriormente?",
      type: "boolean",
      required: false,
      options: [],
    },
    {
      id: "anos",
      label: "Anos de experiência",
      type: "number",
      required: false,
      options: [],
    },
    {
      id: "data_experiencia",
      label: "Data da experiência",
      type: "date",
      required: false,
      options: [],
    },
    {
      id: "turno",
      label: "Turno preferido",
      type: "single",
      required: false,
      options: ["Manhã", "Tarde", "Noite"],
    },
    {
      id: "equipes_preferencia",
      label: "Equipes de preferência",
      type: "multiple",
      required: true,
      options: teams.map((team) => team.name),
      maxSelections: 3,
    },
    {
      id: "aceite_regras",
      label: "Aceite das regras originais",
      type: "boolean",
      required: true,
      options: [],
      mustBeTrue: true,
    },
    {
      id: "aceite_orientacoes",
      label: "Aceite das orientações originais",
      type: "boolean",
      required: false,
      options: [],
    },
    {
      id: "oculta",
      label: "Pergunta oculta da ficha",
      type: "text",
      required: false,
      options: [],
    },
  ],
};
form.layout = defaultLayout(form, "VOLUNTEER");
form.layout.steps
  .flatMap((step) => step.fields)
  .find((field) => field.key === "question:oculta").hidden = true;
const labels = {
  name: "Nome completo",
  birthDate: "Data de nascimento",
  phone: "Telefone/WhatsApp",
  email: "E-mail de contato",
  cpf: "CPF",
  address: "Endereço",
  shirt: "Tamanho da camiseta",
  availability: "Disponibilidade",
  emergencyName: "Nome do contato de emergência",
  emergencyPhone: "Telefone do contato de emergência",
  emergencyAlternativePhone: "Telefone alternativo de emergência",
  emergencyRelationship: "Parentesco do contato de emergência",
  guardianName: "Nome do responsável",
  guardianPhone: "Telefone do responsável",
  guardianEmail: "E-mail do responsável",
  guardianRelationship: "Parentesco do responsável",
  ...Object.fromEntries(
    form.questions.map((question) => [
      `question:${question.id}`,
      question.label,
    ]),
  ),
};
const automaticReason = "Correção da ficha pela organização.";
const listUrl = `${target}/organizacao/${orgId}/inscricoes?evento=${eventId}`;
const phoneFields = new Set([
  "phone",
  "emergencyPhone",
  "emergencyAlternativePhone",
  "guardianPhone",
]);
const clone = (value) => structuredClone(value);

function fixtures() {
  return ["PUBLIC_FORM", "IMPORT"].map((source, index) => {
    const name = index ? "Bruna Importada Fictícia" : "Ana Nativa Fictícia";
    const snapshot = {
      name,
      birthDate: "2000-01-01",
      phone: "44999999999",
      email: `${index ? "importada" : "nativa"}-original@corrections.test`,
      cpf: "52998224725",
      address: "Rua fictícia, 123",
      shirt: "M",
      availability: "Todo o período",
      emergencyName: "Emergência fictícia original",
      emergencyPhone: "44988888888",
      emergencyAlternativePhone: "4433333333",
      emergencyRelationship: "Mãe",
      ...(index
        ? {
            guardianName: "Responsável fictício original",
            guardianPhone: "44977777777",
            guardianEmail: "responsavel-original@corrections.test",
            guardianRelationship: "Mãe",
          }
        : {}),
      photoAssetId: "00000000-0000-4000-8000-000000000420",
      termsAccepted: !index,
      imageAuthorized: false,
      guardianAuthorization: false,
      emailProof: {
        email: `${index ? "importada" : "nativa"}-original@corrections.test`,
        verifiedAt: "2026-10-01T12:00:00.000Z",
      },
      answers: {
        experiencia: "Resposta anterior fictícia",
        participou: true,
        anos: 2,
        data_experiencia: "2026-01-01",
        turno: "Manhã",
        equipes_preferencia: teams
          .slice(0, index ? 4 : 2)
          .map((team) => team.name),
        aceite_regras: !index,
        aceite_orientacoes: false,
        oculta: "Resposta oculta preservada",
      },
    };
    return {
      id: `00000000-0000-4000-8000-${String(index + 430).padStart(12, "0")}`,
      protocol: `CORRECAO-FICTICIA-${index + 1}`,
      origin: source,
      personId: `00000000-0000-4000-8000-${String(index + 440).padStart(12, "0")}`,
      person: {
        name,
        phone: snapshot.phone,
        birthDate: snapshot.birthDate,
        cpf: snapshot.cpf,
        email: snapshot.email,
      },
      accountId: index ? null : user.id,
      draftId: index ? null : "00000000-0000-4000-8000-000000000450",
      status: "CONFIRMED",
      teamId: teams[1].id,
      team: teams[1],
      createdAt: "2026-10-10T12:00:00.000Z",
      updatedAt: "2026-11-13T12:00:00.000Z",
      snapshot,
      health: { data: { hasAllergies: false, hasMedication: false } },
      consent: index
        ? null
        : {
            version: "FICTICIA",
            accepted: true,
            guardianAuthorized: false,
            imageAuthorized: false,
            termsText: form.terms,
          },
      spiritualityResponse: false,
      spiritualityRespondedAt: "2026-11-10T12:00:00.000Z",
      spiritualityAt: "2028-01-10T12:00:00.000Z",
      history: [
        {
          id: `history-${index}`,
          fromStatus: "APPROVED",
          toStatus: "CONFIRMED",
          createdAt: "2026-11-11T12:00:00.000Z",
          reason: "Confirmação fictícia original.",
        },
      ],
      corrections: [],
      campaign: {
        ...event.campaigns[0],
        event: { id: eventId, name: event.name, startsAt: event.startsAt },
      },
      form: { id: "form-fixture", config: clone(form) },
      ...(index
        ? {
            importData: {
              source: {
                batchId: "batch-fixture",
                rowId: "row-fixture",
                fileName: "origem-ficticia.csv",
              },
              original: {
                headers: ["Nome", "Telefone"],
                cells: [name, snapshot.phone],
              },
              baseline: clone(snapshot),
              pending: ["Aceitar os termos atuais da inscrição."],
              historical: { training: "Registro histórico fictício" },
            },
            pendingInformation: ["Aceitar os termos atuais da inscrição."],
          }
        : {}),
    };
  });
}

function protectedValues(row) {
  return clone({
    status: row.status,
    teamId: row.teamId,
    team: row.team,
    accountId: row.accountId,
    draftId: row.draftId,
    origin: row.origin,
    email: row.snapshot.email,
    emailProof: row.snapshot.emailProof,
    personEmail: row.person.email,
    photoAssetId: row.snapshot.photoAssetId,
    termsAccepted: row.snapshot.termsAccepted,
    imageAuthorized: row.snapshot.imageAuthorized,
    guardianAuthorization: row.snapshot.guardianAuthorization,
    accepts: [
      row.snapshot.answers.aceite_regras,
      row.snapshot.answers.aceite_orientacoes,
    ],
    hiddenAnswer: row.snapshot.answers.oculta,
    health: row.health,
    consent: row.consent,
    spiritualityResponse: row.spiritualityResponse,
    spiritualityRespondedAt: row.spiritualityRespondedAt,
    spiritualityAt: row.spiritualityAt,
    ...(row.importData
      ? {
          source: row.importData.source,
          original: row.importData.original,
          baseline: row.importData.baseline,
          historical: row.importData.historical,
        }
      : {}),
  });
}

async function createFixtureContext(browser, viewport, role = "ORGANIZER") {
  const mobile = viewport.width <= 800;
  const context = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: "block",
  });
  await context.addInitScript(
    (value) =>
      localStorage.setItem("sb-auth-auth-token", JSON.stringify(value)),
    session,
  );
  const state = {
    rows: fixtures(),
    patches: [],
    errors: [],
    blockedExternal: [],
    listReads: 0,
    detailReads: 0,
    conflictNext: false,
    guardianDocument: false,
    forbiddenWrites: [],
  };
  const json = (route, value, status = 200, headers = {}) =>
    route.fulfill({
      status,
      headers,
      contentType: "application/json",
      body: JSON.stringify(value),
    });
  const base = `/api/v1/organizations/${orgId}`;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === authHost) {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers":
          "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      if (url.pathname.endsWith("/user") && request.method() === "GET")
        return json(route, user, 200, headers);
      state.errors.push(
        `Autenticação inesperada: ${request.method()} ${url.pathname}`,
      );
      return route.abort();
    }
    if (url.pathname === "/api/v1/config")
      return json(route, {
        supabaseUrl: `https://${authHost}`,
        supabaseAnonKey: "sb_publishable_test",
        eventsEnabled: true,
        eventManagementEnabled: true,
      });
    if (url.pathname === "/api/v1/me/access")
      return json(route, {
        account: {
          id: user.id,
          email: user.email,
          profile: { name: "Organizadora fictícia" },
          platformAdmin: false,
        },
        organizations: [
          {
            id: "member-fixture",
            organizationId: orgId,
            accountId: user.id,
            organization,
            role,
            active: true,
            healthEventIds: role === "HEALTH" ? [eventId] : [],
          },
        ],
      });
    if (url.pathname === `${base}/events` && request.method() === "GET")
      return json(route, [event]);
    if (
      url.pathname === `${base}/registrations` &&
      request.method() === "GET"
    ) {
      state.listReads++;
      const search = (url.searchParams.get("q") ?? "").toLocaleLowerCase(
        "pt-BR",
      );
      const rows = state.rows.filter((row) =>
        row.person.name.toLocaleLowerCase("pt-BR").includes(search),
      );
      return json(route, {
        items: rows.map((row) => ({
          ...row,
          decisionSummary: {
            ready: true,
            notice: {
              id: `notice-${row.id}`,
              kind: "ACEITE",
              active: true,
              confirmedAt: "2026-11-11T12:00:00.000Z",
              emailStatus: "ENVIADA",
            },
          },
        })),
        total: rows.length,
        page: 1,
        pageSize: 20,
      });
    }
    const match = url.pathname.match(
      new RegExp(`^${base}/registrations/([^/]+)(.*)$`),
    );
    if (match) {
      const row = state.rows.find((item) => item.id === match[1]);
      if (!row) return json(route, {}, 404);
      const suffix = match[2];
      if (!suffix && request.method() === "GET") {
        state.detailReads++;
        return json(route, row);
      }
      if (suffix === "/guardian" && request.method() === "GET")
        return json(route, {
          ready: true,
          needsAuthorization: false,
          authorization:
            state.guardianDocument && row.origin === "IMPORT"
              ? {
                  id: "guardian-fixture",
                  signedAt: null,
                  expiresAt: "2028-02-01T12:00:00.000Z",
                  termsText: "Documento fictício preservado",
                  emailStatus: "PENDENTE",
                  active: true,
                  expired: false,
                  link: null,
                  whatsappLink: null,
                }
              : null,
        });
      if (suffix === "/decision-notice" && request.method() === "GET")
        return json(route, {
          ready: true,
          notice: {
            id: `notice-${row.id}`,
            kind: "ACEITE",
            active: true,
            expired: false,
            confirmedAt: "2026-11-11T12:00:00.000Z",
            declinedAt: null,
            email: row.snapshot.email,
            emailStatus: "ENVIADA",
            emailSentAt: "2026-11-10T12:00:00.000Z",
            whatsappSentAt: null,
            expiresAt: "2028-02-01T12:00:00.000Z",
            link: `${target}/r#fixture`,
            shortLink: `${target}/r#fixture`,
            whatsappLink: "https://wa.me/5544999999999?text=fixture",
            message: "Convite fictício preservado",
          },
        });
      if (suffix === "/photo" && request.method() === "GET")
        return json(route, {}, 404);
      if (suffix === "/corrections" && request.method() === "PATCH") {
        const body = request.postDataJSON();
        state.patches.push({ id: row.id, body: clone(body) });
        assert.equal(
          role,
          "ORGANIZER",
          "Apenas o organizador pode enviar correções.",
        );
        assert.deepEqual(Object.keys(body).sort(), [
          "overrides",
          "reason",
          "updatedAt",
        ]);
        assert.equal(
          body.reason,
          automaticReason,
          "O motivo deve ser automático.",
        );
        assert(body.overrides && Object.keys(body.overrides).length);
        for (const key of Object.keys(body.overrides))
          assert(
            labels[key] &&
              ![
                "question:aceite_regras",
                "question:aceite_orientacoes",
                "question:oculta",
              ].includes(key),
            `Campo protegido enviado: ${key}`,
          );
        if (state.conflictNext || body.updatedAt !== row.updatedAt) {
          state.conflictNext = false;
          return json(
            route,
            {
              error: {
                code: "REGISTRATION_REVISION_CONFLICT",
                message:
                  "Esta ficha foi alterada em outra tela. Atualize antes de corrigir.",
              },
            },
            409,
          );
        }
        if (
          state.guardianDocument &&
          Object.keys(body.overrides).some((key) =>
            ["name", "birthDate", "cpf"].includes(key),
          )
        )
          return json(
            route,
            {
              error: {
                code: "GUARDIAN_DOCUMENT_REVIEW_REQUIRED",
                message:
                  "Nome, nascimento ou CPF exigem revisão do termo do responsável já criado.",
              },
            },
            409,
          );
        const beforeProtected = protectedValues(row);
        const changes = [];
        for (const [field, raw] of Object.entries(body.overrides)) {
          const question = field.startsWith("question:");
          const key = question
            ? field.slice(9)
            : field === "email"
              ? "contactEmail"
              : field;
          const holder = question ? row.snapshot.answers : row.snapshot;
          const before =
            field === "email"
              ? (row.snapshot.contactEmail ?? row.snapshot.email)
              : (holder[key] ?? null);
          let after = raw;
          if (phoneFields.has(field) || field === "cpf")
            after = String(raw ?? "").replace(/\D/g, "");
          else if (["email", "guardianEmail"].includes(field))
            after = String(raw ?? "")
              .trim()
              .toLowerCase();
          else if (typeof raw === "string") after = raw.trim();
          if (after === null) delete holder[key];
          else holder[key] = after;
          if (["name", "phone", "cpf", "birthDate"].includes(field))
            row.person[field] = after;
          changes.push({ field, label: labels[field], before, after });
        }
        row.updatedAt = new Date(
          Date.parse(row.updatedAt) + 1000,
        ).toISOString();
        row.corrections.push({
          id: `correction-${state.patches.length}`,
          createdAt: row.updatedAt,
          reason: automaticReason,
          actor: {
            id: user.id,
            name: "Organizadora fictícia",
            email: user.email,
          },
          changes,
        });
        row.history.push({
          id: `history-correction-${state.patches.length}`,
          fromStatus: row.status,
          toStatus: row.status,
          createdAt: row.updatedAt,
          reason: `Correção de ficha (${changes.map((change) => change.label).join(", ")}): ${automaticReason}`,
        });
        assert.deepEqual(
          protectedValues(row),
          beforeProtected,
          "A correção alterou evidência, conta ou decisão protegida.",
        );
        return json(route, row);
      }
    }
    if (url.pathname.startsWith("/api/v1/")) {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()))
        state.forbiddenWrites.push(`${request.method()} ${url.pathname}`);
      state.errors.push(`API inesperada: ${request.method()} ${url.pathname}`);
      return json(
        route,
        { error: { message: "Serviço não previsto na fixture" } },
        400,
      );
    }
    if (url.origin === origin) return route.continue();
    state.blockedExternal.push(url.hostname);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => state.errors.push(error.message));
  return { context, page, state };
}

async function openRow(page, row) {
  await page
    .getByRole("button", {
      name: `Abrir ficha de ${row.person.name}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Ficha do participante",
    exact: true,
  });
  await expect(
    dialog.getByRole("heading", { name: row.person.name, exact: true }),
  ).toBeVisible();
  return dialog;
}
async function edit(dialog) {
  await dialog
    .getByRole("button", { name: "Editar ficha", exact: true })
    .click();
  const editor = dialog.getByRole("form", {
    name: "Editar ficha",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel(/motivo/i)).toHaveCount(0);
  for (const name of [
    "health:hasAllergies",
    "termsAccepted",
    "imageAuthorized",
    "guardianAuthorization",
    "photoAssetId",
    "question:aceite_regras",
    "question:aceite_orientacoes",
    "question:oculta",
  ])
    await expect(editor.locator(`[name="${name}"]`)).toHaveCount(0);
  await expect(
    editor.getByRole("button", { name: "Salvar alterações", exact: true }),
  ).toBeDisabled();
  return editor;
}
async function openSection(dialog, title) {
  const trigger = dialog.getByRole("button", { name: title, exact: true });
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  return dialog.getByRole("region", { name: title, exact: true });
}
async function noHorizontalOverflow(page, dialog) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "A página não pode ter rolagem horizontal.",
  );
  assert(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
    "A ficha não pode ter rolagem horizontal.",
  );
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
try {
  for (const viewport of [
    { width: 1536, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const screen = viewport.width <= 800 ? "mobile" : "desktop";
    const { context, page, state } = await createFixtureContext(
      browser,
      viewport,
    );
    try {
      await page.goto(listUrl);
      const native = state.rows[0],
        imported = state.rows[1];
      await expect(
        page.getByRole("button", {
          name: `Abrir ficha de ${native.person.name}`,
          exact: true,
        }),
      ).toBeVisible();
      const nativeProtected = protectedValues(native),
        importProtected = protectedValues(imported);
      let dialog = await openRow(page, native);
      let editor = await edit(dialog);
      await expect(
        editor.getByLabel("Telefone/WhatsApp", { exact: true }),
      ).toHaveValue("(44) 99999-9999");
      await expect(editor.getByLabel("CPF", { exact: true })).toHaveValue(
        "529.982.247-25",
      );
      await editor
        .getByLabel("Nome completo", { exact: true })
        .fill("Ana Nativa Conferida");
      await editor
        .getByLabel("Telefone/WhatsApp", { exact: true })
        .fill("44988887777");
      await expect(
        editor.getByLabel("Telefone/WhatsApp", { exact: true }),
      ).toHaveValue("(44) 98888-7777");
      await editor
        .getByLabel("E-mail de contato", { exact: true })
        .fill("Contato-Nativo@corrections.test");
      await editor.getByLabel("CPF", { exact: true }).fill("11144477735");
      await expect(editor.getByLabel("CPF", { exact: true })).toHaveValue(
        "111.444.777-35",
      );
      await editor
        .getByLabel("Endereço", { exact: true })
        .fill("Rua conferida fictícia, 456");
      await editor
        .getByLabel("Tamanho da camiseta", { exact: true })
        .selectOption("G4");
      await editor
        .getByLabel("Sua disponibilidade", { exact: true })
        .fill("Noite e fim de semana");
      await editor
        .getByLabel("Nome do contato de emergência", { exact: true })
        .fill("Emergência conferida fictícia");
      await editor
        .getByLabel("Telefone do contato de emergência com DDD", {
          exact: true,
        })
        .fill("44988881111");
      await editor
        .getByLabel("Telefone alternativo de emergência", { exact: true })
        .fill("4433332222");
      await editor
        .locator('select[name="emergencyRelationship"]')
        .selectOption("Pai");
      await editor
        .getByLabel("Experiência para servir", { exact: true })
        .fill("Experiência conferida fictícia");
      await editor
        .getByLabel("Já participou anteriormente?", { exact: true })
        .selectOption("false");
      await editor.getByLabel("Anos de experiência", { exact: true }).fill("0");
      await editor
        .getByLabel("Data da experiência", { exact: true })
        .fill("2026-02-03");
      await editor
        .getByLabel("Turno preferido", { exact: true })
        .selectOption("Noite");
      const preferences = editor
        .getByRole("group", { name: "Equipes de preferência", exact: true })
        .last();
      await preferences
        .getByRole("checkbox", { name: "Recreação", exact: true })
        .check();
      await preferences
        .getByRole("checkbox", { name: "Manutenção", exact: true })
        .click();
      await expect(
        preferences.getByRole("checkbox", { name: "Manutenção", exact: true }),
      ).not.toBeChecked();
      await expect(
        editor.getByText("Selecione até 3 opções.", { exact: true }),
      ).toBeVisible();
      await preferences
        .getByRole("checkbox", { name: "Recreação", exact: true })
        .uncheck();
      await preferences
        .getByRole("checkbox", { name: "Recreação", exact: true })
        .check();
      await noHorizontalOverflow(page, dialog);
      await editor
        .getByLabel("Nome completo", { exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(
          screenshots,
          `registration-corrections-${screen}-editing.png`,
        ),
        fullPage: false,
      });
      const readsBefore = { list: state.listReads, detail: state.detailReads };
      await editor
        .getByRole("button", { name: "Salvar alterações", exact: true })
        .click();
      await expect(
        dialog.getByRole("form", { name: "Editar ficha", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("heading", {
          name: "Ana Nativa Conferida",
          exact: true,
        }),
      ).toBeVisible();
      await expect
        .poll(() => state.listReads)
        .toBeGreaterThan(readsBefore.list);
      await expect
        .poll(() => state.detailReads)
        .toBeGreaterThan(readsBefore.detail);
      assert.equal(state.patches.length, 1);
      assert.equal(
        state.patches[0].body.overrides["question:participou"],
        false,
      );
      assert.equal(state.patches[0].body.overrides["question:anos"], 0);
      assert.equal(state.patches[0].body.overrides.shirt, "G4");
      assert.deepEqual(
        state.patches[0].body.overrides["question:equipes_preferencia"],
        ["Anjos", "Secretaria", "Recreação"],
      );
      const personal = await openSection(dialog, "Dados pessoais e contato");
      await expect(
        personal.getByText("contato-nativo@corrections.test", { exact: true }),
      ).toBeVisible();
      await expect(
        personal.getByText("44988887777", { exact: true }),
      ).toBeVisible();
      let history = await openSection(dialog, "Histórico e vínculo");
      await expect(
        history.getByRole("heading", { name: "Edições da ficha", exact: true }),
      ).toBeVisible();
      await expect(
        history.getByText("Organizadora fictícia", { exact: true }),
      ).toBeVisible();
      await expect(
        history.getByText("Ana Nativa Fictícia", { exact: false }),
      ).toBeVisible();
      await expect(
        history.getByText("Ana Nativa Conferida", { exact: false }),
      ).toBeVisible();
      await expect(
        history.getByText(automaticReason, { exact: true }),
      ).toHaveCount(0);
      assert.deepEqual(protectedValues(native), nativeProtected);
      await history
        .getByText("Ana Nativa Fictícia", { exact: false })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(
          screenshots,
          `registration-corrections-${screen}-history.png`,
        ),
        fullPage: false,
      });

      // Cancelar descarta apenas o rascunho e volta à leitura da mesma ficha.
      editor = await edit(dialog);
      await editor
        .getByLabel("Nome completo", { exact: true })
        .fill("Nome cancelado fictício");
      await editor
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Editar ficha", exact: true }),
      ).toBeVisible();
      assert.equal(state.patches.length, 1);
      editor = await edit(dialog);
      await expect(
        editor.getByLabel("Nome completo", { exact: true }),
      ).toHaveValue("Ana Nativa Conferida");

      // Conflito mantém os valores digitados até cancelar ou recarregar.
      state.conflictNext = true;
      await editor
        .getByLabel("Nome completo", { exact: true })
        .fill("Nome preservado após conflito");
      await editor
        .getByRole("button", { name: "Salvar alterações", exact: true })
        .click();
      await expect(
        editor.getByText(/Esta ficha foi alterada em outra tela/),
      ).toBeVisible();
      await expect(
        editor.getByLabel("Nome completo", { exact: true }),
      ).toHaveValue("Nome preservado após conflito");
      assert.equal(native.person.name, "Ana Nativa Conferida");
      assert.equal(native.corrections.length, 1);
      await page.screenshot({
        path: join(
          screenshots,
          `registration-corrections-${screen}-conflict.png`,
        ),
        fullPage: false,
      });

      await page.keyboard.press("Escape");
      const discard = dialog.getByRole("alertdialog", {
        name: "Descartar alterações não salvas?",
        exact: true,
      });
      await expect(discard).toBeVisible();
      await discard
        .getByRole("button", { name: "Continuar editando", exact: true })
        .click();
      await expect(
        editor.getByLabel("Nome completo", { exact: true }),
      ).toHaveValue("Nome preservado após conflito");
      await page.goBack();
      await expect(discard).toBeVisible();
      await discard
        .getByRole("button", { name: "Continuar editando", exact: true })
        .click();
      await expect(
        editor.getByLabel("Nome completo", { exact: true }),
      ).toHaveValue("Nome preservado após conflito");
      await dialog
        .getByRole("button", { name: "Fechar janela", exact: true })
        .click();
      await expect(discard).toBeVisible();
      await discard
        .getByRole("button", { name: "Descartar e fechar", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      assert.equal(state.patches.length, 2);
      await expect(
        page.getByRole("button", {
          name: "Abrir ficha de Ana Nativa Conferida",
          exact: true,
        }),
      ).toBeVisible();

      // Importada admite quatro preferências e limpar o contato não recupera email antigo.
      dialog = await openRow(page, imported);
      editor = await edit(dialog);
      const importedPreferences = editor
        .getByRole("group", { name: "Equipes de preferência", exact: true })
        .last();
      for (const team of teams)
        await expect(
          importedPreferences.getByRole("checkbox", {
            name: team.name,
            exact: true,
          }),
        ).toBeChecked();
      await editor.getByLabel("E-mail de contato", { exact: true }).fill("");
      await editor
        .getByLabel("Telefone/WhatsApp", { exact: true })
        .fill("44988883333");
      await editor
        .getByLabel("Nome do responsável", { exact: true })
        .fill("Responsável conferido fictício");
      await editor
        .getByLabel("Telefone do responsável com DDD", { exact: true })
        .fill("44988884444");
      await editor
        .getByLabel("E-mail do responsável", { exact: true })
        .fill("Responsavel-Conferido@corrections.test");
      await editor
        .locator('select[name="guardianRelationship"]')
        .selectOption("Pai");
      await editor
        .getByLabel("Já participou anteriormente?", { exact: true })
        .selectOption("");
      await editor
        .getByLabel("Experiência para servir", { exact: true })
        .fill("Resposta importada conferida");
      await editor
        .getByRole("button", { name: "Salvar alterações", exact: true })
        .click();
      await expect(
        dialog.getByRole("form", { name: "Editar ficha", exact: true }),
      ).toHaveCount(0);
      assert.equal(state.patches.length, 3);
      assert.equal(
        state.patches[2].body.overrides["question:participou"],
        null,
      );
      assert(
        !Object.hasOwn(
          state.patches[2].body.overrides,
          "question:equipes_preferencia",
        ),
      );
      assert.equal(imported.snapshot.contactEmail, "");
      assert.deepEqual(
        imported.snapshot.answers.equipes_preferencia,
        teams.map((team) => team.name),
      );
      assert.deepEqual(protectedValues(imported), importProtected);
      const importPersonal = await openSection(
        dialog,
        "Dados pessoais e contato",
      );
      await expect(
        importPersonal.getByText(imported.snapshot.email, { exact: true }),
      ).toHaveCount(0);
      const guardian = await openSection(dialog, "Responsável e autorização");
      await expect(
        guardian.getByText("Responsável conferido fictício", { exact: true }),
      ).toBeVisible();
      history = await openSection(dialog, "Histórico e vínculo");
      await expect(
        history.getByText("Responsável conferido fictício", { exact: false }),
      ).toBeVisible();
      await history
        .getByText("Responsável conferido fictício", { exact: false })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(
          screenshots,
          `registration-corrections-${screen}-imported.png`,
        ),
        fullPage: false,
      });

      state.guardianDocument = true;
      editor = await edit(dialog);
      await editor
        .getByLabel("Nome completo", { exact: true })
        .fill("Identidade que requer revisão");
      await editor
        .getByRole("button", { name: "Salvar alterações", exact: true })
        .click();
      await expect(
        editor.getByText(/exigem revisão do termo do responsável/),
      ).toBeVisible();
      await expect(
        editor.getByLabel("Nome completo", { exact: true }),
      ).toHaveValue("Identidade que requer revisão");
      assert.equal(imported.person.name, "Bruna Importada Fictícia");
      assert.equal(imported.corrections.length, 1);
      await editor
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Fechar janela", exact: true })
        .click();
      assert.equal(state.patches.length, 4);
      assert.deepEqual(state.errors, []);
      assert.deepEqual(
        state.forbiddenWrites,
        [],
        "A edição não deve enviar decisões, convites ou mensagens.",
      );
      console.log(
        `registration-corrections ${screen}: nativa, importada, máscaras, histórico, conflitos e descarte OK`,
      );
    } catch (error) {
      await page
        .screenshot({
          path: join(
            screenshots,
            `registration-corrections-${screen}-failure.png`,
          ),
          fullPage: true,
        })
        .catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }

  for (const role of ["SECRETARY", "HEALTH"]) {
    const { context, page, state } = await createFixtureContext(
      browser,
      { width: 1536, height: 1000 },
      role,
    );
    try {
      await page.goto(listUrl);
      const dialog = await openRow(page, state.rows[0]);
      await expect(
        dialog.getByRole("button", { name: "Editar ficha", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("form", { name: "Editar ficha", exact: true }),
      ).toHaveCount(0);
      assert.equal(state.patches.length, 0);
      assert.deepEqual(state.errors, []);
      assert.deepEqual(state.forbiddenWrites, []);
      console.log(`registration-corrections ${role}: leitura sem edição OK`);
    } finally {
      await context.close();
    }
  }
  console.log(
    "Correções de inscrições: navegador concluído com serviços fictícios e destinos externos bloqueados.",
  );
} finally {
  await browser.close();
}
