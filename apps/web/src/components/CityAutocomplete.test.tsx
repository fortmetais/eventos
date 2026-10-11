import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CityAutocomplete } from "./CityAutocomplete";
import { Questions } from "./Questions";
import { loadBrazilianCities, normalizeCitySearch } from "../lib/brazil-cities";
import type { Answer } from "../lib/types";

vi.mock("../lib/brazil-cities", async (original) => ({
  ...(await original<typeof import("../lib/brazil-cities")>()),
  loadBrazilianCities: vi.fn(),
}));
const labels = [
  "Loanda - PR",
  "Santa Helena - PR",
  "Santa Helena - SC",
  "São Paulo - SP",
  "São Paulo de Olivença - AM",
];
const cities = labels.map((label) => ({
  label,
  search: normalizeCitySearch(label),
}));
afterEach(cleanup);
beforeEach(() => {
  vi.mocked(loadBrazilianCities).mockReset().mockResolvedValue(cities);
});

function Controlled({
  initial = "",
  onChange = vi.fn(),
  onSubmit = vi.fn(),
}: {
  initial?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <CityAutocomplete
        label="Cidade onde mora"
        name="answers.cidade"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        required
      />
      <button type="button">Próxima etapa</button>
    </form>
  );
}

describe("Cidade na inscrição", () => {
  it("carrega somente ao focar e filtra nomes sem acento e a UF", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    expect(loadBrazilianCities).not.toHaveBeenCalled();
    const input = screen.getByRole("combobox", { name: "Cidade onde mora" });
    await user.type(input, "sao paulo");
    expect(
      await screen.findByRole("option", { name: "São Paulo - SP" }),
    ).toBeVisible();
    expect(
      screen.getByRole("option", { name: "São Paulo de Olivença - AM" }),
    ).toBeVisible();
    await user.type(input, " - SP");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(
      screen.queryByRole("option", { name: "São Paulo de Olivença - AM" }),
    ).not.toBeInTheDocument();
    expect(loadBrazilianCities).toHaveBeenCalledTimes(1);
  });

  it("distingue municípios de mesmo nome e salva Cidade - UF ao clicar", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<Controlled onChange={change} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "santa helena");
    expect(
      await screen.findByRole("option", { name: "Santa Helena - PR" }),
    ).toBeVisible();
    await user.click(screen.getByRole("option", { name: "Santa Helena - SC" }));
    expect(input).toHaveValue("Santa Helena - SC");
    expect(change).toHaveBeenLastCalledWith("Santa Helena - SC");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("seleciona com as setas e Enter sem enviar o formulário e fecha com Escape", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<Controlled onSubmit={submit} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "santa");
    await screen.findByRole("option", { name: "Santa Helena - PR" });
    await user.keyboard("{ArrowDown}{ArrowDown}");
    const selected = screen.getByRole("option", { name: "Santa Helena - SC" });
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", selected.id);
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("Santa Helena - SC");
    expect(submit).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("Santa Helena - SC");
  });

  it("limita a lista e permite refinar por UF, mostrando aviso quando não encontra", async () => {
    const user = userEvent.setup();
    vi.mocked(loadBrazilianCities).mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => {
        const label = `Vila ${index} - ${index === 24 ? "PR" : "SP"}`;
        return { label, search: normalizeCitySearch(label) };
      }),
    );
    render(<Controlled />);
    const input = screen.getByRole("combobox");
    await user.type(input, "vila");
    await screen.findByRole("option", { name: "Vila 0 - SP" });
    expect(screen.getAllByRole("option")).toHaveLength(20);
    expect(
      screen.getByText("Digite mais letras ou a UF para refinar a busca."),
    ).toBeVisible();
    await user.type(input, " PR");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: "Vila 24 - PR" })).toBeVisible();
    await user.clear(input);
    await user.type(input, "xyzxyz");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText(/Nenhuma cidade encontrada/)).toBeVisible();
  });

  it("preserva texto de rascunhos antigos e não altera a cidade ao sair do campo", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<Controlled initial="Loanda" onChange={change} />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("Loanda");
    await user.click(input);
    await screen.findByRole("option", { name: "Loanda - PR" });
    await user.tab();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("Loanda");
    expect(change).not.toHaveBeenCalled();
  });

  it("permite preenchimento manual se o catálogo falhar e oferece nova tentativa", async () => {
    const user = userEvent.setup();
    vi.mocked(loadBrazilianCities).mockRejectedValueOnce(
      new Error("Falha de conexão"),
    );
    render(<Controlled initial="Loanda" />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    const retry = await screen.findByRole("button", {
      name: "tentar novamente",
    });
    expect(input).toHaveValue("Loanda");
    expect(screen.getByText(/Você pode informar Cidade - UF/)).toBeVisible();
    await user.click(retry);
    expect(
      await screen.findByRole("option", { name: "Loanda - PR" }),
    ).toBeVisible();
    expect(loadBrazilianCities).toHaveBeenCalledTimes(2);
  });

  it("atualiza answers.cidade e mantém outras respostas nas perguntas da ficha", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    function Form() {
      const [answers, setAnswers] = useState<Record<string, Answer>>({
        cidade: "Loanda",
        sexo: "Masculino",
      });
      return (
        <Questions
          cityAutocomplete
          questions={[
            {
              id: "cidade",
              label: "Cidade onde mora",
              type: "text",
              required: true,
              options: [],
            },
          ]}
          answers={answers}
          onChange={(id, value) => {
            const next = { ...answers, [id]: value };
            setAnswers(next);
            change(next);
          }}
        />
      );
    }
    render(<Form />);
    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Loanda - PR" }),
    );
    await waitFor(() =>
      expect(change).toHaveBeenLastCalledWith({
        cidade: "Loanda - PR",
        sexo: "Masculino",
      }),
    );
  });
});
