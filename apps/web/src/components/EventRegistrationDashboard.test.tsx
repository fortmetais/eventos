import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  EventRegistrationDashboard,
  defaultRegistrationDashboardEvent,
} from "./EventRegistrationDashboard";
import {
  OrganizationDashboard,
  OrganizationLayout,
} from "../pages/Organization";
import type {
  EventEdition,
  EventRegistrationCounts,
  EventRegistrationSummary,
  Role,
} from "../lib/types";

const mocks = vi.hoisted(() => ({ api: vi.fn(), useAuth: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mocks.api,
}));
vi.mock("../lib/auth", () => ({ useAuth: mocks.useAuth }));
const org = {
  id: "org",
  name: "Comunidade de teste",
  city: "Loanda",
  state: "PR",
  kind: "PARISH",
  active: true,
};
function edition(id = "a", values: Partial<EventEdition> = {}): EventEdition {
  return {
    id,
    organizationId: "org",
    name: `Evento ${id}`,
    startsAt: "2026-11-14T00:00:00.000Z",
    endsAt: "2026-11-18T00:00:00.000Z",
    status: "PUBLISHED",
    city: "Loanda",
    location: "Comunidade",
    description: "Evento de teste",
    type: { name: "FAC" },
    campaigns: [],
    teams: [],
    ...values,
  };
}
function counts(total = 23): EventRegistrationCounts {
  return {
    total,
    byStatus: {
      RECEIVED: 5,
      REVIEW: 3,
      APPROVED: 4,
      CONFIRMED: 6,
      WAITLIST: 1,
      REJECTED: 2,
      CANCELLED: 2,
    },
    candidateGoing: 9,
  };
}
function summary(id = "a", total = 23): EventRegistrationSummary {
  return {
    eventId: id,
    generatedAt: "2026-11-16T15:00:00Z",
    presenceAvailable: true,
    totals: counts(total),
    campaigns: [
      { id: "volunteer", kind: "VOLUNTEER", ...counts(15) },
      { id: "camper", kind: "CAMPER", ...counts(8) },
    ],
  };
}
function auth(role: Role = "ORGANIZER", flags: Record<string, boolean> = {}) {
  mocks.useAuth.mockReturnValue({
    eventsEnabled: true,
    eventManagementEnabled: true,
    ...flags,
    access: {
      account: {
        id: "user",
        email: "user@example.test",
        platformAdmin: false,
        profile: {},
      },
      organizations: [
        {
          id: "membership",
          organizationId: "org",
          accountId: "user",
          role,
          active: true,
          healthEventIds: [],
          organization: org,
        },
      ],
    },
  });
}
function Location() {
  const location = useLocation();
  return <output aria-label="Localização">{location.search}</output>;
}
function view(path = "/organizacao/org?evento=a") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EventRegistrationDashboard organizationId="org" />
      <Location />
    </MemoryRouter>,
  );
}
function organizationView() {
  return render(
    <MemoryRouter initialEntries={["/organizacao/org?evento=a"]}>
      <Routes>
        <Route
          path="/organizacao/:organizationId"
          element={<OrganizationLayout />}
        >
          <Route index element={<OrganizationDashboard />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
const metric = (name: string, value: number) =>
  screen.getByRole("link", { name: `${name}: ${value}. Ver inscrições` });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T15:00:00Z"));
  mocks.api
    .mockReset()
    .mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/events")
          ? [edition(), edition("b")]
          : summary(path.includes("/events/b/") ? "b" : "a"),
      ),
    );
  auth();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Visão geral de inscrições por evento", () => {
  it("usa o resumo completo do servidor e abre filtros novos sem herdar pesquisa ou paginação", async () => {
    view(
      "/organizacao/org?evento=a&campaign=volunteer&q=antiga&team=antigo&status=CANCELLED&page=9&exibicao=cards",
    );
    await screen.findByRole("link", { name: "Inscritos: 15. Ver inscrições" });
    for (const [label, value, filters] of [
      ["Inscritos", 15, { includeClosed: "true" }],
      ["Aceitos", 4, { status: "APPROVED" }],
      ["Recusados", 2, { status: "REJECTED", includeClosed: "true" }],
      ["Vagas confirmadas", 6, { status: "CONFIRMED" }],
      ["Vou participar", 9, { presence: "VOU", includeClosed: "true" }],
    ] as const) {
      const link = new URL(
        metric(label, value).getAttribute("href")!,
        "https://example.test",
      );
      expect(link.pathname).toBe("/organizacao/org/inscricoes");
      expect(Object.fromEntries(link.searchParams)).toEqual({
        evento: "a",
        aba: "inscricoes",
        campaign: "volunteer",
        ...filters,
      });
    }
    expect(screen.getByText(/Atualizado em/)).toHaveTextContent("16/11/2026");
    expect(mocks.api.mock.calls).toHaveLength(2);
    expect(
      mocks.api.mock.calls.some(([path]) =>
        /health|registrations\?/.test(path),
      ),
    ).toBe(false);
  });
  it("troca campanha no cliente sem nova consulta e mantém o filtro na URL", async () => {
    view();
    await screen.findByRole("link", { name: "Inscritos: 23. Ver inscrições" });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Campanha" }),
      "camper",
    );
    expect(metric("Inscritos", 8)).toBeVisible();
    expect(screen.getByLabelText("Localização")).toHaveTextContent(
      "campaign=camper",
    );
    expect(mocks.api).toHaveBeenCalledTimes(2);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Evento" }),
      "b",
    );
    await screen.findByRole("link", { name: "Inscritos: 23. Ver inscrições" });
    expect(screen.getByLabelText("Localização")).not.toHaveTextContent(
      "campaign=",
    );
  });
  it("abre as barras com evento e campanha atuais sem herdar filtros antigos ou consultar cada departamento", async () => {
    mocks.api.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/events")
          ? [edition()]
          : {
              ...summary(),
              departmentsAvailable: true,
              departments: [
                {
                  id: "welcome",
                  name: "Acolhida",
                  capacity: 12,
                  occupied: 8,
                  available: 4,
                  occupiedByCampaign: { volunteer: 5, camper: 3 },
                },
              ],
            },
      ),
    );
    view(
      "/organizacao/org?evento=a&campaign=camper&q=antiga&team=antigo&status=CANCELLED&page=7",
    );
    const department = await screen.findByRole("link", {
      name: "Ver inscrições de Acolhida",
    });
    expect(department).toHaveAccessibleDescription(
      "8 de 12 vagas ocupadas · 3 nesta campanha · 5 de outras campanhas · 4 livres",
    );
    const status = screen.getByRole("link", {
      name: "Recusada: 2 inscrições. Ver inscrições",
    });
    for (const [link, filters] of [
      [
        department,
        { team: "welcome", sort: "ACCEPTED_FIRST", includeClosed: "true" },
      ],
      [status, { status: "REJECTED", includeClosed: "true" }],
    ] as const) {
      expect(
        Object.fromEntries(
          new URL(link.getAttribute("href")!, "https://example.test")
            .searchParams,
        ),
      ).toEqual({
        evento: "a",
        aba: "inscricoes",
        campaign: "camper",
        ...filters,
      });
    }
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
  it("mostra zero verdadeiro e presença indisponível sem transformar erro em contagem zero", async () => {
    const zero = counts(0);
    for (const key of Object.keys(
      zero.byStatus,
    ) as (keyof typeof zero.byStatus)[])
      zero.byStatus[key] = 0;
    zero.candidateGoing = null;
    mocks.api.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/events")
          ? [edition()]
          : {
              ...summary(),
              presenceAvailable: false,
              totals: zero,
              campaigns: [{ id: "volunteer", kind: "VOLUNTEER", ...zero }],
            },
      ),
    );
    view();
    await screen.findByRole("link", { name: "Inscritos: 0. Ver inscrições" });
    expect(metric("Aceitos", 0)).toBeVisible();
    expect(
      screen.getByLabelText("Vou participar: indisponível"),
    ).toHaveTextContent("—");
    expect(
      screen.queryByRole("link", { name: /Vou participar/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Campanha" }),
    ).not.toBeInTheDocument();
  });
  it("trata ausência de eventos e erro do resumo sem cartões numéricos inventados", async () => {
    mocks.api.mockResolvedValue([]);
    const first = view();
    expect(await screen.findByText("Nenhum evento disponível")).toBeVisible();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    first.unmount();
    mocks.api.mockImplementation((path: string) =>
      path.endsWith("/events")
        ? Promise.resolve([edition()])
        : Promise.reject(new Error("Não foi possível carregar o resumo.")),
    );
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o resumo.",
    );
    expect(
      screen.queryByRole("link", { name: /Inscritos:/ }),
    ).not.toBeInTheDocument();
    mocks.api.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith("/events") ? [edition()] : summary()),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Atualizar resumo" }),
    );
    expect(
      await screen.findByRole("link", {
        name: "Inscritos: 23. Ver inscrições",
      }),
    ).toBeVisible();
  });
  it("mantém o último resumo identificado quando uma atualização falha", async () => {
    view();
    await screen.findByRole("link", { name: "Inscritos: 23. Ver inscrições" });
    mocks.api.mockImplementation((path: string) =>
      path.endsWith("/events")
        ? Promise.resolve([edition()])
        : Promise.reject(new Error("Falha na atualização.")),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Atualizar resumo" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Os números exibidos são da última atualização.",
    );
    expect(metric("Inscritos", 23)).toBeVisible();
  });
  it("não reaproveita números do evento anterior nem aplica resposta atrasada após a troca", async () => {
    let resolveA!: (value: EventRegistrationSummary) => void;
    mocks.api.mockImplementation((path: string) =>
      path.endsWith("/events")
        ? Promise.resolve([edition(), edition("b")])
        : path.includes("/events/a/")
          ? new Promise((resolve) => {
              resolveA = resolve;
            })
          : Promise.resolve(summary("b", 5)),
    );
    view();
    await screen.findByRole("combobox", { name: "Evento" });
    await waitFor(() => expect(resolveA).toBeDefined());
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Evento" }),
      "b",
    );
    expect(
      await screen.findByRole("link", { name: "Inscritos: 5. Ver inscrições" }),
    ).toBeVisible();
    await act(async () => resolveA(summary("a", 99)));
    expect(metric("Inscritos", 5)).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Inscritos: 99/ }),
    ).not.toBeInTheDocument();
  });
  it("remove opções e resumo da organização anterior enquanto a próxima carrega", async () => {
    const rendered = render(
      <MemoryRouter initialEntries={["/?evento=a"]}>
        <EventRegistrationDashboard organizationId="org" />
      </MemoryRouter>,
    );
    await screen.findByRole("link", { name: "Inscritos: 23. Ver inscrições" });
    let resolveEvents!: (value: EventEdition[]) => void;
    mocks.api.mockImplementation((path: string) =>
      path === "/organizations/other/events"
        ? new Promise((resolve) => {
            resolveEvents = resolve;
          })
        : Promise.resolve(summary("b", 7)),
    );
    rendered.rerender(
      <MemoryRouter initialEntries={["/?evento=a"]}>
        <EventRegistrationDashboard organizationId="other" />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("link", { name: /Inscritos: 23/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Evento a/ }),
    ).not.toBeInTheDocument();
    await act(async () =>
      resolveEvents([edition("b", { organizationId: "other" })]),
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Evento" }),
      "b",
    );
    expect(
      await screen.findByRole("link", { name: "Inscritos: 7. Ver inscrições" }),
    ).toBeVisible();
    expect(
      mocks.api.mock.calls.some(
        ([path]) =>
          path === "/organizations/other/events/a/registration-summary",
      ),
    ).toBe(false);
  });
  it("atualiza somente quando visível e volta a consultar ao retornar o foco", async () => {
    vi.useFakeTimers();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    render(
      <MemoryRouter initialEntries={["/?evento=a"]}>
        <EventRegistrationDashboard organizationId="org" />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(metric("Inscritos", 23)).toBeVisible();
    const initial = mocks.api.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(mocks.api).toHaveBeenCalledTimes(initial + 1);
    visibility.mockReturnValue("hidden");
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      fireEvent.focus(window);
    });
    expect(mocks.api).toHaveBeenCalledTimes(initial + 1);
    visibility.mockReturnValue("visible");
    await act(async () => fireEvent.focus(window));
    expect(mocks.api).toHaveBeenCalledTimes(initial + 2);
  });
  it("prioriza eventos por dia de Brasília e deixa rascunhos/cancelados para escolha manual", async () => {
    const active = edition("active", {
      startsAt: "2026-11-16T00:00:00Z",
      endsAt: "2026-11-16T00:00:00Z",
    });
    const near = edition("near", {
      startsAt: "2026-11-18",
      endsAt: "2026-11-20",
    });
    const far = edition("far", {
      startsAt: "2026-12-18",
      endsAt: "2026-12-20",
    });
    const past = edition("past", {
      startsAt: "2026-11-10",
      endsAt: "2026-11-12",
      status: "COMPLETED",
    });
    const excluded = [
      edition("draft", { status: "DRAFT" }),
      edition("cancel", { status: "CANCELLED" }),
    ];
    expect(
      defaultRegistrationDashboardEvent(
        [...excluded, near, active],
        new Date("2026-11-17T02:30:00Z"),
      )?.id,
    ).toBe("active");
    expect(defaultRegistrationDashboardEvent([far, near, past])?.id).toBe(
      "near",
    );
    expect(defaultRegistrationDashboardEvent([past])?.id).toBe("past");
    expect(defaultRegistrationDashboardEvent(excluded)).toBeNull();
    mocks.api.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith("/events") ? excluded : summary("draft")),
    );
    view("/organizacao/org");
    await screen.findByText(
      "Selecione um evento para acompanhar as inscrições.",
    );
    expect(mocks.api).toHaveBeenCalledTimes(1);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Evento" }),
      "draft",
    );
    expect(
      await screen.findByRole("link", {
        name: "Inscritos: 23. Ver inscrições",
      }),
    ).toBeVisible();
  });
  it.each([
    ["ORGANIZER", { eventsEnabled: true }, true],
    [
      "SECRETARY",
      { eventsEnabled: false, volunteerRegistrationsReady: true },
      true,
    ],
    [
      "SECRETARY",
      { eventsEnabled: false, camperRegistrationsReady: true },
      true,
    ],
    [
      "ORGANIZER",
      {
        eventsEnabled: false,
        volunteerRegistrationsEnabled: true,
        volunteerRegistrationsReady: false,
      },
      false,
    ],
    [
      "HEALTH",
      { eventsEnabled: true, volunteerRegistrationsReady: true },
      false,
    ],
  ] as const)(
    "integra a visão geral respeitando papel %s e liberações do acesso",
    async (role, flags, expected) => {
      auth(role, flags);
      organizationView();
      await act(async () => {});
      if (expected)
        expect(
          await screen.findByRole("link", {
            name: "Inscritos: 23. Ver inscrições",
          }),
        ).toBeVisible();
      else {
        expect(
          screen.queryByRole("region", {
            name: "Resumo das inscrições do evento",
          }),
        ).not.toBeInTheDocument();
        expect(
          mocks.api.mock.calls.some(([path]) =>
            path.endsWith("/registration-summary"),
          ),
        ).toBe(false);
      }
    },
  );
  it("usa o menu recolhível da organização no início e mantém Escape e foco acessíveis", async () => {
    organizationView();
    const toggle = screen.getByRole("button", { name: "Menu da organização" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    screen.getByRole("link", { name: "Visão geral" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });
});
