import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { ReviewRegistrations } from "./ReviewRegistrations";
import type { EventEdition, Registration, Team } from "../lib/types";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  role: "ORGANIZER",
  eventsEnabled: true,
}));
vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({ eventsEnabled: mocks.eventsEnabled }),
}));
vi.mock("./Organization", () => ({
  useOrganization: () => ({
    organizationId: "org",
    membership: { role: mocks.role },
  }),
}));
vi.mock("../components/Modal", () => ({
  Modal: ({
    title,
    children,
    onClose,
    closeRequested,
    onKeepEditing,
  }: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
    closeRequested?: boolean;
    onKeepEditing?: () => void;
  }) => (
    <section role="dialog" aria-label={title}>
      <button onClick={onClose}>Fechar modal</button>
      {children}
      {closeRequested && (
        <div role="alertdialog">
          <button onClick={onKeepEditing}>Continuar editando</button>
          <button onClick={onClose}>Descartar e fechar</button>
        </div>
      )}
    </section>
  ),
}));
vi.mock("../components/RegistrationDetail", () => ({
  RegistrationDetail: ({
    registrationId,
    onDirtyChange,
  }: {
    registrationId: string;
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <>
      <p>Ficha original {registrationId}</p>
      <button onClick={() => onDirtyChange?.(true)}>Editar dados</button>
    </>
  ),
}));
vi.mock("../components/RegistrationInvite", () => ({
  RegistrationInvite: ({
    registrationId,
    initialWhatsApp,
  }: {
    registrationId: string;
    initialWhatsApp?: boolean;
  }) => (
    <p>
      Convite {registrationId}
      {initialWhatsApp ? " pelo WhatsApp" : ""}
    </p>
  ),
}));

const edition = {
  id: "event",
  organizationId: "org",
  name: "3º Acampamento FAC",
  startsAt: "2027-02-05",
  endsAt: "2027-02-09",
  city: "Loanda",
  status: "PUBLISHED",
  type: { name: "FAC" },
  departmentsReady: true,
  teams: [
    {
      id: "team",
      eventId: "event",
      name: "SECRETARIA",
      capacity: 1,
      occupied: 1,
      available: 0,
    },
  ],
  campaigns: [
    {
      id: "campaign",
      kind: "VOLUNTEER",
      opensAt: "2026-10-01T00:00:00Z",
      closesAt: "2027-02-01T00:00:00Z",
      paused: false,
      capacity: null,
      allowWaitlist: true,
      _count: { registrations: 25 },
    },
  ],
} as EventEdition;
const candidate = {
  id: "registration",
  protocol: "INS-TESTE",
  status: "RECEIVED",
  origin: "PUBLIC_FORM",
  snapshot: { phone: "44999999999" },
  person: { name: "Maria Teste", phone: "44999999999", email: null },
  team: null,
  createdAt: "2026-10-10",
  history: [],
  campaign: {
    id: "campaign",
    kind: "VOLUNTEER",
    opensAt: "2026-10-01T00:00:00Z",
    closesAt: "2027-02-01T00:00:00Z",
    paused: false,
    capacity: null,
    allowWaitlist: true,
    event: edition,
  },
  decisionSummary: { ready: true, notice: null },
} as Registration;
let events: EventEdition[], items: Registration[], total: number;
let camperTeams: Team[];
let mobileViewport = false;
let wideLandscapeViewport = false;
const mediaListeners = new Set<() => void>();

function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{location.search}</output>
      <button onClick={() => navigate(-1)}>Voltar no histórico</button>
    </>
  );
}
function show(
  url = "/organizacao/org/inscricoes?evento=event&campaign=campaign",
) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ReviewRegistrations />
      <Location />
    </MemoryRouter>,
  );
}
async function ready() {
  return screen.findByRole("combobox", { name: "Decisão de Maria Teste" });
}
function queries() {
  return mocks.api.mock.calls.filter(([path]) =>
    String(path).includes("/registrations?"),
  );
}

beforeEach(() => {
  mobileViewport = false;
  wideLandscapeViewport = false;
  mediaListeners.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((media: string) => ({
      get matches() {
        return media.includes("min-width: 1280px")
          ? wideLandscapeViewport
          : media.includes("max-width: 800px")
            ? mobileViewport
            : false;
      },
      media,
      addEventListener: (_: string, listener: () => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        mediaListeners.delete(listener),
    })),
  });
  events = structuredClone([edition]);
  items = structuredClone([candidate]);
  total = 1;
  mocks.role = "ORGANIZER";
  mocks.eventsEnabled = true;
  mocks.api.mockReset();
  mocks.api.mockImplementation(
    async (
      path: string,
      options?: { method?: string; body?: Record<string, unknown> },
    ) => {
      if (path.endsWith("/events")) return structuredClone(events);
      if (path.includes("/campaigns/") && path.endsWith("/teams")) {
        const id = path.split("/campaigns/")[1].split("/")[0];
        const event = events.find((item) =>
          item.campaigns.some((campaign) => campaign.id === id),
        );
        const campaign = event?.campaigns.find(
          (campaign) => campaign.id === id,
        );
        return structuredClone(
          campaign?.kind === "CAMPER" ? camperTeams : (event?.teams ?? []),
        );
      }
      if (path.includes("/registrations?"))
        return { items: structuredClone(items), total, page: 1, pageSize: 20 };
      if (path.endsWith("/status")) {
        items[0].status = options!.body!.status as Registration["status"];
        return items[0];
      }
      if (path.endsWith("/team")) {
        const optionsForCampaign =
          items[0].campaign.kind === "CAMPER" ? camperTeams : events[0].teams;
        items[0].team = options!.body!.teamId
          ? (optionsForCampaign.find(
              (team) => team.id === options!.body!.teamId,
            ) ?? null)
          : null;
        return items[0];
      }
      if (path.endsWith("/registrations/elsewhere"))
        return {
          ...candidate,
          id: "elsewhere",
          campaign: { ...candidate.campaign, event: edition },
        };
      if (path.endsWith("/registrations/registration"))
        return structuredClone(items[0]);
      throw new Error(`Unexpected request ${path}`);
    },
  );
});
afterEach(cleanup);

