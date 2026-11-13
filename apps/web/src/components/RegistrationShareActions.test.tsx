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
import { RegistrationShareActions } from "./RegistrationShareActions";
import type { Registration } from "../lib/types";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));

const candidate = {
  id: "registration",
  status: "APPROVED",
  updatedAt: "2026-11-12T12:00:00Z",
  team: null,
  person: { name: "Maria Teste", phone: "44999999999" },
  snapshot: { phone: "44999999999" },
  decisionSummary: {
    ready: true,
    notice: {
      id: "notice",
      active: true,
      expired: false,
      expiresAt: "2027-02-01T12:00:00Z",
      whatsappSentAt: null,
    },
  },
} as Registration;
const state = () => ({
  ready: true,
  notice: {
    id: "notice",
    kind: "ACEITE",
    active: true,
    expired: false,
    whatsappSentAt: null,
    emailSentAt: null,
    confirmedAt: null,
    expiresAt: "2027-02-01T12:00:00Z",
    emailStatus: "PENDENTE",
    shortLink: "https://example.test/r#short-secret",
    link: "https://example.test/resposta/notice#token=secret",
    whatsappLink: "https://wa.me/5544999999999?text=convite",
  },
});
const writeText = vi.fn(),
  onChanged = vi.fn();
let open: ReturnType<typeof vi.spyOn>;
function subject(
  overrides: Partial<
    React.ComponentProps<typeof RegistrationShareActions>
  > = {},
) {
  return (
    <RegistrationShareActions
      organizationId="org"
      registration={candidate}
      disabled={false}
      canWhatsApp
      canCopy
      onChanged={onChanged}
      {...overrides}
    />
  );
}
function show(
  overrides: Partial<
    React.ComponentProps<typeof RegistrationShareActions>
  > = {},
) {
  return render(subject(overrides));
}
const whatsappName = "Enviar convite por WhatsApp para Maria Teste";
const whatsapp = () => screen.getByRole("button", { name: whatsappName });
const preparedWhatsApp = () => screen.getByRole("link", { name: whatsappName });
async function prepare() {
  fireEvent.click(whatsapp());
  return screen.findByRole("link", { name: whatsappName });
}
async function openPrepared() {
  const link = await prepare();
  fireEvent.click(link);
  return link;
}
const copy = () =>
  screen.getByRole("button", { name: "Copiar link do candidato Maria Teste" });
