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
        findFirst: vi
          .fn()
          .mockResolvedValue({
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
    defaultMessageTemplate.replace("{{link}}", ""),
    defaultMessageTemplate + " {{link}}",
    defaultMessageTemplate + " {{saude}}",
    defaultMessageTemplate + " {{nome",
    "x".repeat(5001),
  ])("rejeita modelo incompleto ou desconhecido", (template) => {
    expect(() => validateMessageTemplate(template)).toThrow();
  });
});