describe("Gestão de inscrições por evento", () => {
  it("alterna Lista e Cards em tela grande sem perder filtros, página ou recarregar inscrições", async () => {
    wideLandscapeViewport = true;
    total = 45;
    show(
      "/organizacao/org/inscricoes?evento=event&campaign=campaign&q=Maria&sort=NAME_DESC&origin=IMPORT&page=2",
    );
    await ready();
    const modes = screen.getByRole("group", { name: "Modo de exibição" });
    expect(
      within(modes).getByRole("button", { name: "Lista" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("table")).toBeVisible();
    const before = queries().length;
    fireEvent.click(within(modes).getByRole("button", { name: "Cards" }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "exibicao=cards",
      ),
    );
    const cards = screen.getByRole("list", { name: "Inscrições em cards" });
    expect(within(cards).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      within(modes).getByRole("button", { name: "Cards" }),
    ).toHaveAttribute("aria-pressed", "true");
    const params = new URLSearchParams(
      screen.getByTestId("location").textContent ?? "",
    );
    expect(params.get("q")).toBe("Maria");
    expect(params.get("sort")).toBe("NAME_DESC");
    expect(params.get("origin")).toBe("IMPORT");
    expect(params.get("page")).toBe("2");
    expect(queries()).toHaveLength(before);
    fireEvent.click(within(modes).getByRole("button", { name: "Lista" }));
    expect(screen.getByRole("table")).toBeVisible();
    expect(
      screen.queryByRole("list", { name: "Inscrições em cards" }),
    ).not.toBeInTheDocument();
    expect(
      within(modes).getByRole("button", { name: "Lista" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(queries()).toHaveLength(before);
  });
  it("restaura Cards pela URL e preserva a escolha ao reduzir e ampliar a tela", async () => {
    wideLandscapeViewport = true;
    show(
      "/organizacao/org/inscricoes?evento=event&campaign=campaign&exibicao=cards",
    );
    await ready();
    expect(
      screen.getByRole("list", { name: "Inscrições em cards" }),
    ).toBeVisible();
    act(() => {
      wideLandscapeViewport = false;
      for (const listener of mediaListeners) listener();
    });
    expect(
      screen.queryByRole("group", { name: "Modo de exibição" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("exibicao=cards");
    act(() => {
      wideLandscapeViewport = true;
      for (const listener of mediaListeners) listener();
    });
    expect(
      screen.getByRole("list", { name: "Inscrições em cards" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Cards" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(window.matchMedia).toHaveBeenCalledWith(
      expect.stringContaining("orientation: landscape"),
    );
  });
  it("mantém cards compactos no celular sem mostrar o seletor de computador", async () => {
    mobileViewport = true;
    show(
      "/organizacao/org/inscricoes?evento=event&campaign=campaign&exibicao=lista",
    );
    await ready();
    expect(
      screen.queryByRole("group", { name: "Modo de exibição" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Inscrições em cards" }),
    ).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("exibicao=lista");
  });
  it("mantém lista em computador menor ou vertical mesmo com Cards na URL", async () => {
    show(
      "/organizacao/org/inscricoes?evento=event&campaign=campaign&exibicao=cards",
    );
    await ready();
    expect(
      screen.queryByRole("group", { name: "Modo de exibição" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeVisible();
    expect(
      screen.queryByRole("list", { name: "Inscrições em cards" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("exibicao=cards");
  });
  it("usa Lista quando a URL informa um modo desconhecido", async () => {
    wideLandscapeViewport = true;
    show(
      "/organizacao/org/inscricoes?evento=event&campaign=campaign&exibicao=desconhecido",
    );
    await ready();
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("table")).toBeVisible();
  });
  it("preserva a escolha de Cards ao voltar aos eventos e reabrir um evento", async () => {
    wideLandscapeViewport = true;
    show(
      "/organizacao/org/inscricoes?evento=event&campaign=campaign&exibicao=cards",
    );
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Voltar aos eventos/ }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).not.toHaveTextContent("evento="),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("exibicao=cards");
    fireEvent.click(
      await screen.findByRole("button", { name: /3º Acampamento FAC/ }),
    );
    await ready();
    expect(screen.getByTestId("location")).toHaveTextContent("exibicao=cards");
    expect(
      screen.getByRole("list", { name: "Inscrições em cards" }),
    ).toBeVisible();
  });
  it.each([false, true])(
    "mantém a escolha de exibição disponível sem resultados ou durante o carregamento (%s)",
    async (loading) => {
      wideLandscapeViewport = true;
      items = [];
      total = 0;
      if (loading) {
        const normal = mocks.api.getMockImplementation()!;
        mocks.api.mockImplementation((path: string, options) =>
          path.includes("/registrations?")
            ? new Promise(() => {})
            : normal(path, options),
        );
      }
      show();
      const group = await screen.findByRole("group", {
        name: "Modo de exibição",
      });
      fireEvent.click(within(group).getByRole("button", { name: "Cards" }));
      expect(
        within(group).getByRole("button", { name: "Cards" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("location")).toHaveTextContent(
        "exibicao=cards",
      );
      if (!loading)
        expect(
          await screen.findByText("Nenhuma inscrição neste filtro"),
        ).toBeVisible();
    },
  );
  it("mostra a orientação do WhatsApp antes do aceite somente ao clicar, sem carregar aviso", async () => {
    show();
    await ready();
    expect(
      screen.queryByText("Disponível após o aceite"),
    ).not.toBeInTheDocument();
    const button = screen.getByRole("button", {
      name: "Enviar convite por WhatsApp para Maria Teste",
    });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    mocks.api.mockClear();
    fireEvent.click(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Disponível após o aceite",
    );
    expect(mocks.api).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it.each([
    "APPROVED",
    "CONFIRMED",
    "WAITLIST",
    "REJECTED",
    "CANCELLED",
  ] as const)(
    "oferece Recebida e Em análise para corrigir uma decisão %s",
    async (status) => {
      items[0].status = status;
      show();
      const decision = await ready();
      expect(
        within(decision).getByRole("option", { name: "Recebida" }),
      ).not.toBeDisabled();
      expect(
        within(decision).getByRole("option", { name: "Em análise" }),
      ).not.toBeDisabled();
    },
  );
  it("volta uma aceita para Recebida com motivo padrão e mantém só indicação de departamento", async () => {
    items[0].status = "APPROVED";
    items[0].team = events[0].teams[0];
    items[0].decisionSummary = {
      ready: true,
      notice: {
        id: "notice",
        kind: "ACEITE",
        active: true,
        expired: false,
        emailStatus: "PENDENTE",
        emailSentAt: null,
        whatsappSentAt: null,
        confirmedAt: null,
        expiresAt: "2027-02-01",
      },
    };
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(
      async (
        path: string,
        options?: { method?: string; body?: Record<string, unknown> },
      ) => {
        if (path.endsWith("/status")) {
          items[0].status = options!.body!.status as Registration["status"];
          items[0].decisionSummary!.notice!.active = false;
          events[0].teams[0].occupied = 0;
          events[0].teams[0].available = 1;
          return structuredClone(items[0]);
        }
        return original(path, options);
      },
    );
    show();
    fireEvent.change(await ready(), { target: { value: "RECEIVED" } });
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/organizations/org/registrations/registration/status",
        {
          method: "PATCH",
          body: {
            status: "RECEIVED",
            reason:
              "Candidatura devolvida a Recebida pela organização para correção da decisão.",
          },
        },
      ),
    );
    expect(await screen.findByText("Indicado — sem reserva")).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Decisão de Maria Teste" }),
    ).toHaveValue("RECEIVED");
    expect(
      screen.getByRole("combobox", { name: "Departamento de Maria Teste" }),
    ).toHaveValue("team");
    expect(
      screen.getByRole("button", {
        name: "Enviar convite por WhatsApp para Maria Teste",
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByRole("button", {
        name: "Convite não enviado: Maria Teste",
      }),
    ).not.toBeInTheDocument();
  });
  it("preserva a decisão aceita quando a API recusa a reabertura", async () => {
    items[0].status = "APPROVED";
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(
      (
        path: string,
        options?: { method?: string; body?: Record<string, unknown> },
      ) =>
        path.endsWith("/status")
          ? Promise.reject(new Error("Este evento não aceita reabertura."))
          : original(path, options),
    );
    show();
    fireEvent.change(await ready(), { target: { value: "REVIEW" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este evento não aceita reabertura.",
    );
    expect(
      screen.getByRole("combobox", { name: "Decisão de Maria Teste" }),
    ).toHaveValue("APPROVED");
  });
  it("oferece retorno de Em análise para Recebida e bloqueia reabertura de evento encerrado", async () => {
    items[0].status = "REVIEW";
    show();
    expect(
      within(await ready()).getByRole("option", { name: "Recebida" }),
    ).not.toBeDisabled();
    cleanup();
    items[0].status = "APPROVED";
    events[0].status = "COMPLETED";
    show();
    const decision = await ready();
    expect(
      within(decision).getByRole("option", { name: "Recebida" }),
    ).toBeDisabled();
    expect(
      within(decision).getByRole("option", { name: "Em análise" }),
    ).toBeDisabled();
  });
  it("mantém busca e ações no celular e concentra filtros em uma única janela", async () => {
    mobileViewport = true;
    show(
      "/organizacao/org/inscricoes?evento=event&campaign=campaign&q=Maria&origin=IMPORT&status=REVIEW",
    );
    await ready();
    expect(screen.getByRole("searchbox")).toHaveValue("Maria");
    expect(
      screen.queryByRole("combobox", { name: "Ordenar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Filtros e ordenação, 2 filtros ativos/,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Abrir ficha de Maria Teste" }),
    ).toHaveTextContent("Ver ficha");
    expect(
      screen.getByRole("button", {
        name: "Enviar convite por WhatsApp para Maria Teste",
      }),
    ).toHaveTextContent("WhatsApp");
    expect(
      screen.queryByText("Disponível após o aceite"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Filtros e ordenação/ }),
    );
    expect(
      screen.getByRole("dialog", { name: "Filtros e ordenação" }),
    ).toBeVisible();
    expect(screen.getAllByRole("combobox", { name: "Ordenar" })).toHaveLength(
      1,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar" }), {
      target: { value: "NAME_DESC" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "sort=NAME_DESC",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).not.toHaveTextContent("origin=");
      expect(screen.getByTestId("location")).not.toHaveTextContent("status=");
    });
    expect(screen.getByTestId("location")).toHaveTextContent("q=Maria");
    fireEvent.click(screen.getByRole("button", { name: "Ver 1 inscrição" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("Maria");
    expect(
      screen.getByRole("button", { name: "Filtros e ordenação" }),
    ).toBeVisible();
  });
  it("preserva ordenação e remove a janela ao passar de celular para desktop", async () => {
    mobileViewport = true;
    show();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: /Filtros e ordenação/ }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar" }), {
      target: { value: "ACCEPTED_FIRST" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "sort=ACCEPTED_FIRST",
      ),
    );
    act(() => {
      mobileViewport = false;
      for (const listener of mediaListeners) listener();
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByRole("combobox", { name: "Ordenar" })).toHaveLength(
      1,
    );
    expect(screen.getByRole("combobox", { name: "Ordenar" })).toHaveValue(
      "ACCEPTED_FIRST",
    );
    expect(screen.getByRole("button", { name: "Filtros" })).toBeVisible();
  });
  it("protege alterações não salvas ao voltar no histórico e permite continuar editando", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/organizacao/org/inscricoes?evento=event&campaign=campaign",
          "/organizacao/org/inscricoes?evento=event&campaign=campaign&inscricao=registration",
        ]}
        initialIndex={1}
      >
        <ReviewRegistrations />
        <Location />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Ficha original registration"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Editar dados" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Voltar no histórico" }),
    );
    expect(await screen.findByRole("alertdialog")).toBeVisible();
    expect(screen.getByText("Ficha original registration")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "inscricao=registration",
      ),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("permite descartar alterações ao voltar no histórico", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/organizacao/org/inscricoes?evento=event&campaign=campaign",
          "/organizacao/org/inscricoes?evento=event&campaign=campaign&inscricao=registration",
        ]}
        initialIndex={1}
      >
        <ReviewRegistrations />
        <Location />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Ficha original registration"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Editar dados" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Voltar no histórico" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Descartar e fechar" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("location")).not.toHaveTextContent("inscricao=");
  });
  it("troca as abas com o teclado preservando a pesquisa", async () => {
    show("/organizacao/org/inscricoes?evento=event&campaign=campaign&q=Maria");
    await ready();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Inscrições" }), {
      key: "ArrowRight",
    });
    expect(
      screen.getByRole("tab", { name: "Departamentos e vagas" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("location")).toHaveTextContent("q=Maria");
    fireEvent.keyDown(
      screen.getByRole("tab", { name: "Departamentos e vagas" }),
      { key: "Home" },
    );
    expect(screen.getByRole("tab", { name: "Inscrições" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
  it("começa pelos cards sem carregar inscrições de todos os eventos", async () => {
    show("/organizacao/org/inscricoes");
    fireEvent.click(
      await screen.findByRole("button", { name: /3º Acampamento FAC/ }),
    );
    await ready();
    expect(screen.getByRole("tab", { name: "Inscrições" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const params = new URLSearchParams(String(queries()[0][0]).split("?")[1]);
    expect(params.get("eventId")).toBe("event");
    expect(params.get("sort")).toBe("NAME_ASC");
    expect(params.get("includeClosed")).toBe("false");
    fireEvent.click(screen.getByRole("tab", { name: "Departamentos e vagas" }));
    expect(
      await screen.findByRole("button", { name: /Criar departamento/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Decisão de Maria Teste" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos eventos" }));
    expect(
      await screen.findByRole("button", { name: /3º Acampamento FAC/ }),
    ).toBeVisible();
  });
  it("preserva link de ficha fora da página atual e descobre o evento quando omitido", async () => {
    items = [];
    total = 0;
    show("/organizacao/org/inscricoes?inscricao=elsewhere");
    expect(await screen.findByText("Ficha original elsewhere")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("evento=event"),
    );
    expect(
      screen.getByRole("dialog", { name: "Ficha do participante" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Fechar modal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).not.toHaveTextContent("inscricao=");
  });
  it("aplica pesquisa e ordenação no endpoint e preserva filtros na URL", async () => {
    show(
      "/organizacao/org/inscricoes?evento=event&campaign=campaign&origin=IMPORT&page=2",
    );
    await ready();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "MáRia" },
    });
    await waitFor(() =>
      expect(
        queries().some(
          ([path]) =>
            new URLSearchParams(String(path).split("?")[1]).get("q") ===
            "MáRia",
        ),
      ).toBe(true),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar" }), {
      target: { value: "ACCEPTED_FIRST" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "sort=ACCEPTED_FIRST",
      ),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("origin=IMPORT");
    expect(screen.getByTestId("location")).not.toHaveTextContent("page=2");
  });
  it("oculta recusadas e canceladas por padrão e o olho alterna o filtro", async () => {
    show();
    await ready();
    const toggle = screen.getByRole("button", {
      name: /Recusadas e canceladas ocultas/,
    });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(
        queries().some(([path]) => String(path).includes("includeClosed=true")),
      ).toBe(true),
    );
    expect(
      screen.getByRole("button", { name: /Recusadas e canceladas visíveis/ }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    expect(
      screen.getByRole("combobox", { name: "Complementação" }),
    ).toBeVisible();
  });
  it.each([
    ["Participação no acampamento", "presence", "SEM_RESPOSTA"],
    ["Participação no acampamento", "presence", "VOU"],
    ["Participação no acampamento", "presence", "NAO_IREI"],
    ["Espiritualidade", "spirituality", "SEM_RESPOSTA"],
    ["Espiritualidade", "spirituality", "SIM"],
    ["Espiritualidade", "spirituality", "NAO"],
  ])(
    "filtra %s por %s=%s e volta à primeira página",
    async (label, key, value) => {
      total = 25;
      show(
        "/organizacao/org/inscricoes?evento=event&campaign=campaign&page=2&q=Maria",
      );
      await ready();
      fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
      const select = screen.getByRole("combobox", { name: label });
      expect(
        within(select)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["Todos", "Não respondeu", "Sim", "Não"]);
      fireEvent.change(select, { target: { value } });
      await waitFor(() =>
        expect(
          queries().some(([path]) => {
            const params = new URL(String(path), "https://example.test")
              .searchParams;
            return (
              params.get(key) === value &&
              params.get("page") === "1" &&
              params.get("q") === "Maria"
            );
          }),
        ).toBe(true),
      );
      expect(screen.getByTestId("location")).toHaveTextContent(
        `${key}=${value}`,
      );
      expect(screen.getByTestId("location")).not.toHaveTextContent("page=2");
    },
  );
  it("retoma e combina filtros das duas perguntas e permite limpá-los no celular", async () => {
    mobileViewport = true;
    show(
      "/organizacao/org/inscricoes?evento=event&campaign=campaign&presence=VOU&spirituality=SEM_RESPOSTA&q=Maria",
    );
    await ready();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Filtros e ordenação, 2 filtros ativos/,
      }),
    );
    const camp = screen.getByRole("combobox", {
      name: "Participação no acampamento",
    });
    const meeting = screen.getByRole("combobox", { name: "Espiritualidade" });
    expect(camp).toHaveValue("VOU");
    expect(meeting).toHaveValue("SEM_RESPOSTA");
    fireEvent.change(meeting, { target: { value: "NAO" } });
    await waitFor(() =>
      expect(
        queries().some(([path]) =>
          String(path).includes("presence=VOU&spirituality=NAO"),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).not.toHaveTextContent("presence=");
      expect(screen.getByTestId("location")).not.toHaveTextContent(
        "spirituality=",
      );
    });
    expect(screen.getByTestId("location")).toHaveTextContent("q=Maria");
    expect(camp).toHaveValue("");
    expect(meeting).toHaveValue("");
  });
  it.each([false, true])(
    "filtra equipe/departamento preservando contexto e primeira página (celular: %s)",
    async (mobile) => {
      mobileViewport = mobile;
      total = 45;
      events.push({
        ...structuredClone(edition),
        id: "other-event",
        teams: [
          { ...edition.teams[0], id: "other-team", name: "OUTRO EVENTO" },
        ],
      });
      show(
        "/organizacao/org/inscricoes?evento=event&campaign=campaign&page=2&q=Maria&sort=NAME_DESC",
      );
      await ready();
      fireEvent.click(
        screen.getByRole("button", {
          name: mobile ? /Filtros e ordenação/ : "Filtros",
        }),
      );
      const select = screen.getByRole("combobox", {
        name: "Equipe/departamento",
      });
      expect(
        within(select)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["Todos", "Sem departamento", "SECRETARIA"]);
      for (const value of ["team", "NONE", ""]) {
        fireEvent.change(select, { target: { value } });
        await waitFor(() => {
          const params = new URL(
            String(queries().at(-1)![0]),
            "https://example.test",
          ).searchParams;
          expect(params.get("teamId")).toBe(value || null);
          expect(params.get("page")).toBe("1");
          expect(params.get("q")).toBe("Maria");
          expect(params.get("sort")).toBe("NAME_DESC");
          const location = new URLSearchParams(
            screen.getByTestId("location").textContent ?? "",
          );
          expect(location.get("team")).toBe(value || null);
          expect(location.has("page")).toBe(false);
        });
      }
    },
  );
  it("retoma equipe pela URL, combina com respostas e limpa no celular", async () => {
    mobileViewport = true;
    show(
      "/organizacao/org/inscricoes?evento=event&campaign=campaign&team=NONE&presence=VOU&spirituality=SIM&q=Maria",
    );
    await ready();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Filtros e ordenação, 3 filtros ativos/,
      }),
    );
    const team = screen.getByRole("combobox", { name: "Equipe/departamento" });
    expect(team).toHaveValue("NONE");
    expect(
      screen.getByRole("combobox", { name: "Participação no acampamento" }),
    ).toHaveValue("VOU");
    expect(
      screen.getByRole("combobox", { name: "Espiritualidade" }),
    ).toHaveValue("SIM");
    fireEvent.change(team, { target: { value: "team" } });
    await waitFor(() => {
      const params = new URL(
        String(queries().at(-1)![0]),
        "https://example.test",
      ).searchParams;
      expect(params.get("teamId")).toBe("team");
      expect(params.get("presence")).toBe("VOU");
      expect(params.get("spirituality")).toBe("SIM");
    });
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => {
      const params = new URLSearchParams(
        screen.getByTestId("location").textContent ?? "",
      );
      expect(params.has("team")).toBe(false);
      expect(params.has("presence")).toBe(false);
      expect(params.has("spirituality")).toBe(false);
      expect(params.get("q")).toBe("Maria");
    });
    expect(team).toHaveValue("");
  });
  it("aceita diretamente e registra motivo padrão sem pedir justificativa", async () => {
    show();
    const select = await ready();
    fireEvent.change(select, { target: { value: "APPROVED" } });
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/organizations/org/registrations/registration/status",
        {
          method: "PATCH",
          body: {
            status: "APPROVED",
            reason:
              "Candidatura aceita pela organização na lista de inscrições.",
          },
        },
      ),
    );
    expect(await screen.findByText("Decisão salva.")).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: /Motivo/ }),
    ).not.toBeInTheDocument();
    expect(
      mocks.api.mock.calls.some(([path]) => String(path).endsWith("/email")),
    ).toBe(false);
  });
  it("permite indicação antecipada mesmo em departamento lotado sem reservar vaga", async () => {
    show();
    await ready();
    const select = screen.getByRole("combobox", {
      name: "Departamento de Maria Teste",
    });
    expect(select).not.toBeDisabled();
    expect(
      screen.getByRole("option", { name: "SECRETARIA · 0 vagas" }),
    ).not.toBeDisabled();
    fireEvent.change(select, { target: { value: "team" } });
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/organizations/org/registrations/registration/team",
        { method: "PUT", body: { teamId: "team" } },
      ),
    );
    expect(await screen.findByText("Indicado — sem reserva")).toBeVisible();
  });
  it("limpa departamento em pendentes e bloqueia remoção em participação confirmada", async () => {
    items[0].team = events[0].teams[0];
    show();
    await ready();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Departamento de Maria Teste" }),
      { target: { value: "" } },
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/organizations/org/registrations/registration/team",
        { method: "PUT", body: { teamId: null } },
      ),
    );
    cleanup();
    items[0].status = "CONFIRMED";
    items[0].team = events[0].teams[0];
    show();
    await ready();
    expect(
      screen.getByRole("option", { name: "Sem departamento" }),
    ).toBeDisabled();
  });
  it("mantém a decisão anterior quando a API recusa a mudança", async () => {
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation(
      (
        path: string,
        options?: { method?: string; body?: Record<string, unknown> },
      ) =>
        path.endsWith("/status")
          ? Promise.reject(
              new Error("Não há vagas disponíveis neste departamento."),
            )
          : original(path, options),
    );
    show();
    fireEvent.change(await ready(), { target: { value: "APPROVED" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não há vagas disponíveis neste departamento.",
    );
    expect(
      screen.getByRole("combobox", { name: "Decisão de Maria Teste" }),
    ).toHaveValue("RECEIVED");
  });
  it("mostra cores textuais do convite e carrega a mensagem somente ao abrir", async () => {
    items[0].origin = "IMPORT";
    items[0].importData = { pending: ["Adicionar foto do participante."] };
    items[0].status = "APPROVED";
    items[0].decisionSummary = {
      ready: true,
      notice: {
        id: "notice",
        kind: "ACEITE",
        emailStatus: "PENDENTE",
        emailSentAt: null,
        whatsappSentAt: null,
        confirmedAt: null,
        expiresAt: "2027-02-01",
        active: true,
        expired: false,
      },
    };
    show();
    await ready();
    expect(
      screen.getByRole("button", { name: "Convite não enviado: Maria Teste" }),
    ).toHaveClass("pending");
    fireEvent.click(
      screen.getByRole("button", { name: "Convite não enviado: Maria Teste" }),
    );
    expect(await screen.findByText("Convite registration")).toBeVisible();
    expect(items[0].decisionSummary.notice!.whatsappSentAt).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fechar modal" }));
    items[0].decisionSummary.notice!.whatsappSentAt = "2026-11-11";
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar inscrições" }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Aguardando resposta: Maria Teste",
      }),
    ).toHaveClass("waiting");
    items[0].decisionSummary.notice!.confirmedAt = "2026-11-12";
    fireEvent(window, new Event("focus"));
    expect(
      await screen.findByRole("button", {
        name: "Vou participar: Maria Teste",
      }),
    ).toHaveClass("confirmed");
    items[0].decisionSummary.notice!.confirmedAt = null;
    items[0].decisionSummary.notice!.declinedAt = "2026-11-12";
    fireEvent(window, new Event("focus"));
    expect(
      await screen.findByRole("button", {
        name: "Não irei — revisar vaga: Maria Teste",
      }),
    ).toHaveClass("declined");
    expect(items[0].status).toBe("APPROVED");
    expect(
      mocks.api.mock.calls.some(([path]) =>
        String(path).includes("decision-notice"),
      ),
    ).toBe(false);
  });
  it("explica convite indisponível e permite abrir detalhes sem buscar avisos por linha", async () => {
    items[0].status = "APPROVED";
    items[0].decisionSummary = { ready: false, notice: null };
    show();
    await ready();
    const unavailable = screen.getByRole("button", {
      name: "Convite indisponível: Maria Teste",
    });
    expect(unavailable).not.toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Enviar convite por WhatsApp para Maria Teste",
      }),
    ).toBeDisabled();
    fireEvent.click(unavailable);
    expect(await screen.findByText("Convite registration")).toBeVisible();
  });
  it("permite confirmar importadas pendentes sem ampliar permissões de gestão", async () => {
    items[0].origin = "IMPORT";
    items[0].status = "APPROVED";
    items[0].importData = { pending: ["Aceitar os termos atuais."] };
    show();
    await ready();
    expect(
      screen.getByRole("option", { name: "Confirmada" }),
    ).not.toBeDisabled();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Decisão de Maria Teste" }),
      { target: { value: "CONFIRMED" } },
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/organizations/org/registrations/registration/status",
        expect.objectContaining({
          method: "PATCH",
          body: expect.objectContaining({ status: "CONFIRMED" }),
        }),
      ),
    );
    expect(items[0].importData.pending).toEqual(["Aceitar os termos atuais."]);
    expect(await screen.findByText("Vaga confirmada.")).toBeVisible();
    cleanup();
    mocks.role = "SECRETARY";
    mocks.eventsEnabled = false;
    show();
    await ready();
    expect(
      screen.getByRole("combobox", { name: "Decisão de Maria Teste" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Departamento de Maria Teste" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Abrir ficha de Maria Teste" }),
    ).not.toBeDisabled();
  });
  it("mostra pendências pelo ícone antes do nome, inclusive de vaga confirmada, sem empilhar a ficha", async () => {
    mobileViewport = true;
    items[0].origin = "IMPORT";
    items[0].status = "CONFIRMED";
    items[0].importData = { pending: ["Texto histórico desatualizado"] };
    items[0].pendingInformation = [
      "Adicionar foto do participante.",
      "Autorização do responsável pendente: obrigatória antes do evento.",
    ];
    show();
    await ready();
    expect(
      screen.queryByText("Complementação pendente"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Conferir complementação"),
    ).not.toBeInTheDocument();
    const icon = screen.getByRole("button", {
      name: "Ver pendências de Maria Teste",
    });
    icon.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", {
      name: "Informações pendentes",
    });
    expect(dialog).toHaveTextContent("A vaga está confirmada");
    expect(
      within(dialog).getByText("Adicionar foto do participante."),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Autorização do responsável pendente:/),
    ).toBeVisible();
    expect(
      screen.queryByText("Texto histórico desatualizado"),
    ).not.toBeInTheDocument();
    items[0].pendingInformation = ["Informações atualizadas após revisão."];
    fireEvent(window, new Event("focus"));
    expect(
      await within(dialog).findByText("Informações atualizadas após revisão."),
    ).toBeVisible();
    expect(
      within(dialog).queryByText("Adicionar foto do participante."),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Abrir ficha" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Informações pendentes" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("Ficha original registration")).toBeVisible();
  });
  it("não mostra alerta quando a API informa que as pendências foram resolvidas", async () => {
    items[0].origin = "IMPORT";
    items[0].importData = { pending: ["Pendência histórica já resolvida"] };
    items[0].pendingInformation = [];
    show();
    await ready();
    expect(
      screen.queryByRole("button", { name: "Ver pendências de Maria Teste" }),
    ).not.toBeInTheDocument();
  });
  it("mantém a renovação explícita pelo indicador do convite expirado", async () => {
    items[0].origin = "IMPORT";
    items[0].status = "APPROVED";
    items[0].importData = { pending: ["Informar contato de emergência."] };
    items[0].decisionSummary = {
      ready: true,
      notice: {
        id: "notice",
        kind: "ACEITE",
        emailStatus: "PENDENTE",
        emailSentAt: null,
        whatsappSentAt: null,
        confirmedAt: null,
        expiresAt: "2020-01-01",
        active: true,
        expired: true,
      },
    };
    show();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Link expirado: Maria Teste" }),
    );
    expect(await screen.findByText("Convite registration")).toBeVisible();
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
  });
});

