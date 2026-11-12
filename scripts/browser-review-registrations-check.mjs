import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

// React real e serviços fictícios: nenhuma conexão com dados ou mensageria reais.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5174";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Execute somente contra a aplicação local.");
const orgId = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000003";
const campaignId = "00000000-0000-4000-8000-000000000004";
const teamId = "00000000-0000-4000-8000-000000000005";
const otherEventId = "00000000-0000-4000-8000-000000000006";
const authHost = "auth.encontro.invalid";
const user = {
  id: "00000000-0000-4000-8000-000000000002",
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
      sub: user.id,
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
const organization = {
  id: orgId,
  name: "Paróquia do teste de inscrições",
  city: "Loanda",
  state: "PR",
  kind: "PARISH",
  active: true,
};
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
  for (const viewport of [
    { width: 1536, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 430, height: 932 },
  ]) {
    const mobile = viewport.width <= 800;
    const screenLabel = mobile
      ? viewport.width === 390
        ? "mobile"
        : `mobile-${viewport.width}`
      : "desktop";
    const context = await browser.newContext({
      viewport,
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(
      (value) =>
        localStorage.setItem("sb-auth-auth-token", JSON.stringify(value)),
      session,
    );
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.__fixtureClipboard = value;
          },
          write: async (items) => {
            window.__fixtureClipboard = await (
              await items[0].getType("text/plain")
            ).text();
          },
        },
      });
    });
    const errors = [],
      queries = [],
      changes = [];
    let emails = 0,
      detailReads = 0,
      noticeReads = 0,
      noticeRenewals = 0,
      guardianRenewals = 0,
      testingResponseFilters = false;
    const event = {
      id: eventId,
      organizationId: orgId,
      name: "3º Acampamento FAC",
      description: "Evento fictício",
      startsAt: "2028-02-05",
      endsAt: "2028-02-09",
      location: "Comunidade Santa Teresinha",
      city: "Loanda",
      status: "PUBLISHED",
      spiritualityStartsAt: "2026-11-14T17:00:00.000Z",
      type: { name: "FAC" },
      departmentsReady: true,
      imageThumbnailUrl: `${target}/fixture-banner.svg`,
      imageUrl: `${target}/fixture-banner.svg`,
      campaigns: [
        {
          id: campaignId,
          kind: "VOLUNTEER",
          allowWaitlist: true,
          _count: { registrations: 4 },
        },
      ],
      teams: [
        {
          id: teamId,
          eventId,
          name: "SECRETARIA",
          capacity: 5,
          occupied: 1,
          available: 4,
        },
      ],
    };
    const people = [
      "Ágata Silva",
      "Bruno Souza",
      "Carla Oliveira",
      "Daniel Lima",
    ];
    const rows = people.map((name, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 11).padStart(12, "0")}`,
      protocol: `INS-TESTE-${index + 1}`,
      person: { name, phone: "44999999999" },
      status: index === 2 ? "REJECTED" : index === 1 ? "APPROVED" : "RECEIVED",
      origin: index === 1 ? "IMPORT" : "PUBLIC_FORM",
      ...(index === 1
        ? {
            importData: {
              pending: [
                "Adicionar foto do participante.",
                "Aceitar os termos atuais da inscrição.",
              ],
            },
            pendingInformation: [
              "Adicionar foto do participante.",
              "Aceitar os termos atuais da inscrição.",
            ],
          }
        : {}),
      accountId: user.id,
      team: index === 1 ? event.teams[0] : null,
      createdAt: `2026-10-${index + 10}T12:00:00Z`,
      updatedAt: "2026-11-11T12:00:00Z",
      snapshot: {
        name,
        phone: "44999999999",
        email: "candidato@example.test",
        birthDate: "1990-01-01",
        answers: {},
      },
      history: [],
      campaign: {
        ...event.campaigns[0],
        event: {
          id: eventId,
          name: event.name,
          startsAt: event.startsAt,
          spiritualityStartsAt: event.spiritualityStartsAt,
        },
      },
      form: { config: { questions: [], terms: "Termos fictícios" } },
    }));
    Object.assign(rows[0].snapshot, {
      phone: "44988776655",
      email: "privado@example.test",
      cpf: "123.456.789-09",
      address: "Rua de Testes, 123",
      emergencyName: "Contato de Emergência Fictício",
      emergencyPhone: "44985554433",
      emergencyRelationship: "Mãe",
      answers: { "test-experience": "Resposta reservada da ficha." },
    });
    rows[0].form.config.questions = [
      {
        id: "test-experience",
        label: "Experiência informada",
        type: "text",
        required: false,
      },
    ];
    rows[0].history = [
      {
        id: "history-fixture",
        toStatus: "REVIEW",
        createdAt: "2026-11-10T12:00:00Z",
        reason: "Análise preliminar fictícia.",
      },
    ];
    rows[1].accountId = null;
    Object.assign(rows[1].snapshot, {
      birthDate: "2012-01-01",
      guardianName: "Responsável Fictício",
      guardianPhone: "44982221100",
      guardianRelationship: "Mãe",
    });
    rows[1].importData.source = {
      fileName: "Inscrições anteriores de teste.csv",
    };
    rows[1].importData.original = {
      headers: ["Nome", "Observação original"],
      cells: [rows[1].person.name, "Resposta original reservada."],
    };
    const notices = new Map();
    const guardian = {
      id: "guardian-fixture",
      signedAt: null,
      expiresAt: "2028-01-10T12:00:00Z",
      emailStatus: "PENDENTE",
      expired: false,
      active: true,
      link: `${target}/autorizacao/guardian-fixture#token=fixture`,
      whatsappLink: "https://wa.me/5544982221100?text=Autorizacao-ficticia",
      email: "responsavel@example.test",
      signedData: null,
      signature: null,
      termsText: "Termo fictício reservado.",
      receiptHash: null,
    };
    function makeNotice(row) {
      return {
        id: `notice-${row.id}`,
        kind: "ACEITE",
        emailStatus: "PENDENTE",
        emailSentAt: null,
        whatsappSentAt: null,
        confirmedAt: null,
        declinedAt: null,
        spirituality: {
          startsAt: event.spiritualityStartsAt,
          answer: row.spiritualityResponse ?? null,
          respondedAt: row.spiritualityRespondedAt ?? null,
          canRespond: true,
        },
        expiresAt: "2028-01-10T12:00:00Z",
        active: true,
        expired: false,
        email: row.snapshot.email,
        message: `Olá, ${row.person.name}! Departamento: ${row.team?.name ?? "A definir pela organização"}.`,
        link: `${target}/resposta/fixture#token=fixture`,
        shortLink: `${target}/r#fixture`,
        whatsappLink: "https://wa.me/5544999999999?text=convite-ficticio",
      };
    }
    notices.set(rows[1].id, makeNotice(rows[1]));
    const filteringRows = Array.from({ length: 25 }, (_, index) => {
      const row = structuredClone(rows[3]);
      row.id = `00000000-0000-4000-8000-${String(index + 301).padStart(12, "0")}`;
      row.protocol = `INS-FILTROS-${index + 1}`;
      row.person.name =
        [
          "Pessoa fictícia Ana Exemplo",
          "Pessoa fictícia Beatriz Exemplo",
          "Pessoa fictícia Caio Exemplo",
          "Pessoa fictícia Diana Exemplo",
        ][index] ?? `Pessoa fictícia ${String(index + 1).padStart(2, "0")}`;
      row.snapshot.name = row.person.name;
      row.status = index === 2 ? "REVIEW" : "APPROVED";
      row.team = [0, 2].includes(index) ? event.teams[0] : null;
      row.spiritualityResponse =
        index === 2 ? null : index === 1 ? false : true;
      row.spiritualityAt =
        row.spiritualityResponse === null ? null : event.spiritualityStartsAt;
      row.spiritualityRespondedAt =
        row.spiritualityResponse === null ? null : "2026-11-12T12:00:00.000Z";
      if (index !== 2) {
        const notice = makeNotice(row);
        if (index === 1) notice.declinedAt = "2026-11-12T12:00:00.000Z";
        else if (index !== 3) notice.confirmedAt = "2026-11-12T12:00:00.000Z";
        notices.set(row.id, notice);
      }
      return row;
    });
    function summary(row) {
      const notice = notices.get(row.id);
      if (!notice) return { ready: true, notice: null };
      const { link, shortLink, whatsappLink, message, email, ...safe } = notice;
      return { ready: true, notice: safe };
    }
    const json = (route, value, status = 200, headers = {}) =>
      route.fulfill({
        status,
        headers,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.hostname === authHost) {
        const headers = {
          "access-control-allow-origin": "*",
          "access-control-allow-headers":
            "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        };
        if (request.method() === "OPTIONS")
          return route.fulfill({ status: 204, headers });
        if (url.pathname.endsWith("/user"))
          return json(route, user, 200, headers);
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
            profile: {},
            platformAdmin: false,
          },
          organizations: [
            {
              id: "member",
              organizationId: orgId,
              accountId: user.id,
              organization,
              role: "ORGANIZER",
              active: true,
              healthEventIds: [],
            },
          ],
        });
      const base = `/api/v1/organizations/${orgId}`;
      if (url.pathname === `${base}/events`)
        return json(route, [
          event,
          {
            ...event,
            id: otherEventId,
            name: "Retiro de formação",
            teams: [],
            campaigns: [],
          },
        ]);
      if (url.pathname === `${base}/registrations`) {
        queries.push(url.searchParams.toString());
        const q = (url.searchParams.get("q") ?? "")
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase();
        let result = (testingResponseFilters ? filteringRows : rows).filter(
          (row) =>
            (url.searchParams.get("includeClosed") !== "false" ||
              !["REJECTED", "CANCELLED"].includes(row.status)) &&
            row.person.name
              .normalize("NFD")
              .replace(/\p{Diacritic}/gu, "")
              .toLowerCase()
              .includes(q),
        );
        if (url.searchParams.get("status"))
          result = result.filter(
            (row) => row.status === url.searchParams.get("status"),
          );
        if (url.searchParams.get("teamId"))
          result = result.filter((row) =>
            url.searchParams.get("teamId") === "NONE"
              ? !row.team
              : row.team?.id === url.searchParams.get("teamId"),
          );
        if (url.searchParams.get("presence"))
          result = result.filter((row) => {
            const notice = notices.get(row.id);
            const response =
              notice?.active && notice.kind === "ACEITE"
                ? notice.declinedAt
                  ? "NAO_IREI"
                  : notice.confirmedAt
                    ? "VOU"
                    : "SEM_RESPOSTA"
                : "SEM_RESPOSTA";
            return response === url.searchParams.get("presence");
          });
        if (url.searchParams.get("spirituality"))
          result = result.filter((row) => {
            const configured =
              row.campaign.kind === "VOLUNTEER" &&
              row.campaign.event.spiritualityStartsAt;
            const answered =
              row.spiritualityAt === configured &&
              row.spiritualityResponse != null;
            const response = answered
              ? row.spiritualityResponse
                ? "SIM"
                : "NAO"
              : "SEM_RESPOSTA";
            return (
              configured && response === url.searchParams.get("spirituality")
            );
          });
        const sort = url.searchParams.get("sort");
        result.sort((a, b) =>
          sort === "RECEIVED_ASC"
            ? a.createdAt.localeCompare(b.createdAt)
            : sort === "NAME_DESC"
              ? b.person.name.localeCompare(a.person.name, "pt-BR")
              : sort === "ACCEPTED_FIRST"
                ? Number(["APPROVED", "CONFIRMED"].includes(b.status)) -
                    Number(["APPROVED", "CONFIRMED"].includes(a.status)) ||
                  a.person.name.localeCompare(b.person.name, "pt-BR")
                : a.person.name.localeCompare(b.person.name, "pt-BR"),
        );
        const requestedPage = testingResponseFilters
          ? Number(url.searchParams.get("page") ?? 1)
          : 1;
        return json(route, {
          items: (testingResponseFilters
            ? result.slice((requestedPage - 1) * 20, requestedPage * 20)
            : result
          ).map((row) => ({
            ...row,
            decisionSummary: summary(row),
          })),
          total: result.length,
          page: requestedPage,
          pageSize: 20,
        });
      }
      const match = url.pathname.match(
        new RegExp(`^${base}/registrations/([^/]+)(.*)$`),
      );
      if (match) {
        const row = [...rows, ...filteringRows].find(
            (item) => item.id === match[1],
          ),
          suffix = match[2];
        if (!row) return json(route, {}, 404);
        if (!suffix) {
          detailReads++;
          return json(route, { ...row, decisionSummary: summary(row) });
        }
        if (suffix === "/guardian")
          return json(route, {
            ready: true,
            needsAuthorization: row.id === rows[1].id,
            authorization: row.id === rows[1].id ? guardian : null,
          });
        if (suffix === "/guardian/renew") {
          guardianRenewals++;
          guardian.link = `${target}/autorizacao/guardian-fixture#token=renewed-${guardianRenewals}`;
          return json(route, {
            ready: true,
            needsAuthorization: true,
            authorization: guardian,
          });
        }
        if (suffix === "/team" && request.method() === "PUT") {
          const { teamId: value } = request.postDataJSON();
          row.team = value ? event.teams.find((t) => t.id === value) : null;
          if (notices.has(row.id))
            notices.set(row.id, { ...notices.get(row.id), ...makeNotice(row) });
          changes.push("team");
          return json(route, row);
        }
        if (suffix === "/status" && request.method() === "PATCH") {
          const body = request.postDataJSON();
          assert(body.reason?.length >= 3);
          row.status = body.status;
          changes.push(body.status);
          if (body.status === "APPROVED") notices.set(row.id, makeNotice(row));
          else if (
            [
              "RECEIVED",
              "REVIEW",
              "WAITLIST",
              "REJECTED",
              "CANCELLED",
            ].includes(body.status) &&
            notices.has(row.id)
          )
            notices.get(row.id).active = false;
          if (["REJECTED", "CANCELLED"].includes(body.status)) row.team = null;
          return json(route, row);
        }
        if (suffix === "/decision-notice") {
          noticeReads++;
          return json(route, {
            ready: true,
            notice: notices.get(row.id) ?? null,
          });
        }
        if (suffix.startsWith("/decision-notice/")) {
          const notice = notices.get(row.id);
          assert(notice);
          if (suffix.endsWith("/whatsapp-sent"))
            notice.whatsappSentAt = new Date().toISOString();
          else if (suffix.endsWith("/email")) {
            notice.emailStatus = "ENVIADA";
            notice.emailSentAt = new Date().toISOString();
            emails++;
          } else if (suffix.endsWith("/renew")) {
            noticeRenewals++;
            notice.expired = false;
            notice.expiresAt = "2028-01-11T12:00:00Z";
            notice.shortLink = `${target}/r#renewed-fixture-${noticeRenewals}`;
          }
          return json(route, { ready: true, notice });
        }
      }
      if (url.pathname === "/fixture-banner.svg")
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><rect width="800" height="300" fill="#10285d"/><text x="40" y="180" fill="#f4c158" font-size="70">FAC 2028</text></svg>',
        });
      if (url.hostname === "wa.me")
        return route.fulfill({
          contentType: "text/html",
          body: "<p>Conversa fictícia do WhatsApp</p>",
        });
      if (url.pathname.startsWith("/api/v1/")) {
        errors.push(`API inesperada: ${url.pathname}`);
        return json(route, {}, 400);
      }
      if (url.hostname === "fonts.googleapis.com")
        return route.fulfill({ contentType: "text/css", body: "" });
      if (url.origin === new URL(target).origin) return route.continue();
      errors.push(`Destino externo: ${url.hostname}`);
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(15000);
    try {
      await page.goto(`${target}/organizacao/${orgId}/inscricoes`);
      await expect(
        page.getByText(event.name, { exact: true }).first(),
      ).toBeVisible();
      if (mobile) {
        const menu = page.getByRole("button", {
          name: "Menu da organização",
          exact: true,
        });
        await expect(menu).toHaveAttribute("aria-expanded", "false");
        await menu.tap();
        await expect(
          page.getByRole("navigation", { name: "Organização", exact: true }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu).toHaveAttribute("aria-expanded", "false");
      }
      await page.screenshot({
        path: `.local/screenshots/review-events-${screenLabel}.png`,
        fullPage: true,
      });
      await page.getByText(event.name, { exact: true }).first().click();
      await expect(
        page.getByRole("tab", { name: "Inscrições", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByText("Ágata Silva", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Carla Oliveira", { exact: true }),
      ).toHaveCount(0);
      assert.equal(
        noticeReads,
        0,
        "A tabela não deve carregar aviso individual por linha.",
      );
      assert.equal(
        detailReads,
        0,
        "A tabela não deve carregar ficha individual por linha.",
      );
      const displayMode = page.getByRole("group", {
        name: "Modo de exibição",
        exact: true,
      });
      if (mobile) {
        await expect(displayMode).toHaveCount(0);
        await expect(
          page.getByRole("list", { name: "Inscrições em cards", exact: true }),
        ).toBeVisible();
      } else {
        await expect(displayMode).toBeVisible();
        await expect(
          displayMode.getByRole("button", { name: "Lista", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("table")).toBeVisible();
        const beforeModeParams = new URL(page.url()).searchParams;
        const beforeModeReads = queries.length;
        await displayMode
          .getByRole("button", { name: "Cards", exact: true })
          .click();
        const cardList = page.getByRole("list", {
          name: "Inscrições em cards",
          exact: true,
        });
        await expect(cardList).toBeVisible();
        await expect(
          displayMode.getByRole("button", { name: "Cards", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        assert.equal(new URL(page.url()).searchParams.get("exibicao"), "cards");
        const afterModeParams = new URL(page.url()).searchParams;
        afterModeParams.delete("exibicao");
        assert.equal(afterModeParams.toString(), beforeModeParams.toString());
        assert.equal(
          queries.length,
          beforeModeReads,
          "Trocar a exibição não deve consultar novamente as inscrições.",
        );
        assert(
          queries.every((query) => !new URLSearchParams(query).has("exibicao")),
        );
        await expect(cardList.getByRole("listitem")).toHaveCount(3);
        const brunoCard = cardList.getByRole("listitem").filter({
          has: page.getByText("Bruno Souza", { exact: true }),
        });
        const originalRowCount = rows.length;
        for (const [index, name] of [
          "Eduardo Lima",
          "Fernanda Alves",
          "Gabriel Costa",
          "Helena Santos",
          "Igor Nunes",
          "Júlia Rocha",
        ].entries()) {
          const extra = structuredClone(rows[3]);
          extra.id = `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`;
          extra.protocol = `INS-GRADE-${index + 1}`;
          extra.person.name = name;
          extra.snapshot.name = name;
          rows.push(extra);
        }
        await page
          .getByRole("button", { name: "Atualizar inscrições", exact: true })
          .click();
        await expect(cardList.getByRole("listitem")).toHaveCount(9);
        for (const [width, height, columns] of [
          [1366, 900, 3],
          [1600, 1000, 4],
          [1920, 1080, 5],
        ]) {
          await page.setViewportSize({ width, height });
          await expect(cardList).toBeVisible();
          await expect
            .poll(async () =>
              cardList.evaluate(
                (node) =>
                  getComputedStyle(node)
                    .gridTemplateColumns.split(/\s+/)
                    .filter(Boolean).length,
              ),
            )
            .toBe(columns);
          const cardBounds = await brunoCard.boundingBox();
          assert(
            cardBounds && cardBounds.width >= 299,
            "Os cartões devem conservar largura confortável.",
          );
          const firstGridCard = await cardList
            .getByRole("listitem")
            .first()
            .boundingBox();
          const lastFirstRow = await cardList
            .getByRole("listitem")
            .nth(columns - 1)
            .boundingBox();
          const firstSecondRow = await cardList
            .getByRole("listitem")
            .nth(columns)
            .boundingBox();
          assert(
            firstGridCard &&
              lastFirstRow &&
              firstSecondRow &&
              Math.abs(firstGridCard.y - lastFirstRow.y) <= 1 &&
              firstSecondRow.y >= firstGridCard.y + firstGridCard.height,
            "A grade deve ocupar as colunas disponíveis antes de iniciar a próxima linha.",
          );
          const controls = [
            brunoCard.getByRole("combobox", {
              name: "Decisão de Bruno Souza",
              exact: true,
            }),
            brunoCard.getByRole("button", {
              name: "Convite não enviado: Bruno Souza",
              exact: true,
            }),
            brunoCard.getByRole("button", {
              name: "Enviar convite por WhatsApp para Bruno Souza",
              exact: true,
            }),
            brunoCard.getByRole("button", {
              name: "Copiar link do candidato Bruno Souza",
              exact: true,
            }),
          ];
          const bounds = await Promise.all(
            controls.map((control) => control.boundingBox()),
          );
          assert(
            bounds.every(Boolean),
            "Os controles devem permanecer disponíveis no cartão de computador.",
          );
          for (let index = 0; index < bounds.length; index++) {
            const box = bounds[index];
            assert(
              box.height >= 44 && box.width >= 44,
              "Os controles devem manter área de clique adequada.",
            );
            assert(
              Math.abs(box.y - bounds[0].y) <= 1,
              "Decisão, convite e compartilhamento devem permanecer alinhados nos cards do computador.",
            );
            if (index)
              assert(
                box.x >= bounds[index - 1].x + bounds[index - 1].width - 1,
                "Controles não podem se sobrepor.",
              );
          }
          const detail = await brunoCard
            .getByRole("button", {
              name: "Abrir ficha de Bruno Souza",
              exact: true,
            })
            .boundingBox();
          assert(
            detail &&
              detail.x > cardBounds.x + cardBounds.width / 2 &&
              detail.y - cardBounds.y <= 16,
            "A ficha deve ficar no canto superior direito também no computador.",
          );
          assert(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
            "A grade não pode causar rolagem horizontal.",
          );
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: `.local/screenshots/review-desktop-cards-${columns}-columns.png`,
            fullPage: true,
          });
        }
        await page.setViewportSize({ width: 1200, height: 800 });
        await expect(displayMode).toHaveCount(0);
        await expect(page.getByRole("table")).toBeVisible();
        assert.equal(new URL(page.url()).searchParams.get("exibicao"), "cards");
        await page.setViewportSize({ width: 1280, height: 1400 });
        await expect(displayMode).toHaveCount(0);
        await expect(page.getByRole("table")).toBeVisible();
        await page.setViewportSize(viewport);
        await expect(cardList).toBeVisible();
        await expect(
          displayMode.getByRole("button", { name: "Cards", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        rows.splice(originalRowCount);
        await page
          .getByRole("button", { name: "Atualizar inscrições", exact: true })
          .click();
        await expect(cardList.getByRole("listitem")).toHaveCount(3);
        const listReads = queries.length;
        await displayMode
          .getByRole("button", { name: "Lista", exact: true })
          .click();
        await expect(page.getByRole("table")).toBeVisible();
        assert.equal(
          queries.length,
          listReads,
          "Voltar à lista não consulta novamente as inscrições.",
        );
        await displayMode
          .getByRole("button", { name: "Cards", exact: true })
          .click();
        await expect(cardList).toBeVisible();
        // The remaining desktop journey exercises all existing actions in cards.
      }
      const pendingCandidate = page.locator("tbody tr").filter({
        has: page.getByText("Ágata Silva", { exact: true }),
      });
      const pendingWhatsApp = pendingCandidate.getByRole("button", {
        name: "Enviar convite por WhatsApp para Ágata Silva",
        exact: true,
      });
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await expect(
        page.getByText("Disponível após o aceite", { exact: true }),
      ).toHaveCount(0);
      await expect(pendingWhatsApp).toHaveAttribute("aria-disabled", "true");
      const pendingCardBefore = await pendingCandidate.boundingBox();
      const pendingNoticeReads = noticeReads;
      const pendingPageCount = context.pages().length;
      // aria-disabled describes the blocked action, while the native button
      // still receives a click to explain why no conversation can be opened.
      if (mobile) await pendingWhatsApp.tap({ force: true });
      else await pendingWhatsApp.click({ force: true });
      const blockedHint = page.getByRole("tooltip");
      await expect(blockedHint).toHaveText("Disponível após o aceite");
      const hintBounds = await blockedHint.boundingBox();
      const pendingCardAfter = await pendingCandidate.boundingBox();
      assert(
        hintBounds &&
          hintBounds.x >= 0 &&
          hintBounds.y >= 0 &&
          hintBounds.x + hintBounds.width <= viewport.width &&
          hintBounds.y + hintBounds.height <= viewport.height,
        "O aviso pequeno deve permanecer dentro da tela.",
      );
      assert(
        pendingCardBefore &&
          pendingCardAfter &&
          Math.abs(pendingCardAfter.height - pendingCardBefore.height) <= 1,
        "O aviso não deve aumentar a altura do cartão.",
      );
      assert.equal(
        noticeReads,
        pendingNoticeReads,
        "Tentar abrir WhatsApp antes do aceite não consulta o convite.",
      );
      assert.equal(
        context.pages().length,
        pendingPageCount,
        "O aviso não deve abrir outra aba.",
      );
      await page.screenshot({
        path: `.local/screenshots/review-whatsapp-blocked-${screenLabel}.png`,
        fullPage: false,
      });
      await page.keyboard.press("Escape");
      await expect(blockedHint).toHaveCount(0);
      if (mobile) await pendingWhatsApp.tap({ force: true });
      else await pendingWhatsApp.click({ force: true });
      await expect(blockedHint).toBeVisible();
      await pendingCandidate.getByText("Ágata Silva", { exact: true }).click();
      await expect(blockedHint).toHaveCount(0);
      assert.equal(noticeReads, pendingNoticeReads);
      assert.equal(context.pages().length, pendingPageCount);
      if (!mobile) {
        const toolbar = page.locator(".review-toolbar");
        const controls = [
          toolbar.getByRole("searchbox"),
          toolbar.getByRole("combobox", { name: /^Ordenar/ }),
          toolbar.locator(".review-closed-toggle"),
          toolbar.getByRole("button", {
            name: "Atualizar inscrições",
            exact: true,
          }),
          toolbar.getByRole("button", { name: "Filtros", exact: true }),
        ];
        const bounds = await Promise.all(
          controls.map((control) => control.boundingBox()),
        );
        assert(
          bounds.every(Boolean),
          "Todos os controles da barra devem estar visíveis.",
        );
        for (const box of bounds) {
          assert(
            Math.abs(box.height - 46) <= 1,
            "Busca, ordenação e botões devem ter a mesma altura de 46 px.",
          );
          assert(
            Math.abs(box.y - bounds[0].y) <= 1,
            "Os controles da barra devem estar alinhados no topo.",
          );
        }
        assert(
          bounds[2].width >= 44 && bounds[2].width <= 48,
          "Ocultar inscrições deve ser um botão compacto de ícone.",
        );
        await expect(controls[2]).toHaveAttribute("aria-pressed", "false");
        await expect(controls[2]).toHaveAttribute(
          "title",
          "Mostrar recusadas e canceladas",
        );
        await page.screenshot({
          path: ".local/screenshots/review-toolbar-desktop.png",
          fullPage: true,
        });
      }
      const importedCandidate = page
        .locator("tbody tr")
        .filter({ has: page.getByText("Bruno Souza", { exact: true }) });
      await expect(
        importedCandidate.getByText("Complementação pendente", { exact: true }),
      ).toHaveCount(0);
      await importedCandidate
        .getByRole("button", {
          name: "Ver pendências de Bruno Souza",
          exact: true,
        })
        .click();
      const pendingDialog = page.getByRole("dialog", {
        name: "Informações pendentes",
        exact: true,
      });
      await expect(pendingDialog).toContainText(
        "Adicionar foto do participante.",
      );
      await expect(pendingDialog).toContainText(
        "Aceitar os termos atuais da inscrição.",
      );
      await page.screenshot({
        path: `.local/screenshots/review-pending-${screenLabel}.png`,
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(pendingDialog).toHaveCount(0);
      await expect(
        importedCandidate.getByRole("button", {
          name: /Enviar convite por WhatsApp/,
        }),
      ).toBeEnabled();
      if (mobile) {
        await page.evaluate(() => window.scrollTo(0, 0));
        const firstDepartment = page.getByRole("combobox", {
          name: "Departamento de Ágata Silva",
          exact: true,
        });
        const bounds = await firstDepartment.boundingBox();
        assert(
          bounds && bounds.y >= 0 && bounds.y + bounds.height < viewport.height,
          "O primeiro departamento deve estar acessível na primeira tela.",
        );
        assert.equal(
          await firstDepartment.evaluate(
            (node) => getComputedStyle(node).fontSize,
          ),
          "16px",
        );
        assert(
          bounds.height >= 44,
          "Campos precisam de área adequada ao toque.",
        );
        const firstCard = page.locator("tbody tr").filter({
          has: page.getByText("Ágata Silva", { exact: true }),
        });
        const cardBounds = await firstCard.boundingBox();
        assert(
          cardBounds && cardBounds.height <= 330,
          "O cartão móvel deve manter a ficha simples compacta, com até 330 px de altura.",
        );
        const nameFont = await firstCard
          .locator(".review-person-heading strong")
          .evaluate((node) =>
            Number.parseFloat(getComputedStyle(node).fontSize),
          );
        assert(
          nameFont <= 14,
          "O nome deve usar a escala compacta de até 14 px no celular.",
        );
        const actionBounds = await Promise.all([
          firstCard
            .getByRole("button", {
              name: "Abrir ficha de Ágata Silva",
              exact: true,
            })
            .boundingBox(),
          firstCard
            .getByRole("button", {
              name: "Enviar convite por WhatsApp para Ágata Silva",
              exact: true,
            })
            .boundingBox(),
          firstCard
            .getByRole("button", {
              name: "Copiar link do candidato Ágata Silva",
              exact: true,
            })
            .boundingBox(),
        ]);
        assert(
          actionBounds.every(Boolean),
          "Ficha, WhatsApp e cópia devem permanecer disponíveis no cartão.",
        );
        for (const action of actionBounds) {
          assert(
            action.width >= 44 && action.height >= 44 && action.height <= 48,
            "Ações compactas devem preservar área de toque de pelo menos 44 px.",
          );
        }
        const [fichaBounds, whatsappBounds, copyBounds] = actionBounds;
        const headingBounds = await firstCard
          .locator(".review-person-heading")
          .boundingBox();
        assert(
          fichaBounds.x > cardBounds.x + cardBounds.width / 2 &&
            fichaBounds.y >= cardBounds.y &&
            fichaBounds.y - cardBounds.y <= 16 &&
            fichaBounds.x + fichaBounds.width <=
              cardBounds.x + cardBounds.width,
          "A ficha deve ficar no canto superior direito, dentro do cartão.",
        );
        assert(
          headingBounds && Math.abs(headingBounds.y - fichaBounds.y) <= 5,
          "O nome deve permanecer no cabeçalho, ao lado do ícone da ficha.",
        );
        assert(
          Math.abs(whatsappBounds.y - copyBounds.y) <= 1 &&
            whatsappBounds.y > fichaBounds.y + fichaBounds.height,
          "WhatsApp e cópia devem ficar juntos abaixo do cabeçalho, separados da ficha.",
        );
        const mainControls = await Promise.all([
          importedCandidate
            .getByRole("combobox", {
              name: "Decisão de Bruno Souza",
              exact: true,
            })
            .boundingBox(),
          importedCandidate
            .getByRole("button", {
              name: "Convite não enviado: Bruno Souza",
              exact: true,
            })
            .boundingBox(),
          importedCandidate
            .getByRole("button", {
              name: "Enviar convite por WhatsApp para Bruno Souza",
              exact: true,
            })
            .boundingBox(),
          importedCandidate
            .getByRole("button", {
              name: "Copiar link do candidato Bruno Souza",
              exact: true,
            })
            .boundingBox(),
        ]);
        assert(
          mainControls.every(Boolean),
          "Decisão, convite e compartilhamento devem permanecer acessíveis.",
        );
        for (let index = 0; index < mainControls.length; index += 1) {
          const control = mainControls[index];
          assert(
            control.width >= 44 && control.height >= 44 && control.height <= 48,
            "Os quatro controles precisam manter área de toque de 44 px.",
          );
          assert(
            Math.abs(control.y - mainControls[0].y) <= 1,
            "Decisão, convite, WhatsApp e cópia devem ocupar a mesma linha no celular.",
          );
          if (index > 0)
            assert(
              control.x >=
                mainControls[index - 1].x + mainControls[index - 1].width,
              "Os controles da linha não devem se sobrepor.",
            );
        }
        assert.equal(
          await firstCard
            .locator(".review-cell-detail .review-action-label")
            .isVisible(),
          false,
          "A ficha no celular deve mostrar somente o ícone.",
        );
        const name = await firstCard
          .locator(".review-person-heading strong")
          .elementHandle();
        const ficha = await firstCard
          .getByRole("button", {
            name: "Abrir ficha de Ágata Silva",
            exact: true,
          })
          .elementHandle();
        assert(name && ficha);
        await name.evaluate((node) => {
          node.textContent = "Adaiane Possidônio Brunieri de Oliveira Silva";
        });
        const longNameBounds = await name.boundingBox();
        const longNameFicha = await ficha.boundingBox();
        assert(
          longNameBounds &&
            longNameFicha &&
            longNameBounds.x + longNameBounds.width <= longNameFicha.x,
          "O nome longo deve quebrar a linha sem passar por baixo do ícone da ficha.",
        );
        await name.evaluate((node) => {
          node.textContent = "Ágata Silva";
        });
        const importedName = await importedCandidate
          .locator(".review-person-heading strong")
          .boundingBox();
        const pendingIcon = await importedCandidate
          .getByRole("button", {
            name: "Ver pendências de Bruno Souza",
            exact: true,
          })
          .boundingBox();
        assert(
          importedName &&
            pendingIcon &&
            pendingIcon.x >= importedName.x + importedName.width,
          "O ícone de pendências deve continuar depois do nome.",
        );
        await page.screenshot({
          path: `.local/screenshots/review-mobile-inline-actions-${screenLabel}.png`,
          fullPage: true,
        });
      }
      await page.getByRole("tab", { name: "Departamentos e vagas" }).click();
      await expect(
        page.getByRole("button", { name: "Criar departamento" }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Inscrições", exact: true }).click();
      const search = page.getByRole("searchbox", { name: /pesquis|busc/i });
      await search.fill("agata");
      await expect(page.getByText("Bruno Souza", { exact: true })).toHaveCount(
        0,
      );
      assert(queries.some((q) => new URLSearchParams(q).get("q") === "agata"));
      await page.reload();
      await expect(search).toHaveValue("agata");
      await search.fill("");
      await expect(
        page.getByText("Bruno Souza", { exact: true }),
      ).toBeVisible();
      const openFilters = async () => {
        if (mobile)
          await page
            .getByRole("button", { name: /^Filtros e ordenação/ })
            .tap();
      };
      const closeFilters = async () => {
        if (mobile)
          await page.getByRole("button", { name: /^Ver .*inscri/ }).tap();
      };
      const ordering = page.getByRole("combobox", { name: /^Ordenar/ });
      await openFilters();
      await ordering.selectOption("NAME_DESC");
      await closeFilters();
      await expect(
        page.locator("tbody tr .review-person strong").first(),
      ).toHaveText("Daniel Lima");
      await openFilters();
      await page
        .getByRole("button", { name: /Recusadas e canceladas ocultas/i })
        .click();
      await expect(page.locator(".review-closed-toggle")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await closeFilters();
      await expect(
        page.getByText("Carla Oliveira", { exact: true }),
      ).toBeVisible();
      await openFilters();
      await ordering.selectOption("ACCEPTED_FIRST");
      await closeFilters();
      await expect(
        page.locator("tbody tr .review-person strong").first(),
      ).toHaveText("Bruno Souza");
      await openFilters();
      await ordering.selectOption("RECEIVED_ASC");
      await closeFilters();
      await expect(
        page.locator("tbody tr .review-person strong").first(),
      ).toHaveText("Ágata Silva");
      await openFilters();
      await ordering.selectOption("NAME_ASC");
      await page
        .getByRole("button", { name: /Recusadas e canceladas visíveis/i })
        .click();
      await expect(page.locator(".review-closed-toggle")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await closeFilters();
      await expect(
        page.getByText("Carla Oliveira", { exact: true }),
      ).toHaveCount(0);
      const candidate = page
        .locator("tr, article")
        .filter({ has: page.getByText("Ágata Silva", { exact: true }) })
        .last();
      await candidate
        .getByRole("combobox", { name: /departamento/i })
        .selectOption(teamId);
      await expect(candidate).toContainText(/sem reserva/i);
      await candidate
        .getByRole("combobox", { name: /decis/i })
        .selectOption("APPROVED");
      await expect(candidate).toContainText("Convite não enviado");
      assert.equal(emails, 0, "Aceitar não envia e-mail.");
      assert(changes.includes("APPROVED") && changes.includes("team"));
      await page.screenshot({
        path: `.local/screenshots/review-registrations-${screenLabel}.png`,
        fullPage: true,
      });
      if (mobile) {
        await page
          .getByText("Daniel Lima", { exact: true })
          .scrollIntoViewIfNeeded();
        await expect(search).toBeInViewport();
        await expect(
          page.getByRole("button", { name: /^Filtros e ordenação/ }),
        ).toBeInViewport();
      }
      await candidate.getByRole("button", { name: /ficha/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "Ágata Silva" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: "Ágata Silva", exact: true }),
      ).toHaveCount(1);
      for (const title of [
        "Dados pessoais e contato",
        "Participação e respostas",
        "Contato de emergência",
        "Departamento e decisão",
        "Convite e presença",
        "Histórico e vínculo",
      ]) {
        await expect(
          dialog.getByRole("button", { name: title, exact: true }),
        ).toHaveAttribute("aria-expanded", "false");
      }
      for (const value of [
        "44988776655",
        "privado@example.test",
        "123.456.789-09",
        "Rua de Testes, 123",
        "Contato de Emergência Fictício",
        "Resposta reservada da ficha.",
        "Análise preliminar fictícia.",
      ])
        await expect(dialog.getByText(value, { exact: true })).toBeHidden();
      await expect(
        dialog.getByRole("textbox", { name: "Link do candidato", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("region", {
          name: "Mensagem para o candidato",
          exact: true,
        }),
      ).toBeHidden();
      await page.screenshot({
        path: `.local/screenshots/review-detail-collapsed-${screenLabel}.png`,
        fullPage: false,
      });
      const personalSection = dialog.getByRole("button", {
        name: "Dados pessoais e contato",
        exact: true,
      });
      await personalSection.click();
      await expect(
        dialog.getByText("privado@example.test", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText("123.456.789-09", { exact: true }),
      ).toBeVisible();
      await personalSection.click();
      await expect(
        dialog.getByText("privado@example.test", { exact: true }),
      ).toBeHidden();
      const answersSection = dialog.getByRole("button", {
        name: "Participação e respostas",
        exact: true,
      });
      await answersSection.click();
      await expect(
        dialog.getByText("Resposta reservada da ficha.", { exact: true }),
      ).toBeVisible();
      await answersSection.click();
      const emergencySection = dialog.getByRole("button", {
        name: "Contato de emergência",
        exact: true,
      });
      await emergencySection.click();
      await expect(
        dialog.getByText("Contato de Emergência Fictício", { exact: true }),
      ).toBeVisible();
      await emergencySection.click();
      const historySection = dialog.getByRole("button", {
        name: "Histórico e vínculo",
        exact: true,
      });
      await historySection.click();
      await expect(
        dialog.getByText("Análise preliminar fictícia.", { exact: true }),
      ).toBeVisible();
      await historySection.click();
      const decisionSection = dialog.getByRole("button", {
        name: "Departamento e decisão",
        exact: true,
      });
      await decisionSection.click();
      await page.screenshot({
        path: `.local/screenshots/review-detail-expanded-${screenLabel}.png`,
        fullPage: false,
      });
      await dialog
        .getByLabel("Decisão sobre a candidatura")
        .selectOption("WAITLIST");
      await decisionSection.click();
      await expect(
        dialog.getByLabel("Decisão sobre a candidatura"),
      ).toBeHidden();
      await decisionSection.click();
      await expect(
        dialog.getByLabel("Decisão sobre a candidatura"),
      ).toHaveValue("WAITLIST");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page.getByRole("button", { name: "Continuar editando" }).click();
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Descartar e fechar" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        candidate.getByRole("button", { name: /ficha/i }),
      ).toBeFocused();
      await importedCandidate
        .getByRole("button", {
          name: "Abrir ficha de Bruno Souza",
          exact: true,
        })
        .click();
      const importedDialog = page.getByRole("dialog");
      await expect(
        importedDialog.getByRole("heading", {
          name: "Bruno Souza",
          exact: true,
        }),
      ).toHaveCount(1);
      const importSection = importedDialog.getByRole("button", {
        name: "Importação e pendências",
        exact: true,
      });
      await expect(importSection).toHaveAttribute("aria-expanded", "false");
      await expect(
        importedDialog.getByText("Resposta original reservada.", {
          exact: true,
        }),
      ).toBeHidden();
      await importedDialog
        .getByRole("button", { name: "Ver informações pendentes", exact: true })
        .click();
      await expect(importSection).toHaveAttribute("aria-expanded", "true");
      await expect(importSection).toBeFocused();
      await expect(
        importedDialog.getByText("Adicionar foto do participante.", {
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: `.local/screenshots/review-import-pending-section-${screenLabel}.png`,
        fullPage: false,
      });
      await importSection.click();
      const guardianSection = importedDialog.getByRole("button", {
        name: "Responsável e autorização",
        exact: true,
      });
      await expect(guardianSection).toHaveAttribute("aria-expanded", "false");
      await expect(
        importedDialog.getByRole("textbox", {
          name: "Link do responsável",
          exact: true,
        }),
      ).toHaveCount(0);
      await guardianSection.click();
      const guardianWhatsApp = importedDialog.getByRole("link", {
        name: "Enviar autorização pelo WhatsApp ao responsável",
        exact: true,
      });
      await expect(guardianWhatsApp).toBeVisible();
      await expect(
        importedDialog.getByRole("button", {
          name: "Copiar link do responsável",
          exact: true,
        }),
      ).toBeVisible();
      const beforeGuardianRenew = guardianRenewals;
      await importedDialog
        .getByRole("button", { name: "Renovar link", exact: true })
        .click();
      await expect(
        importedDialog.getByRole("button", {
          name: "Confirmar renovação",
          exact: true,
        }),
      ).toBeVisible();
      assert.equal(guardianRenewals, beforeGuardianRenew);
      await importedDialog
        .getByRole("button", { name: "Manter link atual", exact: true })
        .click();
      assert.equal(guardianRenewals, beforeGuardianRenew);
      await guardianSection.click();
      const importedHistory = importedDialog.getByRole("button", {
        name: "Histórico e vínculo",
        exact: true,
      });
      await importedHistory.click();
      const linkEmail = importedDialog.getByRole("textbox", {
        name: /^E-mail verificado da conta/,
      });
      await linkEmail.fill("novo-vinculo@example.test");
      await importedHistory.click();
      await importedHistory.click();
      await expect(linkEmail).toHaveValue("novo-vinculo@example.test");
      await linkEmail.fill("");
      await page.keyboard.press("Escape");
      await expect(importedDialog).toHaveCount(0);
      await candidate
        .getByRole("button", {
          name: "Copiar link do candidato Ágata Silva",
          exact: true,
        })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.__fixtureClipboard))
        .toBe(notices.get(rows[0].id).shortLink);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      assert.equal(
        notices.get(rows[0].id).whatsappSentAt,
        null,
        "Copiar o link não registra envio.",
      );
      const popupPromise = context.waitForEvent("page");
      await candidate
        .getByRole("button", {
          name: "Enviar convite por WhatsApp para Ágata Silva",
          exact: true,
        })
        .click();
      const whatsappPage = await popupPromise;
      await expect(whatsappPage).toHaveURL(/^https:\/\/wa\.me\//);
      await whatsappPage.close();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      assert.equal(notices.get(rows[0].id).whatsappSentAt, null);
      await candidate
        .getByRole("button", { name: /Marcar como enviado/i })
        .click();
      await expect(candidate).toContainText("Aguardando resposta");
      await candidate
        .getByRole("button", {
          name: "Aguardando resposta: Ágata Silva",
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page.getByRole("dialog").getByText(/Envio pelo WhatsApp registrado/),
      ).toBeVisible();
      const inviteDialog = page.getByRole("dialog");
      await expect(
        inviteDialog.getByRole("textbox", {
          name: "Link do candidato",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        inviteDialog.getByRole("region", {
          name: "Mensagem para o candidato",
          exact: true,
        }),
      ).toBeHidden();
      await inviteDialog
        .getByRole("button", { name: "Ver mensagem", exact: true })
        .click();
      await expect(
        inviteDialog.getByRole("region", {
          name: "Mensagem para o candidato",
          exact: true,
        }),
      ).toContainText(notices.get(rows[0].id).message);
      await inviteDialog
        .getByRole("button", { name: "Ocultar mensagem", exact: true })
        .click();
      await expect(
        inviteDialog.getByRole("region", {
          name: "Mensagem para o candidato",
          exact: true,
        }),
      ).toBeHidden();
      await page.evaluate(() => {
        navigator.clipboard.writeText = async () => {
          throw new Error("Clipboard indisponível no teste");
        };
      });
      await inviteDialog
        .getByRole("button", { name: "Copiar link do candidato", exact: true })
        .click();
      await expect(
        inviteDialog.getByRole("button", {
          name: "Exibir link para copiar manualmente",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        inviteDialog.getByRole("textbox", {
          name: "Link do candidato",
          exact: true,
        }),
      ).toHaveCount(0);
      await inviteDialog
        .getByRole("button", {
          name: "Exibir link para copiar manualmente",
          exact: true,
        })
        .click();
      await expect(
        inviteDialog.getByRole("textbox", {
          name: "Link do candidato",
          exact: true,
        }),
      ).toHaveValue(notices.get(rows[0].id).shortLink);
      await page.evaluate(() => {
        navigator.clipboard.writeText = async (value) => {
          window.__fixtureClipboard = value;
        };
      });
      const beforeNoticeRenew = noticeRenewals;
      await inviteDialog
        .getByRole("button", { name: "Renovar link", exact: true })
        .click();
      await expect(
        inviteDialog.getByRole("button", {
          name: "Confirmar renovação",
          exact: true,
        }),
      ).toBeVisible();
      assert.equal(
        noticeRenewals,
        beforeNoticeRenew,
        "Pedir renovação não pode invalidar o link imediatamente.",
      );
      await inviteDialog
        .getByRole("button", { name: "Manter link atual", exact: true })
        .click();
      assert.equal(noticeRenewals, beforeNoticeRenew);
      await inviteDialog
        .getByRole("button", { name: "Renovar link", exact: true })
        .click();
      await inviteDialog
        .getByRole("button", { name: "Confirmar renovação", exact: true })
        .click();
      await expect.poll(() => noticeRenewals).toBe(beforeNoticeRenew + 1);
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.local/screenshots/review-quick-share-${screenLabel}.png`,
        fullPage: true,
      });
      if (mobile) {
        for (const name of [
          "Enviar convite por WhatsApp para Ágata Silva",
          "Copiar link do candidato Ágata Silva",
        ]) {
          const actionBounds = await candidate
            .getByRole("button", { name, exact: true })
            .boundingBox();
          assert(
            actionBounds &&
              actionBounds.width >= 44 &&
              actionBounds.height >= 44 &&
              actionBounds.height <= 80,
            "Compartilhamento precisa de botões legíveis e área de toque adequada.",
          );
        }
      }
      notices.get(rows[0].id).confirmedAt = new Date().toISOString();
      await openFilters();
      await page
        .getByRole("button", { name: /atualizar (lista|inscri)/i })
        .click();
      await closeFilters();
      await expect(candidate).toContainText("Vou participar");
      notices.get(rows[1].id).confirmedAt = new Date().toISOString();
      await importedCandidate
        .getByRole("combobox", { name: /Decisão de/ })
        .selectOption("CONFIRMED");
      await expect(
        importedCandidate.getByRole("combobox", { name: /Decisão de/ }),
      ).toHaveValue("CONFIRMED");
      assert.equal(rows[1].status, "CONFIRMED");
      assert.equal(
        rows[1].importData.pending.length,
        2,
        "Confirmar vaga não apaga pendências.",
      );
      await expect(
        importedCandidate.getByRole("button", {
          name: "Ver pendências de Bruno Souza",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        importedCandidate.getByRole("button", {
          name: /Enviar convite por WhatsApp/,
        }),
      ).toBeEnabled();
      await page.screenshot({
        path: `.local/screenshots/review-presence-${screenLabel}.png`,
        fullPage: true,
      });
      await candidate
        .getByRole("combobox", { name: /Decisão de/ })
        .selectOption("RECEIVED");
      await expect(
        candidate.getByRole("combobox", { name: /Decisão de/ }),
      ).toHaveValue("RECEIVED");
      await expect(
        candidate.getByRole("combobox", { name: /Departamento de/ }),
      ).toHaveValue(teamId);
      await expect(candidate).toContainText("Indicado — sem reserva");
      await expect(
        candidate.getByRole("button", { name: /Enviar convite por WhatsApp/ }),
      ).toHaveAttribute("aria-disabled", "true");
      assert.equal(
        notices.get(rows[0].id).active,
        false,
        "Reabrir invalida o convite anterior.",
      );
      await candidate
        .getByRole("combobox", { name: /Decisão de/ })
        .selectOption("REVIEW");
      await expect(
        candidate.getByRole("combobox", { name: /Decisão de/ }),
      ).toHaveValue("REVIEW");
      await candidate
        .getByRole("combobox", { name: /Decisão de/ })
        .selectOption("APPROVED");
      await expect(candidate).toContainText("Convite não enviado");
      assert.equal(
        notices.get(rows[0].id).confirmedAt,
        null,
        "O novo aceite não reutiliza presença anterior.",
      );
      assert.equal(
        emails,
        0,
        "Corrigir decisões não envia e-mail automaticamente.",
      );
      await page.screenshot({
        path: `.local/screenshots/review-reopened-${screenLabel}.png`,
        fullPage: true,
      });
      await page.goto(
        `${target}/organizacao/${orgId}/inscricoes?inscricao=${rows[0].id}`,
      );
      await expect(
        page.getByRole("dialog").getByRole("heading", { name: "Ágata Silva" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "A página não pode ter rolagem horizontal.",
      );
      testingResponseFilters = true;
      await page.goto(
        `${target}/organizacao/${orgId}/inscricoes?evento=${eventId}&q=ficticia&sort=NAME_DESC&page=2`,
      );
      await expect(
        page.getByText("Página 2 de 2", { exact: true }),
      ).toBeVisible();
      const campFilter = page.getByRole("combobox", {
        name: "Participação no acampamento",
        exact: true,
      });
      const spiritualityFilter = page.getByRole("combobox", {
        name: "Espiritualidade",
        exact: true,
      });
      const openResponseFilters = async () => {
        const trigger = page.getByRole("button", {
          name: mobile ? /^Filtros e ordenação/ : "Filtros",
          exact: !mobile,
        });
        await expect(trigger).toBeVisible();
        if ((await trigger.getAttribute("aria-expanded")) !== "true")
          await trigger.click();
        await expect(campFilter).toBeVisible();
      };
      const assertResponseQuery = async (presence, spirituality) => {
        await expect
          .poll(() => new URL(page.url()).searchParams.get("presence") ?? "")
          .toBe(presence);
        await expect
          .poll(
            () => new URL(page.url()).searchParams.get("spirituality") ?? "",
          )
          .toBe(spirituality);
        const params = new URL(page.url()).searchParams;
        assert.equal(params.get("q"), "ficticia");
        assert.equal(
          params.get("page"),
          null,
          "Mudar resposta retorna à primeira página.",
        );
        await expect
          .poll(() =>
            queries.some((query) => {
              const apiParams = new URLSearchParams(query);
              return (
                (apiParams.get("presence") ?? "") === presence &&
                (apiParams.get("spirituality") ?? "") === spirituality &&
                apiParams.get("page") === "1" &&
                apiParams.get("q") === "ficticia"
              );
            }),
          )
          .toBe(true);
      };
      const assertResponseDetail = async (
        row,
        campAnswer,
        spiritualityAnswer,
        screenshot,
      ) => {
        await page
          .getByRole("button", {
            name: `Abrir ficha de ${row.person.name}`,
            exact: true,
          })
          .click();
        const responseDialog = page.getByRole("dialog");
        await responseDialog
          .getByRole("button", {
            name: "Participação e respostas",
            exact: true,
          })
          .click();
        const answers = responseDialog.locator(
          ".registration-detail-invitation-answers",
        );
        await expect(
          answers.getByRole("heading", {
            name: "Respostas ao convite",
            exact: true,
          }),
        ).toBeVisible();
        const camp = answers
          .locator("dt")
          .filter({ hasText: /^Participação no acampamento$/ })
          .locator("..");
        const spirituality = answers
          .locator("dt")
          .filter({ hasText: /^Participação na espiritualidade$/ })
          .locator("..");
        await expect(camp.locator("dd strong")).toHaveText(campAnswer);
        await expect(spirituality.locator("dd strong")).toHaveText(
          spiritualityAnswer,
        );
        await expect(spirituality).toContainText("14/11/2026");
        if (campAnswer !== "Não respondeu")
          await expect(camp).toContainText("Respondido em");
        if (spiritualityAnswer !== "Não respondeu")
          await expect(spirituality).toContainText("Respondido em");
        await answers.scrollIntoViewIfNeeded();
        if (screenshot)
          await page.screenshot({
            path: `.local/screenshots/review-invitation-answers-${screenshot}-${screenLabel}.png`,
            fullPage: false,
            animations: "disabled",
          });
        await page.keyboard.press("Escape");
        await expect(responseDialog).toHaveCount(0);
      };
      await openResponseFilters();
      await campFilter.selectOption("SEM_RESPOSTA");
      await assertResponseQuery("SEM_RESPOSTA", "");
      assert.equal(new URL(page.url()).searchParams.get("sort"), "NAME_DESC");
      await closeFilters();
      await expect(page.locator("tbody tr .review-person strong")).toHaveText([
        filteringRows[3].person.name,
        filteringRows[2].person.name,
      ]);
      await openResponseFilters();
      await spiritualityFilter.selectOption("SEM_RESPOSTA");
      await assertResponseQuery("SEM_RESPOSTA", "SEM_RESPOSTA");
      await closeFilters();
      await expect(page.locator("tbody tr .review-person strong")).toHaveText([
        filteringRows[2].person.name,
      ]);
      await page.reload();
      await openResponseFilters();
      await expect(campFilter).toHaveValue("SEM_RESPOSTA");
      await expect(spiritualityFilter).toHaveValue("SEM_RESPOSTA");
      await spiritualityFilter.evaluate((element) =>
        element.scrollIntoView({ block: "center", behavior: "instant" }),
      );
      await expect(spiritualityFilter).toBeInViewport();
      await page.screenshot({
        path: `.local/screenshots/review-response-filters-${screenLabel}.png`,
        fullPage: !mobile,
        animations: "disabled",
      });
      await closeFilters();
      await assertResponseDetail(
        filteringRows[2],
        "Não respondeu",
        "Não respondeu",
        "pending",
      );
      await openResponseFilters();
      await campFilter.selectOption("VOU");
      await spiritualityFilter.selectOption("NAO");
      await assertResponseQuery("VOU", "NAO");
      await closeFilters();
      await expect(page.locator("tbody tr .review-person strong")).toHaveCount(
        0,
      );
      await openResponseFilters();
      await campFilter.selectOption("NAO_IREI");
      await assertResponseQuery("NAO_IREI", "NAO");
      await closeFilters();
      await expect(page.locator("tbody tr .review-person strong")).toHaveText([
        filteringRows[1].person.name,
      ]);
      await assertResponseDetail(
        filteringRows[1],
        "Não irei",
        "Não",
        "declined",
      );
      await openResponseFilters();
      await campFilter.selectOption("VOU");
      await spiritualityFilter.selectOption("SIM");
      await assertResponseQuery("VOU", "SIM");
      await closeFilters();
      await expect(page.locator("tbody tr .review-person strong")).toHaveCount(
        20,
      );
      await expect(
        page.getByText("Página 1 de 2", { exact: true }),
      ).toBeVisible();
      await assertResponseDetail(
        filteringRows[0],
        "Vou participar",
        "Sim",
        "confirmed",
      );
      await openResponseFilters();
      await campFilter.selectOption("SEM_RESPOSTA");
      await assertResponseQuery("SEM_RESPOSTA", "SIM");
      await closeFilters();
      await expect(page.locator("tbody tr .review-person strong")).toHaveText([
        filteringRows[3].person.name,
      ]);
      await assertResponseDetail(filteringRows[3], "Não respondeu", "Sim");
      await openResponseFilters();
      if (mobile)
        await page
          .getByRole("button", { name: "Limpar filtros", exact: true })
          .click();
      else {
        await campFilter.selectOption("");
        await spiritualityFilter.selectOption("");
      }
      await expect(campFilter).toHaveValue("");
      await expect(spiritualityFilter).toHaveValue("");
      await assertResponseQuery("", "");
      await closeFilters();
      await expect(page.locator("tbody tr .review-person strong")).toHaveCount(
        20,
      );
      const teamQueryStart = queries.length;
      await page.goto(
        `${target}/organizacao/${orgId}/inscricoes?evento=${eventId}&q=ficticia&sort=NAME_DESC&page=2`,
      );
      await expect(
        page.getByText("Página 2 de 2", { exact: true }),
      ).toBeVisible();
      const teamFilter = page.getByRole("combobox", {
        name: "Equipe/departamento",
        exact: true,
      });
      const assertTeamQuery = async (
        team,
        presence = "",
        spirituality = "",
        preserveSort = true,
      ) => {
        await expect
          .poll(() => new URL(page.url()).searchParams.get("team") ?? "")
          .toBe(team);
        await expect
          .poll(() => new URL(page.url()).searchParams.get("presence") ?? "")
          .toBe(presence);
        await expect
          .poll(() => new URL(page.url()).searchParams.get("spirituality") ?? "")
          .toBe(spirituality);
        const params = new URL(page.url()).searchParams;
        assert.equal(params.get("q"), "ficticia");
        if (preserveSort) assert.equal(params.get("sort"), "NAME_DESC");
        assert.equal(
          params.get("page"),
          null,
          "Mudar equipe retorna à primeira página.",
        );
        await expect
          .poll(() =>
            queries.slice(teamQueryStart).some((query) => {
              const apiParams = new URLSearchParams(query);
              return (
                (apiParams.get("teamId") ?? "") === team &&
                !apiParams.has("team") &&
                (apiParams.get("presence") ?? "") === presence &&
                (apiParams.get("spirituality") ?? "") === spirituality &&
                apiParams.get("page") === "1" &&
                apiParams.get("q") === "ficticia"
              );
            }),
          )
          .toBe(true);
      };
      await openResponseFilters();
      await expect(teamFilter.locator("option")).toHaveText([
        "Todos",
        "Sem departamento",
        "SECRETARIA",
      ]);
      await teamFilter.selectOption(teamId);
      await assertTeamQuery(teamId);
      await closeFilters();
      await expect(page.locator("tbody tr .review-person strong")).toHaveText([
        filteringRows[2].person.name,
        filteringRows[0].person.name,
      ]);
      const indicated = page.locator("tr").filter({
        has: page.getByText(filteringRows[2].person.name, { exact: true }),
      });
      await expect(indicated).toContainText("Indicado — sem reserva");
      assert.equal(filteringRows[0].status, "APPROVED");
      assert.equal(filteringRows[2].status, "REVIEW");
      await openResponseFilters();
      await teamFilter.evaluate((element) =>
        element.scrollIntoView({ block: "center", behavior: "instant" }),
      );
      await expect(teamFilter).toBeInViewport();
      await page.screenshot({
        path: `.local/screenshots/review-team-filter-${screenLabel}.png`,
        fullPage: !mobile,
        animations: "disabled",
      });
      await campFilter.selectOption("VOU");
      await spiritualityFilter.selectOption("SIM");
      await assertTeamQuery(teamId, "VOU", "SIM");
      await closeFilters();
      await expect(page.locator("tbody tr .review-person strong")).toHaveText([
        filteringRows[0].person.name,
      ]);
      await page.reload();
      await openResponseFilters();
      await expect(teamFilter).toHaveValue(teamId);
      await expect(campFilter).toHaveValue("VOU");
      await expect(spiritualityFilter).toHaveValue("SIM");
      await teamFilter.selectOption("NONE");
      await assertTeamQuery("NONE", "VOU", "SIM");
      await closeFilters();
      await expect(page.locator("tbody tr .review-person strong")).toHaveCount(
        20,
      );
      await expect(
        page.getByText(filteringRows[0].person.name, { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("Página 1 de 2", { exact: true }),
      ).toBeVisible();
      await openResponseFilters();
      await campFilter.selectOption("");
      await spiritualityFilter.selectOption("");
      await assertTeamQuery("NONE");
      await closeFilters();
      await expect(
        page.getByText("23 inscrições encontradas", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(filteringRows[2].person.name, { exact: true }),
      ).toHaveCount(0);
      await openResponseFilters();
      if (mobile)
        await page
          .getByRole("button", { name: "Limpar filtros", exact: true })
          .click();
      else await teamFilter.selectOption("");
      await expect(teamFilter).toHaveValue("");
      await assertTeamQuery("", "", "", !mobile);
      await closeFilters();
      await expect(
        page.getByText("25 inscrições encontradas", { exact: true }),
      ).toBeVisible();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "Filtros de resposta e ficha não podem criar rolagem horizontal.",
      );
      assert.deepEqual(errors, []);
      console.log(
        `Inscrições ${screenLabel}: fluxo existente preservado; respostas e filtro de equipe/departamento com indicados/alocados, sem departamento, combinação, URL, recarga, limpeza e paginação aprovados.`,
      );
    } catch (error) {
      if (errors.length) console.error(errors);
      await page.screenshot({
        path: `.local/screenshots/review-error-${screenLabel}.png`,
        fullPage: true,
      });
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
