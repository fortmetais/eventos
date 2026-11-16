import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

// Painel React real com autenticação e serviços fictícios somente neste navegador.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5192";
const origin = new URL(target).origin;
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Execute somente contra a aplicação local.");
const screenshots = process.env.SCREENSHOT_DIR ?? ".local/screenshots";
mkdirSync(screenshots, { recursive: true });
const fixedTime = new Date("2026-11-16T12:00:00.000Z");
const orgId = "00000000-0000-4000-8000-000000000601";
const authHost = "auth.encontro.invalid";
const user = {
  id: "00000000-0000-4000-8000-000000000602",
  email: "organizador@dashboard.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  email_confirmed_at: "2026-11-01T12:00:00.000Z",
};
const now = Math.floor(fixedTime.getTime() / 1000);
const session = {
  access_token: [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        aud: "authenticated",
        exp: now + 86400,
        iat: now,
      }),
    ).toString("base64url"),
    "fixture",
  ].join("."),
  refresh_token: "fixture-refresh",
  token_type: "bearer",
  expires_in: 86400,
  expires_at: now + 86400,
  user,
};
const organization = {
  id: orgId,
  name: "Comunidade fictícia do painel",
  city: "Cidade fictícia",
  state: "PR",
  kind: "PARISH",
  active: true,
};
const uuid = (number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const definitions = [
  [
    "pastOld",
    "FAC histórico de outubro",
    "2026-10-02",
    "2026-10-04",
    "COMPLETED",
    1,
  ],
  [
    "futureFar",
    "FAC futuro de dezembro",
    "2026-12-10",
    "2026-12-12",
    "PUBLISHED",
    2,
  ],
  [
    "ongoingOld",
    "FAC em andamento desde a semana passada",
    "2026-11-10",
    "2026-11-20",
    "PUBLISHED",
    3,
  ],
  [
    "pastRecent",
    "FAC histórico de novembro",
    "2026-11-01",
    "2026-11-03",
    "COMPLETED",
    4,
  ],
  [
    "futureNear",
    "FAC próximo de novembro",
    "2026-11-20",
    "2026-11-22",
    "PUBLISHED",
    5,
  ],
  [
    "ongoingNear",
    "FAC atual da comunidade",
    "2026-11-15",
    "2026-11-17",
    "PUBLISHED",
    6,
  ],
];
const events = definitions.map(
  ([key, name, startsAt, endsAt, status, seed], index) => ({
    id: uuid(610 + index),
    key,
    seed,
    organizationId: orgId,
    name,
    startsAt,
    endsAt,
    status,
    description: "Evento fictício para conferir o painel",
    location: "Local fictício",
    city: "Cidade fictícia",
    type: { name: "FAC" },
    departmentsReady: true,
    teams: [],
    campaigns: [
      {
        id: uuid(630 + index * 2),
        kind: "VOLUNTEER",
        opensAt: "2026-01-01T12:00:00.000Z",
        closesAt: "2027-01-01T12:00:00.000Z",
        capacity: null,
        allowWaitlist: true,
        _count: { registrations: 70 * seed },
      },
      {
        id: uuid(631 + index * 2),
        kind: "CAMPER",
        opensAt: "2026-01-01T12:00:00.000Z",
        closesAt: "2027-01-01T12:00:00.000Z",
        capacity: 100,
        allowWaitlist: true,
        _count: { registrations: 33 * seed },
      },
    ],
  }),
);
const byKey = Object.fromEntries(events.map((event) => [event.key, event]));
const statuses = [
  "RECEIVED",
  "REVIEW",
  "APPROVED",
  "CONFIRMED",
  "WAITLIST",
  "REJECTED",
  "CANCELLED",
];
function summary(event, volunteersOnly = false) {
  const campaigns = event.campaigns
    .filter((campaign) => !volunteersOnly || campaign.kind === "VOLUNTEER")
    .map((campaign) => {
      const values =
        campaign.kind === "VOLUNTEER"
          ? [20, 5, 24, 12, 3, 4, 2]
          : [8, 2, 10, 9, 1, 2, 1];
      const byStatus = Object.fromEntries(
        statuses.map((status, index) => [status, values[index] * event.seed]),
      );
      return {
        id: campaign.id,
        kind: campaign.kind,
        total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
        byStatus,
        candidateGoing: (campaign.kind === "VOLUNTEER" ? 9 : 6) * event.seed,
      };
    });
  return {
    eventId: event.id,
    generatedAt: fixedTime.toISOString(),
    presenceAvailable: true,
    totals: {
      total: campaigns.reduce((sum, campaign) => sum + campaign.total, 0),
      byStatus: Object.fromEntries(
        statuses.map((status) => [
          status,
          campaigns.reduce(
            (sum, campaign) => sum + campaign.byStatus[status],
            0,
          ),
        ]),
      ),
      candidateGoing: campaigns.reduce(
        (sum, campaign) => sum + campaign.candidateGoing,
        0,
      ),
    },
    campaigns,
  };
}
const cards = [
  { label: "Inscritos", value: (counts) => counts.total, includeClosed: true },
  {
    label: "Aceitos",
    value: (counts) => counts.byStatus.APPROVED,
    status: "APPROVED",
  },
  {
    label: "Recusados",
    value: (counts) => counts.byStatus.REJECTED,
    status: "REJECTED",
    includeClosed: true,
  },
  {
    label: "Vagas confirmadas",
    value: (counts) => counts.byStatus.CONFIRMED,
    status: "CONFIRMED",
  },
  {
    label: "Vou participar",
    value: (counts) => counts.candidateGoing,
    presence: "VOU",
  },
];
const features = {
  eventsEnabled: true,
  eventManagementEnabled: true,
  volunteerRegistrationsEnabled: true,
  volunteerRegistrationsReady: true,
  camperRegistrationsEnabled: true,
  camperRegistrationsReady: true,
};
const dashboardUrl = (event, campaign) =>
  `${target}/organizacao/${orgId}${event ? `?evento=${event.id}${campaign ? `&campaign=${campaign.id}` : ""}` : ""}`;

async function fixtureContext(browser, viewport, options = {}) {
  const role = options.role ?? "ORGANIZER";
  const flags = { ...features, ...options.features };
  const volunteersOnly =
    !flags.eventsEnabled &&
    flags.volunteerRegistrationsEnabled &&
    !flags.camperRegistrationsEnabled;
  const visibleEvents = (options.events ?? events).map((event) => ({
    ...event,
    campaigns: event.campaigns.filter(
      (campaign) => !volunteersOnly || campaign.kind === "VOLUNTEER",
    ),
  }));
  const context = await browser.newContext({
    viewport,
    isMobile: viewport.width <= 800,
    hasTouch: viewport.width <= 800,
    serviceWorkers: "block",
  });
  await context.addInitScript(
    (value) =>
      localStorage.setItem("sb-auth-auth-token", JSON.stringify(value)),
    session,
  );
  const state = {
    errors: [],
    blockedExternal: [],
    summaries: [],
    registrationQueries: [],
    overrides: new Map(),
    nextDelayedEvent: null,
    delayed: null,
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
    const request = route.request(),
      url = new URL(request.url());
    if (url.hostname === authHost) {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers":
          "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
        "access-control-allow-methods": "GET,OPTIONS",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      if (request.method() === "GET" && url.pathname.endsWith("/user"))
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
        ...flags,
      });
    if (url.pathname === "/api/v1/me/access")
      return json(route, {
        account: {
          id: user.id,
          email: user.email,
          profile: { name: "Organizador fictício" },
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
            healthEventIds:
              role === "HEALTH" ? visibleEvents.map((event) => event.id) : [],
          },
        ],
      });
    if (url.pathname === `${base}/events` && request.method() === "GET")
      return json(route, visibleEvents);
    const match = url.pathname.match(
      new RegExp(`^${base}/events/([^/]+)/registration-summary$`),
    );
    if (match && request.method() === "GET") {
      assert.notEqual(
        role,
        "HEALTH",
        "Saúde não deve solicitar o resumo de inscrições.",
      );
      const event = visibleEvents.find((item) => item.id === match[1]);
      if (!event) return json(route, {}, 404);
      state.summaries.push({ eventId: event.id, query: url.search });
      assert(
        !url.searchParams.has("campaignId") &&
          !url.searchParams.has("campaign"),
        "O filtro de campanha deve usar o resumo carregado.",
      );
      const value = structuredClone(
        state.overrides.get(event.id) ?? summary(event, volunteersOnly),
      );
      if (state.nextDelayedEvent === event.id) {
        state.nextDelayedEvent = null;
        let release;
        const held = new Promise((resolve) => {
          release = resolve;
        });
        let finished;
        const done = new Promise((resolve) => {
          finished = resolve;
        });
        state.delayed = { release, done };
        await held;
        try {
          await json(route, value);
        } catch {
          /* A troca de evento pode abortar a resposta antiga. */
        }
        finished();
        return;
      }
      return json(route, value);
    }
    if (
      url.pathname === `${base}/registrations` &&
      request.method() === "GET"
    ) {
      state.registrationQueries.push(Object.fromEntries(url.searchParams));
      return json(route, { items: [], total: 0, page: 1, pageSize: 20 });
    }
    if (url.pathname.startsWith("/api/v1/")) {
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
  await page.clock.install({ time: fixedTime });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => state.errors.push(error.message));
  return { context, page, state, volunteersOnly };
}

