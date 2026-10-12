import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultLayout } from "@fac/form-layout";
import { GuardianRelationshipSelect } from "./GuardianRelationshipSelect";
import { RegistrationFields } from "./RegistrationFields";
import type { FormConfig, Payload } from "../lib/types";

afterEach(cleanup);

function Select({ initial = "" }) {
  const [value, setValue] = useState(initial);
  return <GuardianRelationshipSelect value={value} onChange={setValue} />;
}

const form: FormConfig = {
  askCpf: false,
  askAddress: false,
  askShirt: false,
  questions: [],
  terms: "Termos gerais da inscrição",
};

function Care({ minor = true }: { minor?: boolean }) {
  const [payload, setPayload] = useState<Payload>({});
  return (
    <RegistrationFields
      form={{ ...form, layout: defaultLayout(form, "VOLUNTEER") }}
      kind="VOLUNTEER"
      step="care"
      minor={minor}
      payload={payload}
      health={{}}
      onPayload={(patch) => setPayload((current) => ({ ...current, ...patch }))}
      onHealth={vi.fn()}
    />
  );
}

describe("Responsável legal na ficha", () => {
  it("oferece somente relações de responsável legal, com seleção obrigatória", async () => {
    render(<Select />);
    const select = screen.getByRole("combobox", {
      name: /Parentesco do responsável/,
    });
    expect(select).toBeRequired();
    expect(select).toHaveAttribute("name", "guardianRelationship");
    expect(select).toHaveValue("");
    for (const name of [
      "Selecione",
      "Pai",
      "Mãe",
      "Tutor(a) legal",
      "Responsável com guarda judicial",
    ]) {
      expect(
        screen.getByRole("option", { name }),
      ).toBeInTheDocument();
    }
    expect(screen.getAllByRole("option")).toHaveLength(5);
    for (const name of ["Amigo", "Cônjuge", "Vizinho", "Outro"]) {
      expect(
        screen.queryByRole("option", { name }),
      ).not.toBeInTheDocument();
    }
    await userEvent.selectOptions(select, "Tutor(a) legal");
    expect(select).toHaveValue("Tutor(a) legal");
  });

  it("preserva a resposta anterior até a troca por uma opção padronizada", async () => {
    render(<Select initial="Avó" />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("Avó");
    expect(
      screen.getByRole("option", { name: "Avó (resposta anterior)" }),
    ).toBeInTheDocument();
    await userEvent.selectOptions(select, "Responsável com guarda judicial");
    expect(select).toHaveValue("Responsável com guarda judicial");
    expect(
      screen.queryByRole("option", { name: /resposta anterior/ }),
    ).not.toBeInTheDocument();
  });

  it("aplica a máscara nos telefones celular e fixo do responsável na etapa 4", async () => {
    const user = userEvent.setup();
    render(<Care />);
    const phone = screen.getByLabelText("Telefone do responsável", {
      exact: false,
    });
    expect(phone).toHaveAttribute("type", "tel");
    expect(phone).toHaveAttribute("placeholder", "(00) 00000-0000");
    await user.type(phone, "44988888888");
    expect(phone).toHaveValue("(44) 98888-8888");
    await user.clear(phone);
    await user.type(phone, "4434215678");
    expect(phone).toHaveValue("(44) 3421-5678");
    const relationship = screen.getByRole("combobox", {
      name: /Parentesco do responsável/,
    });
    await user.selectOptions(relationship, "Mãe");
    expect(relationship).toHaveValue("Mãe");
    expect(
      screen.getByRole("combobox", { name: /Parentesco.*emergência/ }),
    ).not.toBe(relationship);
  });

  it("mantém o bloco do responsável restrito a candidatos menores", () => {
    render(<Care minor={false} />);
    expect(
      screen.queryByRole("heading", { name: "Responsável legal" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Telefone do responsável", { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /Parentesco do responsável/ }),
    ).not.toBeInTheDocument();
  });
});
