import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParishAutocomplete } from "./ParishAutocomplete";
import { Questions } from "./Questions";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));
const parishes = [
  {
    id: "one",
    name: "Paróquia Nossa Senhora Aparecida",
    city: "Loanda",
    state: "PR",
  },
  { id: "two", name: "Paróquia São José", city: "São Paulo", state: "SP" },
  { id: "three", name: "Paróquia São José", city: "Toledo", state: "PR" },
];
afterEach(cleanup);
beforeEach(() => {
  vi.mocked(api).mockReset().mockResolvedValue(parishes);
});

function Controlled({
  initial = "",
  onChange = vi.fn(),
  onSubmit = vi.fn(),
} = {}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <ParishAutocomplete
        label="Qual paróquia frequenta?"
        name="answers.paroquia"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
      <button type="button">Próxima etapa</button>
    </form>
  );
}

describe("Paróquia na inscrição", () => {
  it("carrega ao focar, filtra sem acentos pela paróquia/cidade/UF e não consulta a cada letra", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    expect(api).not.toHaveBeenCalled();
    await user.type(screen.getByRole("combobox"), "sao jose");
    expect(
      await screen.findByRole("option", {
        name: "Paróquia São José — São Paulo - SP",
      }),
    ).toBeVisible();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await user.type(screen.getByRole("combobox"), " PR");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(api).toHaveBeenCalledExactlyOnceWith("/public/parishes");
  });
  it("seleciona a paróquia e distingue as de mesmo nome pela localização", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<Controlled onChange={change} />);
    await user.type(screen.getByRole("combobox"), "sao jose");
    await user.click(
      await screen.findByRole("option", {
        name: "Paróquia São José — Toledo - PR",
      }),
    );
    expect(change).toHaveBeenLastCalledWith("Paróquia São José — Toledo - PR");
    expect(screen.getByRole("combobox")).toHaveValue(
      "Paróquia São José — Toledo - PR",
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("permite teclado e cancela sugestões sem apagar a resposta", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<Controlled onSubmit={submit} />);
    await user.type(screen.getByRole("combobox"), "sao jose");
    await screen.findAllByRole("option");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByRole("combobox")).toHaveValue(
      "Paróquia São José — Toledo - PR",
    );
    expect(submit).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue(
      "Paróquia São José — Toledo - PR",
    );
  });
  it("mantém respostas antigas e permite informar uma paróquia ausente ou sem cadastros", async () => {
    const user = userEvent.setup();
    vi.mocked(api).mockResolvedValue([]);
    render(<Controlled initial="Paróquia de outra cidade" />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    await screen.findByText(
      "Nenhuma paróquia encontrada. Você pode manter o nome digitado.",
    );
    expect(input).toHaveValue("Paróquia de outra cidade");
    await user.clear(input);
    await user.type(input, "Minha paróquia ainda não cadastrada");
    await user.click(screen.getByRole("button", { name: "Próxima etapa" }));
    expect(input).toHaveValue("Minha paróquia ainda não cadastrada");
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("preserva o texto em falha de conexão e oferece nova tentativa", async () => {
    const user = userEvent.setup();
    vi.mocked(api).mockRejectedValueOnce(new Error("offline"));
    render(<Controlled />);
    const input = screen.getByRole("combobox");
    await user.type(input, "aparecida");
    await user.click(
      await screen.findByRole("button", { name: "tentar novamente" }),
    );
    await screen.findByRole("option", {
      name: "Paróquia Nossa Senhora Aparecida — Loanda - PR",
    });
    expect(input).toHaveValue("aparecida");
    expect(api).toHaveBeenCalledTimes(2);
  });
  it("usa o campo livre com sugestões na ficha pública, preservando obrigatoriedade e resposta textual", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <Questions
        questions={[
          {
            id: "paroquia",
            label: "Qual paróquia frequenta?",
            type: "text",
            required: false,
            options: [],
          },
        ]}
        answers={{ paroquia: "Paróquia informada no rascunho" }}
        cityAutocomplete
        onChange={change}
      />,
    );
    const input = screen.getByRole("combobox", {
      name: "Qual paróquia frequenta?",
    });
    expect(input).not.toBeRequired();
    expect(input).toHaveValue("Paróquia informada no rascunho");
    await user.click(input);
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(change).not.toHaveBeenCalled();
  });
});
