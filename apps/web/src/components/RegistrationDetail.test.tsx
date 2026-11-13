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
import { useEffect, useState } from "react";
import { RegistrationDetail } from "./RegistrationDetail";
import { Modal } from "./Modal";
import type { Registration } from "../lib/types";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  setData: vi.fn(),
  guardianLoads: vi.fn(),
  noticeLoads: vi.fn(),
  team: null as { id: string; name: string } | null,
  origin: "PUBLIC_FORM" as "PUBLIC_FORM" | "IMPORT",
  status: "RECEIVED",
  eventStatus: "PUBLISHED",
  pendingInformation: undefined as string[] | undefined,
  updatedAt: "2026-11-11T12:00:00Z",
  guardian: { ready: true, needsAuthorization: false, authorization: null },
  notice: null as Record<string, unknown> | null,
  snapshot: {} as Record<string, unknown>,
  role: "ORGANIZER",
  eventsEnabled: true,
  loading: false,
  spiritualityResponse: null as boolean | null,
  spiritualityStartsAt: "2026-11-14T17:00:00Z" as string | null,
  decisionSummary: undefined as Record<string, unknown> | undefined,
  corrections: [] as NonNullable<Registration["corrections"]>,
}));
vi.mock("../lib/api", () => ({
  api: mocks.api,
  ApiError: class extends Error {},
}));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({ eventsEnabled: mocks.eventsEnabled }),
}));
vi.mock("../pages/Organization", () => ({
  useOrganization: () => ({ membership: { role: mocks.role } }),
}));
vi.mock("./GuardianNotice", () => ({
  GuardianNotice: ({
    onStateChange,
  }: {
    onStateChange?: (state: unknown) => void;
  }) => {
    useEffect(() => {
      mocks.guardianLoads();
    }, []);
    useEffect(() => onStateChange?.(mocks.guardian), [onStateChange]);
    return <p>Autorização preservada</p>;
  },
}));
vi.mock("./DecisionNotice", () => ({
  DecisionNotice: ({
    onStateChange,
  }: {
    onStateChange?: (state: unknown) => void;
  }) => {
    useEffect(() => {
      mocks.noticeLoads();
    }, []);
    useEffect(() => {
      if (mocks.notice) onStateChange?.(mocks.notice);
    }, [onStateChange]);
    return null;
  },
}));
vi.mock("../lib/hooks", () => ({
  useRemote: (path: string) => ({
    loading: mocks.loading,
    error: "",
    refresh: mocks.refresh,
    refreshInBackground: mocks.refresh,
    setData: mocks.setData,
    data: path.endsWith("/events")
      ? [
          {
            id: "event",
            status: mocks.eventStatus,
            teams: [
              { id: "team", name: "SECRETARIA", available: 0, capacity: 1 },
            ],
          },
        ]
      : {
          id: "candidate",
          protocol: "INS-2026-TESTE",
          status: mocks.status,
          origin: mocks.origin,
          updatedAt: mocks.updatedAt,
          spiritualityResponse: mocks.spiritualityResponse,
          spiritualityAt:
            mocks.spiritualityResponse == null ? null : "2026-11-14T17:00:00Z",
          spiritualityRespondedAt:
            mocks.spiritualityResponse == null ? null : "2026-11-12T15:00:00Z",
          decisionSummary: mocks.decisionSummary,
          pendingInformation: mocks.pendingInformation,
          importData:
            mocks.origin === "IMPORT"
              ? { pending: ["Pendência histórica"] }
              : null,
          accountId: "account",
          team: mocks.team,
          person: { name: "Maria Teste" },
          snapshot: {
            name: "Maria Teste",
            birthDate: "2000-01-01",
            phone: "44999999999",
            photoAssetId: "photo",
            answers: {},
            ...mocks.snapshot,
          },
          history: [],
          corrections: mocks.corrections,
          campaign: {
            kind: "VOLUNTEER",
            allowWaitlist: true,
            event: {
              id: "event",
              name: "Evento Teste",
              startsAt: "2027-02-05",
              spiritualityStartsAt: mocks.spiritualityStartsAt,
            },
          },
        },
  }),
}));
afterEach(cleanup);
beforeEach(() => {
  mocks.spiritualityResponse = null;
  mocks.spiritualityStartsAt = "2026-11-14T17:00:00Z";
  mocks.decisionSummary = undefined;
  mocks.api.mockReset();
  mocks.refresh.mockClear();
  mocks.setData.mockClear();
  mocks.guardianLoads.mockClear();
  mocks.noticeLoads.mockClear();
  mocks.team = null;
  mocks.origin = "PUBLIC_FORM";
  mocks.status = "RECEIVED";
  mocks.eventStatus = "PUBLISHED";
  mocks.pendingInformation = undefined;
  mocks.updatedAt = "2026-11-11T12:00:00Z";
  mocks.guardian = {
    ready: true,
    needsAuthorization: false,
    authorization: null,
  };
  mocks.notice = null;
  mocks.snapshot = {};
  mocks.role = "ORGANIZER";
  mocks.eventsEnabled = true;
  mocks.loading = false;
  mocks.corrections = [];
  mocks.api.mockResolvedValue({
    url: "https://example.test/photo.webp",
    status: "APPROVED",
  });
});
function expand(title = "Departamento e decisão") {
  const button = screen.getByRole("button", { name: title });
  if (button.getAttribute("aria-expanded") === "false") fireEvent.click(button);
}

