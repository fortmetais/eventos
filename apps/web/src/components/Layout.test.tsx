import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./Layout";

const state = vi.hoisted(() => ({ temporaryHome: true }));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({
    temporaryHome: state.temporaryHome,
    eventsEnabled: false,
    volunteerRegistrationsReady: true,
    session: null,
    access: null,
    loading: false,
  }),
}));
afterEach(cleanup);

describe("Navegação pública com cartaz no início", () => {
  it.each([
    [true, "/eventos"],
    [false, "/"],
  ])("modo de cartaz %s usa a vitrine em %s", (temporaryHome, target) => {
    state.temporaryHome = temporaryHome;
    render(
      <MemoryRouter initialEntries={["/inscricao/teste"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="inscricao/:id" element={<p>Ficha de teste</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: "Explorar eventos" }),
    ).toHaveAttribute("href", target);
    expect(
      screen.getAllByRole("link", { name: "encontro ." })[0],
    ).toHaveAttribute("href", "/");
    expect(screen.getByText("Ficha de teste")).toBeInTheDocument();
  });
});
