import { describe, expect, it } from "vitest";
import {
  ageAt,
  validateSubmission,
  validCpf,
} from "../src/modules/registrations/registrations.validation.js";
import {
  campaignIsOpen,
  formSchema,
} from "../src/modules/events/events.validation.js";
const form = {
  askCpf: false,
  askAddress: false,
  askShirt: true,
  questions: [],
  terms: "Termos de demonstração para validação da ficha.",
};
const payload = {
  name: "Pessoa de Teste",
  phone: "(44) 99999-1111",
  birthDate: "1990-01-01",
  photoAssetId: "00000000-0000-4000-a000-000000000111",
  emergencyName: "Contato de Teste",
  emergencyPhone: "44999992222",
  emergencyRelationship: "Amigo",
  termsAccepted: true,
};
const health = {
  hasAllergies: false,
  hasMedication: false,
  hasDiet: false,
  hasCondition: false,
  hasNeeds: false,
};
describe("Regras de inscrição", () => {
  it("calcula maioridade na data do evento, incluindo aniversário", () => {
    expect(ageAt("2008-10-08", new Date("2026-10-07"))).toBe(17);
    expect(ageAt("2008-10-07", new Date("2026-10-07"))).toBe(18);
  });
  it("normaliza telefone sem exigir e-mail ou conta", () => {
    const result = validateSubmission(
      payload,
      health,
      form,
      new Date("2027-01-01"),
      "CAMPER",
    );
    expect(result.payload.phone).toBe("44999991111");
    expect(result.payload.email).toBeUndefined();
  });
  it("exige responsável e autorização para menores", () => {
    expect(() =>
      validateSubmission(
        { ...payload, birthDate: "2015-01-01" },
        health,
        form,
        new Date("2027-01-01"),
        "CAMPER",
      ),
    ).toThrow(/responsável/);
  });
  it("valida detalhes condicionais de saúde e remove detalhes para Não", () => {
    expect(() =>
      validateSubmission(
        payload,
        { ...health, hasAllergies: true },
        form,
        new Date("2027-01-01"),
        "CAMPER",
      ),
    ).toThrow(/saúde/);
    expect(
      validateSubmission(
        payload,
        { ...health, allergies: "Informação antiga" },
        form,
        new Date("2027-01-01"),
        "CAMPER",
      ).health.allergies,
    ).toBe("");
  });
  it("aceita a resposta Não em pergunta obrigatória", () => {
    expect(() =>
      validateSubmission(
        { ...payload, answers: { retreat: false } },
        health,
        {
          ...form,
          questions: [
            {
              id: "retreat",
              label: "Já participou?",
              type: "boolean",
              required: true,
              options: [],
            },
          ],
        },
        new Date("2027-01-01"),
        "CAMPER",
      ),
    ).not.toThrow();
  });
  it("rejeita opções inventadas e respostas de outra ficha", () => {
    expect(() =>
      validateSubmission(
        { ...payload, answers: { intruder: "x" } },
        health,
        form,
        new Date("2027-01-01"),
        "CAMPER",
      ),
    ).toThrow(/versão/);
  });
  it("exige disponibilidade para candidato a servo", () => {
    expect(() =>
      validateSubmission(
        payload,
        health,
        form,
        new Date("2027-01-01"),
        "VOLUNTEER",
      ),
    ).toThrow(/disponibilidade/);
  });
  it("valida dígitos do CPF", () => {
    expect(validCpf("529.982.247-25")).toBe(true);
    expect(validCpf("111.111.111-11")).toBe(false);
    expect(validCpf("529.982.247-26")).toBe(false);
  });
  it("encerra exatamente no limite e respeita pausa e organização", () => {
    const campaign = {
      paused: false,
      opensAt: new Date("2026-10-07T12:00:00Z"),
      closesAt: new Date("2026-10-07T13:00:00Z"),
      event: { status: "PUBLISHED", organization: { active: true } },
    };
    expect(campaignIsOpen(campaign, new Date("2026-10-07T12:00:00Z"))).toBe(
      true,
    );
    expect(campaignIsOpen(campaign, new Date("2026-10-07T13:00:00Z"))).toBe(
      false,
    );
    expect(
      campaignIsOpen(
        { ...campaign, paused: true },
        new Date("2026-10-07T12:30:00Z"),
      ),
    ).toBe(false);
  });
  it("não permite identificadores e opções duplicados na ficha", () => {
    expect(
      formSchema.safeParse({
        ...form,
        questions: [
          {
            id: "q",
            label: "Qual equipe?",
            type: "single",
            required: true,
            options: ["A", "A"],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
