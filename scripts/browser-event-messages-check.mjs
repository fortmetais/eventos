import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import {
  defaultMessageTemplate,
  messageFields,
  requiredMessageFields,
  validateMessageTemplate,
} from "../apps/api/dist/modules/registrations/event-messages.service.js";

// Browser-only mocks. Never uses the production database, credentials or messaging providers.
const target = process.env.PREVIEW_URL ?? "http://127.0.0.1:5186";
if (!["localhost", "127.0.0.1"].includes(new URL(target).hostname))
  throw new Error("Use somente a prévia local.");
const org = "00000000-0000-4000-8000-000000000001",
  event = "00000000-0000-4000-8000-000000000002",
  account = "00000000-0000-4000-8000-000000000003";
const noticeId = "00000000-0000-4000-8000-000000000004";
const token = Buffer.alloc(32, 129).toString("base64url");
const code = Buffer.concat([
  Buffer.from(noticeId.replaceAll("-", ""), "hex"),
  Buffer.from(token, "base64url"),
]).toString("base64url");
const user = {
  id: account,
  email: "organizador@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
};
const now = Math.floor(Date.now() / 1000);
const session = {
  access_token: [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: account,
        aud: "authenticated",
        exp: now + 3600,
        iat: now,
      }),
    ).toString("base64url"),
    "fixture",
  ].join("."),
  refresh_token: "fixture",
  expires_in: 3600,
  expires_at: now + 3600,
  token_type: "bearer",
  user,
};
const organization = {
  id: org,
  name: "Paróquia Testes",
  city: "Loanda",
  state: "PR",
  kind: "PARISH",
  active: true,
};
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32"
    ? {
        executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      }
    : {}),
});
mkdirSync(".local/screenshots", { recursive: true });
try {
  for (const mobile of [false, true]) {
    const errors = [];
    const settings = {
      ready: true,
      event: { id: event, name: "FAC dos testes" },
      revision: 0,
      template: defaultMessageTemplate,
      defaultTemplate: defaultMessageTemplate,
      customized: false,
      fields: messageFields,
      ...(mobile ? {} : { requiredFields: requiredMessageFields }),
      previewValues: {
        ...Object.fromEntries(messageFields.map((f) => [f.key, f.example])),
        evento: "FAC dos testes",
        organizacao: organization.name,
        link: `${target}/r#${code}`,
      },
    };
    const savedBodies = [];
    let saves = 0,
      putAttempts = 0,
      confirmations = 0,
      confirmedAt = null,
      declinedAt = null,
      spiritualityConfigured = true,
      spiritualityAnswer = null,
      spiritualityRespondedAt = null,
      spiritualityResponses = 0;
    const responseSummary = () => ({
      kind: "ACEITE",
      participation: "VOLUNTEER",
      candidateName: "Maria",
      confirmedAt,
      declinedAt,
      canRespond: true,
      expiresAt: "2027-01-30T12:00:00Z",
      spirituality: spiritualityConfigured
        ? {
            startsAt: "2026-11-14T17:00:00.000Z",
            answer: spiritualityAnswer,
            respondedAt: spiritualityRespondedAt,
            canRespond: true,
          }
        : null,
      event: {
        name: settings.event.name,
        startsAt: "2027-02-05",
        endsAt: "2027-02-09",
        organization: organization.name,
      },
    });
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
      timezoneId: mobile ? "Asia/Tokyo" : "America/Los_Angeles",
    });
    await context.addInitScript(
      (value) =>
        localStorage.setItem("sb-auth-auth-token", JSON.stringify(value)),
      session,
    );
    await context.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      const json = (value) => route.fulfill({ json: value });
      if (url.hostname === "auth.encontro.invalid")
        return route.fulfill({
          status: req.method() === "OPTIONS" ? 204 : 200,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers":
              "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
            "access-control-allow-methods": "GET,POST,OPTIONS",
          },
          ...(req.method() === "OPTIONS" ? {} : { json: user }),
        });
      if (path === "/api/v1/config")
        return json({
          supabaseUrl: "https://auth.encontro.invalid",
          supabaseAnonKey: "sb_publishable_test",
          eventsEnabled: false,
          eventManagementEnabled: true,
          volunteerRegistrationsEnabled: true,
          volunteerRegistrationsReady: true,
        });
      if (path === "/api/v1/me/access")
        return json({
          account: {
            id: account,
            email: user.email,
            profile: {},
            platformAdmin: false,
          },
          organizations: [
            {
              id: "membership",
              accountId: account,
              organizationId: org,
              organization,
              role: "ORGANIZER",
              active: true,
              healthEventIds: [],
            },
          ],
        });
      if (path === `/api/v1/organizations/${org}/events`)
        return json([{ id: event, name: settings.event.name }]);
      if (
        path === `/api/v1/organizations/${org}/events/${event}/accept-message`
      ) {
        if (req.method() === "PUT") {
          putAttempts++;
          const body = req.postDataJSON();
          assert.equal(body.revision, settings.revision);
          try {
            if (body.template !== null) validateMessageTemplate(body.template);
          } catch (error) {
            return route.fulfill({
              status: error.status ?? 422,
              json: {
                error: { code: error.code, message: error.message },
              },
            });
          }
          settings.template = body.template ?? defaultMessageTemplate;
          settings.customized = body.template !== null;
          settings.revision++;
          saves++;
          savedBodies.push(body);
        }
        return json(settings);
      }
      if (
        path === `/api/v1/public/decision-responses/${noticeId}/view` ||
        path === `/api/v1/public/decision-responses/${noticeId}` ||
        path === `/api/v1/public/decision-responses/${noticeId}/spirituality`
      ) {
        assert.equal(req.postDataJSON().token, token);
        if (path.endsWith("/spirituality")) {
          assert.equal(typeof req.postDataJSON().response, "boolean");
          assert.equal(spiritualityConfigured, true);
          spiritualityResponses++;
          spiritualityAnswer = req.postDataJSON().response;
          spiritualityRespondedAt = new Date().toISOString();
        } else if (!path.endsWith("/view")) {
          confirmations++;
          if (req.postDataJSON().resposta === "NAO_IREI") {
            declinedAt = new Date().toISOString();
            confirmedAt = null;
          } else {
            confirmedAt = new Date().toISOString();
            declinedAt = null;
          }
        }
        return json(responseSummary());
      }
      if (path.startsWith("/api/")) {
        errors.push(`${req.method()} ${path}`);
        return route.fulfill({ status: 404, json: {} });
      }
      if (url.origin === new URL(target).origin) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${target}/organizacao/${org}/mensagens?evento=${event}`);
    const editor = page.getByRole("textbox", { name: /Texto da mensagem/ });
    await expect(editor).toHaveValue(defaultMessageTemplate);
    const preview = page.getByRole("region", { name: "Prévia da mensagem" });
    const insertions = page.getByRole("region", {
      name: "Inserir informações automáticas",
    });
    const editorBox = await editor.boundingBox();
    const previewBox = await preview.locator(".message-preview").boundingBox();
    const insertionsBox = await insertions.boundingBox();
    assert(editorBox && previewBox && insertionsBox);
    await page.screenshot({
      path: `.local/screenshots/event-messages-layout-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    if (mobile) {
      assert(
        previewBox.y >= editorBox.y + editorBox.height,
        "A prévia deve vir abaixo do editor no celular.",
      );
    } else {
      assert(
        Math.abs(editorBox.y - previewBox.y) <= 2,
        "Editor e prévia devem começar alinhados.",
      );
      assert(
        Math.abs(editorBox.width - previewBox.width) <= 2,
        "As colunas devem ter a mesma largura.",
      );
    }
    assert(
      insertionsBox.y >=
        Math.max(
          editorBox.y + editorBox.height,
          previewBox.y + previewBox.height,
        ),
      "As opções automáticas devem ficar abaixo dos dois campos.",
    );
    await editor.fill(
      "Paz e bem, {{nome}}! Você foi escolhido para {{evento}}. Confirme em {{link}} até {{validade}}.\nDepartamento: ",
    );
    await editor.focus();
    await editor.evaluate((input) => {
      const start = input.value.indexOf("{{nome}}");
      input.setSelectionRange(start, start + "{{nome}}".length);
    });
    await page
      .getByRole("button", { name: "Inserir primeiro nome do candidato" })
      .click();
    await expect(editor).toHaveValue(/Paz e bem, \{\{primeiro_nome\}\}!/);
    await expect(preview).toContainText("Paz e bem, Maria!");
    await expect(preview).not.toContainText("Maria Exemplo");
    await editor.focus();
    await editor.evaluate((input) =>
      input.setSelectionRange(input.value.length, input.value.length),
    );
    await page
      .getByRole("button", { name: "Inserir departamento alocado" })
      .click();
    await expect(editor).toHaveValue(/Departamento: \{\{departamento\}\}$/);
    await expect(
      page.getByRole("region", { name: "Prévia da mensagem" }),
    ).toContainText("Departamento: SECRETARIA");
    assert.equal(saves, 0);
    await page.getByRole("button", { name: "Salvar mensagem" }).click();
    await expect(
      page.getByText(/Mensagem salva para este evento/),
    ).toBeVisible();
    assert.equal(saves, 1);
    await page.reload();
    await expect(editor).toHaveValue(settings.template);
    assert(settings.template.includes("{{primeiro_nome}}"));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `.local/screenshots/event-messages-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    const saveButton = page.getByRole("button", { name: "Salvar mensagem" });
    const draft =
      "Olá, {{primeiro_nome}}! A Paz de Jesus! Recebemos sua inscrição para servir no 3º Acampamento FAC. Confirme sua presença pelo link: {{link}}";
    const savedBeforeUserDraft = settings.template;
    const attemptsBeforeUserDraft = putAttempts;
    await editor.fill(draft);
    const missingFields = page.getByRole("region", {
      name: "Informações obrigatórias para salvar",
      exact: true,
    });
    await expect(missingFields).toHaveCount(0);
    await expect(saveButton).toBeEnabled();
    await expect(page.getByText(/Alterações ainda não salvas/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Inserir nome do evento", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Inserir validade do link",
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(putAttempts, attemptsBeforeUserDraft);
    assert.equal(settings.template, savedBeforeUserDraft);
    await page.screenshot({
      path: `.local/screenshots/event-messages-optional-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await saveButton.click();
    await expect(
      page.getByText(/Mensagem salva para este evento/),
    ).toBeVisible();
    await expect(page.getByText(/Alterações ainda não salvas/)).toHaveCount(0);
    assert.equal(saves, 2);
    assert.equal(
      savedBodies.at(-1).template,
      draft,
      "O texto do usuário deve ser salvo exatamente como foi escrito.",
    );
    assert(!settings.template.includes("{{evento}}"));
    assert(!settings.template.includes("{{validade}}"));
    await page.reload();
    await expect(editor).toHaveValue(draft);
    const incomplete =
      "Sua candidatura foi aceita! Confirme sua presença com a organização.";
    const attemptsBeforeIncompleteDraft = putAttempts;
    await editor.fill(incomplete);
    await expect(missingFields).toBeVisible();
    await expect(missingFields.locator("li")).toHaveCount(2);
    await expect(missingFields).toContainText("{{primeiro_nome}}");
    await expect(missingFields).toContainText("{{link}}");
    await expect(missingFields).not.toContainText("{{evento}}");
    await expect(missingFields).not.toContainText("{{validade}}");
    await expect(saveButton).toBeDisabled();
    await expect(page.getByText(/Alterações ainda não salvas/)).toBeVisible();
    await saveButton.evaluate((button) => button.click());
    assert.equal(
      putAttempts,
      attemptsBeforeIncompleteDraft,
      "Rascunho incompleto não pode enviar PUT.",
    );
    assert.equal(settings.template, draft);
    await page.screenshot({
      path: `.local/screenshots/event-messages-required-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: "Adicionar informações obrigatórias",
        exact: true,
      })
      .click();
    const completed =
      "Olá, {{primeiro_nome}}!\n\n" +
      incomplete +
      "\n\nConfirme sua presença pelo link: {{link}}";
    await expect(editor).toHaveValue(completed);
    await expect(missingFields).toHaveCount(0);
    await expect(saveButton).toBeEnabled();
    await expect(page.getByText(/Alterações ainda não salvas/)).toBeVisible();
    assert.equal(
      settings.template,
      draft,
      "Completar informações altera somente a edição local.",
    );
    assert.equal(putAttempts, attemptsBeforeIncompleteDraft);
    await expect(preview).toContainText("Olá, Maria!");
    await expect(preview).toContainText(incomplete);
    await expect(preview).not.toContainText("{{");
    await page.screenshot({
      path: `.local/screenshots/event-messages-completed-draft-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await saveButton.click();
    await expect(
      page.getByText(/Mensagem salva para este evento/),
    ).toBeVisible();
    await expect(page.getByText(/Alterações ainda não salvas/)).toHaveCount(0);
    assert.equal(saves, 3);
    assert.equal(savedBodies.at(-1).template, completed);
    for (const variable of ["primeiro_nome", "link"])
      assert(
        settings.template.includes(`{{${variable}}}`),
        `O modelo salvo deve preservar {{${variable}}}.`,
      );
    assert(!settings.template.includes("{{evento}}"));
    assert(!settings.template.includes("{{validade}}"));
    await page.reload();
    await expect(editor).toHaveValue(completed);
    await expect(page.getByText(/Alterações ainda não salvas/)).toHaveCount(0);
    await editor.fill(completed + "\n{{apelido}}");
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByRole("alert")).toContainText(
      "informação automática desconhecida",
    );
    await expect(editor).toHaveValue(completed + "\n{{apelido}}");
    await expect(page.getByText(/Alterações ainda não salvas/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Recarregar modelo salvo" }),
    ).toHaveCount(0);
    assert.equal(saves, 3, "Validação 422 preserva o último modelo salvo.");
    assert.equal(settings.template, completed);
    await page.getByRole("button", { name: "Restaurar texto padrão" }).click();
    await expect(editor).toHaveValue(defaultMessageTemplate);
    assert.equal(saves, 3);
    await page.getByRole("button", { name: "Salvar mensagem" }).click();
    await expect(
      page.getByText(/Mensagem salva para este evento/),
    ).toBeVisible();
    assert.equal(saves, 4);
    await page.goto(`${target}/r#${code}`);
    await expect(
      page.getByRole("button", { name: "Vou participar" }),
    ).toBeVisible();
    assert.equal(new URL(page.url()).pathname, `/resposta/${noticeId}`);
    assert.equal(new URL(page.url()).hash, "");
    assert.equal(confirmations, 0);
    const eventParticipation = page.getByRole("group", {
      name: "Participação no evento",
      exact: true,
    });
    const spiritualityParticipation = page.getByRole("group", {
      name: "Participação na espiritualidade",
      exact: true,
    });
    await expect(eventParticipation).toBeVisible();
    await expect(spiritualityParticipation).toBeVisible();
    await expect(page.locator("#spirituality-question")).toHaveText(
      "Você participará da espiritualidade do dia 14/11/2026 às 14:00 horas?",
    );
    const campButtons = [
      eventParticipation.getByRole("button", {
        name: "Vou participar",
        exact: true,
      }),
      eventParticipation.getByRole("button", { name: "Não irei", exact: true }),
    ];
    const spiritualityButtons = [
      spiritualityParticipation.getByRole("button", {
        name: "Sim",
        exact: true,
      }),
      spiritualityParticipation.getByRole("button", {
        name: "Não",
        exact: true,
      }),
    ];
    for (const button of [...campButtons, ...spiritualityButtons]) {
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute("aria-pressed", "false");
    }
    const campBounds = await eventParticipation.boundingBox();
    const spiritualityBounds = await spiritualityParticipation.boundingBox();
    const introductionBounds = await page
      .locator("#participation-question")
      .boundingBox();
    const spiritualityQuestionBounds = await page
      .locator("#spirituality-question")
      .boundingBox();
    const footerBounds = await page
      .getByText("Você pode confirmar sem criar conta.", { exact: false })
      .boundingBox();
    assert(
      campBounds &&
        spiritualityBounds &&
        introductionBounds &&
        spiritualityQuestionBounds &&
        footerBounds &&
        introductionBounds.y + introductionBounds.height <= campBounds.y &&
        campBounds.y + campBounds.height <= spiritualityQuestionBounds.y &&
        spiritualityQuestionBounds.y + spiritualityQuestionBounds.height <=
          spiritualityBounds.y &&
        spiritualityBounds.y + spiritualityBounds.height <= footerBounds.y,
      "A página deve mostrar introdução, participação no evento, espiritualidade e rodapé nessa ordem.",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "A confirmação não deve criar rolagem horizontal.",
    );
    const noVisibleExpiry = async () => {
      await expect(page.locator("main")).not.toContainText("Responda até");
      await expect(page.locator("main")).not.toContainText(
        "pode alterar sua resposta até",
      );
      await expect(page.locator("main")).not.toContainText("30/01/2027");
    };
    await noVisibleExpiry();
    await page.screenshot({
      path: `.local/screenshots/decision-response-spirituality-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await spiritualityButtons[0].click();
    await expect(spiritualityButtons[0]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(spiritualityButtons[1]).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    for (const button of campButtons)
      await expect(button).toHaveAttribute("aria-pressed", "false");
    assert.equal(spiritualityResponses, 1);
    assert.equal(
      confirmations,
      0,
      "Responder à espiritualidade não confirma a participação no acampamento.",
    );
    assert.equal(confirmedAt, null);
    assert.equal(declinedAt, null);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Vou participar" }),
    ).toBeVisible();
    assert.equal(confirmations, 0);
    await expect(spiritualityButtons[0]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    assert.equal(
      spiritualityResponses,
      1,
      "Recarregar deve consultar, sem criar resposta de espiritualidade.",
    );
    await spiritualityButtons[1].click();
    await expect(spiritualityButtons[1]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(spiritualityButtons[0]).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    assert.equal(spiritualityResponses, 2);
    assert.equal(spiritualityAnswer, false);
    assert.equal(confirmations, 0);
    await page.reload();
    await expect(spiritualityButtons[1]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    assert.equal(spiritualityResponses, 2);
    assert.equal(confirmations, 0);
    await campButtons[1].click();
    await expect(page.getByText(/informou que não irá/)).toBeVisible();
    assert.equal(confirmations, 1);
    assert.equal(
      spiritualityAnswer,
      false,
      "Não ir ao acampamento não apaga a resposta da espiritualidade.",
    );
    await expect(spiritualityButtons[1]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(campButtons[1]).toHaveAttribute("aria-pressed", "true");
    await expect(campButtons[0]).toHaveAttribute("aria-pressed", "false");
    for (const button of campButtons) await expect(button).toBeVisible();
    await noVisibleExpiry();
    await campButtons[0].click();
    await expect(
      page.getByRole("heading", { name: "Você informou que vai participar!" }),
    ).toBeVisible();
    assert.equal(confirmations, 2);
    assert.equal(spiritualityResponses, 2);
    assert.equal(spiritualityAnswer, false);
    await expect(campButtons[0]).toHaveAttribute("aria-pressed", "true");
    await expect(campButtons[1]).toHaveAttribute("aria-pressed", "false");
    await expect(spiritualityButtons[1]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const button of [...campButtons, ...spiritualityButtons])
      await expect(button).toBeEnabled();
    await noVisibleExpiry();
    await page.screenshot({
      path: `.local/screenshots/decision-response-independent-answers-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
      animations: "disabled",
    });
    spiritualityConfigured = false;
    await page.reload();
    await expect(eventParticipation).toBeVisible();
    await expect(spiritualityParticipation).toHaveCount(0);
    await expect(
      page.getByText(/Você participará da espiritualidade/),
    ).toHaveCount(0);
    assert.equal(spiritualityResponses, 2);
    await noVisibleExpiry();
    await page.screenshot({
      path: `.local/screenshots/decision-response-without-spirituality-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
      animations: "disabled",
    });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `Mensagens ${mobile ? "celular" : "desktop"}: editor e link compacto preservados; página pública sem prazo exibido, ordem visual, respostas independentes de evento/espiritualidade, recarga, troca Sim→Não e ausência de configuração aprovados.`,
    );
  }
} finally {
  await browser.close();
}
