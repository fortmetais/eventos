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
      noticeReads = 0;
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
        event: { id: eventId, name: event.name, startsAt: event.startsAt },
      },
      form: { config: { questions: [], terms: "Termos fictícios" } },
    }));
    const notices = new Map();
    function makeNotice(row) {
      return {
        id: `notice-${row.id}`,
        kind: "ACEITE",
        emailStatus: "PENDENTE",
        emailSentAt: null,
        whatsappSentAt: null,
        confirmedAt: null,
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
        let result = rows.filter(
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
        return json(route, {
          items: result.map((row) => ({
            ...row,
            decisionSummary: summary(row),
          })),
          total: result.length,
          page: 1,
          pageSize: 20,
        });
      }
      const match = url.pathname.match(
        new RegExp(`^${base}/registrations/([^/]+)(.*)$`),
      );
      if (match) {
        const row = rows.find((item) => item.id === match[1]),
          suffix = match[2];
        if (!row) return json(route, {}, 404);
        if (!suffix) {
          detailReads++;
          return json(route, row);
        }
        if (suffix === "/guardian")
          return json(route, {
            ready: true,
            needsAuthorization: false,
            authorization: null,
          });
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
            notice.expired = false;
            notice.expiresAt = "2028-01-11T12:00:00Z";
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
              name: "Enviar convite: Bruno Souza",
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
      await expect(candidate).toContainText("Enviar convite");
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
      await page.screenshot({
        path: `.local/screenshots/review-detail-${screenLabel}.png`,
        fullPage: true,
      });
      await dialog
        .getByLabel("Decisão sobre a candidatura")
        .selectOption("WAITLIST");
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
      await expect(candidate).toContainText("Aguardando confirmação");
      await candidate
        .getByRole("button", {
          name: "Aguardando confirmação: Ágata Silva",
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page.getByRole("dialog").getByText(/Envio pelo WhatsApp registrado/),
      ).toBeVisible();
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
      await expect(candidate).toContainText("Presença confirmada");
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
      await expect(candidate).toContainText("Enviar convite");
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
      assert.deepEqual(errors, []);
      console.log(
        `Inscrições ${screenLabel}: cards, abas, pesquisa/URL, indicação, aprovação, modal, WhatsApp direto, cópia de link, envio explícito, presença e link antigo aprovados.`,
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
