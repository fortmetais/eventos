import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DepartmentCapacity } from "./DepartmentCapacity";
const mocks = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
function view(occupied = 0, editable = true) {
  render(
    <DepartmentCapacity
      team={{
        id: "team-a",
        eventId: "event-a",
        name: "ANJO",
        capacity: 5,
        occupied,
        available: 5 - occupied,
      }}
      organizationId="org-a"
      editable={editable}
      refresh={mocks.refresh}
    />,
  );
}
beforeEach(() => {
  mocks.api.mockReset();
  mocks.refresh.mockReset();
  mocks.api.mockResolvedValue({ deleted: true });
});
afterEach(cleanup);
describe("Excluir departamentos e suas vagas", () => {
  it("pede confirmação e permite cancelar sem excluir", async () => {
    view();
    await userEvent.click(
      screen.getByRole("button", { name: "Excluir departamento ANJO" }),
    );
    expect(screen.getByText("Excluir ANJO e suas vagas?")).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.getByRole("button", { name: "Excluir departamento ANJO" }),
    ).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("exclui somente o departamento selecionado e atualiza a lista", async () => {
    view();
    await userEvent.click(
      screen.getByRole("button", { name: "Excluir departamento ANJO" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org-a/events/event-a/teams/team-a",
      { method: "DELETE" },
    );
  });
  it("preserva o departamento e mostra o bloqueio da API", async () => {
    mocks.api.mockRejectedValueOnce(
      new Error("O departamento está em uma ficha publicada."),
    );
    view();
    await userEvent.click(
      screen.getByRole("button", { name: "Excluir departamento ANJO" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar exclusão" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ficha publicada",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByText("ANJO")).toBeInTheDocument();
  });
  it("bloqueia exclusão de departamento ocupado e não oferece o controle a outros perfis", () => {
    view(1);
    expect(
      screen.getByRole("button", { name: "Excluir departamento ANJO" }),
    ).toBeDisabled();
    cleanup();
    view(0, false);
    expect(
      screen.queryByRole("button", { name: "Excluir departamento ANJO" }),
    ).not.toBeInTheDocument();
  });
});
