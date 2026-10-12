import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { fieldCatalog } from "@fac/form-layout";
import {
  volunteerTemplate,
  volunteerTeams,
} from "../apps/api/dist/modules/events/volunteer-template.js";

// React real com serviços simulados somente neste navegador. Não altera a base real.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5174";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Use a aplicação local.");
const id = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000003";
const campaignId = "00000000-0000-4000-8000-000000000004";
const draftId = "00000000-0000-4000-8000-000000000005";
const authHost = "auth.encontro.invalid";
const user = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "organizador@example.com",
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
  refresh_token: "fixture-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: now + 3600,
  user,
};
const organization = {
  id,
  name: "Paróquia do teste de servos",
  city: "Toledo",
  state: "PR",
  kind: "PARISH",
  active: true,
};
const campaign = {
  id: campaignId,
  eventId,
  kind: "VOLUNTEER",
  opensAt: new Date(Date.now() - 3600000).toISOString(),
  closesAt: new Date(Date.now() + 3600000).toISOString(),
  paused: false,
  capacity: null,
  allowWaitlist: false,
  open: true,
};
const event = {
  id: eventId,
  name: "FAC 2027 — Equipe de trabalho",
  status: "DRAFT",
  description: "Encontro fictício",
  location: "Chácara",
  city: "Toledo",
  startsAt: "2027-06-01",
  endsAt: "2027-06-03",
  organization,
  organizationId: id,
  type: { name: "FAC" },
  departmentsReady: true,
  teams: volunteerTeams.map((name, index) => ({
    id: `team-${index}`,
    eventId,
    name: name.toLocaleUpperCase("pt-BR"),
    capacity: 5,
    occupied: 0,
    available: 5,
  })),
  campaigns: [campaign],
};
const template = volunteerTemplate(
  "FAC",
  volunteerTeams.map((name) => name.toLocaleUpperCase("pt-BR")),
);
let form = null,
  payload = {},
  health = {},
  registration = null,
  publications = 0,
  submissions = 0;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=",
  "base64",
);
const photoUrl = `data:image/png;base64,${png.toString("base64")}`;
let photoUploads = 0,
  photoSignature = 0,
  expiredPhotoResponses = 0,
  rejectNextPhoto = false;
const photoLinks = [],
  expiredPhotoSignatures = new Set();
function signedPhotoUrl() {
  return `${target}/storage-test/photos/photo-test.png?signature=${++photoSignature}`;
}
async function loadedPhoto(page, alt) {
  const image = page.getByAltText(alt, { exact: true });
  await image.waitFor();
  await page.waitForFunction((label) => {
    const image = [...document.images].find((item) => item.alt === label);
    return image?.complete && image.naturalWidth > 0;
  }, alt);
  return image.getAttribute("src");
}
const bannerPng = await sharp({
  create: { width: 1600, height: 400, channels: 3, background: "#152650" },
})
  .png()
  .toBuffer();
