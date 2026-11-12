import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuardianNotice, type GuardianNoticeState } from "./GuardianNotice";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
beforeEach(() => {
  mocks.api.mockReset();
  mocks.api.mockResolvedValue(authorization());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function authorization(signed = false): GuardianNoticeState {
  return {
    ready: true,
    needsAuthorization: true,
    authorization: {
      id: "term",
      signedAt: signed ? "2026-11-11T12:00:00Z" : null,
      active: true,
      expired: false,
      expiresAt: "2027-01-01T12:00:00Z",
      emailStatus: "PENDENTE",
      email: "responsavel@example.test",
      link: "https://example.test/autorizacao/term#token=credencial",
      whatsappLink:
        "https://wa.me/5544999999999?text=Mensagem%20privada%20do%20responsavel",
      signature: signed
        ? [
            [
              { x: 20, y: 20 },
              { x: 100, y: 100 },
            ],
          ]
        : null,
      receiptHash: signed ? "f".repeat(64) : null,
      termsText: "Termo privado de autorização do evento",
      signedData: signed
        ? {
            name: "Responsável Teste",
            cpf: "52998224725",
            relationship: "Mãe",
            phone: "44999999999",
            email: "responsavel@example.test",
            city: "Loanda - PR",
            participantCity: "Loanda - PR",
            participantCpf: "",
            familyName: "Contato Familiar",
            familyPhone: "44999998888",
            medication: "",
            allergies: "",
            participationAccepted: true,
            responsibilityAccepted: true,
            privacyAccepted: true,
            imageAuthorized: false,
          }
        : null,
    },
  };
}

describe("Ações do aviso ao responsável", () => {
  it("padroniza ações sem registrar envio ao abrir WhatsApp nem expor link ou mensagem por padrão", async () => {
    const state = authorization();
    mocks.api.mockResolvedValue(state);
    const user = userEvent.setup();
    render(
      <GuardianNotice
        organizationId="org"
        registrationId="candidate"
        embedded
      />,
    );
    const whatsapp = await screen.findByRole("link", {
      name: "Enviar autorização pelo WhatsApp ao responsável",
    });
    expect(whatsapp).toHaveClass("review-whatsapp");
    expect(
      screen.queryByRole("heading", { name: "Autorização do responsável" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Mensagem privada do responsavel"),
    ).not.toBeInTheDocument();
    await user.click(whatsapp);
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    await user.click(screen.getByRole("button", { name: "Ver mensagem" }));
    expect(
      screen.getByRole("region", { name: "Mensagem para o responsável" }),
    ).toHaveTextContent("Mensagem privada do responsavel");
    await user.click(
      screen.getByRole("button", { name: "Copiar link do responsável" }),
    );
    expect(await navigator.clipboard.readText()).toBe(
      state.authorization!.link,
    );
  });
  it("expõe cópia manual só após falha e escolha explícita", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("Bloqueado"),
    );
    render(<GuardianNotice organizationId="org" registrationId="candidate" />);
    await user.click(
      await screen.findByRole("button", { name: "Copiar link do responsável" }),
    );
    expect(
      screen.queryByRole("textbox", { name: "Link do responsável" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Exibir link para copiar manualmente",
      }),
    );
    expect(
      screen.getByRole("textbox", { name: "Link do responsável" }),
    ).toHaveValue(authorization().authorization!.link);
  });
  it("exige confirmação ao renovar e permite manter o link sem enviar mensagens", async () => {
    const onStateChange = vi.fn(),
      onChanged = vi.fn();
    render(
      <GuardianNotice
        organizationId="org"
        registrationId="candidate"
        onStateChange={onStateChange}
        onChanged={onChanged}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Renovar link" }),
    );
    expect(
      screen.getByText(/o link anterior deixará de funcionar/),
    ).toBeVisible();
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    await userEvent.click(
      screen.getByRole("button", { name: "Manter link atual" }),
    );
    expect(mocks.api).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Renovar link" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar renovação" }),
    );
    expect(mocks.api).toHaveBeenCalledWith(
      expect.stringContaining("/guardian/renew"),
      { method: "POST" },
    );
    expect(onStateChange).toHaveBeenCalledWith(authorization());
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(mocks.api.mock.calls.some(([path]) => path.endsWith("/email"))).toBe(
      false,
    );
  });
  it("documento e assinatura só são montados ao consultar o termo", async () => {
    mocks.api.mockResolvedValue(authorization(true));
    render(<GuardianNotice organizationId="org" registrationId="candidate" />);
    const consult = await screen.findByRole("button", {
      name: "Consultar termo",
    });
    expect(screen.queryByText(/52998224725/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Termo privado de autorização do evento"),
    ).not.toBeInTheDocument();
    await userEvent.click(consult);
    expect(
      screen.getByRole("region", { name: "Termo e assinatura do responsável" }),
    ).toHaveTextContent("52998224725");
    expect(
      screen.getByText("Termo privado de autorização do evento"),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Ocultar termo" }),
    );
    expect(
      screen.queryByText("Termo privado de autorização do evento"),
    ).not.toBeInTheDocument();
  });
  it("envia e-mail apenas pela ação e reporta erros sem perder o estado consultado", async () => {
    const onBusyChange = vi.fn(),
      onError = vi.fn();
    mocks.api.mockImplementation(async (_path, options) => {
      if (options?.method === "POST")
        throw new Error("Falha simulada no envio");
      return authorization();
    });
    render(
      <GuardianNotice
        organizationId="org"
        registrationId="candidate"
        onBusyChange={onBusyChange}
        onError={onError}
      />,
    );
    const button = await screen.findByRole("button", {
      name: "Enviar por e-mail",
    });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    await userEvent.click(button);
    expect(await screen.findByText("Falha simulada no envio")).toBeVisible();
    expect(onError).toHaveBeenCalledWith("Falha simulada no envio");
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
});
