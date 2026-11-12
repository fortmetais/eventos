import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  defaultMessageTemplate,
  messageFields,
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