function configureCampers() {
  const campaign = {
    ...events[0].campaigns[0],
    id: "camper-campaign",
    kind: "CAMPER" as const,
    _count: { registrations: 7 },
  };
  events[0].campaigns.push(campaign);
  camperTeams = [
    {
      id: "camper-team",
      campaignId: campaign.id,
      kind: "CAMPER",
      eventId: "event",
      name: "EQUIPE AZUL",
      capacity: 12,
      occupied: 3,
      available: 9,
    },
  ];
  return campaign;
}

describe("Campanhas e equipes independentes", () => {
  it("mostra dois cards por evento com contagens próprias e mantém campanha na listagem", async () => {
    const campaign = configureCampers();
    items[0].campaign = { ...items[0].campaign, ...campaign };
    show("/organizacao/org/inscricoes");
    expect(
      await screen.findByRole("button", {
        name: /Servos — 3º Acampamento FAC — 25 inscrições/,
      }),
    ).toBeVisible();
    const campers = screen.getByRole("button", {
      name: /Campistas — 3º Acampamento FAC — 7 inscrições/,
    });
    expect(queries()).toHaveLength(0);
    fireEvent.click(campers);
    await ready();
    const params = new URLSearchParams(
      String(queries().at(-1)![0]).split("?")[1],
    );
    expect(params.get("eventId")).toBe("event");
    expect(params.get("campaignId")).toBe("camper-campaign");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "campaign=camper-campaign",
    );
    const team = await screen.findByRole("combobox", {
      name: "Equipe de Maria Teste",
    });
    expect(
      within(team).getByRole("option", { name: /EQUIPE AZUL/ }),
    ).toBeVisible();
    expect(
      within(team).queryByRole("option", { name: /SECRETARIA/ }),
    ).not.toBeInTheDocument();
  });

  it("link antigo somente com evento pede campanha e não consulta inscrições misturadas", async () => {
    configureCampers();
    show("/organizacao/org/inscricoes?evento=event");
    expect(
      await screen.findByRole("button", { name: /Campistas —/ }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /Servos —/ })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(queries()).toHaveLength(0);
  });

  it("permite preparar campanha ausente sem inventar inscrições ou bloquear as existentes", async () => {
    events[0].campaigns[0].paused = true;
    events[0].campaigns[0].forms = [];
    show("/organizacao/org/inscricoes");
    expect(
      await screen.findByRole("link", { name: /Preparar campistas/ }),
    ).toHaveAttribute("href", "/organizacao/org/eventos/event/ficha-campistas");
    fireEvent.click(screen.getByRole("button", { name: /Servos —/ }));
    await ready();
    expect(
      screen.getByRole("combobox", { name: "Departamento de Maria Teste" }),
    ).toBeVisible();
  });

  it("descobre a campanha verdadeira da ficha mesmo com evento e campanha incorretos na URL", async () => {
    const campaign = configureCampers();
    items = [];
    total = 0;
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation((path: string, options) =>
      path.endsWith("/registrations/elsewhere")
        ? Promise.resolve({
            ...candidate,
            id: "elsewhere",
            campaign: { ...candidate.campaign, ...campaign, event: events[0] },
          })
        : original(path, options),
    );
    show(
      "/organizacao/org/inscricoes?evento=evento-errado&campaign=campaign&team=team&inscricao=elsewhere",
    );
    expect(await screen.findByText("Ficha original elsewhere")).toBeVisible();
    await waitFor(() => {
      const location = new URLSearchParams(
        screen.getByTestId("location").textContent ?? "",
      );
      expect(location.get("evento")).toBe("event");
      expect(location.get("campaign")).toBe("camper-campaign");
      expect(location.has("team")).toBe(false);
    });
    expect(
      queries().every(
        ([path]) =>
          new URLSearchParams(String(path).split("?")[1]).get("campaignId") ===
          "camper-campaign",
      ),
    ).toBe(true);
  });

  it("mantém grupos de campistas separados no filtro e não oferece espiritualidade ou campanha Todas", async () => {
    const campaign = configureCampers();
    items[0].campaign = { ...items[0].campaign, ...campaign };
    show(
      "/organizacao/org/inscricoes?evento=event&campaign=camper-campaign&spirituality=SIM",
    );
    await ready();
    expect(
      await screen.findByRole("combobox", { name: "Equipe" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Campanha" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Espiritualidade" }),
    ).not.toBeInTheDocument();
    const teamFilter = screen.getByRole("combobox", {
      name: "Equipe",
    });
    expect(
      within(teamFilter)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Todos", "Sem equipe", "EQUIPE AZUL"]);
    await waitFor(() =>
      expect(screen.getByTestId("location")).not.toHaveTextContent(
        "spirituality=",
      ),
    );
    expect(
      queries().every(
        ([path]) =>
          !new URLSearchParams(String(path).split("?")[1]).has("spirituality"),
      ),
    ).toBe(true);
  });

  it("confirma campista sem equipe e permite remover a equipe após confirmar", async () => {
    const campaign = configureCampers();
    items[0].campaign = { ...items[0].campaign, ...campaign };
    items[0].status = "APPROVED";
    show("/organizacao/org/inscricoes?evento=event&campaign=camper-campaign");
    const decision = await ready();
    fireEvent.change(decision, { target: { value: "CONFIRMED" } });
    await waitFor(() => expect(decision).toHaveValue("CONFIRMED"));
    const team = screen.getByRole("combobox", {
      name: "Equipe de Maria Teste",
    });
    expect(
      within(team).getByRole("option", { name: "Sem equipe" }),
    ).not.toBeDisabled();
    fireEvent.change(team, { target: { value: "camper-team" } });
    await waitFor(() => expect(team).toHaveValue("camper-team"));
    fireEvent.change(team, { target: { value: "" } });
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/organizations/org/registrations/registration/team",
        { method: "PUT", body: { teamId: null } },
      ),
    );
  });

  it("descarta resposta tardia de departamentos ao trocar para campistas", async () => {
    const campaign = configureCampers();
    const original = mocks.api.getMockImplementation()!;
    let resolvePrevious!: (value: Team[]) => void;
    mocks.api.mockImplementation((path: string, options) =>
      path === "/organizations/org/campaigns/campaign/teams"
        ? new Promise<Team[]>((resolve) => {
            resolvePrevious = resolve;
          })
        : original(path, options),
    );
    show();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos eventos" }));
    items[0].campaign = { ...items[0].campaign, ...campaign };
    fireEvent.click(await screen.findByRole("button", { name: /Campistas —/ }));
    await ready();
    const team = screen.getByRole("combobox", {
      name: "Equipe de Maria Teste",
    });
    await waitFor(() =>
      expect(
        within(team).getByRole("option", { name: /EQUIPE AZUL/ }),
      ).toBeVisible(),
    );
    await act(async () => resolvePrevious(events[0].teams));
    expect(
      within(team).queryByRole("option", { name: /SECRETARIA/ }),
    ).not.toBeInTheDocument();
  });
});

