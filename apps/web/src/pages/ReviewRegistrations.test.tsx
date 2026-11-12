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
import type { EventEdition, Registration } from "../lib/types";

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
let mobileViewport = false;
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
function show(url = "/organizacao/org/inscricoes?evento=event") {
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
  mediaListeners.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((media: string) => ({
      get matches() {
        return mobileViewport;
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
      if (path.includes("/registrations?"))
        return { items: structuredClone(items), total, page: 1, pageSize: 20 };
      if (path.endsWith("/status")) {
        items[0].status = options!.body!.status as Registration["status"];
        return items[0];
      }
      if (path.endsWith("/team")) {
        items[0].team = options!.body!.teamId ? events[0].teams[0] : null;
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
    expect(screen.getByRole("tooltip")).toHaveTextContent(
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
      screen.queryByRole("button", { name: "Enviar convite: Maria Teste" }),
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
      "/organizacao/org/inscricoes?evento=event&q=Maria&origin=IMPORT&status=REVIEW",
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
          "/organizacao/org/inscricoes?evento=event",
          "/organizacao/org/inscricoes?evento=event&inscricao=registration",
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
          "/organizacao/org/inscricoes?evento=event",
          "/organizacao/org/inscricoes?evento=event&inscricao=registration",
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
    show("/organizacao/org/inscricoes?evento=event&q=Maria");
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
    show("/organizacao/org/inscricoes?evento=event&origin=IMPORT&page=2");
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
      screen.getByRole("button", { name: "Enviar convite: Maria Teste" }),
    ).toHaveClass("pending");
    fireEvent.click(
      screen.getByRole("button", { name: "Enviar convite: Maria Teste" }),
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
        name: "Aguardando confirmação: Maria Teste",
      }),
    ).toHaveClass("waiting");
    items[0].decisionSummary.notice!.confirmedAt = "2026-11-12";
    fireEvent(window, new Event("focus"));
    expect(
      await screen.findByRole("button", {
        name: "Presença confirmada: Maria Teste",
      }),
    ).toHaveClass("confirmed");
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
