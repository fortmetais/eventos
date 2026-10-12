import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultLayout } from "@fac/form-layout";
import { EmergencyRelationshipSelect } from "./EmergencyRelationshipSelect";
import { RegistrationFields } from "./RegistrationFields";
import type { FormConfig, Payload } from "../lib/types";
afterEach(cleanup);

function Select({ initial = "" }) {
  const [value, setValue] = useState(initial);
  return <EmergencyRelationshipSelect value={value} onChange={setValue} />;
}
const form: FormConfig = {
  askCpf: false,
  askAddress: false,
  askShirt: false,
  questions: [],
  terms: "Termos gerais da inscrição",
};
function Care() {
  const [payload, setPayload] = useState<Payload>({});
  return (
    <RegistrationFields
      form={{ ...form, layout: defaultLayout(form, "VOLUNTEER") }}
      kind="VOLUNTEER"
      step="care"
      minor={false}
      payload={payload}
      health={{}}
      onPayload={(patch) => setPayload((current) => ({ ...current, ...patch }))}
      onHealth={vi.fn()}
    />
  );
}
describe("Contato de emergência na ficha", () => {
  it("oferece opções padronizadas com seleção obrigatória", async () => {
    render(<Select />);
    const select = screen.getByRole("combobox", { name: /Parentesco/ });
    expect(select).toBeRequired();
    for (const name of [
      "Pai",
      "Mãe",
      "Cônjuge",
      "Irmão",
      "Amigo",
      "Responsável legal",
      "Outro",
    ])
      expect(
        screen.getByRole("option", { name }),
      ).toBeInTheDocument();
    await userEvent.selectOptions(select, "Mãe");
    expect(select).toHaveValue("Mãe");
  });
  it("mantém respostas antigas e oferece a troca por um valor padronizado", async () => {
    render(<Select initial="Colega da comunidade" />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("Colega da comunidade");
    expect(
      screen.getByRole("option", {
        name: "Colega da comunidade (resposta anterior)",
      }),
    ).toBeInTheDocument();
    await userEvent.selectOptions(select, "Outro");
    expect(select).toHaveValue("Outro");
    expect(
      screen.queryByRole("option", { name: /resposta anterior/ }),
    ).not.toBeInTheDocument();
  });
  it("aplica a máscara no telefone da etapa de saúde/emergência e usa dropdown para relação", async () => {
    const user = userEvent.setup();
    render(<Care />);
    const phone = screen.getByLabelText(
      "Telefone do contato de emergência com DDD",
      { exact: false },
    );
    await user.type(phone, "44988888888");
    expect(phone).toHaveValue("(44) 98888-8888");
    expect(phone).toHaveAttribute("placeholder", "(00) 00000-0000");
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Parentesco/ }),
      "Irmão",
    );
    expect(screen.getByRole("combobox", { name: /Parentesco/ })).toHaveValue(
      "Irmão",
    );
  });
});
