import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemporaryInvitationAccess } from "./TemporaryInvitationAccess";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
const action = "Liberar acesso com senha temporária";
const acknowledgement =
  "Entendo que a senha atual será substituída, as sessões serão encerradas e a confirmação por e-mail será dispensada.";
const result = {
  email: "convidado@example.test",
  temporaryPassword: "Temporaria-de-teste-938!",
  loginUrl:
    "https://encontro.example/entrar?modo=senha&next=%2Fconvite%2Fteste",
  mustChangePassword: true,
  emailsSent: false,
};
const firstId = "132fc144-8d2a-45d2-8bb9-1654bb3b5c0c";
const secondId = "9f62b144-28d7-4389-b77d-67ae37dadfab";
function view(disabled = false) {
  return render(
    <TemporaryInvitationAccess
      organizationId="org"
      invitationId="invitation"
      email={result.email}
      disabled={disabled}
    />,
  );
}
function fill(reason = "Destinatário solicitou ajuda para acessar.") {
  fireEvent.change(screen.getByLabelText(/Motivo da liberação/), {
    target: { value: reason },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }));
}
function submit() {
  fireEvent.submit(
    screen.getByRole("button", { name: "Liberar acesso" }).closest("form")!,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce(firstId)
    .mockReturnValue(secondId);
  mocks.api.mockResolvedValue(result);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Liberação administrativa de acesso temporário", () => {
  it("explica as consequências e exige motivo e confirmação explícita sem enviar ao abrir", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(screen.getByRole("dialog", { name: action })).toBeVisible();
    expect(
      screen.getByText(
        /A senha atual dessa conta será substituída e as sessões serão encerradas/,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/não aceita o convite automaticamente/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Liberar acesso" }),
    ).toBeDisabled();
    submit();
    expect(mocks.api).not.toHaveBeenCalled();
    fill("curto");
    submit();
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Motivo da liberação/), {
      target: { value: "x".repeat(501) },
    });
    submit();
    expect(mocks.api).not.toHaveBeenCalled();
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("mantém o mesmo identificador ao repetir após erro e impede envio duplicado", async () => {
    let resolve!: (data: typeof result) => void;
    mocks.api
      .mockRejectedValueOnce(new Error("detalhe interno secreto"))
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
    view();
    fireEvent.click(screen.getByRole("button", { name: action }));
    fill();
    submit();
    await screen.findByText(/Não foi possível concluir a liberação/);
    expect(
      screen.queryByText(/detalhe interno secreto/),
    ).not.toBeInTheDocument();
    submit();
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Liberando acesso…" })
        .closest("form")!,
    );
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Fechar janela" }),
    ).toBeDisabled();
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    for (const [path, options] of mocks.api.mock.calls) {
      expect(path).toBe(
        "/admin/organizations/org/invitations/invitation/temporary-access",
      );
      expect(options).toEqual(
        expect.objectContaining({
          method: "POST",
          body: {
            reason: "Destinatário solicitou ajuda para acessar.",
            acknowledgeEmailBypass: true,
            requestId: firstId,
          },
          signal: expect.any(AbortSignal),
        }),
      );
    }
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(result);
    });
    expect(
      await screen.findByDisplayValue(result.temporaryPassword),
    ).toBeVisible();
  });

  it("mostra e copia a credencial somente nesta janela, limpa ao fechar e cria nova operação ao reabrir", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    const storage = vi.spyOn(Storage.prototype, "setItem");
    view();
    const trigger = screen.getByRole("button", { name: action });
    await user.click(trigger);
    fill();
    submit();
    await screen.findByDisplayValue(result.temporaryPassword);
    expect(screen.getByLabelText("E-mail de acesso")).toHaveValue(result.email);
    expect(screen.getByLabelText("Link para entrar")).toHaveValue(
      result.loginUrl,
    );
    expect(screen.getByText(/Guarde a senha agora/)).toBeVisible();
    expect(
      screen.getByText(/Envie também o link do convite disponível na lista/),
    ).toBeVisible();
    expect(
      screen.getByText(/Acesso liberado.*Nenhum e-mail foi enviado/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Copiar senha" }));
    expect(write).toHaveBeenLastCalledWith(result.temporaryPassword);
    await user.click(screen.getByRole("button", { name: "Copiar instruções" }));
    expect(write).toHaveBeenLastCalledWith(
      expect.stringContaining(`Senha temporária: ${result.temporaryPassword}`),
    );
    expect(write).toHaveBeenLastCalledWith(
      expect.stringContaining(result.loginUrl),
    );
    expect(write).toHaveBeenLastCalledWith(
      expect.stringContaining(
        "Após criar sua senha pessoal, abra o link do convite fornecido pela organização para aceitar sua participação.",
      ),
    );
    expect(storage).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByDisplayValue(result.temporaryPassword),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByLabelText(/Motivo da liberação/)).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(
      screen.queryByDisplayValue(result.temporaryPassword),
    ).not.toBeInTheDocument();
    fill();
    submit();
    await screen.findByDisplayValue(result.temporaryPassword);
    expect(mocks.api.mock.calls[1][1].body.requestId).toBe(secondId);
  });

  it.each([
    [
      409,
      "TEMPORARY_ACCESS_ALREADY_GRANTED",
      /Esta operação pode já ter sido aplicada/,
    ],
    [
      409,
      "TEMPORARY_ACCESS_IN_PROGRESS",
      /Já existe uma liberação em andamento/,
    ],
    [
      503,
      "TEMPORARY_ACCESS_POSSIBLY_APPLIED",
      /A liberação pode ter sido aplicada/,
    ],
    [
      403,
      "TEMPORARY_ACCESS_PROTECTED_ACCOUNT",
      /não permite liberar a própria conta/,
    ],
    [
      410,
      "INVITATION_NOT_PENDING",
      /Este convite já não está pendente ou válido/,
    ],
  ])(
    "orienta sobre %s %s e impede nova tentativa na mesma operação",
    async (status, code, text) => {
      mocks.api.mockRejectedValue({
        status,
        code,
        message: "mensagem interna",
      });
      view();
      fireEvent.click(screen.getByRole("button", { name: action }));
      fill();
      submit();
      await screen.findByText(text);
      expect(
        screen.getByRole("button", { name: "Liberar acesso" }),
      ).toBeDisabled();
      submit();
      expect(mocks.api).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
    },
  );

  it("não classifica qualquer conflito como senha já gerada", async () => {
    mocks.api.mockRejectedValue({ status: 409, code: "OTHER_CONFLICT" });
    view();
    fireEvent.click(screen.getByRole("button", { name: action }));
    fill();
    submit();
    await screen.findByText(/Não foi possível concluir a liberação/);
    expect(
      screen.getByRole("button", { name: "Liberar acesso" }),
    ).toBeEnabled();
  });

  it("oferece seleção manual quando a cópia está bloqueada", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("bloqueado"),
    );
    view();
    await user.click(screen.getByRole("button", { name: action }));
    fill();
    submit();
    await screen.findByDisplayValue(result.temporaryPassword);
    await user.click(screen.getByRole("button", { name: "Copiar senha" }));
    await screen.findByText(/Selecione os dados exibidos nesta janela/);
    expect(screen.getByLabelText("Senha temporária")).toHaveValue(
      result.temporaryPassword,
    );
  });

  it("cancela a consulta ao desmontar e ignora credenciais tardias", async () => {
    let resolve!: (data: typeof result) => void;
    mocks.api.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const rendered = view();
    fireEvent.click(screen.getByRole("button", { name: action }));
    fill();
    submit();
    const signal = mocks.api.mock.calls[0][1].signal as AbortSignal;
    rendered.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolve(result);
    });
    expect(
      screen.queryByDisplayValue(result.temporaryPassword),
    ).not.toBeInTheDocument();
  });

  it("respeita indisponibilidade da ação durante outra alteração", () => {
    view(true);
    expect(screen.getByRole("button", { name: action })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