const bannerUrl = "https://storage.test/form-banner.png";
const errors = [];
let decisionNotice = null;
const responseToken = "n".repeat(43);
function prepareNotice(kind) {
  const noticeId =
    kind === "ACEITE"
      ? "00000000-0000-4000-8000-000000000006"
      : "00000000-0000-4000-8000-000000000007";
  const link = `${target}/resposta/${noticeId}#token=${responseToken}`;
  const message =
    kind === "ACEITE"
      ? `Sua candidatura foi aceita! Confirme sua presença: ${link}`
      : `Não foi dessa vez! Agradecemos sua disponibilidade. Confira: ${link}`;
  return {
    id: noticeId,
    kind,
    link,
    message,
    email: null,
    emailStatus: "SEM_EMAIL",
    emailSentAt: null,
    whatsappSentAt: null,
    confirmedAt: null,
    expiresAt: campaign.closesAt,
    active: true,
    expired: false,
    whatsappLink: `https://wa.me/5544999999999?text=${encodeURIComponent(message)}`,
  };
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
const json = (route, value, status = 200, headers = {}) =>
  route.fulfill({
    status,
    headers,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
async function fixtures(context) {
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname,
      method = request.method();
    if (path === "/storage-test/photos/photo-test.png") {
      if (
        rejectNextPhoto ||
        expiredPhotoSignatures.has(url.searchParams.get("signature"))
      ) {
        rejectNextPhoto = false;
        expiredPhotoResponses++;
        // Falha HTTP controlada do Storage; não é um erro de execução do React.
        return json(
          route,
          {
            statusCode: "400",
            error: "InvalidJWT",
            message: '"exp" claim timestamp check failed',
            code: "InvalidJWT",
          },
          400,
        );
      }
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "cache-control": "no-store" },
        body: png,
      });
    }
    if (request.url() === bannerUrl)
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: bannerPng,
      });
    if (url.hostname === authHost) {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers":
          "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
        "access-control-allow-methods": "GET, POST, OPTIONS",
      };
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (path.endsWith("/user")) return json(route, user, 200, headers);
    }
    if (path === "/api/v1/config")
      return json(route, {
        supabaseUrl: `https://${authHost}`,
        supabaseAnonKey: "sb_publishable_test",
        eventsEnabled: false,
        eventManagementEnabled: true,
        volunteerRegistrationsEnabled: true,
        volunteerRegistrationsReady: true,
      });
    if (path === "/api/v1/me/access")
      return json(route, {
        account: {
          id: user.id,
          email: user.email,
          platformAdmin: false,
          profile: {},
        },
        organizations: [
          {
            id: "member",
            accountId: user.id,
            organizationId: id,
            organization,
            role: "ORGANIZER",
            active: true,
            healthEventIds: [],
          },
        ],
      });
    if (
      path === `/api/v1/organizations/${id}/events/${eventId}/volunteer-form`
    ) {
      if (method === "POST") {
        const multipart = request
          .headers()
          ["content-type"]?.startsWith("multipart/form-data");
        const config = multipart
          ? JSON.parse(
              request
                .postData()
                .match(/name="data"\r\n\r\n([\s\S]*?)\r\n--/)[1],
            )
          : request.postDataJSON();
        if (multipart) {
          assert.ok(request.postData().includes('name="banner"'));
          config.banner = {
            url: bannerUrl,
            bucket: "artes-eventos",
            key: "banner-da-versao-1.webp",
            width: 1600,
            height: 400,
          };
        }
        assert.equal(
          config.volunteer.training,
          "Preparação na comunidade, no sábado anterior ao evento.",
        );
        form = {
          id: `form-${++publications}`,
          campaignId,
          version: publications,
          config,
          publishedAt: new Date().toISOString(),
        };
        event.status = "PUBLISHED";
        return json(
          route,
          { form, campaignId, link: `/inscricao/${campaignId}` },
          201,
        );
      }
      return json(route, {
        event,
        campaign,
        form,
        template,
        departmentsReady: true,
        departments: event.teams,
      });
    }
    if (
      path === `/api/v1/organizations/${id}/events` ||
      path === `/api/v1/organizations/${id}/event-setups`
    )
      return json(route, [event]);
    if (path === "/api/v1/public/parishes")
      return json(route, [
        {
          id: "parish-one",
          name: "Paróquia Nossa Senhora Aparecida",
          city: "Loanda",
          state: "PR",
        },
      ]);
    if (path === `/api/v1/public/campaigns/${campaignId}`)
      return json(route, { ...campaign, event, form });
    if (path === `/api/v1/public/campaigns/${campaignId}/drafts`) {
      assert.equal(
        request.headers().authorization,
        undefined,
        "A ficha pública não deve exigir conta.",
      );
      return json(
        route,
        { id: draftId, token: "credencial-temporaria-somente-teste" },
        201,
      );
    }
    if (path === `/api/v1/public/drafts/${draftId}`) {
      assert.equal(
        request.headers()["x-draft-token"],
        "credencial-temporaria-somente-teste",
      );
      if (method === "PUT") ({ payload, health } = request.postDataJSON());
      return json(route, {
        id: draftId,
        payload,
        health,
        form,
        submitted: false,
      });
    }
    if (path === `/api/v1/public/drafts/${draftId}/photo`) {
      assert.equal(method, "POST");
      assert.equal(
        request.headers()["x-draft-token"],
        "credencial-temporaria-somente-teste",
      );
      photoUploads++;
      return json(route, { id: "photo-test", url: signedPhotoUrl() }, 201);
    }
    if (path === `/api/v1/public/drafts/${draftId}/photos/photo-test`) {
      assert.equal(method, "GET");
      assert.equal(
        request.headers()["x-draft-token"],
        "credencial-temporaria-somente-teste",
        "Renovar a foto deve conservar a autorização do rascunho.",
      );
      const url = signedPhotoUrl();
      photoLinks.push(url);
      return json(route, { url });
    }
    if (path === `/api/v1/public/drafts/${draftId}/submit`) {
      if (form.version > 1) {
        assert.equal(payload.photoAssetId, undefined);
        assert.equal(payload.shirt, undefined);
        assert.equal(payload.emergencyName, undefined);
        assert.deepEqual(payload.answers ?? {}, {});
        assert.deepEqual(health, {});
        assert.equal(payload.termsAccepted, true);
        submissions++;
        return json(route, {
          id: "registration-minimal",
          protocol: "LAYOUT-TESTE",
          status: "RECEIVED",
        });
      }
      assert.equal(
        payload.answers.paroquia,
        "Paróquia de São Francisco ainda não cadastrada",
      );
      assert.equal(payload.answers.aceite_formacao, true);
      assert.equal(payload.answers.aceite_regras, true);
      assert.equal(payload.termsAccepted, true);
      assert.equal(payload.imageAuthorized ?? false, false);
      assert.equal(payload.answers.equipes_preferencia.length, 3);
      assert.equal(payload.photoAssetId, "photo-test");
      assert.equal(payload.answers.cidade, "Loanda - PR");
      assert.equal(health.hasAllergies, false);
      submissions++;
      registration = {
        id: "registration-test",
        protocol: "SERVO-TESTE-2027",
        status: "RECEIVED",
        person: { id: "person-test", name: payload.name },
        snapshot: payload,
        form,
        campaign: { ...campaign, event },
        history: [],
        accountId: null,
        team: null,
      };
      return json(route, {
        id: registration.id,
        protocol: registration.protocol,
        status: registration.status,
      });
    }
    const base = `/api/v1/organizations/${id}/registrations`;
    if (path === base)
      return json(route, {
        items: registration ? [registration] : [],
        total: registration ? 1 : 0,
        page: 1,
        pageSize: 20,
      });
    if (path === `${base}/registration-test`) return json(route, registration);
    if (path === `${base}/registration-test/photo`)
      return json(route, { url: photoUrl });
    if (path === `${base}/registration-test/guardian`)
      return json(route, {
        ready: true,
        needsAuthorization: false,
        authorization: null,
      });
    if (path === `${base}/registration-test/status`) {
      const data = request.postDataJSON();
      registration.status = data.status;
      if (data.status === "APPROVED") decisionNotice = prepareNotice("ACEITE");
      if (data.status === "REJECTED") decisionNotice = prepareNotice("RECUSA");
      registration.history.push({
        id: `history-${registration.history.length}`,
        fromStatus: "RECEIVED",
        toStatus: data.status,
        reason: data.reason,
        createdAt: new Date().toISOString(),
      });
      return json(route, registration);
    }
    if (path === `${base}/registration-test/decision-notice`)
      return json(route, { ready: true, notice: decisionNotice });
    if (path === `${base}/registration-test/decision-notice/whatsapp-sent`) {
      decisionNotice.whatsappSentAt = new Date().toISOString();
      return json(route, { ready: true, notice: decisionNotice });
    }
    const responsePath = `/api/v1/public/decision-responses/${decisionNotice?.id}`;
    if (path === responsePath || path === `${responsePath}/view`) {
      assert.equal(request.postDataJSON().token, responseToken);
      if (path === responsePath && decisionNotice.kind === "ACEITE")
        decisionNotice.confirmedAt = new Date().toISOString();
      return json(route, {
        kind: decisionNotice.kind,
        candidateName: "Pessoa",
        confirmedAt: decisionNotice.confirmedAt,
        expiresAt: decisionNotice.expiresAt,
        event: {
          name: event.name,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          organization: organization.name,
        },
      });
    }
    if (path.startsWith("/api/v1/")) {
      errors.push(`API inesperada: ${path}`);
      return json(route, {}, 400);
    }
    if (url.hostname === "fonts.googleapis.com")
      return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    if (url.origin === new URL(target).origin) return route.continue();
    errors.push(`Destino inesperado: ${url.hostname}`);
    return route.abort();
  });
}
mkdirSync(".local/screenshots", { recursive: true });
const organizerContext = await browser.newContext({
  viewport: { width: 1366, height: 1000 },
});
await organizerContext.addInitScript((value) => {
  if (["localhost", "127.0.0.1"].includes(location.hostname))
    localStorage.setItem("sb-auth-auth-token", JSON.stringify(value));
}, session);
await fixtures(organizerContext);
const admin = await organizerContext.newPage();
admin.setDefaultTimeout(15000);
let visitor;
try {
  await admin.goto(
    `${target}/organizacao/${id}/eventos/${eventId}/ficha-servos`,
  );
  await admin
    .getByRole("heading", { name: "Organizar campos da ficha", exact: true })
    .waitFor();
  const identityRows = () =>
    admin
      .getByRole("region", { name: "Campos: Identificação", exact: true })
      .locator("[data-field-key]");
  const order = () =>
    identityRows().evaluateAll((rows) =>
      rows.map((row) => row.dataset.fieldKey),
    );
  const originalOrder = await order();
  const emailHandle = admin.getByRole("button", {
    name: "Arrastar E-mail (opcional)",
    exact: true,
  });
  await emailHandle.scrollIntoViewIfNeeded();
  const from = await emailHandle.boundingBox();
  const destination = await identityRows().nth(1).boundingBox();
  await admin.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await admin.mouse.down();
  await admin.mouse.move(
    destination.x + 20,
    destination.y + destination.height / 2,
    { steps: 20 },
  );
  await admin.mouse.up();
  await admin.waitForTimeout(350);
  const mouseOrder = await order();
  assert.notDeepEqual(
    mouseOrder,
    originalOrder,
    "Arraste por mouse precisa mudar a ordem.",
  );
  await emailHandle.focus();
  await admin.keyboard.press("Space");
  await admin.keyboard.press("ArrowDown");
  await admin.keyboard.press("Space");
  await admin.waitForTimeout(350);
  assert.notDeepEqual(
    await order(),
    mouseOrder,
    "Teclado precisa mover a pergunta.",
  );
  const beforeCancel = await order();
  await emailHandle.focus();
  await admin.keyboard.press("Space");
  await admin.keyboard.press("ArrowUp");
  await admin.keyboard.press("Escape");
  await admin.waitForTimeout(350);
  assert.deepEqual(
    await order(),
    beforeCancel,
    "Escape deve cancelar a alteração.",
  );
  // O mesmo notebook recebe eventos de toque reais, com ativação prolongada.
  await emailHandle.scrollIntoViewIfNeeded();
  const touchFrom = await emailHandle.boundingBox();
  const touchTo = await identityRows().first().boundingBox();
  const cdp = await organizerContext.newCDPSession(admin);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchFrom.x + 15, y: touchFrom.y + 15 }],
  });
  await admin.waitForTimeout(350);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchTo.x + 15, y: touchTo.y + 25 }],
  });
  await admin.waitForTimeout(150);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await admin.waitForTimeout(350);
  assert.notDeepEqual(
    await order(),
    beforeCancel,
    "Toque prolongado precisa mover a pergunta.",
  );
  await cdp.detach();
  // Cada etapa tem seu próprio contexto de arraste: um alvo de outra etapa não recebe o item.
  await emailHandle.scrollIntoViewIfNeeded();
  const crossing = await emailHandle.boundingBox();
  const photoHandle = await admin
    .getByRole("button", { name: "Arrastar Foto", exact: true })
    .boundingBox();
  await admin.mouse.move(crossing.x + 15, crossing.y + 15);
  await admin.mouse.down();
  await admin.mouse.move(photoHandle.x + 15, photoHandle.y + 15, { steps: 15 });
  await admin.mouse.up();
  assert.equal(await identityRows().filter({ has: emailHandle }).count(), 1);
  await admin
    .getByLabel("Preparação e formações da equipe", { exact: false })
    .fill("Preparação na comunidade, no sábado anterior ao evento.");
  await admin.getByRole("button", { name: "Visualizar campos" }).click();
  await admin
    .getByRole("heading", { name: "Campos da ficha", exact: true })
    .waitFor();
  await admin
    .getByLabel("Banner da ficha (opcional)", { exact: false })
    .setInputFiles({
      name: "banner.png",
      mimeType: "image/png",
      buffer: bannerPng,
    });
  await admin.getByAltText("Prévia do banner da ficha").waitFor();
  await admin
    .getByRole("button", { name: "Publicar ficha de servos", exact: true })
    .click();
  await admin
    .getByText("Ficha publicada — versão 1.", { exact: false })
    .waitFor();
  assert.equal(
    await admin.getByLabel("Link da ficha de servos").inputValue(),
    `${target}/inscricao/${campaignId}`,
  );
  await admin.screenshot({
    path: ".local/screenshots/servos-publicacao.png",
    fullPage: true,
  });

  const visitorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await fixtures(visitorContext);
  visitor = await visitorContext.newPage();
  visitor.setDefaultTimeout(15000);
  await visitor.clock.install();
  await visitor.goto(`${target}/inscricao/${campaignId}`);
  await visitor
    .getByAltText(`Banner do evento ${event.name}`, { exact: true })
    .waitFor();
  await visitor.waitForFunction(
    () => document.querySelector(".registration-banner img")?.naturalWidth > 0,
  );
  const bannerRatio = await visitor
    .locator(".registration-banner img")
    .evaluate((img) => {
      const box = img.getBoundingClientRect();
      return {
        rendered: box.width / box.height,
        original: img.naturalWidth / img.naturalHeight,
      };
    });
  assert.ok(
    Math.abs(bannerRatio.rendered - bannerRatio.original) < 0.02,
    "O banner deve manter a proporção e não cortar textos.",
  );
  await visitor.screenshot({
    path: ".local/screenshots/banner-introducao-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await visitor.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await visitor.setViewportSize({ width: 1280, height: 900 });
  await visitor.screenshot({
    path: ".local/screenshots/banner-introducao-desktop.png",
  });
  await visitor.setViewportSize({ width: 390, height: 844 });
  await visitor.getByRole("button", { name: "Começar inscrição" }).click();
  await visitor
    .getByLabel("Nome completo", { exact: false })
    .fill("Pessoa candidata a servir");
  await visitor
    .getByLabel("Telefone / WhatsApp", { exact: false })
    .fill("44999999999");
  await visitor
    .getByLabel("Data de nascimento", { exact: false })
    .fill("1990-07-01");
  await visitor.getByLabel("Sexo", { exact: false }).selectOption("Feminino");
  const cityInput = visitor.getByRole("combobox", { name: "Cidade onde mora" });
  await cityInput.fill("sao paulo SP");
  await visitor
    .getByRole("option", { name: "São Paulo - SP", exact: true })
    .waitFor();
  await cityInput.press("ArrowDown");
  await cityInput.press("Enter");
  assert.equal(await cityInput.inputValue(), "São Paulo - SP");
  assert.equal(
    await visitor
      .getByRole("heading", { name: "Vamos começar pelo básico", exact: true })
      .count(),
    1,
  );
  await cityInput.fill("loanda");
  await visitor
    .getByRole("option", { name: "Loanda - PR", exact: true })
    .waitFor();
  await visitor.screenshot({
    path: ".local/screenshots/servos-cidade-busca.png",
    fullPage: true,
  });
  await visitor.getByRole("option", { name: "Loanda - PR", exact: true }).tap();
  assert.equal(await cityInput.inputValue(), "Loanda - PR");
  await visitor.screenshot({
    path: ".local/screenshots/servos-cidade-selecionada.png",
    fullPage: true,
  });
  assert.equal(
    await visitor.getByLabel("Idade no início do evento").inputValue(),
    "36 anos",
  );
  const next = () =>
    visitor.getByRole("button", { name: "Continuar", exact: true }).click();
  await next();
  await visitor
    .locator('input[type="file"]')
    .last()
    .setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: png });
  await visitor.getByRole("button", { name: "Usar esta foto" }).click();
  await visitor.getByRole("button", { name: "Trocar foto" }).waitFor();
  const initialPhoto = await loadedPhoto(
    visitor,
    "Prévia da foto de identificação",
  );
  await next();
  await visitor.getByLabel("Tamanho da camiseta", { exact: false }).waitFor();
  // O candidato pode levar mais que os 120 segundos de validade do link da foto.
  const photoLinksOutsidePhotoStep = photoLinks.length;
  await visitor.clock.fastForward(125_000);
  assert.equal(
    photoLinks.length,
    photoLinksOutsidePhotoStep,
    "Etapas sem a foto não devem renovar o link em segundo plano.",
  );
  for (let signature = 1; signature <= photoSignature; signature++)
    expiredPhotoSignatures.add(String(signature));
  await visitor
    .getByLabel("Tamanho da camiseta", { exact: false })
    .selectOption("M");
  await visitor
    .getByLabel("Sua disponibilidade", { exact: false })
    .fill("Durante todo o evento e preparação.");
  const parishInput = visitor.getByRole("combobox", {
    name: "Qual paróquia frequenta?",
  });
  await parishInput.fill("aparecida");
  const parishOption = visitor.getByRole("option", {
    name: "Paróquia Nossa Senhora Aparecida — Loanda - PR",
  });
  await parishOption.waitFor();
  await parishInput.scrollIntoViewIfNeeded();
  await visitor.screenshot({
    path: ".local/screenshots/parish-suggestions-mobile.png",
  });
  await parishOption.tap();
  assert.equal(
    await parishInput.inputValue(),
    "Paróquia Nossa Senhora Aparecida — Loanda - PR",
  );
  await parishInput.fill("Paróquia de São Francisco ainda não cadastrada");
  await visitor
    .getByText("Nenhuma paróquia encontrada. Você pode manter o nome digitado.")
    .waitFor();
  assert.ok(
    await visitor.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    "Paróquia: seleção por toque, preenchimento livre e layout móvel aprovados.",
  );
  await visitor
    .getByLabel("Já participou ou serviu", { exact: false })
    .selectOption("false");
  await visitor
    .getByLabel("É campista?", { exact: false })
    .fill("Ainda não participei de um acampamento.");
  await visitor.getByRole("checkbox", { name: "Batismo", exact: true }).check();
  await visitor
    .getByRole("checkbox", {
      name: "Não possuo nenhum sacramento",
      exact: true,
    })
    .check();
  assert.equal(
    await visitor
      .getByRole("checkbox", { name: "Batismo", exact: true })
      .isChecked(),
    false,
  );
  for (const name of ["COZINHA", "SECRETARIA", "INTERCESSÃO"])
    await visitor.getByRole("checkbox", { name, exact: true }).check();
  assert.equal(
    await visitor
      .getByRole("checkbox", { name: "EXTERNA", exact: true })
      .isDisabled(),
    true,
  );
  assert(
    await visitor.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "A ficha não deve transbordar no celular.",
  );
  await visitor.screenshot({
    path: ".local/screenshots/servos-ficha-celular.png",
    fullPage: true,
  });
  await next();
  await visitor
    .getByLabel("Nome do contato", { exact: false })
    .fill("Contato de emergência");
  await visitor
    .getByLabel("Telefone do contato de emergência com DDD", { exact: false })
    .fill("44988888888");
  assert.equal(
    await visitor
      .getByLabel("Telefone do contato de emergência com DDD", { exact: false })
      .inputValue(),
    "(44) 98888-8888",
  );
  await visitor
    .getByLabel("Parentesco / relação", { exact: false })
    .selectOption("Irmão");
  for (const label of [
    "Possui alguma alergia?",
    "Usa medicamentos regularmente?",
    "Possui restrição alimentar?",
    "Há uma condição de saúde",
    "Precisa de algum apoio",
  ])
    await visitor.getByLabel(label, { exact: false }).selectOption("false");
  const linksBeforeReview = photoLinks.length;
  // Mesmo um link recém-obtido pode falhar; simula o erro informado pelo usuário.
  rejectNextPhoto = true;
  await next();
  const reviewPhoto = await loadedPhoto(visitor, "Sua foto");
  assert.notEqual(reviewPhoto, initialPhoto);
  assert.equal(expiredPhotoResponses, 1);
  assert.equal(
    photoLinks.length,
    linksBeforeReview + 2,
    "A revisão deve buscar um link atual e renovar uma vez após InvalidJWT.",
  );
  assert.equal(payload.photoAssetId, "photo-test");
  assert.equal(payload.name, "Pessoa candidata a servir");
  assert.equal(photoUploads, 1, "Renovar a URL não deve reenviar o arquivo.");
  const linksBeforePeriodicRenewal = photoLinks.length;
  await visitor.clock.fastForward(125_000);
  await visitor.waitForFunction((previous) => {
    const image = [...document.images].find((item) => item.alt === "Sua foto");
    return image?.complete && image.naturalWidth > 0 && image.src !== previous;
  }, reviewPhoto);
  assert.equal(
    photoLinks.length,
    linksBeforePeriodicRenewal + 1,
    "A foto exibida deve renovar antes de expirar enquanto a aba está visível.",
  );
  for (let index = 0; index < 3; index++)
    await visitor.getByRole("button", { name: "Voltar", exact: true }).click();
  const returnedPhoto = await loadedPhoto(
    visitor,
    "Prévia da foto de identificação",
  );
  assert.notEqual(returnedPhoto, initialPhoto);
  assert.equal(payload.photoAssetId, "photo-test");
  assert.deepEqual(
    await visitor.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      `fac:draft:${campaignId}`,
    ),
    { id: draftId, token: "credencial-temporaria-somente-teste" },
    "Renovar a foto deve preservar a credencial de retomada.",
  );
  for (let index = 0; index < 3; index++) await next();
  await loadedPhoto(visitor, "Sua foto");
  await visitor.screenshot({
    path: ".local/screenshots/servos-foto-renovada-revisao.png",
    fullPage: true,
  });
  console.log(
    "Foto privada: revisão após 125s, recuperação de InvalidJWT, renovação periódica e retorno à etapa2 preservam arquivo, dados e credencial.",
  );
  await visitor.getByRole("button", { name: "Enviar inscrição" }).click();
  await visitor
    .getByText("Confirme este aceite para enviar sua candidatura.", {
      exact: true,
    })
    .first()
    .waitFor();
  assert.equal(submissions, 0);
  await visitor
    .getByRole("checkbox", { name: "Estou de acordo", exact: false })
    .check();
  await visitor
    .getByRole("checkbox", { name: "Declaro que estou ciente", exact: false })
    .check();
  await visitor
    .getByRole("checkbox", { name: "Li e aceito os termos", exact: false })
    .check();
  await visitor.getByRole("button", { name: "Enviar inscrição" }).click();
  await visitor
    .getByRole("heading", { name: "Recebemos sua inscrição!" })
    .waitFor();
  assert.equal(submissions, 1);
  assert.equal(registration.status, "RECEIVED");
  assert.equal(
    await visitor.evaluate(
      () =>
        Object.keys(localStorage).filter((key) => key.startsWith("fac:draft:"))
          .length,
    ),
    1,
  );
  assert.deepEqual(
    Object.keys(
      JSON.parse(
        await visitor.evaluate(
          (key) => localStorage.getItem(key),
          `fac:draft:${campaignId}`,
        ),
      ),
    ).sort(),
    ["id", "token"],
  );
  await visitor.screenshot({
    path: ".local/screenshots/servos-protocolo-celular.png",
    fullPage: true,
  });

  await admin.goto(`${target}/organizacao/${id}/inscricoes`);
  await admin.getByRole("button", { name: "Abrir ficha", exact: true }).click();
  await admin.getByText("Respostas da ficha de intenção").click();
  await admin.getByLabel("Decisão sobre a candidatura").selectOption("REVIEW");
  await admin
    .getByLabel("Motivo", { exact: false })
    .fill("Iniciada a avaliação dos critérios.");
  await admin.getByRole("button", { name: "Salvar decisão" }).click();
  await admin
    .getByRole("option", { name: "Aceitar candidatura", exact: true })
    .waitFor({ state: "attached" });
  await admin
    .getByLabel("Decisão sobre a candidatura")
    .selectOption("APPROVED");
  await admin
    .getByLabel("Motivo", { exact: false })
    .fill("Disponibilidade e preparação avaliadas.");
  await admin.getByRole("button", { name: "Salvar decisão" }).click();
  await admin.getByLabel("Alocar em departamento").waitFor();
  assert.equal(registration.status, "APPROVED");
  assert.equal(registration.team, null);
  const whatsapp = await admin
    .getByRole("link", { name: "Abrir mensagem no WhatsApp" })
    .getAttribute("href");
  assert(new URL(whatsapp).searchParams.get("text").includes("foi aceita!"));
  assert.equal(decisionNotice.whatsappSentAt, null);
  await admin
    .getByRole("button", { name: "Marcar como enviado pelo WhatsApp" })
    .click();
  await admin
    .getByText("Envio pelo WhatsApp registrado em", { exact: false })
    .waitFor();
  const responseLink = await admin.getByLabel("Link do candidato").inputValue();
  await visitor.goto(responseLink);
  await visitor
    .getByRole("button", { name: "Confirmar minha presença" })
    .waitFor();
  assert.equal(decisionNotice.confirmedAt, null);
  await visitor
    .getByRole("button", { name: "Confirmar minha presença" })
    .click();
  await visitor
    .getByRole("heading", { name: "Sua presença está confirmada!" })
    .waitFor();
  assert(
    await visitor.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "A resposta do candidato não deve transbordar no celular.",
  );
  await visitor.screenshot({
    path: ".local/screenshots/servos-presenca-celular.png",
    fullPage: true,
  });
  await admin
    .getByRole("button", { name: "Atualizar envio e presença" })
    .click();
  await admin
    .getByText("Presença confirmada pelo candidato em", { exact: false })
    .waitFor();
  await admin.screenshot({
    path: ".local/screenshots/servos-avaliacao.png",
    fullPage: true,
  });
  await admin
    .getByLabel("Decisão sobre a candidatura")
    .selectOption("REJECTED");
  await admin
    .getByLabel("Motivo", { exact: false })
    .fill("Critério de teste de recusa, sem exposição na mensagem.");
  await admin.getByRole("button", { name: "Salvar decisão" }).click();
  await admin.getByRole("heading", { name: "Aviso de recusa" }).waitFor();
  const refusalWhatsapp = await admin
    .getByRole("link", { name: "Abrir mensagem no WhatsApp" })
    .getAttribute("href");
  assert(
    new URL(refusalWhatsapp).searchParams
      .get("text")
      .includes("Não foi dessa vez!"),
  );
  await visitor.goto(await admin.getByLabel("Link do candidato").inputValue());
  await visitor.getByRole("heading", { name: "Não foi dessa vez!" }).waitFor();
  assert.equal(
    await visitor
      .getByRole("button", { name: "Confirmar minha presença" })
      .count(),
    0,
  );
  await visitor.screenshot({
    path: ".local/screenshots/servos-recusa-celular.png",
    fullPage: true,
  });
  const oldVersion = structuredClone(form);
  await admin.goto(
    `${target}/organizacao/${id}/eventos/${eventId}/ficha-servos`,
  );
  await admin
    .getByRole("heading", { name: "Organizar campos da ficha", exact: true })
    .waitFor();
  for (const field of fieldCatalog(form.config, "VOLUNTEER")) {
    if (field.protectedReason) continue;
    const button = admin.getByRole("button", {
      name: `Ocultar ${field.label}`,
      exact: true,
    });
    if (await button.count()) await button.click();
  }
  await admin
    .getByRole("button", { name: "Publicar nova versão", exact: true })
    .click();
  await admin
    .getByText("Ficha publicada — versão 2.", { exact: false })
    .waitFor();
  const mobileAdminContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mobileAdminContext.addInitScript((value) => {
    if (["localhost", "127.0.0.1"].includes(location.hostname))
      localStorage.setItem("sb-auth-auth-token", JSON.stringify(value));
  }, session);
  await fixtures(mobileAdminContext);
  const mobileAdmin = await mobileAdminContext.newPage();
  await mobileAdmin.goto(
    `${target}/organizacao/${id}/eventos/${eventId}/ficha-servos`,
  );
  const mobileRows = mobileAdmin
    .getByRole("region", { name: "Campos: Identificação", exact: true })
    .locator("[data-field-key]");
  await mobileRows.first().waitFor();
  assert(
    await mobileAdmin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Editor deve caber na tela do celular.",
  );
  const mobileHandle = mobileAdmin.getByRole("button", {
    name: "Arrastar Nome completo",
    exact: true,
  });
  await mobileHandle.scrollIntoViewIfNeeded();
  const beforeTouch = await mobileRows.evaluateAll((rows) =>
    rows.map((row) => row.dataset.fieldKey),
  );
  const startTouch = await mobileHandle.boundingBox();
  const destinationIndex = beforeTouch.indexOf("base:name") === 0 ? 1 : 0;
  const finishTouch = await mobileRows.nth(destinationIndex).boundingBox();
  const mobileCdp = await mobileAdminContext.newCDPSession(mobileAdmin);
  await mobileCdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startTouch.x + 15, y: startTouch.y + 15 }],
  });
  await mobileAdmin.waitForTimeout(350);
  await mobileCdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: finishTouch.x + 15, y: finishTouch.y + finishTouch.height / 2 },
    ],
  });
  await mobileAdmin.waitForTimeout(150);
  await mobileCdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await mobileAdmin.waitForTimeout(350);
  assert.notDeepEqual(
    await mobileRows.evaluateAll((rows) =>
      rows.map((row) => row.dataset.fieldKey),
    ),
    beforeTouch,
  );
  const scrollBefore = await mobileAdmin.evaluate(() => scrollY);
  await mobileCdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 350, y: 650 }],
  });
  await mobileCdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 350, y: 350 }],
  });
  await mobileCdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await mobileAdmin.waitForTimeout(350);
  assert(
    (await mobileAdmin.evaluate(() => scrollY)) > scrollBefore,
    "Fora da alça deve ser possível rolar a página.",
  );
  await mobileAdmin.screenshot({
    path: ".local/screenshots/ficha-editor-celular.png",
    fullPage: true,
  });
  await mobileCdp.detach();
  await mobileAdminContext.close();
  assert.equal(oldVersion.version, 1);
  assert.equal(oldVersion.config.layout.steps[1].fields[0].hidden, false);
  payload = {};
  health = {};
  const minimalContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await fixtures(minimalContext);
  const minimalPage = await minimalContext.newPage();
  await minimalPage.goto(`${target}/inscricao/${campaignId}`);
  await minimalPage.getByRole("button", { name: "Começar inscrição" }).click();
  await minimalPage
    .getByLabel("Nome completo", { exact: false })
    .fill("Inscrição sem foto");
  await minimalPage
    .getByLabel("Telefone / WhatsApp", { exact: false })
    .fill("44999999999");
  await minimalPage
    .getByLabel("Data de nascimento", { exact: false })
    .fill("1990-01-01");
  assert.equal(await minimalPage.locator(".steps li").count(), 2);
  await minimalPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await minimalPage
    .getByRole("checkbox", { name: /Li e aceito os termos/ })
    .check();
  await minimalPage
    .getByRole("button", { name: "Voltar", exact: true })
    .click();
  await minimalPage.reload();
  await minimalPage
    .getByRole("heading", { name: "Regras para servir" })
    .waitFor();
  assert.equal(
    await minimalPage.getByLabel("Nome completo", { exact: false }).count(),
    0,
  );
  await minimalPage
    .getByRole("button", { name: "Continuar inscrição", exact: true })
    .click();
  await minimalPage.getByLabel("Nome completo", { exact: false }).waitFor();
  assert.equal(
    await minimalPage
      .getByLabel("Nome completo", { exact: false })
      .inputValue(),
    "Inscrição sem foto",
  );
  await minimalPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await minimalPage
    .getByRole("checkbox", { name: /Li e aceito os termos/ })
    .check();
  await minimalPage
    .getByRole("button", { name: "Enviar inscrição", exact: true })
    .click();
  await minimalPage
    .getByRole("heading", { name: "Recebemos sua inscrição!" })
    .waitFor();
  assert.equal(submissions, 2);
  await minimalPage.screenshot({
    path: ".local/screenshots/ficha-layout-sem-foto.png",
    fullPage: true,
  });
  // A etapa do responsável reaparece exclusivamente para menores.
  await minimalPage.evaluate(() => localStorage.clear());
  payload = {};
  health = {};
  await minimalPage.reload();
  await minimalPage.getByRole("button", { name: "Começar inscrição" }).click();
  await minimalPage
    .getByLabel("Nome completo", { exact: false })
    .fill("Menor de teste");
  await minimalPage
    .getByLabel("Telefone / WhatsApp", { exact: false })
    .fill("44999999999");
  await minimalPage
    .getByLabel("Data de nascimento", { exact: false })
    .fill("2012-01-01");
  assert.equal(await minimalPage.locator(".steps li").count(), 3);
  await minimalPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await minimalPage
    .getByRole("textbox", { name: /Nome do responsável/ })
    .waitFor();
  await minimalPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  assert.equal(
    await minimalPage
      .getByRole("textbox", { name: /Nome do responsável/ })
      .count(),
    1,
  );
  const guardianRelationship = minimalPage.getByRole("combobox", {
    name: /Parentesco do responsável/,
  });
  assert.equal(await guardianRelationship.inputValue(), "");
  assert.deepEqual(
    await guardianRelationship.locator("option").allTextContents(),
    [
      "Selecione",
      "Pai",
      "Mãe",
      "Tutor(a) legal",
      "Responsável com guarda judicial",
    ],
  );
  await minimalPage
    .getByRole("textbox", { name: /Nome do responsável/ })
    .fill("Responsável do menor");
  const guardianPhone = minimalPage.getByRole("textbox", {
    name: /Telefone do responsável/,
  });
  await guardianPhone.fill("44988887777");
  assert.equal(await guardianPhone.inputValue(), "(44) 98888-7777");
  await guardianRelationship.selectOption("Mãe");
  await minimalPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await minimalPage
    .getByRole("heading", { name: "Está tudo certo?" })
    .waitFor();
  assert.equal(payload.guardianRelationship, "Mãe");
  assert.equal(payload.guardianPhone, "(44) 98888-7777");
  await minimalPage.reload();
  await minimalPage
    .getByRole("button", { name: "Continuar inscrição", exact: true })
    .click();
  await minimalPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  assert.equal(await guardianRelationship.inputValue(), "Mãe");
  assert.equal(await guardianPhone.inputValue(), "(44) 98888-7777");
  await minimalContext.close();
  // Um rascunho anterior não recebe silenciosamente os campos da publicação nova.
  const oldDraftContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await fixtures(oldDraftContext);
  let oldPayload = {
    name: "Pessoa com rascunho anterior",
    phone: "44999999999",
    birthDate: "1990-01-01",
    availability: "Posso servir desde sexta-feira",
    photoAssetId: "photo-test",
    answers: { sexo: "Feminino", cidade: "Loanda - PR" },
  };
  await oldDraftContext.addInitScript(
    ({ key, credential }) => {
      if (["localhost", "127.0.0.1"].includes(location.hostname))
        localStorage.setItem(key, JSON.stringify(credential));
    },
    {
      key: `fac:draft:${campaignId}`,
      credential: { id: draftId, token: "credencial-temporaria-somente-teste" },
    },
  );
  await oldDraftContext.route(`**/api/v1/public/drafts/${draftId}`, (route) => {
    if (route.request().method() === "PUT")
      oldPayload = route.request().postDataJSON().payload;
    return json(route, {
      id: draftId,
      campaignId,
      payload: oldPayload,
      health: {},
      form: oldVersion,
      submitted: false,
    });
  });
  let oldPhotoUnavailable = true;
  await oldDraftContext.route(
    `**/api/v1/public/drafts/${draftId}/photos/photo-test`,
    (route) => {
      assert.equal(
        route.request().headers()["x-draft-token"],
        "credencial-temporaria-somente-teste",
      );
      if (oldPhotoUnavailable) {
        oldPhotoUnavailable = false;
        return json(
          route,
          { message: "Storage temporariamente indisponível" },
          503,
        );
      }
      return route.fallback();
    },
  );
  const oldDraftPage = await oldDraftContext.newPage();
  await oldDraftPage.goto(`${target}/inscricao/${campaignId}`);
  await oldDraftPage
    .getByRole("heading", { name: "Regras para servir" })
    .waitFor();
  await oldDraftPage
    .getByText(/Você tem uma inscrição em andamento na versão 1/)
    .waitFor();
  assert.equal(
    await oldDraftPage.getByLabel("Nome completo", { exact: false }).count(),
    0,
  );
  await oldDraftPage.screenshot({
    path: ".local/screenshots/ficha-introducao-rascunho-anterior.png",
    fullPage: true,
  });
  await oldDraftPage
    .getByRole("button", { name: "Continuar inscrição", exact: true })
    .click();
  assert.equal(
    await oldDraftPage
      .getByLabel("Nome completo", { exact: false })
      .inputValue(),
    "Pessoa com rascunho anterior",
  );
  await oldDraftPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await oldDraftPage.getByText("Não foi possível carregar a foto.").waitFor();
  assert.equal(oldPayload.photoAssetId, "photo-test");
  assert.deepEqual(
    await oldDraftPage.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      `fac:draft:${campaignId}`,
    ),
    { id: draftId, token: "credencial-temporaria-somente-teste" },
    "Uma falha de foto não deve apagar a inscrição anterior nem sua credencial.",
  );
  await oldDraftPage
    .getByRole("button", { name: "Tentar carregar foto" })
    .click();
  await loadedPhoto(oldDraftPage, "Prévia da foto de identificação");
  await oldDraftPage
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  assert.equal(
    await oldDraftPage
      .getByLabel("Sua disponibilidade", { exact: false })
      .inputValue(),
    "Posso servir desde sexta-feira",
  );
  await oldDraftContext.close();
  assert.deepEqual(errors, []);
  console.log(
    "Editor (mouse, teclado, cancelamento, toque e rolagem), publicação, nova versão, ficha no celular, envio sem campos ocultos, retomada, responsável, avaliação e presença validados com serviços simulados. Nenhum registro ou e-mail real criado.",
  );
} catch (error) {
  if (visitor)
    await visitor.screenshot({
      path: ".local/screenshots/servos-falha-celular.png",
      fullPage: true,
    });
  await admin.screenshot({
    path: ".local/screenshots/servos-falha-painel.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
