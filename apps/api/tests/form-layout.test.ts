import { describe, expect, it } from "vitest";
import {
  defaultLayout,
  editableLayout,
  fieldCatalog,
  orderedFields,
  sanitizeHidden,
  syncLegacyFlags,
  validateLayout,
} from "@fac/form-layout";
import {
  formSchema,
  type FormConfig,
} from "../src/modules/events/events.validation.js";
import { volunteerTemplate } from "../src/modules/events/volunteer-template.js";
import { validateSubmission } from "../src/modules/registrations/registrations.validation.js";

const eventDate = new Date("2027-06-01");
const identity = {
  name: "Pessoa de teste",
  phone: "44999999999",
  birthDate: "1990-01-01",
  termsAccepted: true,
};
function minimal(kind: "VOLUNTEER" | "CAMPER" = "VOLUNTEER") {
  const form: FormConfig =
    kind === "VOLUNTEER"
      ? volunteerTemplate("FAC")
      : {
          askCpf: false,
          askAddress: false,
          askShirt: false,
          questions: [],
          terms: "Termos gerais da inscrição",
        };
  const catalog = fieldCatalog(form, kind);
  form.layout = defaultLayout(form, kind);
  for (const group of form.layout.steps)
    for (const field of group.fields)
      field.hidden = !catalog.find((item) => item.key === field.key)
        ?.protectedReason;
  return formSchema.parse(form);
}
describe("Layout versionado das fichas", () => {
  it.each(["VOLUNTEER", "CAMPER"] as const)(
    "permite enviar %s sem os campos ocultos e descarta suas respostas",
    (kind) => {
      const form = minimal(kind);
      const result = validateSubmission(
        {
          ...identity,
          photoAssetId: "00000000-0000-4000-8000-000000000001",
          emergencyName: "Oculto",
          emergencyPhone: "inválido",
          shirt: "inválido",
          availability: "Oculto",
          imageAuthorized: true,
          answers:
            kind === "VOLUNTEER"
              ? { aceite_regras: false, equipes_preferencia: ["Inexistente"] }
              : {},
        },
        { hasAllergies: true, allergies: "Oculto" },
        form,
        eventDate,
        kind,
      );
      expect(result.payload).toMatchObject(identity);
      for (const key of [
        "photoAssetId",
        "emergencyName",
        "emergencyPhone",
        "shirt",
        "availability",
        "imageAuthorized",
      ])
        expect(result.payload).not.toHaveProperty(key);
      expect(result.payload.answers).toEqual({});
      expect(result.health).toEqual({});
      expect(orderedFields(form, kind, "care", false)).toEqual([]);
      expect(
        orderedFields(form, kind, "care", true).map((field) => field.key),
      ).toEqual(["base:guardian"]);
    },
  );
  it("preserva todas as regras da ficha legada sem layout", () => {
    const form = volunteerTemplate("FAC");
    expect(formSchema.parse(form)).not.toHaveProperty("layout");
    expect(() =>
      validateSubmission(identity, {}, form, eventDate, "VOLUNTEER"),
    ).toThrow();
    expect(
      sanitizeHidden(form, "VOLUNTEER", { shirt: "P" }, { hasAllergies: false })
        .health,
    ).toEqual({ hasAllergies: false });
  });
  it.each([
    "base:name",
    "base:phone",
    "base:birthDate",
    "base:guardian",
    "base:termsAccepted",
  ])("bloqueia ocultar %s na API", (key) => {
    const form = minimal();
    form
      .layout!.steps.flatMap((group) => group.fields)
      .find((field) => field.key === key)!.hidden = true;
    expect(formSchema.safeParse(form).success).toBe(false);
  });
  it("rejeita campos desconhecidos, repetidos, ausentes e transferências entre etapas", () => {
    const original = minimal();
    for (const mutate of [
      (form: FormConfig) => {
        form.layout!.steps[0].fields.push({
          key: "base:desconhecido",
          hidden: false,
        });
      },
      (form: FormConfig) => {
        form.layout!.steps[0].fields.push({
          ...form.layout!.steps[0].fields[0],
        });
      },
      (form: FormConfig) => {
        form.layout!.steps[0].fields.pop();
      },
      (form: FormConfig) => {
        form.layout!.steps[1].fields.push(
          form.layout!.steps[0].fields.shift()!,
        );
      },
    ]) {
      const form = structuredClone(original);
      mutate(form);
      expect(formSchema.safeParse(form).success).toBe(false);
    }
  });
  it("sincroniza CPF/endereço/camiseta e conserva posição ao ocultar e reexibir", () => {
    const form = minimal();
    const about = form.layout!.steps.find((group) => group.step === "about")!;
    const shirt = about.fields.find((field) => field.key === "base:shirt")!;
    const position = about.fields.indexOf(shirt);
    shirt.hidden = false;
    expect(syncLegacyFlags(form).askShirt).toBe(true);
    shirt.hidden = true;
    expect(formSchema.parse(form).askShirt).toBe(false);
    expect(
      editableLayout(form, "VOLUNTEER").steps.find(
        (group) => group.step === "about",
      )!.fields[position].key,
    ).toBe(shirt.key);
  });
  it.each([
    "base:photoAssetId",
    "base:shirt",
    "base:availability",
    "base:emergencyName",
    "health:hasAllergies",
    "question:aceite_regras",
  ])("mantém obrigatório %s quando visível", (key) => {
    const form = minimal();
    form
      .layout!.steps.flatMap((group) => group.fields)
      .find((field) => field.key === key)!.hidden = false;
    const configured = formSchema.parse(form);
    expect(() =>
      validateSubmission(identity, {}, configured, eventDate, "VOLUNTEER"),
    ).toThrow();
  });
  it("exige responsável para menores mesmo com saúde/emergência ocultas", () => {
    const form = minimal();
    const payload = { ...identity, birthDate: "2012-01-01" };
    expect(() =>
      validateSubmission(payload, {}, form, eventDate, "VOLUNTEER"),
    ).toThrow();
    expect(
      validateSubmission(
        {
          ...payload,
          guardianName: "Responsável",
          guardianPhone: "44988888888",
          guardianRelationship: "Mãe",
        },
        {},
        form,
        eventDate,
        "VOLUNTEER",
      ).health,
    ).toEqual({});
  });
  it("mantém a descrição condicional junto à pergunta de saúde e não altera a origem", () => {
    const form = minimal();
    const health = { hasAllergies: true, allergies: "Informação" };
    expect(sanitizeHidden(form, "VOLUNTEER", identity, health).health).toEqual(
      {},
    );
    expect(health.allergies).toBe("Informação");
    expect(validateLayout(form)).toEqual([]);
  });
  it("reconcilia perguntas novas/excluídas preservando a ordem da versão anterior", () => {
    const form = minimal();
    const previous = structuredClone(form.layout);
    form.questions.push({
      id: "nova",
      label: "Nova pergunta",
      type: "text",
      required: false,
      options: [],
    });
    form.questions = form.questions.filter((q) => q.id !== "paroquia");
    const layout = editableLayout(form, "VOLUNTEER");
    expect(layout.steps[2].fields.at(-1)).toEqual({
      key: "question:nova",
      hidden: false,
    });
    expect(
      layout.steps
        .flatMap((group) => group.fields)
        .some((field) => field.key === "question:paroquia"),
    ).toBe(false);
    expect(
      previous?.steps[2].fields.some(
        (field) => field.key === "question:paroquia",
      ),
    ).toBe(true);
  });
});
