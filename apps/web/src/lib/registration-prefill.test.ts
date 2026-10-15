import { describe, expect, it } from "vitest";
import { defaultLayout } from "@fac/form-layout";
import {
  mergePrefill,
  prefillIdentity,
  prefillIdentityKey,
} from "./registration-prefill";
import type { PublicCampaign } from "./types";
const form = {
  askShirt: true,
  questions: [
    { id: "cidade", type: "text", options: [] },
    { id: "sexo", type: "single", options: ["Masculino", "Feminino"] },
    { id: "paroquia", type: "text", options: [] },
  ],
} as unknown as PublicCampaign["form"]["config"];
describe("Sugestões limitadas de dados anteriores", () => {
  it("consulta somente com os três dados preenchidos e diferencia a identificação atual", () => {
    expect(
      prefillIdentity({ name: "Maria Teste", birthDate: "2000-01-01" }),
    ).toBeNull();
    expect(
      prefillIdentity({
        name: "Maria",
        birthDate: "2000-01-01",
        phone: "44999999999",
      }),
    ).toBeNull();
    expect(
      prefillIdentity({
        name: "Maria Teste",
        birthDate: "2000-01-01",
        phone: "+55 (44) 99999-9999",
      }),
    ).not.toBeNull();
    expect(prefillIdentityKey({ name: "Maria Teste" })).not.toBe(
      prefillIdentityKey({ name: "Ana Teste" }),
    );
  });
  it("preenche somente cidade, sexo e camiseta sem copiar campos privados ou termos", () => {
    const result = mergePrefill(
      {},
      {
        shirt: "G",
        name: "Outro Nome",
        termsAccepted: true,
        guardianName: "Privado",
        answers: { cidade: "Loanda", sexo: "Feminino", paroquia: "Privado" },
      },
      form,
      "VOLUNTEER",
    );
    expect(result).toEqual({
      changed: true,
      payload: { shirt: "G", answers: { cidade: "Loanda", sexo: "Feminino" } },
    });
  });
  it("preserva respostas digitadas e recuperadas do rascunho", () => {
    const payload = {
      shirt: "P",
      answers: {
        cidade: "Cidade digitada",
        sexo: "Masculino",
        paroquia: "Resposta atual",
      },
    };
    const result = mergePrefill(
      payload,
      { shirt: "G", answers: { cidade: "Outra", sexo: "Feminino" } },
      form,
      "VOLUNTEER",
    );
    expect(result.changed).toBe(false);
    expect(result.payload).toBe(payload);
  });
  it("respeita campos ocultos, reordenados e opções compatíveis", () => {
    const custom = { ...form, layout: defaultLayout(form, "VOLUNTEER") };
    for (const step of custom.layout.steps) {
      step.fields.reverse();
      for (const f of step.fields)
        if (["question:sexo", "base:shirt"].includes(f.key)) f.hidden = true;
    }
    expect(
      mergePrefill(
        {},
        { shirt: "G", answers: { cidade: "Loanda", sexo: "Feminino" } },
        custom,
        "VOLUNTEER",
      ).payload,
    ).toEqual({ answers: { cidade: "Loanda" } });
    expect(
      mergePrefill(
        {},
        { shirt: "G1", answers: { sexo: "Opção inexistente" } },
        form,
        "VOLUNTEER",
      ).changed,
    ).toBe(false);
  });
  it("não transforma uma resposta única em resposta de uma pergunta de múltipla seleção", () => {
    const custom = {
      ...form,
      questions: form.questions.map((q) =>
        q.id === "sexo" ? { ...q, type: "multiple" as const } : q,
      ),
    };
    expect(
      mergePrefill({}, { answers: { sexo: "Feminino" } }, custom, "VOLUNTEER")
        .changed,
    ).toBe(false);
  });
});
