import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DecisionNotice } from "./DecisionNotice";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mocks.api,
}));
const fixture = (kind = "ACEITE") => ({
  ready: true,
  notice: {
    id: "notice",
    kind,
    emailStatus: "SEM_EMAIL",
    emailSentAt: null,
    whatsappSentAt: null,
    confirmedAt: null,
    expiresAt: "2027-06-01T03:00:00Z",
    active: true,
    expired: false,
    email: null,
    message:
      kind === "ACEITE"
        ? "Sua candidatura foi aceita! Confirme presença."
        : "Não foi dessa vez! Agradecemos sua disponibilidade.",
    link: "http://localhost/resposta/notice#token=credencial",
    whatsappLink: "https://wa.me/5544999999999?text=mensagem",
  },
});
beforeEach(() => {
  mocks.api.mockReset();
  mocks.api.mockResolvedValue(fixture());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Aviso ao candidato", () => {
  it("copia o link compacto sem montar um campo ou mensagem permanentemente", async () => {
    const user = userEvent.setup();
    const state = {
      ...fixture(),
      notice: {
        ...fixture().notice,
        shortLink: `https://example.test/r#${"a".repeat(64)}`,
      },
    };
    mocks.api.mockResolvedValue(state);
    render(
      <DecisionNotice organizationId="org" registrationId="registration" />,
    );
    await screen.findByRole("button", { name: "Copiar link do candidato" });
    expect(
      screen.queryByRole("textbox", { name: "Link do candidato" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(state.notice.message)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Copiar link do candidato" }),
    );
    expect(await navigator.clipboard.readText()).toBe(state.notice.shortLink);
  });
  it("abrir mensagem não declara envio; registro exige ação explícita", async () => {
    const onChanged = vi.fn();
    render(
      <DecisionNotice
        organizationId="org"
        registrationId="registration"
        onChanged={onChanged}
      />,
    );
    const link = await screen.findByRole("link", {
      name: "Abrir mensagem no WhatsApp",
    });
    expect(link).toHaveAttribute("href", fixture().notice.whatsappLink);
    expect(
      screen.getByText("Envio pelo WhatsApp ainda não registrado."),
    ).toBeVisible();
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    expect(
      screen.queryByRole("button", {
        name: "Marcar como enviado pelo WhatsApp",
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(link);
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    await userEvent.click(
      screen.getByRole("button", { name: "Marcar como enviado pelo WhatsApp" }),
    );
    expect(
      mocks.api.mock.calls.some(
        ([path, options]) =>
          path.endsWith("/whatsapp-sent") && options?.method === "POST",
      ),
    ).toBe(true);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
  it("recusa mostra a mensagem desejada sem pedir confirmação de presença", async () => {
    mocks.api.mockResolvedValue(fixture("RECUSA"));
    render(
      <DecisionNotice organizationId="org" registrationId="registration" />,
    );
    await screen.findByRole("heading", { name: "Aviso de recusa" });
    await userEvent.click(screen.getByRole("button", { name: "Ver mensagem" }));
    expect(screen.getByText(/Não foi dessa vez!/)).toBeVisible();
    expect(
      screen.queryByText(/Aguardando o candidato confirmar presença/),
    ).not.toBeInTheDocument();
  });
  it("envio indisponível não aparece como enviado", async () => {
    const state = fixture();
    state.notice.emailStatus = "SEM_CONFIGURACAO";
    mocks.api.mockResolvedValue(state);
    render(
      <DecisionNotice organizationId="org" registrationId="registration" />,
    );
    expect(
      await screen.findByText("Envio de e-mail indisponível"),
    ).toBeVisible();
    expect(
      screen.queryByText("Enviado", { exact: true }),
    ).not.toBeInTheDocument();
  });
  it("renovar o link não envia e-mail nem mantém declaração pendente de WhatsApp", async () => {
    render(
      <DecisionNotice organizationId="org" registrationId="registration" />,
    );
    const link = await screen.findByRole("link", {
      name: "Abrir mensagem no WhatsApp",
    });
    await userEvent.click(link);
    await userEvent.click(screen.getByRole("button", { name: "Renovar link" }));
    expect(
      mocks.api.mock.calls.some(
        ([path, options]) =>
          path.endsWith("/renew") && options?.method === "POST",
      ),
    ).toBe(false);
    expect(
      screen.getByText(/o link anterior deixará de funcionar/),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar renovação" }),
    );
    expect(mocks.api).toHaveBeenCalledWith(expect.stringContaining("/renew"), {
      method: "POST",
    });
    expect(
      screen.queryByRole("button", {
        name: "Marcar como enviado pelo WhatsApp",
      }),
    ).not.toBeInTheDocument();
    expect(
      mocks.api.mock.calls.some(
        ([path, options]) =>
          path.endsWith("/email") && options?.method === "POST",
      ),
    ).toBe(false);
  });
  it("falha ao copiar exige ação explícita antes de exibir o link para cópia manual", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("Clipboard bloqueado"),
    );
    const onError = vi.fn();
    render(
      <DecisionNotice
        organizationId="org"
        registrationId="registration"
        onError={onError}
        embedded
      />,
    );
    await user.click(
      await screen.findByRole("button", { name: "Copiar link do candidato" }),
    );
    expect(onError).toHaveBeenCalledWith(
      "Não foi possível copiar automaticamente o link.",
    );
    expect(
      screen.queryByRole("textbox", { name: "Link do candidato" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Exibir link para copiar manualmente",
      }),
    );
    expect(
      screen.getByRole("textbox", { name: "Link do candidato" }),
    ).toHaveValue(fixture().notice.link);
    expect(
      screen.queryByRole("heading", { name: "Aviso de aceite e presença" }),
    ).not.toBeInTheDocument();
  });
  it("cancelar renovação não altera aviso e notifica estado ao resumo sem repetir consultas", async () => {
    const onStateChange = vi.fn();
    render(
      <DecisionNotice
        organizationId="org"
        registrationId="registration"
        onStateChange={onStateChange}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Renovar link" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Manter link atual" }),
    );
    expect(onStateChange).toHaveBeenCalledWith(fixture());
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
  it("e-mail só é enviado ao acionar seu botão e atualiza a lista", async () => {
    const state = fixture();
    const withEmail = {
      ...state,
      notice: {
        ...state.notice,
        email: "candidato@example.test",
        emailStatus: "PENDENTE",
      },
    };
    mocks.api.mockResolvedValueOnce(withEmail).mockResolvedValueOnce({
      ...withEmail,
      notice: {
        ...withEmail.notice,
        emailStatus: "ENVIADA",
        emailSentAt: "2026-11-11T12:00:00Z",
      },
    });
    const onChanged = vi.fn();
    render(
      <DecisionNotice
        organizationId="org"
        registrationId="registration"
        onChanged={onChanged}
      />,
    );
    await screen.findByRole("button", { name: "Enviar por e-mail" });
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar por e-mail" }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Enviado", { exact: true })).toBeVisible();
  });
});