describe("Ficha completa extraída", () => {
  it.each([true, false])(
    "exibe a resposta independente da espiritualidade: %s",
    async (answer) => {
      mocks.spiritualityResponse = answer;
      render(
        <RegistrationDetail
          organizationId="org"
          registrationId="candidate"
          onChanged={vi.fn()}
        />,
      );
      await userEvent.click(
        screen.getByRole("button", {
          name: "Participação e respostas",
        }),
      );
      expect(screen.getByText("Participação na espiritualidade")).toBeVisible();
      const spirituality = screen.getByText(
        "Participação na espiritualidade",
      ).parentElement!;
      expect(
        within(spirituality).getByText(answer ? "Sim" : "Não"),
      ).toBeVisible();
      expect(spirituality).toHaveTextContent("14/11/2026");
      expect(spirituality).toHaveTextContent("Respondido em");
    },
  );
  it.each([
    ["Vou participar", "2026-11-12T15:00:00Z", null, true],
    ["Não irei", null, "2026-11-12T15:00:00Z", false],
    ["Não respondeu", null, null, null],
  ] as const)(
    "mostra as duas respostas sem expor links para a secretaria: %s",
    (answer, confirmedAt, declinedAt, spirituality) => {
      mocks.role = "SECRETARY";
      mocks.eventsEnabled = false;
      mocks.status = "APPROVED";
      mocks.decisionSummary = {
        ready: true,
        notice: {
          kind: "ACEITE",
          active: true,
          expired: true,
          confirmedAt,
          declinedAt,
          spirituality: {
            startsAt: "2026-11-14T17:00:00Z",
            answer: spirituality,
            respondedAt: confirmedAt ?? declinedAt,
          },
        },
      };
      render(
        <RegistrationDetail
          organizationId="org"
          registrationId="candidate"
          onChanged={vi.fn()}
        />,
      );
      expand("Participação e respostas");
      const camp = screen.getByText(
        "Participação no acampamento",
      ).parentElement!;
      const meeting = screen.getByText(
        "Participação na espiritualidade",
      ).parentElement!;
      expect(within(camp).getByText(answer)).toBeVisible();
      expect(
        within(meeting).getByText(
          spirituality == null ? "Não respondeu" : spirituality ? "Sim" : "Não",
        ),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Convite e presença" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Link do candidato")).not.toBeInTheDocument();
    },
  );
  it("não transforma resposta da espiritualidade anterior em resposta da nova data", () => {
    mocks.spiritualityResponse = true;
    mocks.spiritualityStartsAt = "2026-11-21T17:00:00Z";
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expand("Participação e respostas");
    const meeting = screen.getByText(
      "Participação na espiritualidade",
    ).parentElement!;
    expect(meeting).toHaveTextContent("21/11/2026");
    expect(within(meeting).getByText("Não respondeu")).toBeVisible();
    expect(within(meeting).queryByText("Sim")).not.toBeInTheDocument();
  });
  it("não apresenta pergunta de espiritualidade inexistente", () => {
    mocks.spiritualityStartsAt = null;
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expand("Participação e respostas");
    expect(
      screen.queryByText("Participação na espiritualidade"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Participação no acampamento")).toBeVisible();
  });
  it("inicia seções fechadas e mantém dados privados fora do resumo", async () => {
    mocks.snapshot = {
      email: "contato-privado@example.test",
      cpf: "000.000.000-00",
      emergencyName: "Contato privado",
      answers: { residencia: "Resposta privada" },
    };
    const { container } = render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    const summary = screen.getByRole("region", { name: "Resumo da inscrição" });
    expect(summary).toHaveTextContent("Maria Teste");
    expect(summary).toHaveTextContent("INS-2026-TESTE");
    for (const privateValue of [
      "44999999999",
      "contato-privado@example.test",
      "000.000.000-00",
      "Contato privado",
      "Resposta privada",
    ])
      expect(summary).not.toHaveTextContent(privateValue);
    expect(
      container.querySelectorAll(".registration-detail-section-trigger").length,
    ).toBeGreaterThan(4);
    for (const button of container.querySelectorAll(
      ".registration-detail-section-trigger",
    ))
      expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("contato-privado@example.test")).not.toBeVisible();
    expect(container.querySelector("details")).toBeNull();
    expand("Dados pessoais e contato");
    expect(screen.getByText("contato-privado@example.test")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Participação e respostas" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("preserva decisão e justificativa ao recolher e abrir outras seções", async () => {
    const dirty = vi.fn();
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
        onDirtyChange={dirty}
      />,
    );
    expand();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
      "APPROVED",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Motivo adicional (opcional)" }),
      "Conferência preservada",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Departamento e decisão" }),
    );
    expand("Participação e respostas");
    expect(dirty).toHaveBeenLastCalledWith(true);
    expand();
    expect(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
    ).toHaveValue("APPROVED");
    expect(
      screen.getByRole("textbox", { name: "Motivo adicional (opcional)" }),
    ).toHaveValue("Conferência preservada");
    expect(
      screen.getByRole("button", { name: "Participação e respostas" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("abre as pendências pelo resumo e leva o foco ao título da seção", async () => {
    mocks.origin = "IMPORT";
    mocks.pendingInformation = ["Adicionar foto."];
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText("Adicionar foto.")).not.toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Ver informações pendentes" }),
    );
    const heading = screen.getByRole("button", {
      name: "Importação e pendências",
    });
    expect(heading).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Adicionar foto.")).toBeVisible();
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("reabre a seção de decisão em uma falha após recolher durante o salvamento", async () => {
    let reject!: (error: Error) => void;
    mocks.api.mockImplementation((path: string) =>
      path.endsWith("/status")
        ? new Promise((_, fail) => {
            reject = fail;
          })
        : Promise.resolve({ url: "https://example.test/photo.webp" }),
    );
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expand();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
      "APPROVED",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar decisão" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Departamento e decisão" }),
    );
    expect(
      screen.getByRole("button", { name: "Departamento e decisão" }),
    ).toHaveAttribute("aria-expanded", "false");
    await act(async () =>
      reject(new Error("Não foi possível salvar a decisão.")),
    );
    const heading = screen.getByRole("button", {
      name: "Departamento e decisão",
    });
    expect(heading).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível salvar a decisão.",
    );
    await waitFor(() => expect(heading).toHaveFocus());
    expect(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
    ).toHaveValue("APPROVED");
  });

  it.each(["IMPORT", "PUBLIC_FORM"] as const)(
    "preserva edição %s pendente diante de atualização externa",
    async (origin) => {
      mocks.origin = origin;
      const changed = vi.fn();
      const view = render(
        <RegistrationDetail
          organizationId="org"
          registrationId="candidate"
          onChanged={changed}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Editar ficha" }));
      const name = screen.getByRole("textbox", { name: "Nome completo" });
      await userEvent.clear(name);
      await userEvent.type(name, "Maria Corrigida");
      mocks.updatedAt = "2026-11-11T12:10:00Z";
      mocks.loading = true;
      view.rerender(
        <RegistrationDetail
          organizationId="org"
          registrationId="candidate"
          onChanged={changed}
        />,
      );
      expect(
        screen.getByRole("textbox", { name: "Nome completo" }),
      ).toHaveValue("Maria Corrigida");
    },
  );

  it.each(["PUBLIC_FORM", "IMPORT"] as const)(
    "oferece edição direta da ficha %s no mesmo modal e oculta a consulta durante a edição",
    (origin) => {
      mocks.origin = origin;
      render(
        <RegistrationDetail
          organizationId="org"
          registrationId="candidate"
          onChanged={vi.fn()}
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Correções" }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Editar ficha" }));
      expect(screen.getByRole("form", { name: "Editar ficha" })).toBeVisible();
      expect(screen.getByLabelText("Nome completo")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Dados pessoais e contato" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(/Motivo da correção/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Corrigir dados importados" }),
      ).not.toBeInTheDocument();
    },
  );

  it("aplica a ficha retornada ao salvar e atualiza a lista em segundo plano", async () => {
    const changed = vi.fn();
    mocks.status = "APPROVED";
    const corrected = {
      id: "candidate",
      snapshot: { name: "Maria Corrigida" },
      updatedAt: "2026-11-12T12:00:00Z",
    };
    mocks.api.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/corrections")
          ? corrected
          : { url: "https://example.test/photo.webp" },
      ),
    );
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={changed}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar ficha" }));
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Maria Corrigida" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar alterações" }),
    );
    expect(mocks.setData).toHaveBeenCalledWith(corrected);
    expect(mocks.refresh).toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(mocks.guardianLoads).toHaveBeenCalledTimes(2);
    expect(mocks.noticeLoads).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("form", { name: "Editar ficha" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar ficha" })).toBeVisible();
  });
  it.each(["SECRETARY", "HEALTH"])(
    "não oferece edição da ficha para %s mesmo com eventos habilitados",
    (role) => {
      mocks.role = role;
      mocks.eventsEnabled = true;
      render(
        <RegistrationDetail
          organizationId="org"
          registrationId="candidate"
          onChanged={vi.fn()}
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Editar ficha" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("form", { name: "Editar ficha" }),
      ).not.toBeInTheDocument();
    },
  );

  it("mantém a edição e o rascunho abertos quando o salvamento falha", async () => {
    let reject!: (reason: Error) => void;
    mocks.api.mockImplementation((path: string) =>
      path.endsWith("/corrections")
        ? new Promise((_, fail) => {
            reject = fail;
          })
        : Promise.resolve({ url: "https://example.test/photo.webp" }),
    );
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar ficha" }));
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Maria Corrigida" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await act(async () =>
      reject(new Error("Não foi possível salvar a correção.")),
    );
    expect(screen.getByRole("form", { name: "Editar ficha" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível salvar a correção.",
    );
    expect(screen.getByLabelText("Nome completo")).toHaveValue(
      "Maria Corrigida",
    );
  });

  it("mostra o contato corrigido e permite apresentar contato removido sem mudar o e-mail original", () => {
    mocks.snapshot = { email: "original@example.com", contactEmail: "" };
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expand("Dados pessoais e contato");
    const region = screen.getByRole("region", {
      name: "Dados pessoais e contato",
    });
    expect(
      within(region).queryByText("original@example.com"),
    ).not.toBeInTheDocument();
    expect(within(region).getByText("Não informado")).toBeVisible();
  });

  it("cancela a edição no mesmo modal sem salvar e retorna à consulta", async () => {
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar ficha" }));
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Nome não salvo" },
    });
    expect(screen.getAllByRole("form")).toHaveLength(1);
    expect(
      screen.getByRole("form", { name: "Editar ficha" }).querySelector("form"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.queryByRole("form", { name: "Editar ficha" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dados pessoais e contato" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Editar ficha" }),
      ).toHaveFocus(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar ficha" }));
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Maria Teste");
    expect(
      mocks.api.mock.calls.some(([path]) => path.endsWith("/corrections")),
    ).toBe(false);
  });

  it("apresenta automaticamente autor, data e valores antes/depois no histórico de edições", () => {
    mocks.corrections = [
      {
        id: "edit-one",
        createdAt: "2026-11-13T03:00:00Z",
        actor: {
          id: "author",
          name: "Organizadora Exemplo",
          email: "org@example.com",
        },
        reason: "Correção da ficha pela organização.",
        changes: [
          {
            field: "name",
            label: "Nome completo",
            before: "Nome anterior",
            after: "Nome corrigido",
          },
          {
            field: "shirt",
            label: "Tamanho da camiseta",
            before: null,
            after: "G4",
          },
          {
            field: "question:sacramentos",
            label: "Sacramentos",
            before: [],
            after: ["Batismo", "Crisma"],
          },
          {
            field: "question:experiencia",
            label: "Experiência",
            before: false,
            after: true,
          },
        ],
      },
      {
        id: "edit-old",
        createdAt: "2026-11-12T03:00:00Z",
        actor: { id: "other", name: null, email: "outro@example.com" },
        reason: "Dados conferidos com o participante",
        changes: [
          {
            field: "phone",
            label: "Telefone",
            before: "44999999999",
            after: "44988887777",
          },
        ],
      },
    ];
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expand("Histórico e vínculo");
    const region = screen.getByRole("region", { name: "Histórico e vínculo" });
    expect(
      within(region).getByRole("heading", { name: "Edições da ficha" }),
    ).toBeVisible();
    expect(within(region).getByText("Organizadora Exemplo")).toBeVisible();
    expect(within(region).getByText("outro@example.com")).toBeVisible();
    expect(region).toHaveTextContent("13/11/2026");
    expect(region).toHaveTextContent(
      "Antes: Nome anteriorDepois: Nome corrigido",
    );
    expect(region).toHaveTextContent("Depois: Batismo; Crisma");
    expect(region).toHaveTextContent("Antes: NãoDepois: Sim");
    expect(region).toHaveTextContent("Antes: Não informadoDepois: G4");
    expect(
      within(region).queryByText("Correção da ficha pela organização."),
    ).not.toBeInTheDocument();
    expect(
      within(region).getByText("Dados conferidos com o participante"),
    ).toBeVisible();
  });

  it("protege uma correção recém-digitada quando Escape ocorre em seguida", () => {
    const close = vi.fn();
    function Fixture() {
      const [dirty, setDirty] = useState(false);
      return (
        <Modal title="Ficha do participante" dirty={dirty} onClose={close}>
          <RegistrationDetail
            organizationId="org"
            registrationId="candidate"
            onChanged={vi.fn()}
            onDirtyChange={setDirty}
          />
        </Modal>
      );
    }
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "Editar ficha" }));
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Maria Corrigida" },
    });
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });

  it("não mantém presença de um convite antigo ao devolver candidatura e mudar contexto", async () => {
    mocks.status = "APPROVED";
    mocks.notice = {
      ready: true,
      notice: {
        id: "old",
        kind: "ACEITE",
        active: true,
        confirmedAt: "2026-11-11T12:00:00Z",
      },
    };
    const changed = vi.fn();
    const view = render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={changed}
      />,
    );
    expect(
      within(
        screen.getByRole("region", { name: "Resumo da inscrição" }),
      ).getByText("Confirmada pelo candidato"),
    ).toBeVisible();
    mocks.status = "RECEIVED";
    mocks.notice = null;
    view.rerender(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={changed}
      />,
    );
    expect(
      screen.getByRole("region", { name: "Resumo da inscrição" }),
    ).toHaveTextContent("Não solicitada");
    expect(
      screen.queryByText("Confirmada pelo candidato"),
    ).not.toBeInTheDocument();
    mocks.status = "APPROVED";
    mocks.team = { id: "another", name: "NOVO DEPARTAMENTO" };
    view.rerender(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={changed}
      />,
    );
    expect(
      screen.getByRole("region", { name: "Resumo da inscrição" }),
    ).toHaveTextContent("Não informada");
    expect(
      screen.queryByText("Confirmada pelo candidato"),
    ).not.toBeInTheDocument();
  });

  it("não amplia acesso a decisões, comunicações ou correção para outro papel", () => {
    mocks.role = "SECRETARY";
    mocks.eventsEnabled = false;
    mocks.origin = "IMPORT";
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Departamento e decisão" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Convite e presença" }),
    ).not.toBeInTheDocument();
    expand("Importação e pendências");
    expect(
      screen.queryByRole("button", { name: "Editar ficha" }),
    ).not.toBeInTheDocument();
  });
  it.each(["APPROVED", "CONFIRMED", "WAITLIST", "REJECTED", "CANCELLED"])(
    "oferece retorno para Recebida e Em análise na ficha %s",
    (status) => {
      mocks.status = status;
      render(
        <RegistrationDetail
          organizationId="org"
          registrationId="candidate"
          onChanged={vi.fn()}
        />,
      );
      expand();
      expect(
        screen.getByRole("option", { name: "Recebida" }),
      ).not.toBeDisabled();
      expect(
        screen.getByRole("option", { name: "Em análise" }),
      ).not.toBeDisabled();
    },
  );
  it("salva retorno para Recebida sem exigir motivo adicional", async () => {
    mocks.status = "APPROVED";
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expand();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
      "RECEIVED",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar decisão" }),
    );
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/candidate/status",
      expect.objectContaining({
        body: {
          status: "RECEIVED",
          reason:
            "Situação alterada para Recebida pela organização na ficha de inscrição.",
        },
      }),
    );
  });
  it("bloqueia retorno para Recebida ou Em análise em evento concluído", () => {
    mocks.status = "APPROVED";
    mocks.eventStatus = "COMPLETED";
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expand();
    expect(screen.getByRole("option", { name: "Recebida" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Em análise" })).toBeDisabled();
  });
  it("permite confirmar vaga importada com pendências reais, sem afirmar que a autorização já foi dada", async () => {
    mocks.origin = "IMPORT";
    mocks.status = "APPROVED";
    mocks.pendingInformation = [
      "Adicionar foto.",
      "Autorização do responsável pendente: obrigatória antes do evento.",
    ];
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expand();
    expect(
      screen.getByRole("option", { name: "Confirmada" }),
    ).not.toBeDisabled();
    expand("Importação e pendências");
    expect(screen.getByText("Informações pendentes")).toBeVisible();
    expect(screen.getByText("Adicionar foto.")).toBeVisible();
    expect(screen.queryByText("Pendência histórica")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /A confirmação da vaga não registra aceites ou autorizações/,
      ),
    ).toBeVisible();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
      "CONFIRMED",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar decisão" }),
    );
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/candidate/status",
      expect.objectContaining({
        body: expect.objectContaining({ status: "CONFIRMED" }),
      }),
    );
  });
  it("protege a decisão recém-selecionada quando Escape ocorre logo após a edição", async () => {
    const close = vi.fn();
    function Fixture() {
      const [dirty, setDirty] = useState(false);
      return (
        <Modal title="Ficha do participante" dirty={dirty} onClose={close}>
          <RegistrationDetail
            organizationId="org"
            registrationId="candidate"
            onChanged={vi.fn()}
            onDirtyChange={setDirty}
          />
        </Modal>
      );
    }
    render(<Fixture />);
    expand();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
      "APPROVED",
    );
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Continuar editando" }),
    );
    expect(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
    ).toHaveValue("APPROVED");
    expect(close).not.toHaveBeenCalled();
  });
  it("não sinaliza alteração ao carregar departamento já salvo", () => {
    mocks.team = { id: "team", name: "SECRETARIA" };
    const onDirtyChange = vi.fn();
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );
    expand();
    expect(
      screen.getByRole("combobox", { name: "Alocar em departamento" }),
    ).toHaveValue("team");
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });
  it("preserva identificação, foto autenticada e autorização sem consultar saúde", async () => {
    mocks.guardian = {
      ready: true,
      needsAuthorization: true,
      authorization: null,
    };
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Maria Teste" })).toBeVisible();
    expect(
      await screen.findByRole("img", { name: "Foto de Maria Teste" }),
    ).toHaveAttribute("src", "https://example.test/photo.webp");
    expand("Responsável e autorização");
    expect(screen.getByText("Autorização preservada")).toBeVisible();
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/candidate/photo",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(
      mocks.api.mock.calls.some(([path]) => path.endsWith("/health")),
    ).toBe(false);
  });

  it("permite aceitar recebida com motivo padrão e informa edições não salvas", async () => {
    const onDirtyChange = vi.fn();
    const onChanged = vi.fn();
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={onChanged}
        onDirtyChange={onDirtyChange}
      />,
    );
    expand();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
      "APPROVED",
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar decisão" }),
    );
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/candidate/status",
      expect.objectContaining({
        method: "PATCH",
        body: {
          status: "APPROVED",
          reason: expect.stringContaining("pela organização"),
        },
      }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("permite indicar departamento lotado antes da aprovação, sem alegar reserva", async () => {
    const onChanged = vi.fn();
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={onChanged}
      />,
    );
    expand();
    const department = screen.getByRole("combobox", {
      name: "Alocar em departamento",
    });
    await userEvent.selectOptions(department, "team");
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar departamento" }),
    );
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/candidate/team",
      { method: "PUT", body: { teamId: "team" } },
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
