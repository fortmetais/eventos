import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DetailSection } from "./DetailSection";

afterEach(cleanup);
function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <DetailSection
      title="Dados de teste"
      summary="2 respostas"
      open={open}
      onOpenChange={setOpen}
    >
      <label>
        Campo preservado
        <input required defaultValue="" />
      </label>
    </DetailSection>
  );
}
describe("Seção independente da ficha", () => {
  it("abre pelo teclado e preserva a edição ao recolher sem desmontar", async () => {
    render(<Fixture />);
    const button = screen.getByRole("button", { name: "Dados de teste" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    button.focus();
    await userEvent.keyboard("{Enter}");
    const input = screen.getByRole("textbox", { name: "Campo preservado" });
    await userEvent.type(input, "Resposta preservada");
    await userEvent.click(button);
    expect(input).toBeInTheDocument();
    expect(input).not.toBeVisible();
    await userEvent.keyboard(" ");
    expect(input).toBeVisible();
    expect(input).toHaveValue("Resposta preservada");
  });
  it("abre a seção e foca o campo quando um controle oculto fica inválido", async () => {
    const view = render(<Fixture />);
    const input = view.container.querySelector("input")!;
    fireEvent.invalid(input);
    expect(
      screen.getByRole("button", { name: "Dados de teste" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Confira os campos desta seção.",
    );
    await waitFor(() => expect(input).toHaveFocus());
  });
});