beforeEach(() => {
  mocks.api.mockReset().mockResolvedValue(state());
  writeText.mockReset().mockResolvedValue(undefined);
  onChanged.mockReset();
  open = vi.spyOn(window, "open").mockReturnValue(null);
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Compartilhamento direto do convite", () => {
  it("mostra a orientação somente ao tentar abrir o WhatsApp antes do aceite, sem consultar ou enviar convite", () => {
    show({
      registration: { ...candidate, status: "RECEIVED" },
      canWhatsApp: false,
      canCopy: false,
      whatsappBlockedMessage: "Disponível após o aceite",
    });
    expect(
      screen.queryByText("Disponível após o aceite"),
    ).not.toBeInTheDocument();
    expect(whatsapp()).not.toBeDisabled();
    expect(whatsapp()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(whatsapp());
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Disponível após o aceite",
    );
    expect(whatsapp()).toHaveAccessibleDescription("Disponível após o aceite");
    expect(mocks.api).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(copy()).toBeDisabled();
    fireEvent.keyDown(whatsapp(), { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
  it.each(["blur", "outside"])(
    "fecha a orientação de bloqueio ao ocorrer %s",
    (event) => {
      show({
        canWhatsApp: false,
        whatsappBlockedMessage: "Disponível após o aceite",
      });
      fireEvent.click(whatsapp());
      expect(screen.getByRole("tooltip")).toBeVisible();
      if (event === "blur") fireEvent.blur(whatsapp());
      else fireEvent.pointerDown(document.body);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      expect(mocks.api).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    },
  );
  it("oculta automaticamente a orientação de bloqueio após alguns segundos", () => {
    vi.useFakeTimers();
    show({
      canWhatsApp: false,
      whatsappBlockedMessage: "Disponível após o aceite",
    });
    fireEvent.click(whatsapp());
    expect(screen.getByRole("tooltip")).toBeVisible();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
  it("prepara o convite apenas ao clicar, sem abrir aba vazia ou carregar links na listagem", async () => {
    show();
    expect(mocks.api).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("short-secret");
    expect(document.body).not.toHaveTextContent("token=secret");
    const link = await prepare();
    expect(open).not.toHaveBeenCalled();
    expect(link).toHaveAttribute("href", state().notice.whatsappLink);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.getByText("Mensagem pronta. Toque no WhatsApp para abrir."),
    ).toBeVisible();
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/registration/decision-notice",
      { signal: expect.any(AbortSignal) },
    );
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Marcar como enviado/ }),
    ).not.toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it("permite navegação nativa no segundo clique e registra envio somente pela ação explícita", async () => {
    show();
    const link = await prepare();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => link.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        "Abertura solicitada. Após enviar a mensagem, marque como enviado.",
      ),
    ).toBeVisible();
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    fireEvent.click(
      await screen.findByRole("button", { name: /Marcar como enviado/ }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/organizations/org/registrations/registration/decision-notice/whatsapp-sent",
        { method: "POST", signal: expect.any(AbortSignal) },
      ),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
  it("o link preparado pode ser ativado por Enter sem navegação programática", async () => {
    show();
    const link = await prepare();
    const clicks: MouseEvent[] = [];
    link.addEventListener("click", (event) => clicks.push(event as MouseEvent));
    link.focus();
    expect(link).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(clicks).toHaveLength(1);
    expect(clicks[0].defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Marcar como enviado/ }),
    ).toBeVisible();
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    "copia o link pessoal, priorizando o compacto quando disponível (%s)",
    async (compact) => {
      const response = state();
      if (!compact) response.notice.shortLink = null as unknown as string;
      mocks.api.mockResolvedValue(response);
      show();
      fireEvent.click(copy());
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(
          compact ? response.notice.shortLink : response.notice.link,
        ),
      );
      expect(open).not.toHaveBeenCalled();
      expect(
        mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
      ).toBe(false);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onChanged).not.toHaveBeenCalled();
    },
  );
  it.each(["expired", "inactive", "unready", "missing"])(
    "não compartilha convite %s nem o renova automaticamente",
    async (kind) => {
      const response = state();
      if (kind === "expired") response.notice.expired = true;
      if (kind === "inactive") response.notice.active = false;
      if (kind === "unready") response.ready = false;
      if (kind === "missing")
        response.notice = null as unknown as typeof response.notice;
      mocks.api.mockResolvedValue(response);
      show();
      fireEvent.click(whatsapp());
      expect(await screen.findByRole("alert")).toBeVisible();
      expect(open).not.toHaveBeenCalled();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(
        mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
      ).toBe(false);
      expect(
        screen.queryByRole("button", { name: /Marcar como enviado/ }),
      ).not.toBeInTheDocument();
    },
  );
  it("mostra falha da consulta sem abrir aba e permite tentar novamente", async () => {
    mocks.api.mockRejectedValue(
      new Error("Não foi possível consultar o convite."),
    );
    show();
    fireEvent.click(whatsapp());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível consultar o convite.",
    );
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(whatsapp()).not.toBeDisabled();
    mocks.api.mockResolvedValue(state());
    await prepare();
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
  it.each([null, "https://example.test/conversa", "javascript:alert(1)"])(
    "não prepara link de WhatsApp inválido (%s), não abre aba e permite corrigir",
    async (whatsappLink) => {
      mocks.api.mockResolvedValue({
        ...state(),
        notice: { ...state().notice, whatsappLink },
      });
      show();
      fireEvent.click(whatsapp());
      expect(await screen.findByRole("alert")).toBeVisible();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(open).not.toHaveBeenCalled();
      expect(onChanged).not.toHaveBeenCalled();
      mocks.api.mockResolvedValue(state());
      const link = await prepare();
      expect(link).toHaveAttribute("href", state().notice.whatsappLink);
      expect(mocks.api).toHaveBeenCalledTimes(2);
    },
  );
  it("mostra a falha de cópia sem declarar envio ou abrir outra aba", async () => {
    writeText.mockRejectedValue(new Error("Permission denied"));
    show();
    fireEvent.click(copy());
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(open).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Link do candidato Maria Teste" }),
    ).toHaveValue(state().notice.shortLink);
  });
  it("não registra envio em outro convite renovado depois que a conversa foi aberta", async () => {
    show();
    await openPrepared();
    const mark = await screen.findByRole("button", {
      name: /Marcar como enviado/,
    });
    mocks.api.mockResolvedValue({
      ...state(),
      notice: { ...state().notice, id: "renewed" },
    });
    fireEvent.click(mark);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /convite mudou/i,
    );
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    expect(onChanged).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /Marcar como enviado/ }),
    ).not.toBeInTheDocument();
  });
  it("invalida a marcação pendente quando a candidatura é devolvida para Recebida", async () => {
    const view = show();
    await openPrepared();
    await screen.findByRole("button", { name: /Marcar como enviado/ });
    view.rerender(
      subject({
        registration: { ...candidate, status: "RECEIVED" },
        canWhatsApp: false,
        canCopy: false,
      }),
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Marcar como enviado/ }),
    ).not.toBeInTheDocument();
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
  });
  it("ignora cliques repetidos enquanto consulta o convite", async () => {
    let resolve!: (value: ReturnType<typeof state>) => void;
    mocks.api.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    show();
    fireEvent.click(whatsapp());
    fireEvent.click(whatsapp());
    fireEvent.click(copy());
    expect(open).not.toHaveBeenCalled();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    resolve(state());
    await screen.findByRole("link", { name: whatsappName });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });
  it("mantém a preparação por 60 segundos e depois exige nova consulta sem abrir abas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
    show();
    await act(async () => fireEvent.click(whatsapp()));
    expect(preparedWhatsApp()).toHaveAttribute(
      "href",
      state().notice.whatsappLink,
    );
    act(() => vi.advanceTimersByTime(59_999));
    expect(preparedWhatsApp()).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Mensagem pronta. Toque no WhatsApp para abrir."),
    ).not.toBeInTheDocument();
    expect(whatsapp()).toBeEnabled();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.click(whatsapp()));
    expect(preparedWhatsApp()).toBeVisible();
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(open).not.toHaveBeenCalled();
  });
  it("a preparação nunca ultrapassa a validade do convite", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-11-12T12:00:00Z");
    vi.setSystemTime(now);
    mocks.api.mockResolvedValue({
      ...state(),
      notice: {
        ...state().notice,
        expiresAt: new Date(now.getTime() + 10_000).toISOString(),
      },
    });
    show();
    await act(async () => fireEvent.click(whatsapp()));
    expect(preparedWhatsApp()).toBeVisible();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(whatsapp()).toBeEnabled();
    expect(open).not.toHaveBeenCalled();
  });
  it.each(["2026-11-12T12:00:00Z", "data inválida"])(
    "rejeita validade %s mesmo quando a API não marcou expired",
    async (expiresAt) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
      mocks.api.mockResolvedValue({
        ...state(),
        notice: { ...state().notice, expiresAt },
      });
      show();
      await act(async () => fireEvent.click(whatsapp()));
      expect(screen.getByRole("alert")).toHaveTextContent(/expirou/i);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(open).not.toHaveBeenCalled();
    },
  );
  it("bloqueia sincronicamente o clique se a preparação venceu antes de o temporizador atualizar a tela", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-11-12T12:00:00Z");
    vi.setSystemTime(now);
    show();
    await act(async () => fireEvent.click(whatsapp()));
    const link = preparedWhatsApp();
    vi.setSystemTime(new Date(now.getTime() + 60_001));
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => link.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Atualize a mensagem/i);
    expect(
      screen.queryByRole("button", { name: /Marcar como enviado/ }),
    ).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
  const contextCases: Array<
    [string, Partial<React.ComponentProps<typeof RegistrationShareActions>>]
  > = [
    ["organização", { organizationId: "another-org" }],
    [
      "candidato",
      {
        registration: {
          ...candidate,
          id: "another-registration",
          person: { ...candidate.person, name: "Joana Teste" },
        },
      },
    ],
    ["situação", { registration: { ...candidate, status: "CONFIRMED" } }],
    [
      "departamento",
      {
        registration: {
          ...candidate,
          team: { id: "team", name: "Secretaria" } as Registration["team"],
        },
      },
    ],
    [
      "atualização da candidatura",
      { registration: { ...candidate, updatedAt: "2026-11-12T12:01:00Z" } },
    ],
    ...(
      [
        ["identificador do convite", { id: "renewed" }],
        ["convite encerrado", { active: false }],
        ["convite expirado", { expired: true }],
        ["validade alterada", { expiresAt: "2027-02-01T13:00:00Z" }],
      ] as const
    ).map(
      ([label, patch]) =>
        [
          label,
          {
            registration: {
              ...candidate,
              decisionSummary: {
                ...candidate.decisionSummary!,
                notice: { ...candidate.decisionSummary!.notice!, ...patch },
              },
            },
          },
        ] as [
          string,
          Partial<React.ComponentProps<typeof RegistrationShareActions>>,
        ],
    ),
  ];
  it.each(contextCases)(
    "descarta link preparado e marcação pendente ao mudar %s, sem consultar automaticamente",
    async (_, overrides) => {
      const view = show();
      await openPrepared();
      expect(
        screen.getByRole("button", { name: /Marcar como enviado/ }),
      ).toBeVisible();
      view.rerender(subject(overrides));
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Marcar como enviado/ }),
      ).not.toBeInTheDocument();
      expect(mocks.api).toHaveBeenCalledTimes(1);
      expect(open).not.toHaveBeenCalled();
      expect(onChanged).not.toHaveBeenCalled();
    },
  );
  it("o link preparado bloqueia navegação quando a linha está desativada", async () => {
    const view = show();
    await prepare();
    view.rerender(subject({ disabled: true }));
    const link = preparedWhatsApp();
    expect(link).toHaveAttribute("aria-disabled", "true");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => link.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    expect(
      screen.queryByRole("button", { name: /Marcar como enviado/ }),
    ).not.toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
  it("o link preparado bloqueia navegação enquanto outra ação está em andamento", async () => {
    show();
    await prepare();
    let resolve!: (value: ReturnType<typeof state>) => void;
    mocks.api.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fireEvent.click(copy());
    const link = preparedWhatsApp();
    expect(link).toHaveAttribute("aria-disabled", "true");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => link.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    expect(
      screen.queryByRole("button", { name: /Marcar como enviado/ }),
    ).not.toBeInTheDocument();
    await act(async () => resolve(state()));
    expect(open).not.toHaveBeenCalled();
  });
  it("remove o link preparado quando perde a permissão de WhatsApp", async () => {
    const view = show();
    await prepare();
    view.rerender(subject({ canWhatsApp: false }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(whatsapp()).toBeDisabled();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });
  it("inicia a cópia durante o clique e entrega o conteúdo após a consulta, preservando o gesto no Safari", async () => {
    let resolve!: (value: ReturnType<typeof state>) => void;
    mocks.api.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    class TestClipboardItem {
      constructor(public data: Record<string, Promise<Blob>>) {}
    }
    vi.stubGlobal("ClipboardItem", TestClipboardItem);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write, writeText },
    });
    show();
    fireEvent.click(copy());
    expect(write).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByText("Preparando…")).toBeVisible();
    const payload = (write.mock.calls[0][0] as TestClipboardItem[])[0].data[
      "text/plain"
    ];
    expect(payload).toBeInstanceOf(Promise);
    await act(async () => resolve(state()));
    const blob = await payload;
    expect(blob.type).toBe("text/plain");
    const contents = await new Promise<string>((done) => {
      const reader = new FileReader();
      reader.onload = () => done(String(reader.result));
      reader.readAsText(blob);
    });
    expect(contents).toBe(state().notice.shortLink);
    expect(await screen.findByText("Link copiado.")).toBeVisible();
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
  });
  it.each(["unmount", "status"])(
    "aborta a consulta sem abrir aba quando ocorre %s",
    async (change) => {
      let resolve!: (value: ReturnType<typeof state>) => void;
      mocks.api.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const view = show();
      fireEvent.click(whatsapp());
      const signal = mocks.api.mock.calls[0][1].signal as AbortSignal;
      expect(signal.aborted).toBe(false);
      if (change === "unmount") view.unmount();
      else
        view.rerender(
          <RegistrationShareActions
            organizationId="org"
            registration={{ ...candidate, status: "RECEIVED" }}
            disabled={false}
            canWhatsApp={false}
            canCopy={false}
            onChanged={onChanged}
          />,
        );
      expect(signal.aborted).toBe(true);
      await act(async () => resolve(state()));
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(open).not.toHaveBeenCalled();
      expect(onChanged).not.toHaveBeenCalled();
    },
  );
  it("permite copiar sem telefone e respeita os bloqueios de permissão e processamento", async () => {
    const view = show({ canWhatsApp: false, canCopy: true });
    expect(whatsapp()).toBeDisabled();
    expect(copy()).not.toBeDisabled();
    fireEvent.click(copy());
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    view.rerender(
      <RegistrationShareActions
        organizationId="org"
        registration={candidate}
        disabled
        canWhatsApp
        canCopy
        onChanged={onChanged}
      />,
    );
    expect(whatsapp()).toBeDisabled();
    expect(copy()).toBeDisabled();
    view.rerender(
      <RegistrationShareActions
        organizationId="org"
        registration={candidate}
        disabled={false}
        canWhatsApp={false}
        canCopy={false}
        onChanged={onChanged}
      />,
    );
    expect(whatsapp()).toBeDisabled();
    expect(copy()).toBeDisabled();
  });
});
