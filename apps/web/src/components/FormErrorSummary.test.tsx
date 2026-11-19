import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FormErrorSummary } from "./FormErrorSummary";
import { Field } from "./ui";
afterEach(cleanup);
describe("FormErrorSummary", () => {
  it("focuses the summary and takes the user to the invalid field", () => {
    render(<form><FormErrorSummary errors={{ phone: "Confira o telefone" }} />
      <Field label="Telefone" error="Confira o telefone"><input /></Field>
    </form>);
    const summary = screen.getByRole("alert");
    expect(summary).toHaveFocus();
    fireEvent.click(screen.getByRole("link", { name: "Telefone" }));
    expect(screen.getByRole("textbox", { name: "Telefone" })).toHaveFocus();
  });
  it("does not show a warning when there are no invalid fields", () => {
    render(<form><FormErrorSummary errors={{}} /><Field label="Nome"><input /></Field></form>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

it("does not interrupt typing when empty error keys are cleared", () => {
  const { rerender } = render(<form><FormErrorSummary errors={{ name: "" }} /><Field label="Nome"><input /></Field></form>);
  const input = screen.getByRole("textbox", { name: "Nome" });
  input.focus();
  rerender(<form><FormErrorSummary errors={{ name: "", phone: "" }} /><Field label="Nome"><input /></Field></form>);
  expect(input).toHaveFocus();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
