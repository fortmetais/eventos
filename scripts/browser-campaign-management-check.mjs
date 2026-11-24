import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { camperTemplate } from "../apps/api/dist/modules/events/camper-template.js";

// React real; somente API/Auth fictícios. Não consulta cadastros ou mensageria reais.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5180";
const origin = new URL(target).origin;
assert(
  ["localhost", "127.0.0.1"].includes(new URL(target).hostname),
  "Use somente a aplicação local.",
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const orgId = id(701),
  userId = id(702),
  eventId = id(703),
  volunteerId = id(704),
  camperId = id(705);
const volunteerTeam = id(706),
  camperTeam = id(707),
  newTeam = id(708);
const authHost = "auth.campaign-check.invalid";
const now = Math.floor(Date.now() / 1000);
const user = {
  id: userId,
  email: "organizador@campaign.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  email_confirmed_at: new Date().toISOString(),
};
const accessToken = [
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
  access_token: accessToken,
  refresh_token: "fixture",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: now + 3600,
  user,
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
  for (const mobile of [false, true]) {
    const label = mobile ? "mobile" : "desktop";
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1536, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(
      (value) =>
        localStorage.setItem("sb-auth-auth-token", JSON.stringify(value)),
      session,
    );
    const failures = [],
      changes = [];
    const organization = {
      id: orgId,
      name: "Organização das campanhas fictícias",
      city: "Loanda",
      state: "PR",
      active: true,
    };
    const campaigns = [
      {
        id: volunteerId,
        kind: "VOLUNTEER",
        paused: false,
        _count: { registrations: 4 },
      },
      {
        id: camperId,
        kind: "CAMPER",
        paused: true,
        _count: { registrations: 2 },
      },
    ].map((campaign) => ({
      ...campaign,
      eventId,
      opensAt: "2020-01-01T12:00:00Z",
      closesAt: "2028-01-31T21:00:00Z",
      capacity: 30,
      allowWaitlist: true,
      forms: [{ id: id(709), publishedAt: "2026-11-01T12:00:00Z" }],
    }));
    const event = {
      id: eventId,
      organizationId: orgId,
      name: "FAC Campanhas Separadas",
      type: { name: "FAC" },
      description: "Evento fictício",
      city: "Loanda",
      location: "Chácara",
      startsAt: "2028-02-05",
      endsAt: "2028-02-09",
      status: "PUBLISHED",
      organization,
      departmentsReady: true,
      campaigns,
      teams: [
        {
          id: volunteerTeam,
          eventId,
          name: "SECRETARIA",
          capacity: 5,
          occupied: 0,
          available: 5,
        },
      ],
    };
    const teams = {
      [volunteerId]: [
        {
          id: volunteerTeam,
          campaignId: volunteerId,
          kind: "VOLUNTEER",
          eventId,
          name: "SECRETARIA",
          capacity: 5,
        },
      ],
      [camperId]: [
        {
          id: camperTeam,
          campaignId: camperId,
          kind: "CAMPER",
          eventId,
          name: "AZUL",
          capacity: 2,
        },
      ],
    };
    const people = [
      [volunteerId, "Servo de demonstração"],
      [volunteerId, "Outra serva"],
      [volunteerId, "Terceiro servo"],
      [volunteerId, "Quarta serva"],
      [camperId, "Campista de demonstração"],
      [camperId, "Outra campista"],
    ].map(([campaignId, name], index) => ({
      id: id(720 + index),
      protocol: `INS-CAMPANHA-${index + 1}`,
      campaignId,
      campaign: { ...campaigns.find((item) => item.id === campaignId), event },
      person: {
        id: id(740 + index),
        name,
        birthDate: "1990-01-01",
        phone: "44999999999",
      },
      snapshot: {
        name,
        birthDate: "1990-01-01",
        phone: "44999999999",
        answers: {},
      },
      origin: "PUBLIC_FORM",
      status: "RECEIVED",
      teamId: null,
      team: null,
      createdAt: "2026-11-01T12:00:00Z",
      updatedAt: "2026-11-01T12:00:00Z",
      history: [],
      decisionSummary: { ready: true, notice: null },
    }));
    const campers = people.filter((person) => person.campaignId === camperId);
    const occupied = (teamId) =>
      people.filter(
        (person) =>
          person.teamId === teamId &&
          ["APPROVED", "CONFIRMED"].includes(person.status),
      ).length;
    const teamRows = (campaignId) =>
      teams[campaignId].map((team) => ({
        ...team,
        occupied: occupied(team.id),
        available: Math.max(0, team.capacity - occupied(team.id)),
      }));
    let delayNextCampers = false,
      releaseLate,
      lateStarted,
      lateFinished;
    let draftWrites = 0;
    await context.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname,
        method = req.method();
      const json = (body, status = 200, headers = {}) =>
        route.fulfill({ status, headers, json: body });
      if (url.hostname === authHost)
        return method === "OPTIONS"
          ? route.fulfill({
              status: 204,
              headers: {
                "access-control-allow-origin": "*",
                "access-control-allow-headers":
                  "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
                "access-control-allow-methods": "GET,POST,OPTIONS",
              },
            })
          : json(user, 200, { "access-control-allow-origin": "*" });
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
        });
      if (path === "/api/v1/me/access")
        return json({
          account: {
            id: userId,
            email: user.email,
            profile: {},
            platformAdmin: false,
          },
          organizations: [
            {
              id: id(750),
              organizationId: orgId,
              accountId: userId,
              organization,
              role: "ORGANIZER",
              active: true,
              healthEventIds: [],
            },
          ],
        });
      if (path === `/api/v1/organizations/${orgId}/events`)
        return json([event]);
      const scoped = path.match(
        new RegExp(
          `^/api/v1/organizations/${orgId}/campaigns/([^/]+)/teams(?:/([^/]+))?$`,
        ),
      );
      if (scoped) {
        const [, campaignId, selectedTeam] = scoped;
        assert.ok(teams[campaignId], "Unknown campaign in team endpoint");
        if (method === "GET") return json(teamRows(campaignId));
        assert.equal(
          campaignId,
          camperId,
          "Camper controls must not modify volunteer teams",
        );
        changes.push({ method, campaignId, selectedTeam });
        if (method === "POST") {
          const data = req.postDataJSON();
          teams[camperId].push({
            id: newTeam,
            eventId,
            campaignId,
            kind: "CAMPER",
            name: data.name.trim().toUpperCase(),
            capacity: data.capacity,
          });
          return json(
            teamRows(camperId).find((team) => team.id === newTeam),
            201,
          );
        }
        const team = teams[camperId].find((team) => team.id === selectedTeam);
        assert.ok(team);
        if (method === "PUT") {
          team.capacity = req.postDataJSON().capacity;
          return json(
            teamRows(camperId).find((item) => item.id === selectedTeam),
          );
        }
        if (method === "DELETE") {
          assert.equal(
            people.filter((person) => person.teamId === selectedTeam).length,
            0,
          );
          teams[camperId] = teams[camperId].filter(
            (item) => item.id !== selectedTeam,
          );
          return json({ deleted: true });
        }
      }
      if (path === `/api/v1/organizations/${orgId}/registrations`) {
        const campaignId = url.searchParams.get("campaignId");
        assert.ok(
          campaignId === volunteerId || campaignId === camperId,
          "List must be campaign scoped",
        );
        const rows = people
          .filter((person) => person.campaignId === campaignId)
          .map((person) => structuredClone(person));
        const held = campaignId === camperId && delayNextCampers;
        if (held) {
          delayNextCampers = false;
          lateStarted?.();
          await new Promise((resolve) => {
            releaseLate = resolve;
          });
        }
        try {
          return await json({
            items: rows,
            total: rows.length,
            page: 1,
            pageSize: 20,
          });
        } catch (error) {
          if (!route.request().failure() && !String(error).includes("closed"))
            throw error;
          return;
        } finally {
          if (held) lateFinished?.();
        }
      }
      const registration = path.match(
        new RegExp(
          `^/api/v1/organizations/${orgId}/registrations/([^/]+)(?:/(team|status))?$`,
        ),
      );
      if (registration) {
        const row = people.find((person) => person.id === registration[1]);
        assert.ok(row);
        if (method === "GET") return json(row);
        assert.equal(
          row.campaignId,
          camperId,
          "Only camper mutations expected",
        );
        const data = req.postDataJSON();
        if (registration[2] === "team") {
          assert.ok(
            data.teamId === null ||
              teams[camperId].some((team) => team.id === data.teamId),
          );
          row.teamId = data.teamId;
          row.team =
            teams[camperId].find((team) => team.id === data.teamId) ?? null;
        } else {
          assert.equal(registration[2], "status");
          row.status = data.status;
        }
        return json(row);
      }
      if (path === `/api/v1/public/campaigns/${camperId}`)
        return json({
          ...campaigns[1],
          open: false,
          event: { ...event, teams: [] },
          form: {
            id: id(709),
            version: 1,
            publishedAt: "2026-11-01T12:00:00Z",
            config: camperTemplate("FAC"),
          },
        });
      if (path.startsWith("/api/v1/public/") && method !== "GET") {
        draftWrites++;
        return json({ error: { message: "Pausada" } }, 409);
      }
      if (path.startsWith("/api/v1/")) {
        failures.push(`Unexpected API ${method} ${path}`);
        return json({}, 500);
      }
      if (url.hostname === "fonts.googleapis.com")
        return route.fulfill({ contentType: "text/css", body: "" });
      if (url.origin === origin) return route.continue();
      failures.push(`Unexpected external request: ${url.origin}`);
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(error.message));
    const base = `${target}/organizacao/${orgId}/inscricoes`;
    await page.goto(base);
    const volunteerCard = () =>
      page.getByRole("button", {
        name: `Servos — ${event.name} — 4 inscrições`,
        exact: true,
      });
    const camperCard = () =>
      page.getByRole("button", {
        name: `Campistas — ${event.name} — 2 inscrições`,
        exact: true,
      });
    await expect(volunteerCard()).toBeVisible();
    await expect(camperCard()).toBeVisible();
    await expect(page.locator(".review-event-card")).toHaveCount(2);
    await camperCard().click();
    const camperName = campers[0].person.name;
    const group = () =>
      page.getByRole("combobox", {
        name: `Equipe de ${camperName}`,
        exact: true,
      });
    const decision = () =>
      page.getByRole("combobox", {
        name: `Decisão de ${camperName}`,
        exact: true,
      });
    await expect(group()).toBeVisible();
    await expect(
      page.getByText(people[0].person.name, { exact: true }),
    ).toHaveCount(0);
    assert.equal(new URL(page.url()).searchParams.get("campaign"), camperId);
    assert.equal(
      await group().locator(`option[value="${volunteerTeam}"]`).count(),
      0,
    );
    await page
      .getByRole("tab", { name: "Equipes e vagas", exact: true })
      .click();
    await page.getByLabel("Nova equipe", { exact: false }).fill("Equipe verde");
    await page.locator(".review-create-team").getByRole("spinbutton").fill("1");
    await page
      .getByRole("button", { name: "Criar equipe", exact: true })
      .click();
    await expect(page.getByText("EQUIPE VERDE", { exact: true })).toBeVisible();
    await page
      .getByRole("spinbutton", { name: /^Vagas de EQUIPE VERDE/ })
      .fill("3");
    await page
      .getByRole("button", {
        name: "Salvar vagas de EQUIPE VERDE",
        exact: true,
      })
      .click();
    await expect
      .poll(() => teams[camperId].find((team) => team.id === newTeam)?.capacity)
      .toBe(3);
    await page.getByRole("tab", { name: "Inscrições", exact: true }).click();
    await decision().selectOption("APPROVED");
    await expect(decision()).toHaveValue("APPROVED");
    await decision().selectOption("CONFIRMED");
    await expect(decision()).toHaveValue("CONFIRMED");
    await expect(group()).toHaveValue("");
    await group().selectOption(newTeam);
    await expect(group()).toHaveValue(newTeam);
    await group().selectOption("");
    await expect(group()).toHaveValue("");
    await expect(
      page.getByRole("button", {
        name: `Enviar convite por WhatsApp para ${camperName}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `Copiar link do candidato ${camperName}`,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: "Equipes e vagas", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Excluir equipe EQUIPE VERDE", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar exclusão", exact: true })
      .click();
    await expect(page.getByText("EQUIPE VERDE", { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("tab", { name: "Inscrições", exact: true }).click();

    const lateComplete = new Promise((resolve) => {
      lateFinished = resolve;
    });
    const late = new Promise((resolve) => {
      lateStarted = resolve;
    });
    delayNextCampers = true;
    if (mobile)
      await page.getByRole("button", { name: /^Filtros e ordenação/ }).click();
    await page
      .getByRole("button", { name: "Atualizar inscrições", exact: true })
      .click();
    await Promise.race([
      late,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Delayed camper request did not start")),
          5000,
        ),
      ),
    ]);
    if (mobile)
      await page
        .getByRole("button", { name: "Fechar janela", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Voltar aos eventos", exact: true })
      .click();
    await volunteerCard().click();
    await expect(
      page.getByText(people[0].person.name, { exact: true }),
    ).toBeVisible();
    releaseLate();
    await lateComplete;
    await page.waitForTimeout(100);
    await expect(page.getByText(camperName, { exact: true })).toHaveCount(0);
    const volunteerSelect = page.getByRole("combobox", {
      name: `Departamento de ${people[0].person.name}`,
      exact: true,
    });
    await expect(volunteerSelect).toBeVisible();
    assert.equal(
      await volunteerSelect.locator(`option[value="${camperTeam}"]`).count(),
      0,
    );
    assert.equal(new URL(page.url()).searchParams.get("campaign"), volunteerId);
    assert(changes.length >= 3);
    assert(changes.every((change) => change.campaignId === camperId));
    await page.screenshot({
      path: `.local/screenshots/campaign-management-${label}.png`,
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    );
    await page.goto(`${target}/inscricao/${camperId}`);
    await page
      .getByText("As inscrições desta campanha não estão abertas.", {
        exact: true,
      })
      .waitFor();
    await expect(
      page.getByRole("button", { name: "Começar inscrição" }),
    ).toHaveCount(0);
    assert.equal(draftWrites, 0);
    assert.deepEqual(failures, []);
    await context.close();
    console.info(
      `Campanhas ${label}: dois cards, contagens próprias, equipes isoladas, CRUD, confirmação sem equipe, remoção após confirmação, resposta tardia e inscrição pausada OK.`,
    );
  }
} finally {
  await browser.close();
}
