import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Members } from "./Organization";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));

const email = "organizador@example.com";
function response(accepted: boolean) {
  return {
    members: accepted
      ? [
          {
            id: "member",
            organizationId: "org",
            accountId: "user",
            role: "ORGANIZER",
            active: true,
            healthEventIds: [],
            account: { id: "user", email },
          },
        ]
      : [],
    invitations: [
      {
        id: "invitation",
        email,
        role: "ORGANIZER",
        expiresAt: "2099-01-01T00:00:00Z",
        acceptedAt: accepted ? "2026-10-08T12:00:00Z" : null,
        revokedAt: null,
      },
    ],
    events: [],
  };
}
function renderMembers() {
  return render(
    <MemoryRouter initialEntries={["/organizacao/org/membros"]}>
      <Routes>
        <Route
          path="/organizacao/:organizationId/membros"
          element={<Members />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
function expectAccepted() {
  expect(screen.getByText("Organizador · Aceito")).toBeInTheDocument();
  expect(
    within(screen.getByRole("table")).getByText(email),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Aguardando aceite/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Revogar" }),
  ).not.toBeInTheDocument();
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Lista de membros após aceite em outra aba", () => {
  it("consulta o estado salvo ao retornar à aba e apresenta o membro e o convite aceito", async () => {
    mocks.api.mockResolvedValue(response(false));
    renderMembers();
    await screen.findByText("Organizador · Aguardando aceite");
    mocks.api.mockResolvedValue(response(true));
    fireEvent(window, new Event("focus"));
    await screen.findByText("Organizador · Aceito");
    expectAccepted();
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(
      mocks.api.mock.calls.every(
        ([path, options]) =>
          path === "/organizations/org/members" && !options.method,
      ),
    ).toBe(true);
  });
  it("atualiza periodicamente enquanto está visível e encerra a consulta periódica após o aceite", async () => {
    vi.useFakeTimers();
    mocks.api
      .mockResolvedValueOnce(response(false))
      .mockResolvedValue(response(true));
    renderMembers();
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByText("Organizador · Aguardando aceite"),
    ).toBeInTheDocument();
    const initialCalls = mocks.api.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expectAccepted();
    expect(mocks.api).toHaveBeenCalledTimes(initialCalls + 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(mocks.api).toHaveBeenCalledTimes(initialCalls + 1);
  });
  it("mantém a lista visível durante a consulta em segundo plano", async () => {
    let finishRefresh!: (data: ReturnType<typeof response>) => void;
    mocks.api.mockResolvedValueOnce(response(true)).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
    renderMembers();
    await screen.findByText("Organizador · Aceito");
    fireEvent(window, new Event("focus"));
    expectAccepted();
    expect(screen.queryByText("Carregando…")).not.toBeInTheDocument();
    await act(async () => {
      finishRefresh(response(true));
    });
    expectAccepted();
  });
  it("não consulta enquanto a aba está oculta e atualiza quando volta a ficar visível", async () => {
    mocks.api.mockResolvedValue(response(false));
    renderMembers();
    await screen.findByText("Organizador · Aguardando aceite");
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    fireEvent(window, new Event("focus"));
    expect(mocks.api).toHaveBeenCalledTimes(1);
    mocks.api.mockResolvedValue(response(true));
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    await screen.findByText("Organizador · Aceito");
    expectAccepted();
  });
  it("permite atualizar manualmente sem aceitar o convite novamente", async () => {
    mocks.api.mockResolvedValue(response(false));
    renderMembers();
    await screen.findByText("Organizador · Aguardando aceite");
    mocks.api.mockResolvedValue(response(true));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Atualizar lista" }));
    await screen.findByText("Organizador · Aceito");
    expectAccepted();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
  it("ignora uma resposta antiga que chega depois da atualização", async () => {
    let finishOldRequest!: (data: ReturnType<typeof response>) => void;
    mocks.api
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldRequest = resolve;
          }),
      )
      .mockResolvedValue(response(true));
    renderMembers();
    fireEvent(window, new Event("focus"));
    await screen.findByText("Organizador · Aceito");
    await act(async () => {
      finishOldRequest(response(false));
    });
    expectAccepted();
  });
});
