import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Field, Notice } from "./ui";

afterEach(cleanup);

describe("Field", () => {
  it("associa rótulo, ajuda e erro ao controle com ID estável e sem incluir instruções no nome", () => {
    const { rerender } = render(
      <Field label="Telefone" hint="Inclua o DDD." error="Confira o número.">
        <input name="phone" />
      </Field>,
    );
    const input = screen.getByRole("textbox", {
      name: "Telefone",
    });
    const id = input.id;
    expect(id).not.toBe("");
    expect(input.closest("label")).toHaveAttribute("for", id);
    expect(input).toHaveAccessibleDescription(
      "Inclua o DDD. Confira o número.",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    rerender(
      <Field label="Telefone" hint="Inclua o DDD.">
        <input name="phone" />
      </Field>,
    );
    expect(screen.getByRole("textbox", { name: "Telefone" })).toHaveAttribute(
      "id",
      id,
    );
    expect(input).toHaveAccessibleDescription("Inclua o DDD.");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Confira o número.")).not.toBeInTheDocument();
  });

  it("mantém IDs explícitos, descrições e nomes acessíveis fornecidos pelo controle", () => {
    render(
      <>
        <p id="existing-help">Ajuda existente.</p>
        <Field label="Nome público" id="fallback" hint="Ajuda do campo.">
          <input
            id="custom-id"
            aria-label="Nome do participante"
            aria-describedby="existing-help existing-help"
            aria-invalid="grammar"
          />
        </Field>
        <Field label="Outro nome">
          <input />
        </Field>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Nome do participante" });
    expect(input).toHaveAttribute("id", "custom-id");
    expect(input).not.toHaveAttribute("aria-labelledby");
    expect(input).toHaveAttribute("aria-invalid", "grammar");
    expect(input).toHaveAccessibleDescription(
      "Ajuda existente. Ajuda do campo.",
    );
    expect(
      input
        .getAttribute("aria-describedby")!
        .split(" ")
        .filter((value) => value === "existing-help"),
    ).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Outro nome" }).id).not.toBe(
      input.id,
    );
  });

  it("preserva o contrato de um combobox HTML sem sobrescrever controles ou foco ativo", () => {
    render(
      <>
        <span id="custom-label">Cidade escolhida</span>
        <span id="combo-help">Use as setas.</span>
        <Field label="Cidade" hint="Selecione a UF." error="Confira a cidade.">
          <input
            role="combobox"
            aria-labelledby="custom-label"
            aria-describedby="combo-help"
            aria-controls="cities"
            aria-expanded="true"
            aria-activedescendant="loanda"
          />
        </Field>
      </>,
    );
    const input = screen.getByRole("combobox", { name: "Cidade escolhida" });
    expect(input).toHaveAttribute("aria-labelledby", "custom-label");
    expect(input).toHaveAttribute("aria-controls", "cities");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-activedescendant", "loanda");
    expect(input).toHaveAccessibleDescription(
      "Use as setas. Selecione a UF. Confira a cidade.",
    );
  });

  it("descreve grupos sem substituir a semântica e a ajuda dos componentes compostos", () => {
    function CustomCombobox() {
      return (
        <>
          <input
            role="combobox"
            aria-label="Cidade"
            aria-describedby="own-help"
            aria-expanded="false"
          />
          <small id="own-help">Ajuda da pesquisa.</small>
        </>
      );
    }
    render(
      <Field
        label="Cidade de residência"
        group
        hint="Formato Cidade - UF."
        error="Selecione uma cidade."
      >
        <CustomCombobox />
      </Field>,
    );
    const group = screen.getByRole("group", { name: "Cidade de residência" });
    expect(group).toHaveAccessibleDescription(
      "Formato Cidade - UF. Selecione uma cidade.",
    );
    expect(group).toHaveAttribute("aria-invalid", "true");
    const input = screen.getByRole("combobox", { name: "Cidade" });
    expect(input).not.toHaveAttribute("id");
    expect(input).not.toHaveAttribute("aria-labelledby");
    expect(input).toHaveAccessibleDescription("Ajuda da pesquisa.");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("mantém nomes individuais e seleção de grupos de opções", () => {
    render(
      <Field label="Participação" group hint="Escolha uma opção.">
        <label>
          <input type="radio" name="attendance" defaultChecked />
          Sim
        </label>
        <label>
          <input type="radio" name="attendance" />
          Não
        </label>
      </Field>,
    );
    expect(
      screen.getByRole("group", { name: "Participação" }),
    ).toHaveAccessibleDescription("Escolha uma opção.");
    expect(screen.getByRole("radio", { name: "Sim" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Não" })).not.toBeChecked();
  });

  it("associa controles em fragmentos e ignora entradas ocultas", () => {
    render(
      <Field label="Descrição" id="description">
        <>
          <input type="hidden" value="proof" readOnly />
          <div>
            <textarea />
          </div>
        </>
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Descrição" });
    expect(input).toHaveAttribute("id", "description");
    expect(input.closest("label")).toHaveAttribute("for", "description");
  });

  it("não atribui um único rótulo a vários controles sem mudar agrupamentos existentes", () => {
    render(
      <Field label="Intervalo">
        <input aria-label="Início" />
        <input aria-label="Fim" />
      </Field>,
    );
    expect(screen.getByRole("textbox", { name: "Início" })).not.toHaveAttribute(
      "aria-labelledby",
    );
    expect(screen.getByRole("textbox", { name: "Fim" })).not.toHaveAttribute(
      "aria-labelledby",
    );
  });
});

describe("Notice", () => {
  it.each([
    ["error", "alert", "lucide-circle-alert"],
    ["info", "status", "lucide-info"],
    ["success", "status", "lucide-circle-check"],
  ] as const)(
    "apresenta mensagem %s com ícone sem duplicar o anúncio",
    (kind, role, iconClass) => {
      render(<Notice kind={kind}>Mensagem de teste.</Notice>);
      const notice = screen.getByRole(role);
      expect(notice).toHaveClass("notice", kind);
      expect(notice).toHaveTextContent("Mensagem de teste.");
      const icon = notice.querySelector("svg");
      expect(icon).toHaveClass(iconClass);
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveAttribute("focusable", "false");
    },
  );
});
