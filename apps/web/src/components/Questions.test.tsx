import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Questions } from "./Questions";
afterEach(cleanup);
describe("Perguntas configuráveis", () => {
  it("mantém Não como valor booleano válido", () => {
    const change = vi.fn();
    render(
      <Questions
        questions={[
          {
            id: "retreat",
            label: "Já participou?",
            type: "boolean",
            required: true,
            options: [],
          },
        ]}
        answers={{ retreat: false }}
        onChange={change}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("false");
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "true" },
    });
    expect(change).toHaveBeenCalledWith("retreat", true);
  });
  it("acumula escolhas sem substituir outras respostas", () => {
    const change = vi.fn();
    render(
      <Questions
        questions={[
          {
            id: "days",
            label: "Dias disponíveis",
            type: "multiple",
            required: false,
            options: ["Sábado", "Domingo"],
          },
        ]}
        answers={{ days: ["Sábado"] }}
        onChange={change}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Domingo" }));
    expect(change).toHaveBeenCalledWith("days", ["Sábado", "Domingo"]);
  });
  it("limita equipes sem impedir a remoção de uma escolha", () => {
    const change = vi.fn();
    render(
      <Questions
        questions={[
          {
            id: "equipes",
            label: "Equipes",
            type: "multiple",
            required: true,
            options: ["Cozinha", "Secretaria", "Intercessão", "Externa"],
            maxSelections: 3,
          },
        ]}
        answers={{ equipes: ["Cozinha", "Secretaria", "Intercessão"] }}
        onChange={change}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Externa" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Cozinha" })).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Cozinha" }));
    expect(change).toHaveBeenCalledWith("equipes", [
      "Secretaria",
      "Intercessão",
    ]);
  });
  it("nenhum sacramento substitui escolhas anteriores, e vice-versa", () => {
    const change = vi.fn();
    const questions = [
      {
        id: "sacramentos",
        label: "Sacramentos",
        type: "multiple" as const,
        required: true,
        options: ["Batismo", "Crisma", "Nenhum"],
        exclusiveOption: "Nenhum",
      },
    ];
    const view = render(
      <Questions
        questions={questions}
        answers={{ sacramentos: ["Batismo", "Crisma"] }}
        onChange={change}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Nenhum" }));
    expect(change).toHaveBeenLastCalledWith("sacramentos", ["Nenhum"]);
    view.rerender(
      <Questions
        questions={questions}
        answers={{ sacramentos: ["Nenhum"] }}
        onChange={change}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Batismo" }));
    expect(change).toHaveBeenLastCalledWith("sacramentos", ["Batismo"]);
  });
  it("aceite exige confirmação explícita e mostra o erro junto ao campo", () => {
    const change = vi.fn();
    render(
      <Questions
        questions={[
          {
            id: "aceite",
            label: "Aceito a preparação",
            type: "boolean",
            required: true,
            options: [],
            mustBeTrue: true,
          },
        ]}
        answers={{ aceite: false }}
        onChange={change}
        errors={{ aceite: "Confirme este aceite." }}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Aceito a preparação" }),
    ).not.toBeChecked();
    expect(screen.getByText("Confirme este aceite.")).toBeVisible();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Aceito a preparação" }),
    );
    expect(change).toHaveBeenCalledWith("aceite", true);
  });
});
