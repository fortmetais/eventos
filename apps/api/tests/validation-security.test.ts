import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  draftPayloadSchema,
  fullPayloadSchema,
} from "../src/modules/registrations/registrations.validation.js";
import { id } from "../src/core/security.js";
import { departmentSchema } from "../src/modules/events/departments.validation.js";

describe("Compatibilidade e segurança após atualizar o Zod", () => {
  it("preserva os identificadores determinísticos do PostgreSQL sem aceitar formatos inválidos", () => {
    expect(id.parse("f4b28d51-0283-d774-25c7-bc8b864d6b8f")).toBe(
      "f4b28d51-0283-d774-25c7-bc8b864d6b8f",
    );
    expect(
      departmentSchema.parse({
        id: "f4b28d51-0283-d774-25c7-bc8b864d6b8f",
        name: "ANJOS",
        capacity: 10,
      }).id,
    ).toBe("f4b28d51-0283-d774-25c7-bc8b864d6b8f");
    for (const value of [
      "invalido",
      "f4b28d51-0283-d774-25c7-bc8b864d6b8f/extra",
      "f4b28d51-0283-d774-25c7-bc8b864d6b8x",
    ])
      expect(id.safeParse(value).success).toBe(false);
  });
  it("preserva respostas esparsas com os tipos aceitos e recusa valores fora do contrato", () => {
    const answers = {
      texto: "Resposta",
      numero: 3,
      aceite: false,
      opcoes: ["ANJOS"],
    };
    expect(draftPayloadSchema.parse({ answers }).answers).toEqual(answers);
    expect(
      draftPayloadSchema.safeParse({
        answers: { texto: { valor: "aninhado" } },
      }).success,
    ).toBe(false);
  });
  it("preserva a mensagem do aceite obrigatório e os valores padrão", () => {
    const input = {
      name: "Pessoa de teste",
      birthDate: "1990-01-01",
      phone: "44999991234",
      termsAccepted: true,
    };
    expect(fullPayloadSchema.parse(input)).toMatchObject({
      answers: {},
      imageAuthorized: false,
    });
    const result = fullPayloadSchema.safeParse({
      ...input,
      termsAccepted: false,
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["termsAccepted"],
          message: "Aceite os termos para enviar.",
        }),
      );
  });
  it("recusa uma coleção excessiva sem esgotar a memória do processo", () => {
    const script = `import assert from 'node:assert/strict'; import {z} from 'zod';
      const result=z.array(z.object({value:z.string()})).max(30).safeParse(Array(100000).fill({}));
      assert.equal(result.success,false);`;
    expect(() =>
      execFileSync(
        process.execPath,
        ["--max-old-space-size=64", "--input-type=module", "-e", script],
        { timeout: 15000, stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});
