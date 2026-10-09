import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EventCard } from "./Explore";
import type { EventEdition } from "../lib/types";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const event = {
  id: "e",
  name: "FAC 2027",
  type: { name: "FAC" },
  city: "Toledo",
  startsAt: "2027-05-01",
  endsAt: "2027-05-04",
  organization: { name: "Paróquia de Teste", state: "PR" },
  campaigns: [
    { id: "camper", kind: "CAMPER", open: true },
    { id: "volunteer", kind: "VOLUNTEER", open: true },
  ],
} as EventEdition;
describe("Vitrine de eventos", () => {
  it("exibe os dois caminhos quando ambas as campanhas estão abertas", () => {
    render(
      <MemoryRouter>
        <EventCard event={event} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: /Participar do evento/ }),
    ).toHaveAttribute("href", "/inscricao/camper");
    expect(
      screen.getByRole("link", { name: /Trabalhar na equipe/ }),
    ).toHaveAttribute("href", "/inscricao/volunteer");
    expect(screen.getByText("Paróquia de Teste")).toBeInTheDocument();
  });
  it("não permite iniciar uma campanha fechada pelo card", () => {
    render(
      <MemoryRouter>
        <EventCard
          event={{
            ...event,
            campaigns: event.campaigns.map((c) => ({
              ...c,
              open: c.kind === "VOLUNTEER",
            })),
          }}
        />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("link", { name: /Participar do evento/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Trabalhar na equipe/ }),
    ).toBeInTheDocument();
  });
});
