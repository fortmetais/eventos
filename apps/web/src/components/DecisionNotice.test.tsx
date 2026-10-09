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
afterEach(cleanup);
describe("Aviso ao candidato", () => {
  it("abrir mensagem não declara envio; registro exige ação explícita", async () => {
    render(
      <DecisionNotice organizationId="org" registrationId="registration" />,
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
    await userEvent.click(
      screen.getByRole("button", { name: "Marcar como enviado pelo WhatsApp" }),
    );
    expect(
      mocks.api.mock.calls.some(
        ([path, options]) =>
          path.endsWith("/whatsapp-sent") && options?.method === "POST",
      ),
    ).toBe(true);
  });
  it("recusa mostra a mensagem desejada sem pedir confirmação de presença", async () => {
    mocks.api.mockResolvedValue(fixture("RECUSA"));
    render(
      <DecisionNotice organizationId="org" registrationId="registration" />,
    );
    await screen.findByRole("heading", { name: "Aviso de recusa" });
    await userEvent.click(screen.getByText("Mensagem para o candidato"));
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
});
