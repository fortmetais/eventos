import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
const url = process.env.TEST_NOTICE_DATABASE_URL;
(url ? describe : describe.skip)("Mensagens de aceite por evento", () => {
  if (url && new URL(url).pathname !== "/fac_notice_tests")
    throw new Error("Use somente fac_notice_tests.");
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_notice_tests",
  });
  const users = Object.fromEntries(
    ["organizer", "secretary", "other"].map((role) => [
      role,
      { id: randomUUID(), email: `${role}@event-messages.test` },
    ]),
  );
  const send = vi.fn(async () => "ENVIADA" as const);
  const app = createApp({
    db,
    eventsEnabled: true,
    rateLimits: false,
    decisionNotificationsEnabled: true,
    decisionLinkSecret: "segredo-teste-mensagens-12345678901234567890",
    decisionEmail: { send },
    resolveIdentity: async (token) => users[token] ?? null,
  });
  const auth = (role = "organizer") => ({ Authorization: `Bearer ${role}` });
  let org: string,
    other: string,
    event: string,
    secondEvent: string,
    campaign: string,
    camperCampaign: string,
    camperForm: string,
    form: string,
    registration: string;
  const path = () =>
    `/api/v1/organizations/${org}/events/${event}/accept-message`;
  const template =
    "Paz e bem, {{nome}}! Você foi escolhido para {{evento}}. Departamento: {{departamento}}. Confirme em {{link}} até {{validade}}. {{organizacao}}";
  beforeAll(async () => {
    await db.account.createMany({ data: Object.values(users) });
    org = (
      await db.organization.create({
        data: {
          name: "Paróquia Mensagens",
          city: "Loanda",
          state: "PR",
          contact: "Secretaria",
        },
      })
    ).id;
    other = (
      await db.organization.create({
        data: {
          name: "Outra organização Mensagens",
          city: "Loanda",
          state: "PR",
          contact: "Secretaria",
        },
      })
    ).id;
    await db.membership.createMany({
      data: Object.entries(users).map(([role, user]) => ({
        organizationId: role === "other" ? other : org,
        accountId: user.id,
        role:
          role === "secretary"
            ? ("SECRETARY" as const)
            : ("ORGANIZER" as const),
      })),
    });
    const type = await db.eventType.create({
      data: { organizationId: org, name: "FAC Mensagens" },
    });
    const data = {
      organizationId: org,
      typeId: type.id,
      name: "FAC Mensagens",
      description: "Teste",
      city: "Loanda",
      location: "Chácara",
      startsAt: new Date("2027-06-01"),
      endsAt: new Date("2027-06-03"),
      status: "PUBLISHED" as const,
    };
    event = (await db.event.create({ data })).id;
    secondEvent = (
      await db.event.create({ data: { ...data, name: "Outro FAC Mensagens" } })
    ).id;
    campaign = (
      await db.campaign.create({
        data: {
          eventId: event,
          kind: "VOLUNTEER",
          opensAt: new Date("2026-01-01"),
          closesAt: new Date("2027-05-20"),
          capacity: 20,
        },
      })
    ).id;
    form = (
      await db.formVersion.create({
        data: {
          campaignId: campaign,
          version: 1,
          config: {},
          publishedAt: new Date(),
        },
      })
    ).id;
    camperCampaign = (
      await db.campaign.create({
        data: {
          eventId: event,
          kind: "CAMPER",
          opensAt: new Date("2026-01-01"),
          closesAt: new Date("2027-05-20"),
          capacity: 20,
        },
      })
    ).id;
    camperForm = (
      await db.formVersion.create({
        data: {
          campaignId: camperCampaign,
          version: 1,
          config: {},
          publishedAt: new Date(),
        },
      })
    ).id;
  });
  afterAll(() => db.$disconnect());
  it("restringe consulta/edição ao organizador e mostra padrão sem criar configuração", async () => {
    await request(app).get(path()).expect(401);
    await request(app).get(path()).set(auth("secretary")).expect(403);
    await request(app).get(path()).set(auth("other")).expect(403);
    await request(app)
      .get(`/api/v1/organizations/${other}/events/${event}/accept-message`)
      .set(auth("other"))
      .expect(404);
    const page = (await request(app).get(path()).set(auth()).expect(200)).body;
    expect(page).toMatchObject({ ready: true, revision: 0, customized: false });
    expect(page.previewValues).toMatchObject({
      nome: "Maria Exemplo",
      primeiro_nome: "Maria",
      evento: "FAC Mensagens",
      departamento: "SECRETARIA",
    });
    expect(page.template).toBe(page.defaultTemplate);
    expect(page.requiredFields).toEqual([
      { keys: ["nome", "primeiro_nome"], label: "Nome do candidato" },
      { keys: ["link"], label: "Link pessoal" },
    ]);
  });
  it("valida informações obrigatórias e salva com revisão sem enviar", async () => {
    const incomplete = await request(app)
      .put(path())
      .set(auth())
      .send({
        revision: 0,
        template:
          "Recebemos sua inscrição para servir no 3º Acampamento FAC. Confirme sua presença com a organização.",
      })
      .expect(422);
    expect(incomplete.body.error).toMatchObject({
      code: "MESSAGE_REQUIRED_FIELDS",
      message:
        "Inclua as informações automáticas obrigatórias: {{nome}} ou {{primeiro_nome}}; {{link}}.",
    });
    for (const invalid of [
      template.replace("{{link}}", ""),
      template + " {{senha}}",
      template + " {{link}}",
    ]) {
      await request(app)
        .put(path())
        .set(auth())
        .send({ revision: 0, template: invalid })
        .expect(422);
    }
    const result = (
      await request(app)
        .put(path())
        .set(auth())
        .send({ revision: 0, template })
        .expect(200)
    ).body;
    expect(result).toMatchObject({ revision: 1, customized: true, template });
    await request(app)
      .put(path())
      .set(auth())
      .send({ revision: 0, template })
      .expect(409);
    const second = (
      await request(app)
        .get(
          `/api/v1/organizations/${org}/events/${secondEvent}/accept-message`,
        )
        .set(auth())
        .expect(200)
    ).body;
    expect(second.customized).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("usa o modelo no WhatsApp com nome, alocação e link pessoal sem confirmar presença", async () => {
    const person = await db.person.create({
      data: {
        organizationId: org,
        name: "Maria Integração",
        birthDate: new Date("1990-01-01"),
        phone: "44999999999",
      },
    });
    const draft = await db.draft.create({
      data: {
        campaignId: campaign,
        formVersionId: form,
        tokenHash: randomUUID().replaceAll("-", "").repeat(2),
        expiresAt: new Date("2090-01-01"),
      },
    });
    registration = (
      await db.registration.create({
        data: {
          personId: person.id,
          campaignId: campaign,
          formVersionId: form,
          draftId: draft.id,
          protocol: `MSG-${randomUUID()}`,
          snapshot: { name: person.name, phone: person.phone },
        },
      })
    ).id;
    const base = `/api/v1/organizations/${org}/registrations/${registration}`;
    for (const status of ["REVIEW", "APPROVED"])
      await request(app)
        .patch(base + "/status")
        .set(auth())
        .send({ status, reason: "Avaliação de teste" })
        .expect(200);
    const team = await db.team.create({
      data: { eventId: event, name: "COZINHA", capacity: 2 },
    });
    await request(app)
      .put(base + "/team")
      .set(auth())
      .send({ teamId: team.id })
      .expect(200);
    const notice = (
      await request(app)
        .get(base + "/decision-notice")
        .set(auth())
        .expect(200)
    ).body.notice;
    expect(notice.message).toContain("Paz e bem, Maria Integração!");
    expect(notice.message).toContain("Departamento: COZINHA");
    expect(notice.message).toContain(notice.shortLink);
    expect(new URL(notice.whatsappLink).searchParams.get("text")).toBe(
      notice.message,
    );
    expect(notice.confirmedAt).toBeNull();
    expect(notice.whatsappSentAt).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it("impede sobrescrita concorrente e restaura padrão sem afetar candidatura", async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app).put(path()).set(auth()).send({ revision: 1, template }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = (await request(app).get(path()).set(auth()).expect(200))
      .body;
    const reset = (
      await request(app)
        .put(path())
        .set(auth())
        .send({ revision: current.revision, template: null })
        .expect(200)
    ).body;
    expect(reset.customized).toBe(false);
    expect(reset.template).toBe(reset.defaultTemplate);
    expect(
      (await db.registration.findUniqueOrThrow({ where: { id: registration } }))
        .status,
    ).toBe("APPROVED");
    expect(
      await db.auditLog.count({
        where: { entityId: event, action: "EVENT_ACCEPT_MESSAGE_RESET" },
      }),
    ).toBe(1);
  });
  it("salva primeiro nome como alternativa e prepara o WhatsApp sem o sobrenome", async () => {
    const current = (await request(app).get(path()).set(auth()).expect(200))
      .body;
    const firstNameTemplate = template.replace("{{nome}}", "{{primeiro_nome}}");
    await request(app)
      .put(path())
      .set(auth())
      .send({ revision: current.revision, template: firstNameTemplate })
      .expect(200);
    const notice = (
      await request(app)
        .get(
          `/api/v1/organizations/${org}/registrations/${registration}/decision-notice`,
        )
        .set(auth())
        .expect(200)
    ).body.notice;
    expect(notice.message).toContain("Paz e bem, Maria!");
    expect(notice.message).not.toContain("Maria Integração");
    expect(notice.message).not.toContain("{{primeiro_nome}}");
    expect(new URL(notice.whatsappLink).searchParams.get("text")).toBe(
      notice.message,
    );
    expect(send).not.toHaveBeenCalled();
    expect(
      (await db.registration.findUniqueOrThrow({ where: { id: registration } }))
        .status,
    ).toBe("APPROVED");
  });
  it("salva o texto completo e gera a mensagem pessoal sem manter variáveis", async () => {
    const current = (await request(app).get(path()).set(auth()).expect(200))
      .body;
    const completed =
      "Olá, {{primeiro_nome}}! A Paz de Jesus! ❤️🙏🏻\n\nRecebemos sua inscrição para servir no {{evento}}! ❤️‍🔥\nPrimeira espiritualidade: 14/11, às 14h.\n\nConfirme sua presença pelo link: {{link}}\nLink pessoal válido até {{validade}} (horário de Brasília).";
    await request(app)
      .put(path())
      .set(auth())
      .send({ revision: current.revision, template: completed })
      .expect(200);
    const notice = (
      await request(app)
        .get(
          `/api/v1/organizations/${org}/registrations/${registration}/decision-notice`,
        )
        .set(auth())
        .expect(200)
    ).body.notice;
    expect(notice.message).toContain("Olá, Maria! A Paz de Jesus!");
    expect(notice.message).toContain("FAC Mensagens");
    expect(notice.message).toContain(notice.shortLink);
    expect(notice.message).not.toMatch(/\{\{|\}\}/u);
    expect(new URL(notice.whatsappLink).searchParams.get("text")).toBe(
      notice.message,
    );
    expect(send).not.toHaveBeenCalled();
  });
  it("salva a mensagem fornecida com evento e datas fixos sem acrescentar campos opcionais", async () => {
    const current = (await request(app).get(path()).set(auth()).expect(200))
      .body;
    const draft = `Olá, {{primeiro_nome}}!
A Paz de Jesus! ❤️🙏🏻

Recebemos com muita alegria sua inscrição para servir no 3º Acampamento FAC! ❤️‍🔥

É uma bênção saber que Deus continua despertando corações dispostos a levar Seu amor a tantos jovens!

Agora queremos confirmar o seu SIM para essa linda missão! ❤️

📅 Acampamento: 5 a 9 de fevereiro de 2027, com disponibilidade integral, inclusive para dormir no local.

🙏🏻 Primeira espiritualidade: neste sábado, 14/11, às 14h.
🚨 A participação é obrigatória!! 🚨

Lembramos, com carinho, que a participação nas espiritualidades preparatórias é indispensável para todos os servos.

Podemos contar com você nessa missão de amor? ❤️‍🔥

Confirme sua presença pelo link: {{link}}

Que Nossa Senhora conduza seu SIM e que Deus abençoe sua entrega! 🙏🏻❤️`;
    const saved = (
      await request(app)
        .put(path())
        .set(auth())
        .send({ revision: current.revision, template: draft })
        .expect(200)
    ).body;
    expect(saved.template).toBe(draft);
    expect(saved.template).not.toContain("{{evento}}");
    expect(saved.template).not.toContain("{{validade}}");
    const notice = (
      await request(app)
        .get(
          `/api/v1/organizations/${org}/registrations/${registration}/decision-notice`,
        )
        .set(auth())
        .expect(200)
    ).body.notice;
    expect(notice.message).toContain("Olá, Maria!\nA Paz de Jesus!");
    expect(notice.message).toContain("3º Acampamento FAC");
    expect(notice.message).toContain("5 a 9 de fevereiro de 2027");
    expect(notice.message).toContain(notice.shortLink);
    expect(notice.message).not.toMatch(/\{\{|\}\}/u);
    expect(notice.message).not.toContain("Link pessoal válido até");
    expect(new URL(notice.whatsappLink).searchParams.get("text")).toBe(
      notice.message,
    );
    expect(send).not.toHaveBeenCalled();
  });
  it("mantém o endpoint antigo dos servos e acrescenta o contexto no endpoint da campanha", async () => {
    const current = (await request(app).get(path()).set(auth()).expect(200))
      .body;
    const canonical = (
      await request(app)
        .get(
          `/api/v1/organizations/${org}/campaigns/${campaign}/accept-message`,
        )
        .set(auth())
        .expect(200)
    ).body;
    const { campaign: context, ...settings } = canonical;
    expect(context).toEqual({ id: campaign, kind: "VOLUNTEER" });
    expect(settings).toEqual(current);
    const saved = (
      await request(app)
        .put(
          `/api/v1/organizations/${org}/campaigns/${campaign}/accept-message`,
        )
        .set(auth())
        .send({ revision: current.revision, template: current.template })
        .expect(200)
    ).body;
    expect(saved.campaign).toEqual(context);
    expect(
      (await request(app).get(path()).set(auth()).expect(200)).body.template,
    ).toBe(saved.template);
    expect(send).not.toHaveBeenCalled();
  });
  it("isola o modelo campista, usa sua equipe atual no WhatsApp e mantém o envio explícito", async () => {
    const camperPath = `/api/v1/organizations/${org}/campaigns/${camperCampaign}/accept-message`;
    await request(app).get(camperPath).expect(401);
    await request(app).get(camperPath).set(auth("secretary")).expect(403);
    await request(app)
      .put(camperPath)
      .set(auth("secretary"))
      .send({ revision: 0, template: null })
      .expect(403);
    await request(app).get(camperPath).set(auth("other")).expect(403);
    await request(app)
      .get(
        `/api/v1/organizations/${other}/campaigns/${camperCampaign}/accept-message`,
      )
      .set(auth("other"))
      .expect(404);
    const volunteerBefore = (
      await request(app).get(path()).set(auth()).expect(200)
    ).body;
    const initial = (await request(app).get(camperPath).set(auth()).expect(200))
      .body;
    expect(initial).toMatchObject({
      ready: true,
      customized: false,
      revision: 0,
      campaign: { id: camperCampaign, kind: "CAMPER" },
    });
    expect(initial.template).not.toMatch(/servir|departamento|equipe/iu);
    expect(initial.fields).toContainEqual({
      key: "equipe",
      label: "Equipe de campistas",
      example: "EQUIPE AZUL",
    });
    expect(initial.requiredFields).toEqual(volunteerBefore.requiredFields);
    const person = await db.person.create({
      data: {
        organizationId: org,
        name: "João Campista",
        birthDate: new Date("1990-01-01"),
        phone: "44999999999",
      },
    });
    const draft = await db.draft.create({
      data: {
        campaignId: camperCampaign,
        formVersionId: camperForm,
        tokenHash: randomUUID().replaceAll("-", "").repeat(2),
        expiresAt: new Date("2090-01-01"),
      },
    });
    const candidate = await db.registration.create({
      data: {
        personId: person.id,
        campaignId: camperCampaign,
        formVersionId: camperForm,
        draftId: draft.id,
        protocol: `CAMPER-MSG-${randomUUID()}`,
        snapshot: {
          name: person.name,
          phone: person.phone,
          contactEmail: "campista@example.test",
        },
      },
    });
    const base = `/api/v1/organizations/${org}/registrations/${candidate.id}`;
    await request(app)
      .patch(base + "/status")
      .set(auth())
      .send({
        status: "APPROVED",
        reason: "Inscrição campista aceita no teste",
      })
      .expect(200);
    const defaultNotice = (
      await request(app)
        .get(base + "/decision-notice")
        .set(auth())
        .expect(200)
    ).body.notice;
    expect(defaultNotice.message).toContain("Sua inscrição como campista");
    expect(defaultNotice.message).not.toMatch(/servir|departamento|equipe/iu);
    expect(defaultNotice.spirituality).toBeNull();
    const custom =
      "Olá, {{primeiro_nome}}! Sua inscrição como campista no {{evento}} foi aceita. Equipe: {{equipe}} / {{departamento}}. Informe se poderá participar: {{link}}";
    for (const invalid of [
      custom.replace("{{primeiro_nome}}", ""),
      custom.replace("{{link}}", ""),
      custom + " {{senha}}",
      custom + " {{link}}",
    ])
      await request(app)
        .put(camperPath)
        .set(auth())
        .send({ revision: 0, template: invalid })
        .expect(422);
    const saved = (
      await request(app)
        .put(camperPath)
        .set(auth())
        .send({ revision: 0, template: custom })
        .expect(200)
    ).body;
    expect(saved).toMatchObject({
      revision: 1,
      customized: true,
      template: custom,
    });
    const unallocated = (
      await request(app)
        .get(base + "/decision-notice")
        .set(auth())
        .expect(200)
    ).body.notice;
    expect(unallocated.message).toContain(
      "Equipe: A definir pela organização / A definir pela organização",
    );
    const group = await db.camperTeam.create({
      data: { campaignId: camperCampaign, name: "EQUIPE VERDE", capacity: 2 },
    });
    await db.registration.update({
      where: { id: candidate.id },
      data: { camperTeamId: group.id },
    });
    const notice = (
      await request(app)
        .get(base + "/decision-notice")
        .set(auth())
        .expect(200)
    ).body.notice;
    expect(notice.message).toContain("Olá, João!");
    expect(notice.message).toContain("Equipe: EQUIPE VERDE / EQUIPE VERDE");
    expect(notice.message).not.toMatch(/\{\{|servir|COZINHA/iu);
    expect(new URL(notice.whatsappLink).searchParams.get("text")).toBe(
      notice.message,
    );
    expect(notice.message).toContain(notice.shortLink);
    expect(notice.whatsappSentAt).toBeNull();
    expect(notice.confirmedAt).toBeNull();
    expect(
      (await request(app).get(path()).set(auth()).expect(200)).body,
    ).toEqual(volunteerBefore);
    expect(send).not.toHaveBeenCalled();
    await request(app)
      .post(base + "/decision-notice/email")
      .set(auth())
      .expect(200);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      to: "campista@example.test",
      text: notice.message,
    });
    send.mockClear();
    const edits = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .put(camperPath)
          .set(auth())
          .send({ revision: 1, template: custom + " Esperamos você!" }),
      ),
    );
    expect(edits.map((result) => result.status).sort()).toEqual([200, 409]);
    const current = (await request(app).get(camperPath).set(auth()).expect(200))
      .body;
    const reset = (
      await request(app)
        .put(camperPath)
        .set(auth())
        .send({ revision: current.revision, template: null })
        .expect(200)
    ).body;
    expect(reset.template).toBe(initial.defaultTemplate);
    expect(reset.customized).toBe(false);
    expect(
      (await request(app).get(path()).set(auth()).expect(200)).body,
    ).toEqual(volunteerBefore);
    expect(
      await db.auditLog.count({
        where: {
          entityId: camperCampaign,
          action: "CAMPER_ACCEPT_MESSAGE_RESET",
        },
      }),
    ).toBe(1);
  });
});
