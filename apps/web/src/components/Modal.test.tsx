import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

afterEach(cleanup);

describe("Ficha em janela acessível", () => {
  it("coloca o foco na janela, bloqueia a rolagem e restaura foco e rolagem ao sair", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    document.body.style.overflow = "auto";
    const view = render(
      <Modal title="Ficha completa" onClose={vi.fn()}>
        <input aria-label="Nome" />
      </Modal>,
    );
    expect(
      screen.getByRole("dialog", { name: "Ficha completa" }),
    ).toHaveAttribute("open");
    expect(
      screen.getByRole("heading", { name: "Ficha completa" }),
    ).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.body.style.overflow).toBe("auto");
    expect(trigger).toHaveFocus();
    trigger.remove();
    document.body.style.overflow = "";
  });

  it("Escape fecha somente depois de resolver alterações não salvas", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <Modal title="Ficha completa" onClose={close} dirty>
        <input aria-label="Nome" />
      </Modal>,
    );
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", {
        name: "Descartar alterações não salvas?",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continuar editando" }),
    ).toHaveFocus();
    await user.click(
      screen.getByRole("button", { name: "Continuar editando" }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fechar janela" }));
    await user.click(
      screen.getByRole("button", { name: "Descartar e fechar" }),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("fecha sem confirmação quando não existem edições", async () => {
    const close = vi.fn();
    render(
      <Modal title="Convite" onClose={close}>
        <p>Conteúdo salvo</p>
      </Modal>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Fechar janela" }),
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("confirma navegação de retorno e permite restaurar a edição sem fechar", async () => {
    const close = vi.fn();
    const keepEditing = vi.fn();
    const view = render(
      <Modal title="Ficha" onClose={close} dirty onKeepEditing={keepEditing}>
        <input aria-label="Nome" />
      </Modal>,
    );
    view.rerender(
      <Modal
        title="Ficha"
        onClose={close}
        dirty
        closeRequested
        onKeepEditing={keepEditing}
      >
        <input aria-label="Nome" />
      </Modal>,
    );
    expect(screen.getByRole("alertdialog")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Continuar editando" }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(keepEditing).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Ficha" })).toHaveFocus();
  });

  it("protege atualização externa somente enquanto há alterações não salvas", () => {
    const view = render(
      <Modal title="Ficha" onClose={vi.fn()} dirty>
        <p>Alteração</p>
      </Modal>,
    );
    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
    view.rerender(
      <Modal title="Ficha" onClose={vi.fn()}>
        <p>Salvo</p>
      </Modal>,
    );
    const savedEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(savedEvent);
    expect(savedEvent.defaultPrevented).toBe(false);
  });
});
