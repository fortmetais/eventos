import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { ReactNode } from "react";
vi.mock("./lib/auth", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ session: null, access: null, loading: false, error: "", eventsEnabled: true }),
}));
vi.mock("./pages/Login", () => ({ Login: () => <p>Acesso de teste</p>, NewPassword: () => <p>Senha de teste</p> }));
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });
afterEach(cleanup);
describe("Protected route return context", () => {
  it("retains selected event, filters and fragment when requesting login", async () => {
    const destination = "/organizacao/org/inscricoes?evento=event-a&pagina=3#ficha";
    window.history.replaceState({}, "", destination);
    render(<App />);
    await screen.findByText("Acesso de teste");
    await waitFor(() => expect(new URL(window.location.href).searchParams.get("next")).toBe(destination));
  });
});
