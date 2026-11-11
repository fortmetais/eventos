import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { RegistrationShareActions } from "./RegistrationShareActions";
import type { Registration } from "../lib/types";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));

const candidate = {
  id: "registration",
  status: "APPROVED",
  person: { name: "Maria Teste", phone: "44999999999" },
  snapshot: { phone: "44999999999" },
  decisionSummary: {
    ready: true,
    notice: {
      id: "notice",
      active: true,
      expired: false,
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
const replace = vi.fn(),
  close = vi.fn(),
  writeText = vi.fn(),
  onChanged = vi.fn();
let open: ReturnType<typeof vi.spyOn>;
function show(
  overrides: Partial<
    React.ComponentProps<typeof RegistrationShareActions>
  > = {},
) {
  return render(
    <RegistrationShareActions
      organizationId="org"
      registration={candidate}
      disabled={false}
      canWhatsApp
      canCopy
      onChanged={onChanged}
      {...overrides}
    />,
  );
}
const whatsapp = () =>
  screen.getByRole("button", {
    name: "Enviar convite por WhatsApp para Maria Teste",
  });
const copy = () =>
  screen.getByRole("button", { name: "Copiar link do candidato Maria Teste" });
beforeEach(() => {
  mocks.api.mockReset().mockResolvedValue(state());
  replace.mockReset();
  close.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  onChanged.mockReset();
  open = vi
    .spyOn(window, "open")
    .mockReturnValue({
      location: { replace },
      close,
      opener: null,
    } as unknown as Window);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Compartilhamento direto do convite", () => {
  it("carrega o convite apenas ao clicar e abre o WhatsApp sem declarar envio", async () => {
    show();
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.click(whatsapp());
    expect(open).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(state().notice.whatsappLink),
    );
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/registration/decision-notice",
      { signal: expect.any(AbortSignal) },
    );
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Marcar como enviado/ }),
    ).toBeVisible();
    expect(onChanged).not.toHaveBeenCalled();
  });
  it("registra o WhatsApp somente pela ação explícita após abrir a conversa", async () => {
    show();
    fireEvent.click(whatsapp());
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
      await waitFor(() => expect(close).toHaveBeenCalled());
      expect(replace).not.toHaveBeenCalled();
      expect(
        mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
      ).toBe(false);
      expect(screen.getByRole("alert")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /Marcar como enviado/ }),
      ).not.toBeInTheDocument();
    },
  );
  it("fecha a aba preparada e mostra erro quando a consulta falha", async () => {
    mocks.api.mockRejectedValue(
      new Error("Não foi possível consultar o convite."),
    );
    show();
    fireEvent.click(whatsapp());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível consultar o convite.",
    );
    expect(close).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
  it("não registra envio quando o navegador bloqueia a nova aba", async () => {
    open.mockReturnValue(null);
    show();
    fireEvent.click(whatsapp());
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    expect(
      screen.queryByRole("button", { name: /Marcar como enviado/ }),
    ).not.toBeInTheDocument();
  });
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
    fireEvent.click(whatsapp());
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
    fireEvent.click(whatsapp());
    await screen.findByRole("button", { name: /Marcar como enviado/ });
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
    expect(open).toHaveBeenCalledTimes(1);
    expect(mocks.api).toHaveBeenCalledTimes(1);
    resolve(state());
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
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
    "aborta a consulta e fecha a aba preparada quando ocorre %s",
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
      expect(close).toHaveBeenCalledTimes(1);
      await act(async () => resolve(state()));
      expect(replace).not.toHaveBeenCalled();
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
