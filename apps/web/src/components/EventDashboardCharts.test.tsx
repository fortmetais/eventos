import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EventDashboardCharts } from "./EventDashboardCharts";
import {
  statusLabels,
  type EventRegistrationCounts,
  type EventRegistrationSummary,
  type RegistrationStatus,
} from "../lib/types";

const empty: EventRegistrationCounts = {
  total: 0,
  byStatus: {
    RECEIVED: 0,
    REVIEW: 0,
    WAITLIST: 0,
    APPROVED: 0,
    CONFIRMED: 0,
    REJECTED: 0,
    CANCELLED: 0,
  },
  candidateGoing: 0,
};
const department = {
  id: "welcome",
  name: "Acolhida e recepção",
  capacity: 12,
  occupied: 8,
  available: 4,
  occupiedByCampaign: { volunteer: 5, camper: 3 },
};
function summary(
  overrides: Partial<EventRegistrationSummary> = {},
): EventRegistrationSummary {
  return {
    eventId: "event",
    generatedAt: "2026-11-16T15:00:00Z",
    presenceAvailable: true,
    totals: empty,
    campaigns: [],
    departmentsAvailable: true,
    departments: [department],
    ...overrides,
  };
}
const registrationsLink = (filters: Record<string, string>) =>
  `/inscricoes?${new URLSearchParams(filters)}`;
function view(value = summary(), campaignId = "", counts = empty) {
  return render(
    <MemoryRouter>
      <EventDashboardCharts
        counts={counts}
        summary={value}
        campaignId={campaignId}
        registrationsLink={registrationsLink}
      />
    </MemoryRouter>,
  );
}
afterEach(cleanup);

describe("Gráficos do evento", () => {
  it("apresenta os sete estados exclusivos, percentuais e atalhos inclusive para recusadas e canceladas", () => {
    const counts = {
      ...empty,
      total: 20,
      byStatus: {
        ...empty.byStatus,
        RECEIVED: 10,
        APPROVED: 8,
        REJECTED: 1,
        CANCELLED: 1,
      },
    };
    view(summary(), "", counts);
    const region = screen.getByRole("region", {
      name: "Situação das inscrições",
    });
    expect(within(region).getAllByRole("link")).toHaveLength(7);
    for (const status of Object.keys(counts.byStatus) as RegistrationStatus[]) {
      const count = counts.byStatus[status];
      const link = within(region).getByRole("link", {
        name: `${statusLabels[status]}: ${count} ${count === 1 ? "inscrição" : "inscrições"}. Ver inscrições`,
      });
      const params = new URL(link.getAttribute("href")!, "https://example.test")
        .searchParams;
      expect(params.get("status")).toBe(status);
      expect(params.get("includeClosed")).toBe(
        ["REJECTED", "CANCELLED"].includes(status) ? "true" : null,
      );
    }
    expect(
      within(region).getByRole("link", { name: /^Recebida:/ }),
    ).toHaveAccessibleDescription("50% do total");
    expect(region.querySelectorAll('[aria-hidden="true"]')).toHaveLength(7);
    expect(
      within(region).queryByText("Vou participar"),
    ).not.toBeInTheDocument();
  });

  it("mantém a capacidade e as vagas livres globais ao separar a ocupação por campanha", () => {
    const rendered = view();
    const row = screen.getByRole("link", {
      name: "Ver inscrições de Acolhida e recepção",
    });
    expect(row).toHaveAccessibleDescription(
      "8 de 12 vagas ocupadas · 4 livres",
    );
    const freeWidth = (row.querySelector(".occupancy-free") as HTMLElement)
      .style.width;
    expect(
      row.querySelectorAll(".event-dashboard-chart-track > span"),
    ).toHaveLength(2);
    rendered.rerender(
      <MemoryRouter>
        <EventDashboardCharts
          counts={empty}
          summary={summary()}
          campaignId="volunteer"
          registrationsLink={registrationsLink}
        />
      </MemoryRouter>,
    );
    const selected = screen.getByRole("link", {
      name: "Ver inscrições de Acolhida e recepção",
    });
    expect(selected).toHaveAccessibleDescription(
      "8 de 12 vagas ocupadas · 5 nesta campanha · 3 de outras campanhas · 4 livres",
    );
    expect(
      (selected.querySelector(".occupancy-free") as HTMLElement).style.width,
    ).toBe(freeWidth);
    expect(
      selected.querySelectorAll(".event-dashboard-chart-track > span"),
    ).toHaveLength(3);
    expect(within(selected).queryByRole("link")).not.toBeInTheDocument();
    expect(
      new URL(
        selected.getAttribute("href")!,
        "https://example.test",
      ).searchParams.get("team"),
    ).toBe("welcome");
    expect(selected.getAttribute("href")).toContain("sort=ACCEPTED_FIRST");
    expect(
      screen.getByText(/Capacidade compartilhada entre as campanhas/),
    ).toBeVisible();
  });

  it("distingue capacidade desconhecida, zero e excesso sem esconder ocupações ou inventar vagas", () => {
    const rendered = view(
      summary({
        departments: [
          {
            ...department,
            id: "unknown",
            name: "Sem limite definido",
            capacity: null,
            occupied: 4,
            available: null,
          },
          {
            ...department,
            id: "zero",
            name: "Sem vagas",
            capacity: 0,
            occupied: 0,
            available: 0,
          },
          {
            ...department,
            id: "excess",
            name: "Lotado",
            capacity: 3,
            occupied: 5,
            available: 0,
          },
        ],
      }),
    );
    const unknown = screen.getByRole("link", {
      name: "Ver inscrições de Sem limite definido",
    });
    expect(unknown).toHaveAccessibleDescription(
      "4 ocupadas · Vagas não definidas",
    );
    expect(
      unknown.querySelectorAll(".event-dashboard-chart-track > span"),
    ).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "Ver inscrições de Sem vagas" }),
    ).toHaveAccessibleDescription("0 de 0 vagas ocupadas · 0 livres");
    expect(
      screen.getByRole("link", { name: "Ver inscrições de Lotado" }),
    ).toHaveAccessibleDescription(
      "5 de 3 vagas ocupadas · 0 livres · 2 acima da capacidade",
    );
    expect(rendered.container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(
      within(
        screen.getByRole("region", { name: "Situação das inscrições" }),
      ).getAllByText("0% do total"),
    ).toHaveLength(7);
  });

  it("separa resumo legado indisponível de um evento sem departamentos", () => {
    const rendered = view(
      summary({ departmentsAvailable: undefined, departments: undefined }),
    );
    expect(
      screen.getByText("Dados dos departamentos indisponíveis."),
    ).toBeVisible();
    rendered.rerender(
      <MemoryRouter>
        <EventDashboardCharts
          counts={empty}
          summary={summary({ departmentsAvailable: false })}
          campaignId=""
          registrationsLink={registrationsLink}
        />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("link", { name: /Ver inscrições de Acolhida/ }),
    ).not.toBeInTheDocument();
    rendered.rerender(
      <MemoryRouter>
        <EventDashboardCharts
          counts={empty}
          summary={summary({ departments: [] })}
          campaignId=""
          registrationsLink={registrationsLink}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("Nenhum departamento cadastrado para este evento."),
    ).toBeVisible();
  });
});
