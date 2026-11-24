import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DepartmentCapacity } from "./DepartmentCapacity";
import type { Team } from "../lib/types";
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

const team: Team = {
  id: "blue",
  campaignId: "campers",
  kind: "CAMPER",
  eventId: "event",
  name: "AZUL",
  capacity: 10,
  occupied: 0,
  available: 10,
};

describe("Vagas de equipe por campanha", () => {
  it("salva capacidade e exclui pelo mesmo contexto da campanha de campistas", async () => {
    const refresh = vi.fn();
    render(
      <DepartmentCapacity
        team={team}
        organizationId="org"
        campaignId="campers"
        editable
        refresh={refresh}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Vagas de AZUL/), {
      target: { value: "12" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar vagas de AZUL" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/organizations/org/campaigns/campers/teams/blue",
        { method: "PUT", body: { capacity: 12 } },
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Excluir equipe AZUL" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/organizations/org/campaigns/campers/teams/blue",
        { method: "DELETE" },
      ),
    );
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("mantém a rota antiga para consumidores legados de departamentos do evento", async () => {
    render(
      <DepartmentCapacity
        team={{ ...team, kind: "VOLUNTEER" }}
        organizationId="org"
        editable
        refresh={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar vagas de AZUL" }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/organizations/org/events/event/teams/blue",
        { method: "PUT", body: { capacity: 10 } },
      ),
    );
  });

  it("impede a exclusão de equipe ocupada", () => {
    render(
      <DepartmentCapacity
        team={{ ...team, occupied: 1, available: 9 }}
        organizationId="org"
        campaignId="campers"
        editable
        refresh={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Excluir equipe AZUL" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Há participantes vinculados a esta equipe."),
    ).toBeVisible();
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
