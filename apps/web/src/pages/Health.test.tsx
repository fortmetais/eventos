import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Health } from "./Health";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("./Organization", () => ({ useOrganization: () => ({
  organizationId: "org", membership: { healthEventIds: ["event-a", "event-b"] },
}) }));
beforeEach(() => { mocks.api.mockReset(); });
afterEach(cleanup);
const people = [
  { id: "a", protocol: "TEST-1", person: { name: "Maria Ávila" }, campaign: { kind: "VOLUNTEER" } },
  { id: "b", protocol: "TEST-2", person: { name: "João Teste" }, campaign: { kind: "CAMPER" } },
];
function data(path: string) {
  if (path.endsWith("/events")) return [{ id: "event-a", name: "Evento A" }, { id: "event-b", name: "Evento B" }, { id: "private", name: "Sem autorização" }];
  if (path.includes("/events/")) return people;
  return { hasAllergies: true, allergies: "Informação de Maria" };
}
describe("Health participant navigation", () => {
  it("searches without accents and retains the authorized event filter", async () => {
    mocks.api.mockImplementation(async (path: string) => data(path));
    render(<Health />);
    await screen.findByRole("option", { name: "Evento A" });
    expect(screen.queryByRole("option", { name: "Sem autorização" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Evento autorizado" }), { target: { value: "event-a" } });
    await screen.findByRole("button", { name: /Maria Ávila/ });
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar participante" }), { target: { value: "joao" } });
    expect(screen.getByRole("button", { name: /João Teste/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Maria Ávila/ })).not.toBeInTheDocument();
    expect(screen.getByText("1 de 2 participantes")).toBeInTheDocument();
  });
  it("never displays the previous person's answers while the next record loads", async () => {
    let resolveNext!: (value: unknown) => void;
    mocks.api.mockImplementation((path: string) => path.endsWith("/registrations/b/health")
      ? new Promise((resolve) => { resolveNext = resolve; }) : Promise.resolve(data(path)));
    render(<Health />);
    await screen.findByRole("option", { name: "Evento A" });
    fireEvent.change(screen.getByRole("combobox", { name: "Evento autorizado" }), { target: { value: "event-a" } });
    fireEvent.click(await screen.findByRole("button", { name: /Maria Ávila/ }));
    await screen.findByText("Informação de Maria");
    fireEvent.click(screen.getByRole("button", { name: /João Teste/ }));
    expect(screen.queryByText("Informação de Maria")).not.toBeInTheDocument();
    resolveNext({ hasAllergies: false });
    await screen.findByRole("heading", { name: "João Teste" });
    expect(screen.getAllByText("Não perguntado")).toHaveLength(4);
    expect(screen.getByText("Não")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Evento autorizado" }), { target: { value: "event-b" } });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "João Teste" })).not.toBeInTheDocument());
  });
});