function card(page, label, value) {
  return page.getByRole("link", {
    name: `${label}: ${value}. Ver inscrições`,
    exact: true,
  });
}
async function verifyCards(page, event, counts, campaign) {
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  for (const definition of cards) {
    const link = card(page, definition.label, definition.value(counts));
    await expect(link).toBeVisible();
    const url = new URL(await link.getAttribute("href"), target);
    assert.equal(url.pathname, `/organizacao/${orgId}/inscricoes`);
    assert.equal(url.searchParams.get("evento"), event.id);
    assert.equal(url.searchParams.get("campaign"), campaign?.id ?? null);
    assert.equal(url.searchParams.get("status"), definition.status ?? null);
    assert.equal(url.searchParams.get("presence"), definition.presence ?? null);
    if (definition.includeClosed)
      assert.equal(url.searchParams.get("includeClosed"), "true");
  }
  await expect(
    page.getByRole("link", { name: /\. Ver inscrições$/ }),
  ).toHaveCount(5);
  assert.notEqual(
    counts.byStatus.CONFIRMED,
    counts.candidateGoing,
    "A fixture deve distinguir vaga confirmada de resposta Vou participar.",
  );
}
async function noOverflow(page) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "O painel não pode causar rolagem horizontal.",
  );
}
async function capture(page, name) {
  await page.screenshot({
    path: join(screenshots, `event-dashboard-${name}.png`),
    fullPage: true,
  });
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
    const { context, page, state } = await fixtureContext(browser, viewport);
    try {
      await page.goto(dashboardUrl());
      const active = byKey.ongoingNear;
      const current = summary(active);
      const eventSelector = page.getByRole("combobox", {
        name: "Evento",
        exact: true,
      });
      const campaignSelector = page.getByRole("combobox", {
        name: "Campanha",
        exact: true,
      });
      await expect(eventSelector).toHaveValue(active.id);
      await verifyCards(page, active, current.totals);
      assert.equal(new URL(page.url()).searchParams.get("evento"), active.id);
      assert.equal(
        state.summaries[0].eventId,
        active.id,
        "O padrão deve ser o evento em andamento mais próximo.",
      );
      await expect(
        page.getByText("Eventos cadastrados", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Eventos publicados", { exact: true }),
      ).toHaveCount(0);
      await noOverflow(page);
      if (screen === "mobile") {
        const boxes = await Promise.all(
          cards.map((definition) =>
            card(
              page,
              definition.label,
              definition.value(current.totals),
            ).boundingBox(),
          ),
        );
        assert(boxes.every(Boolean));
        assert(
          Math.abs(boxes[0].y - boxes[1].y) <= 2,
          "Os dois primeiros cartões devem dividir a primeira linha no celular.",
        );
        assert(
          boxes[1].x >= boxes[0].x + boxes[0].width - 1,
          "Os cartões móveis não podem se sobrepor.",
        );
        assert(
          boxes[2].y >= boxes[0].y + boxes[0].height - 1,
          "O terceiro cartão deve iniciar a segunda linha.",
        );
        assert(
          boxes[4].y >= boxes[2].y + boxes[2].height - 1,
          "O quinto cartão deve iniciar a terceira linha.",
        );
      }
      await capture(page, `${screen}-all-campaigns`);

      const campaign = current.campaigns.find(
        (item) => item.kind === "VOLUNTEER",
      );
      const summaryReads = state.summaries.length;
      await campaignSelector.selectOption(campaign.id);
      await verifyCards(page, active, campaign, campaign);
      assert.equal(
        new URL(page.url()).searchParams.get("campaign"),
        campaign.id,
      );
      assert.equal(
        state.summaries.length,
        summaryReads,
        "Selecionar campanha usa os totais locais do resumo.",
      );
      await capture(page, `${screen}-volunteers`);
      await card(page, "Vou participar", campaign.candidateGoing).click();
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(`/organizacao/${orgId}/inscricoes`);
      assert.equal(new URL(page.url()).searchParams.get("presence"), "VOU");
      assert.equal(
        new URL(page.url()).searchParams.get("campaign"),
        campaign.id,
      );
      await expect
        .poll(() => state.registrationQueries.length)
        .toBeGreaterThan(0);
      assert.equal(state.registrationQueries.at(-1).presence, "VOU");
      await page.goBack();
      await expect(eventSelector).toHaveValue(active.id);
      await expect(campaignSelector).toHaveValue(campaign.id);
      await verifyCards(page, active, campaign, campaign);
      await campaignSelector.selectOption("");
      await verifyCards(page, active, current.totals);

      const historic = byKey.pastRecent;
      await eventSelector.selectOption(historic.id);
      await verifyCards(page, historic, summary(historic).totals);
      assert.equal(new URL(page.url()).searchParams.get("evento"), historic.id);
      assert.equal(new URL(page.url()).searchParams.get("campaign"), null);
      await page.reload();
      await expect(eventSelector).toHaveValue(historic.id);
      await verifyCards(page, historic, summary(historic).totals);
      await capture(page, `${screen}-historic`);

      // A resposta demorada de outro evento não pode substituir o evento atual.
      state.nextDelayedEvent = byKey.futureNear.id;
      await eventSelector.selectOption(byKey.futureNear.id);
      await expect.poll(() => Boolean(state.delayed)).toBe(true);
      await expect(
        card(page, "Inscritos", summary(historic).totals.total),
      ).toHaveCount(0);
      await eventSelector.selectOption(active.id);
      await verifyCards(page, active, current.totals);
      state.delayed.release();
      await state.delayed.done;
      await page.waitForTimeout(100);
      await verifyCards(page, active, current.totals);
      await expect(eventSelector).toHaveValue(active.id);

      const updated = structuredClone(current);
      updated.totals.total++;
      updated.totals.byStatus.RECEIVED++;
      updated.campaigns[0].total++;
      updated.campaigns[0].byStatus.RECEIVED++;
      updated.generatedAt = "2026-11-16T12:01:00.000Z";
      state.overrides.set(active.id, updated);
      const beforeRefresh = state.summaries.length;
      await page
        .getByRole("button", { name: "Atualizar resumo", exact: true })
        .click();
      await expect
        .poll(() => state.summaries.length)
        .toBeGreaterThan(beforeRefresh);
      await verifyCards(page, active, updated.totals);
      const beforeInterval = state.summaries.length;
      await page.clock.fastForward(30_100);
      await expect
        .poll(() => state.summaries.length)
        .toBeGreaterThan(beforeInterval);
      await verifyCards(page, active, updated.totals);

      updated.presenceAvailable = false;
      state.overrides.set(active.id, updated);
      await page
        .getByRole("button", { name: "Atualizar resumo", exact: true })
        .click();
      await expect(
        page.getByRole("link", { name: /^Vou participar:/ }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Vou participar", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("—", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("link", { name: /\. Ver inscrições$/ }),
      ).toHaveCount(4);
      await noOverflow(page);
      await capture(page, `${screen}-presence-unavailable`);
      assert.deepEqual(state.errors, []);
      console.log(
        `event-dashboard ${screen}: evento, cinco totais, campanhas, links, atualização e resposta antiga OK`,
      );
    } catch (error) {
      await capture(page, `${screen}-failure`).catch(() => {});
      throw error;
    } finally {
      state.delayed?.release();
      await context.close();
    }
  }

  for (const [name, fixtureEvents, expected] of [
    [
      "upcoming-default",
      events.filter((event) => !event.key.startsWith("ongoing")),
      byKey.futureNear,
    ],
    [
      "past-default",
      events.filter((event) => event.key.startsWith("past")),
      byKey.pastRecent,
    ],
  ]) {
    const { context, page, state } = await fixtureContext(
      browser,
      { width: 1536, height: 1000 },
      { events: fixtureEvents },
    );
    try {
      await page.goto(dashboardUrl());
      await expect(
        page.getByRole("combobox", { name: "Evento", exact: true }),
      ).toHaveValue(expected.id);
      await verifyCards(page, expected, summary(expected).totals);
      assert.equal(state.summaries[0].eventId, expected.id);
      assert.deepEqual(state.errors, []);
      console.log(`event-dashboard ${name}: seleção automática OK`);
    } finally {
      await context.close();
    }
  }

  {
    const { context, page, state } = await fixtureContext(
      browser,
      { width: 390, height: 844 },
      { events: [] },
    );
    try {
      await page.goto(dashboardUrl());
      await expect(page.getByText(/Nenhum evento/i).first()).toBeVisible();
      await expect(
        page.getByRole("link", { name: /\. Ver inscrições$/ }),
      ).toHaveCount(0);
      assert.equal(state.summaries.length, 0);
      await noOverflow(page);
      await capture(page, "mobile-no-events");
      assert.deepEqual(state.errors, []);
      console.log("event-dashboard no-events: estado vazio sem resumo OK");
    } finally {
      await context.close();
    }
  }

  {
    const { context, page, state } = await fixtureContext(
      browser,
      { width: 1536, height: 1000 },
      { role: "HEALTH" },
    );
    try {
      await page.goto(dashboardUrl(byKey.ongoingNear));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      assert.equal(
        state.summaries.length,
        0,
        "Saúde não deve solicitar o resumo de inscrições.",
      );
      await expect(
        page.getByRole("link", { name: /\. Ver inscrições$/ }),
      ).toHaveCount(0);
      assert.deepEqual(state.errors, []);
      console.log("event-dashboard HEALTH: nenhum resumo solicitado OK");
    } finally {
      await context.close();
    }
  }

  {
    const { context, page, state } = await fixtureContext(
      browser,
      { width: 1536, height: 1000 },
      {
        role: "SECRETARY",
        features: {
          eventsEnabled: false,
          camperRegistrationsEnabled: false,
          camperRegistrationsReady: false,
        },
      },
    );
    try {
      await page.goto(dashboardUrl());
      const expected = summary(byKey.ongoingNear, true);
      await verifyCards(page, byKey.ongoingNear, expected.totals);
      await expect(
        page.getByRole("combobox", { name: "Campanha", exact: true }),
      ).toHaveCount(0);
      assert(state.summaries.length > 0);
      await capture(page, "desktop-volunteer-only-secretary");
      assert.deepEqual(state.errors, []);
      console.log(
        "event-dashboard volunteer-only SECRETARY: resumo de servos disponível OK",
      );
    } finally {
      await context.close();
    }
  }
  console.log(
    "Painel de eventos: navegador concluído com dados fictícios e destinos externos bloqueados.",
  );
} finally {
  await browser.close();
}
