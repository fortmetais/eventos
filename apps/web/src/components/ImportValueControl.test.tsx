import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportValueControl } from "./ImportValueControl";
import { api } from "../lib/api";
import { loadBrazilianCities, normalizeCitySearch } from "../lib/brazil-cities";
import type {
  EventImportTarget,
  EventImportValue,
} from "../lib/participant-imports";

vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: vi.fn(),
}));
vi.mock("../lib/brazil-cities", async (original) => ({
  ...(await original<typeof import("../lib/brazil-cities")>()),
  loadBrazilianCities: vi.fn(),
}));

const cityTarget: EventImportTarget = {
  id: "question:cidade",
  label: "Cidade onde mora",
  type: "text",
};
const parishTarget: EventImportTarget = {
  id: "question:paroquia",
  label: "Qual paróquia frequenta?",
  type: "text",
};
const phoneTarget: EventImportTarget = {
  id: "phone",
  label: "Telefone / WhatsApp",
  type: "text",
};
const sacramentsTarget: EventImportTarget = {
  id: "question:sacramentos",
  label: "Quais sacramentos possui?",
  type: "multiple",
  options: [
    "Batismo",
    "1ª Eucaristia",
    "Crisma",
    "Não possuo nenhum sacramento",
  ].map((value) => ({ value, label: value })),
  exclusiveOption: "Não possuo nenhum sacramento",
};

beforeEach(() => {
  vi.mocked(loadBrazilianCities)
    .mockReset()
    .mockResolvedValue(
      ["Loanda - PR", "Santa Helena - PR", "Santa Helena - SC"].map(
        (label) => ({ label, search: normalizeCitySearch(label) }),
      ),
    );
  vi.mocked(api)
    .mockReset()
    .mockResolvedValue([
      {
        id: "parish-one",
        name: "Paróquia Nossa Senhora Aparecida",
        city: "Loanda",
        state: "PR",
      },
    ]);
});
afterEach(cleanup);