it("protege o nome de equipe não salvo antes de voltar aos cards", async () => {
  const campaign = configureCampers();
  items[0].campaign = { ...items[0].campaign, ...campaign };
  show(
    "/organizacao/org/inscricoes?evento=event&campaign=camper-campaign&aba=departamentos",
  );
  const name = await screen.findByRole("textbox", { name: /Nova equipe/ });
  fireEvent.change(name, { target: { value: "EQUIPE NOVA" } });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos eventos" }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith("Descartar alterações não salvas?"),
    );
    expect(name).toHaveValue("EQUIPE NOVA");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "campaign=camper-campaign",
    );
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos eventos" }));
    expect(
      await screen.findByRole("button", { name: /Campistas —/ }),
    ).toBeVisible();
  } finally {
    confirm.mockRestore();
  }
});

it("mantém o botão acionador e a listagem montados enquanto resolve o contexto da ficha", async () => {
  const original = mocks.api.getMockImplementation()!;
  let resolveDetail!: (value: Registration) => void;
  mocks.api.mockImplementation((path: string, options) =>
    path.endsWith("/registrations/registration")
      ? new Promise<Registration>((resolve) => {
          resolveDetail = resolve;
        })
      : original(path, options),
  );
  show();
  await ready();
  const trigger = screen.getByRole("button", {
    name: "Abrir ficha de Maria Teste",
  });
  fireEvent.click(trigger);
  expect(await screen.findByText("Ficha original registration")).toBeVisible();
  expect(trigger.isConnected).toBe(true);
  expect(screen.getByRole("table")).toBeVisible();
  await act(async () => resolveDetail(structuredClone(items[0])));
  expect(trigger.isConnected).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Fechar modal" }));
  expect(
    screen.getByRole("button", { name: "Abrir ficha de Maria Teste" }),
  ).toBe(trigger);
});
