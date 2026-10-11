import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultLayout } from "@fac/form-layout";
import { FormLayoutEditor } from "./FormLayoutEditor";
import { FormLayoutPreview, RegistrationFields } from "./RegistrationFields";
import type { FormConfig } from "../lib/types";

afterEach(cleanup);
const base: FormConfig = {
  askCpf: false,
  askAddress: false,
  askShirt: true,
  terms: "Termos",
  questions: [
    {
      id: "extra",
      label: "Pergunta extra",
      type: "text",
      required: true,
      options: [],
    },
  ],
};
function Harness() {
  const [form, setForm] = useState(base);
  return (
    <>
      <FormLayoutEditor form={form} kind="CAMPER" onChange={setForm} />
      <FormLayoutPreview form={form} kind="CAMPER" />
    </>
  );
}
describe("Editor e prévia das fichas", () => {
  it("pula etapas vazias na prévia de adulto e mostra o responsável para menor", () => {
    const layout = defaultLayout(base, "CAMPER");
    const protectedKeys = [
      "base:name",
      "base:phone",
      "base:birthDate",
      "base:guardian",
      "base:termsAccepted",
    ];
    for (const group of layout.steps)
      for (const field of group.fields)
        field.hidden = !protectedKeys.includes(field.key);
    render(<FormLayoutPreview form={{ ...base, layout }} kind="CAMPER" />);
    expect(
      screen.queryByRole("heading", { name: "Saúde e emergência" }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "Sua foto" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menor de idade" }));
    expect(
      screen.getByRole("heading", { name: "Responsável legal" }),
    ).toBeVisible();
  });
  it("ordena os campos básicos e oculta/reexibe mantendo a posição na prévia", () => {
    const { container } = render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Mover E-mail (opcional) para cima" }),
    );
    const keys = () =>
      [
        ...container.querySelectorAll(
          ".layout-step:first-of-type [data-field-key]",
        ),
      ].map((node) => node.getAttribute("data-field-key"));
    expect(keys()).toEqual([
      "base:name",
      "base:phone",
      "base:email",
      "base:birthDate",
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "Ocultar E-mail (opcional)" }),
    );
    expect(
      container.querySelector('[data-registration-field="base:email"]'),
    ).toBeNull();
    expect(keys()[2]).toBe("base:email");
    fireEvent.click(
      screen.getByRole("button", { name: "Mostrar E-mail (opcional)" }),
    );
    const publicKeys = [
      ...container.querySelectorAll("[data-registration-field]"),
    ].map((node) => node.getAttribute("data-registration-field"));
    expect(publicKeys.slice(0, 4)).toEqual(keys());
  });
  it.each([
    "Nome completo",
    "Telefone / WhatsApp com DDD",
    "Data de nascimento",
    "Responsável legal (somente para menores)",
    "Aceite dos termos gerais",
  ])("protege %s e explica o motivo", (label) => {
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: `Ocultar ${label}` }),
    ).toBeDisabled();
    expect(
      screen
        .getByRole("button", { name: `Ocultar ${label}` })
        .getAttribute("title"),
    ).toBeTruthy();
  });
  it("oculta uma pergunta obrigatória adicional na prévia", () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Ocultar Pergunta extra" }),
    );
    expect(
      screen.queryByRole("textbox", { name: /Pergunta extra/ }),
    ).toBeNull();
  });
  it("não exibe responsável para adultos e conserva o bloco obrigatório para menores", () => {
    const form = { ...base, layout: defaultLayout(base, "CAMPER") };
    const props = {
      form,
      kind: "CAMPER" as const,
      step: "care" as const,
      payload: {},
      health: {},
      onPayload: () => {},
      onHealth: () => {},
    };
    const view = render(<RegistrationFields {...props} minor={false} />);
    expect(
      screen.queryByRole("heading", { name: "Responsável legal" }),
    ).toBeNull();
    view.rerender(<RegistrationFields {...props} minor />);
    expect(
      screen.getByRole("textbox", { name: /Nome do responsável/ }),
    ).toBeRequired();
  });
});