function Controlled({
  target,
  initial = null,
  onChange = vi.fn(),
  disabled = false,
}: {
  target: EventImportTarget;
  initial?: EventImportValue;
  onChange?: (value: EventImportValue) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ImportValueControl
      target={target}
      value={value}
      disabled={disabled}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("Controles padronizados na revisão da importação", () => {
  it("oferece cidade com UF sem alterar o texto importado antes da escolha", async () => {
    const user = userEvent.setup(),
      change = vi.fn();
    render(
      <Controlled target={cityTarget} initial="Loanda" onChange={change} />,
    );
    const input = screen.getByRole("combobox", { name: cityTarget.label });
    expect(input).toHaveValue("Loanda");
    expect(loadBrazilianCities).not.toHaveBeenCalled();
    await user.click(input);
    const city = await screen.findByRole("option", { name: "Loanda - PR" });
    expect(change).not.toHaveBeenCalled();
    await user.click(city);
    expect(change).toHaveBeenLastCalledWith("Loanda - PR");
    expect(input).toHaveValue("Loanda - PR");
  });

  it("distingue cidades homônimas sem inferir a UF", async () => {
    const user = userEvent.setup(),
      change = vi.fn();
    render(
      <Controlled
        target={cityTarget}
        initial="Santa Helena"
        onChange={change}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: cityTarget.label }));
    await screen.findByRole("option", { name: "Santa Helena - PR" });
    expect(
      screen.getByRole("option", { name: "Santa Helena - SC" }),
    ).toBeVisible();
    expect(change).not.toHaveBeenCalled();
    await user.click(screen.getByRole("option", { name: "Santa Helena - SC" }));
    expect(change).toHaveBeenLastCalledWith("Santa Helena - SC");
  });

  it("associa uma paróquia cadastrada pelo mesmo controle da inscrição", async () => {
    const user = userEvent.setup(),
      change = vi.fn();
    render(
      <Controlled
        target={parishTarget}
        initial="Aparecida"
        onChange={change}
      />,
    );
    await user.click(
      screen.getByRole("combobox", { name: parishTarget.label }),
    );
    await user.click(
      await screen.findByRole("option", {
        name: "Paróquia Nossa Senhora Aparecida — Loanda - PR",
      }),
    );
    expect(change).toHaveBeenLastCalledWith(
      "Paróquia Nossa Senhora Aparecida — Loanda - PR",
    );
    expect(api).toHaveBeenCalledExactlyOnceWith("/public/parishes");
  });

  it("permite escrever uma paróquia ausente sem substituir o nome digitado", async () => {
    const user = userEvent.setup(),
      change = vi.fn();
    render(<Controlled target={parishTarget} onChange={change} />);
    const input = screen.getByRole("combobox", { name: parishTarget.label });
    await user.type(input, "Paróquia ainda não cadastrada");
    await user.tab();
    expect(input).toHaveValue("Paróquia ainda não cadastrada");
    expect(change).toHaveBeenLastCalledWith("Paróquia ainda não cadastrada");
  });

  it("mostra máscara no telefone e entrega somente dígitos na correção", async () => {
    const user = userEvent.setup(),
      change = vi.fn();
    render(
      <Controlled
        target={phoneTarget}
        initial="44991250052"
        onChange={change}
      />,
    );
    const input = screen.getByLabelText(phoneTarget.label);
    expect(input).toHaveValue("(44) 99125-0052");
    expect(change).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, "44988887777");
    expect(input).toHaveValue("(44) 98888-7777");
    expect(change).toHaveBeenLastCalledWith("44988887777");
  });

  it("mantém telefone longo inválido integralmente visível até correção explícita", async () => {
    const change = vi.fn(),
      original = "4499999999944999999999";
    render(
      <Controlled target={phoneTarget} initial={original} onChange={change} />,
    );
    expect(screen.getByLabelText(phoneTarget.label)).toHaveValue(original);
    expect(change).not.toHaveBeenCalled();
  });

  it("entrega números como número e vazio como null", () => {
    const target: EventImportTarget = {
      id: "question:quantidade",
      label: "Quantidade",
      type: "number",
    };
    const change = vi.fn();
    render(<Controlled target={target} onChange={change} />);
    const input = screen.getByRole("spinbutton", { name: target.label });
    fireEvent.change(input, { target: { value: "14" } });
    expect(change).toHaveBeenLastCalledWith(14);
    expect(input).toHaveValue(14);
    fireEvent.change(input, { target: { value: "" } });
    expect(change).toHaveBeenLastCalledWith(null);
  });

  it("usa data real no controle e mantém o valor ISO", () => {
    const target: EventImportTarget = {
      id: "birthDate",
      label: "Data de nascimento",
      type: "date",
    };
    const change = vi.fn();
    render(
      <Controlled target={target} initial="2000-01-01" onChange={change} />,
    );
    const input = screen.getByLabelText(target.label);
    expect(input).toHaveAttribute("type", "date");
    fireEvent.change(input, { target: { value: "2001-02-03" } });
    expect(change).toHaveBeenLastCalledWith("2001-02-03");
  });

  it("torna a opção nenhum sacramento exclusiva nos dois sentidos", async () => {
    const user = userEvent.setup(),
      change = vi.fn();
    render(
      <Controlled
        target={sacramentsTarget}
        initial={["Batismo", "Crisma"]}
        onChange={change}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Batismo" })).toBeChecked();
    await user.click(
      screen.getByRole("checkbox", { name: "Não possuo nenhum sacramento" }),
    );
    expect(change).toHaveBeenLastCalledWith(["Não possuo nenhum sacramento"]);
    expect(screen.getByRole("checkbox", { name: "Batismo" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "1ª Eucaristia" }));
    expect(change).toHaveBeenLastCalledWith(["1ª Eucaristia"]);
    expect(
      screen.getByRole("checkbox", { name: "Não possuo nenhum sacramento" }),
    ).not.toBeChecked();
  });

  it("preserva e permite mais de três departamentos de uma ficha importada", async () => {
    const user = userEvent.setup(),
      change = vi.fn();
    const names = [
      "Anjos",
      "Cozinha",
      "Intercessão",
      "Recreação",
      "Secretaria",
    ];
    const target: EventImportTarget = {
      id: "question:equipes_preferencia",
      label: "Departamentos",
      type: "multiple",
      options: names.map((label, index) => ({ value: `team-${index}`, label })),
    };
    render(
      <Controlled
        target={target}
        initial={["team-0", "team-1", "team-2", "team-3"]}
        onChange={change}
      />,
    );
    expect(
      screen
        .getAllByRole("checkbox")
        .filter((input) => (input as HTMLInputElement).checked),
    ).toHaveLength(4);
    const extra = screen.getByRole("checkbox", { name: "Secretaria" });
    expect(extra).toBeEnabled();
    await user.click(extra);
    expect(change).toHaveBeenLastCalledWith([
      "team-0",
      "team-1",
      "team-2",
      "team-3",
      "team-4",
    ]);
  });

  it.each([
    cityTarget,
    parishTarget,
    phoneTarget,
    { id: "birthDate", label: "Nascimento", type: "date" } as EventImportTarget,
    {
      id: "question:quantidade",
      label: "Quantidade",
      type: "number",
    } as EventImportTarget,
  ])("respeita o bloqueio de edição em $label", async (target) => {
    const user = userEvent.setup(),
      change = vi.fn();
    render(<Controlled target={target} disabled onChange={change} />);
    const input = screen.getByLabelText(target.label);
    expect(input).toBeDisabled();
    await user.type(input, "Loanda");
    expect(change).not.toHaveBeenCalled();
    expect(loadBrazilianCities).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it("bloqueia também as opções de múltipla escolha durante salvamento", async () => {
    const user = userEvent.setup(),
      change = vi.fn();
    render(
      <Controlled
        target={sacramentsTarget}
        initial={["Batismo"]}
        disabled
        onChange={change}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    for (const checkbox of checkboxes) expect(checkbox).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Crisma" }));
    expect(change).not.toHaveBeenCalled();
  });
});
