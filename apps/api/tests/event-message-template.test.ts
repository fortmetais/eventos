import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  defaultMessageTemplate,
  defaultCamperMessageTemplate,
  camperMessageFields,
  messageFields,
  requiredMessageFields,
  renderMessageTemplate,
  validateMessageTemplate,
  type MessageValues,
  EventMessagesService,
} from "../src/modules/registrations/event-messages.service.js";
describe("Modelo de mensagem de aceite", () => {
  it("mantém padrão e bloqueia salvamento quando a atualização do banco ainda não foi aplicada", async () => {
    const query = vi.fn().mockResolvedValue([{ ready: false }]);
    const db = {
      $queryRaw: query,
      event: {
        findFirst: vi.fn().mockResolvedValue({
          id: "event",
          name: "FAC",
          startsAt: new Date("2027-02-05"),
          organization: { name: "Paróquia" },
        }),
      },
    } as unknown as PrismaClient;
    const service = new EventMessagesService(db);
    expect(await service.template("event")).toBeNull();
    expect(await service.page("org", "event")).toMatchObject({
      ready: false,
      customized: false,
      template: defaultMessageTemplate,
      requiredFields: requiredMessageFields,
      fields: expect.arrayContaining([
        {
          key: "primeiro_nome",
          label: "Primeiro nome do candidato",
          example: "Maria",
        },
      ]),
      previewValues: { nome: "Maria Exemplo", primeiro_nome: "Maria" },
    });
    await expect(
      service.save("org", "event", "actor", {
        revision: 0,
        template: defaultMessageTemplate,
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("renderiza texto simples e dados sem executar expressões ou reinterpretar respostas", () => {
    validateMessageTemplate(defaultMessageTemplate);
    const values = Object.fromEntries(
      messageFields.map((field) => [field.key, field.example]),
    ) as MessageValues;
    values.nome = "Maria {{link}} <b>Exemplo</b>";
    const text = renderMessageTemplate(defaultMessageTemplate, values);
    expect(text).toContain("Maria {{link}} <b>Exemplo</b>");
    expect(text).toContain("Departamento alocado: SECRETARIA.");
  });
  it("permite evento e datas fixos sem exigir as variáveis opcionais de evento e validade", () => {
    const draft =
      "Olá, {{primeiro_nome}}! Recebemos sua inscrição para servir no 3º Acampamento FAC, de 5 a 9 de fevereiro de 2027. Confirme sua presença pelo link: {{link}}";
    expect(() => validateMessageTemplate(draft)).not.toThrow();
    expect(() =>
      validateMessageTemplate(draft.replace("{{primeiro_nome}}", "{{nome}}")),
    ).not.toThrow();
    const values = Object.fromEntries(
      messageFields.map((field) => [field.key, field.example]),
    ) as MessageValues;
    expect(
      renderMessageTemplate(
        `${draft}\nEvento: {{evento}}. Link válido até {{validade}}.`,
        values,
      ),
    ).toContain(
      "Evento: Acampamento de exemplo. Link válido até [data e horário de vencimento].",
    );
  });
  it("informa juntos nome e link quando faltam as informações que continuam obrigatórias", () => {
    const draft =
      "Recebemos sua inscrição para servir no 3º Acampamento FAC. Confirme sua presença com a organização.";
    expect(() => validateMessageTemplate(draft)).toThrow(
      "Inclua as informações automáticas obrigatórias: {{nome}} ou {{primeiro_nome}}; {{link}}.",
    );
    try {
      validateMessageTemplate(draft);
    } catch (error) {
      expect(error).toMatchObject({
        status: 422,
        code: "MESSAGE_REQUIRED_FIELDS",
      });
    }
  });
  it.each([
    ["Maria Clara de Souza", "Maria"],
    ["  José Luís de Almeida  ", "José"],
    ["\u2003Érica\u00a0dos\tSantos\n", "Érica"],
    ["Ana-Maria Silva", "Ana-Maria"],
    ["João", "João"],
  ])(
    "usa somente o primeiro nome de %s sem alterar o nome completo",
    (name, first) => {
      const template = defaultMessageTemplate.replace(
        "{{nome}}",
        "{{primeiro_nome}}",
      );
      expect(() => validateMessageTemplate(template)).not.toThrow();
      const values = Object.fromEntries(
        messageFields.map((field) => [field.key, field.example]),
      ) as MessageValues;
      values.nome = name;
      expect(renderMessageTemplate(template, values)).toContain(
        `Olá, ${first}!`,
      );
      expect(
        renderMessageTemplate("{{nome}} · {{ primeiro_nome }}", values),
      ).toBe(`${name} · ${first}`);
    },
  );
  it.each([
    defaultMessageTemplate.replace("{{nome}}", ""),
    defaultMessageTemplate.replace("{{nome}}", "{{apelido}}"),
    defaultMessageTemplate.replace("{{link}}", ""),
    defaultMessageTemplate + " {{link}}",
    defaultMessageTemplate + " {{saude}}",
    defaultMessageTemplate + " {{nome",
    "x".repeat(5001),
  ])("rejeita modelo incompleto ou desconhecido", (template) => {
    expect(() => validateMessageTemplate(template)).toThrow();
  });
});

describe("Mensagens separadas por público da campanha", () => {
  const event = {
    id: "event",
    name: "FAC",
    startsAt: new Date("2027-02-05"),
    organization: { name: "Paróquia" },
  };
  it("mantém o padrão campista sem servir ou equipe e oferece equipe como variável opcional", () => {
    expect(defaultCamperMessageTemplate).toContain("inscrição como campista");
    expect(defaultCamperMessageTemplate).not.toMatch(
      /servir|departamento|equipe/iu,
    );
    expect(() =>
      validateMessageTemplate(defaultCamperMessageTemplate, "CAMPER"),
    ).not.toThrow();
    expect(camperMessageFields).toContainEqual({
      key: "equipe",
      label: "Equipe de campistas",
      example: "EQUIPE AZUL",
    });
    const template =
      "Olá, {{primeiro_nome}}! Equipe {{equipe}} · {{departamento}}. Responda em {{link}}";
    expect(() => validateMessageTemplate(template, "CAMPER")).not.toThrow();
    expect(() => validateMessageTemplate(template)).toThrow();
    const values = Object.fromEntries(
      messageFields.map((field) => [field.key, field.example]),
    ) as MessageValues;
    values.departamento = "A definir pela organização";
    expect(renderMessageTemplate(template, values)).toContain(
      "Equipe A definir pela organização · A definir pela organização",
    );
    values.departamento = "EQUIPE VERDE";
    values.equipe = "EQUIPE VERDE";
    expect(renderMessageTemplate(template, values)).toContain(
      "Equipe EQUIPE VERDE · EQUIPE VERDE",
    );
  });
  it("mantém a exigência do nome e de um único link para campistas", () => {
    for (const template of [
      "Olá, candidato. Inscrição aceita; fale com a organização.",
      defaultCamperMessageTemplate.replace("{{nome}}", "Maria"),
      defaultCamperMessageTemplate + " {{link}}",
      defaultCamperMessageTemplate + " {{saude}}",
    ])
      expect(() => validateMessageTemplate(template, "CAMPER")).toThrow();
  });
  it("não lê o modelo dos servos quando a tabela de campistas ainda não foi aplicada", async () => {
    const read = vi.fn();
    const transaction = vi.fn();
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ ready: false }]),
      $transaction: transaction,
      camperAcceptMessage: { findUnique: read },
      campaign: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            id: "camper",
            kind: "CAMPER",
            eventId: "event",
            event,
          }),
      },
    } as unknown as PrismaClient;
    const service = new EventMessagesService(db);
    expect(
      await service.campaignTemplate("camper", "CAMPER", "event"),
    ).toBeNull();
    expect(await service.campaignPage("org", "camper")).toMatchObject({
      ready: false,
      revision: 0,
      customized: false,
      campaign: { id: "camper", kind: "CAMPER" },
      template: defaultCamperMessageTemplate,
      previewValues: { equipe: "EQUIPE AZUL", departamento: "EQUIPE AZUL" },
    });
    await expect(
      service.saveCampaign("org", "camper", "actor", {
        revision: 0,
        template: defaultCamperMessageTemplate,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(read).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
  it("carrega o modelo pela campanha sem misturar mensagens de servos e campistas", async () => {
    const read = vi.fn().mockResolvedValue({ content: "Modelo campista" });
    const query = vi
      .fn()
      .mockImplementation((strings: TemplateStringsArray) =>
        Promise.resolve(
          strings.join("").includes("to_regclass")
            ? [{ ready: true }]
            : [{ content: "Modelo servo" }],
        ),
      );
    const service = new EventMessagesService({
      $queryRaw: query,
      camperAcceptMessage: { findUnique: read },
    } as unknown as PrismaClient);
    expect(
      await service.campaignTemplate("volunteer", "VOLUNTEER", "event"),
    ).toBe("Modelo servo");
    expect(read).not.toHaveBeenCalled();
    expect(await service.campaignTemplate("camper", "CAMPER", "event")).toBe(
      "Modelo campista",
    );
    expect(read).toHaveBeenCalledExactlyOnceWith({
      where: { campaignId: "camper" },
      select: { content: true },
    });
  });
  it("resolve a campanha dentro da organização antes de ler ou salvar seu modelo", async () => {
    const query = vi.fn();
    const read = vi.fn();
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new EventMessagesService({
      $queryRaw: query,
      campaign: { findFirst },
      camperAcceptMessage: { findUnique: read },
    } as unknown as PrismaClient);
    await expect(
      service.campaignPage("org", "other-campaign"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.saveCampaign("org", "other-campaign", "actor", {
        revision: 0,
        template: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "other-campaign", event: { organizationId: "org" } },
      include: { event: { include: { organization: true } } },
    });
    expect(query).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});
