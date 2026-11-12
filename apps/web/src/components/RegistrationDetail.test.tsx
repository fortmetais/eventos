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

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
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
          campaign: {
            kind: "VOLUNTEER",
            allowWaitlist: true,
            event: {
              id: "event",
              name: "Evento Teste",
              startsAt: "2027-02-05",
            },
          },
        },
  }),
}));
afterEach(cleanup);
beforeEach(() => {
  mocks.api.mockReset();
  mocks.refresh.mockClear();
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

  it("preserva correção importada pendente diante de atualização externa e recolhimento", async () => {
    mocks.origin = "IMPORT";
    const changed = vi.fn();
    const view = render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={changed}
      />,
    );
    expand("Importação e pendências");
    await userEvent.click(
      screen.getByRole("button", { name: "Corrigir dados importados" }),
    );
    const name = screen.getByRole("textbox", { name: "Nome completo" });
    await userEvent.clear(name);
    await userEvent.type(name, "Maria Corrigida");
    await userEvent.click(
      screen.getByRole("button", { name: "Importação e pendências" }),
    );
    mocks.updatedAt = "2026-11-11T12:10:00Z";
    mocks.loading = true;
    view.rerender(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={changed}
      />,
    );
    expand("Importação e pendências");
    expect(screen.getByRole("textbox", { name: "Nome completo" })).toHaveValue(
      "Maria Corrigida",
    );
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
      screen.queryByRole("button", { name: "Corrigir dados importados" }),
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
