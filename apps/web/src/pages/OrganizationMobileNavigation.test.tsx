import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OrganizationLayout } from "./Organization";
import type { Access, Role } from "../lib/types";

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("../lib/auth", () => ({ useAuth: mocks.useAuth }));

function view(path = "/organizacao/org/inscricoes", role: Role = "ORGANIZER") {
  const access: Access = {
    account: {
      id: "user",
      email: "user@example.test",
      platformAdmin: false,
      profile: {},
    },
    organizations: [
      {
        id: "member",
        organizationId: "org",
        accountId: "user",
        role,
        active: true,
        healthEventIds: [],
        organization: {
          id: "org",
          name: "Paróquia de teste",
          city: "Loanda",
          state: "PR",
          kind: "PARISH",
          active: true,
        },
      },
    ],
  };
  mocks.useAuth.mockReturnValue({ access, eventsEnabled: true });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/organizacao/:organizationId"
          element={<OrganizationLayout />}
        >
          <Route path="inscricoes" element={<h1>Inscrições do evento</h1>} />
          <Route path="eventos" element={<h1>Eventos da organização</h1>} />
          <Route index element={<h1>Visão geral</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Navegação compacta da organização em Inscrições", () => {
  it("usa o menu único da organização e permite fechar por Escape com retorno de foco", async () => {
    const { container } = view();
    expect(
      container.querySelector(".admin-shell--registrations"),
    ).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Menu da organização" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const nav = screen.getByRole("navigation", { name: "Organização" });
    expect(nav.id).toBe(toggle.getAttribute("aria-controls"));
    expect(
      within(nav).getAllByRole("link", { name: "Inscrições" }),
    ).toHaveLength(1);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      container.querySelector(".sidebar.mobile-organization-open"),
    ).toBeInTheDocument();
    within(nav).getByRole("link", { name: "Eventos e fichas" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("fecha ao escolher outra página e não ativa o novo layout nas demais telas", async () => {
    const { container } = view();
    await userEvent.click(
      screen.getByRole("button", { name: "Menu da organização" }),
    );
    await userEvent.click(
      screen.getByRole("link", { name: "Eventos e fichas" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Eventos da organização" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Menu da organização" }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".admin-shell--registrations"),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Inscrições" }));
    expect(
      screen.getByRole("button", { name: "Menu da organização" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("preserva os limites de navegação da secretaria e não oferece ações de organização", async () => {
    view("/organizacao/org/inscricoes", "SECRETARY");
    await userEvent.click(
      screen.getByRole("button", { name: "Menu da organização" }),
    );
    const nav = screen.getByRole("navigation", { name: "Organização" });
    expect(
      within(nav).getByRole("link", { name: "Inscrições" }),
    ).toBeInTheDocument();
    expect(
      within(nav).queryByRole("link", { name: "Membros e convites" }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole("link", { name: "Mensagens" }),
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole("link", { name: "Funções" }),
    ).not.toBeInTheDocument();
  });
});
