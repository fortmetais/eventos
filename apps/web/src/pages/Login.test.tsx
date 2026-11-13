import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Login } from "./Login";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  verifyOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
}));
vi.mock("../lib/auth", () => ({ useAuth: mocks.useAuth }));
function showLogin(path = "/entrar") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Login />
    </MemoryRouter>,
  );
}
async function submit(name = "Receber acesso por e-mail") {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  mocks.useAuth.mockReturnValue({
    client: { auth: mocks } as unknown as SupabaseClient,
    loading: false,
    session: null,
    access: null,
    error: "",
  });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({
    data: { user: { id: "new-user" }, session: null },
    error: null,
  });
  mocks.resend.mockResolvedValue({ error: null });
});

describe("Criar conta com senha e confirmar e-mail", () => {
  function fillSignup(password = "SenhaSegura1234", confirmation = password) {
    fireEvent.click(
      screen.getByRole("button", { name: "Criar conta com senha" }),
    );
    fireEvent.change(screen.getByLabelText(/Seu e-mail/), {
      target: { value: "Convidado@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^Criar senha/), {
      target: { value: password },
    });
    fireEvent.change(screen.getByLabelText(/^Confirmar senha/), {
      target: { value: confirmation },
    });
  }
  it("cadastra senha somente no envio explícito e preserva o convite na confirmação", async () => {
    const invitation = `/convite/${"a".repeat(43)}`;
    showLogin(`/entrar?next=${encodeURIComponent(invitation)}`);
    fillSignup();
    expect(mocks.signUp).not.toHaveBeenCalled();
    await submit("Criar conta e confirmar e-mail");
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "convidado@example.com",
      password: "SenhaSegura1234",
      options: {
        emailRedirectTo: `${window.location.origin}/entrar?next=${encodeURIComponent(invitation)}`,
      },
    });
    expect(
      screen.getByRole("heading", { name: "Confira seu e-mail" }),
    ).toBeVisible();
    expect(
      screen.getByText(/Confirme seu endereço para concluir o cadastro/),
    ).toBeVisible();
    expect(screen.queryByLabelText(/^Criar senha/)).not.toBeInTheDocument();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(JSON.stringify(localStorage)).not.toContain("SenhaSegura1234");
    expect(JSON.stringify(sessionStorage)).not.toContain("SenhaSegura1234");
  });
  it.each([
    ["curta", "curta", /pelo menos 12 caracteres/],
    ["SenhaSegura1234", "OutraSenha1234", /As senhas não coincidem/],
  ])(
    "valida a senha antes de chamar o provedor (%s)",
    async (password, confirmation, message) => {
      showLogin();
      fillSignup(password, confirmation);
      await act(async () => {
        fireEvent.submit(
          screen
            .getByRole("button", { name: "Criar conta e confirmar e-mail" })
            .closest("form")!,
        );
      });
      expect(screen.getByRole("alert")).toHaveTextContent(message);
      expect(mocks.signUp).not.toHaveBeenCalled();
    },
  );
  it("reenvia somente com clique após a pausa e conserva o tipo signup", async () => {
    showLogin();
    fillSignup();
    await submit("Criar conta e confirmar e-mail");
    expect(
      screen.getByRole("button", { name: "Solicitar novamente em 60 s" }),
    ).toBeDisabled();
    expect(mocks.resend).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    await submit("Reenviar confirmação");
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "convidado@example.com",
      options: { emailRedirectTo: `${window.location.origin}/entrar` },
    });
  });
  it("trata o limite de cadastro sem bloquear o login com senha existente", async () => {
    mocks.signUp.mockResolvedValue({ error: { status: 429 } });
    showLogin();
    fillSignup();
    await submit("Criar conta e confirmar e-mail");
    expect(screen.getByRole("alert")).toHaveTextContent(/atingiu um limite/);
    fireEvent.click(
      screen.getByRole("button", { name: "Já tenho conta: entrar com senha" }),
    );
    fireEvent.change(screen.getByLabelText(/^Senha/), {
      target: { value: "SenhaExistente123" },
    });
    await submit("Entrar");
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
  });
  it("ignora retornos externos e não expõe o erro bruto do provedor", async () => {
    mocks.signUp.mockResolvedValue({
      error: { code: "weak_password", message: "RAW PROVIDER ERROR" },
    });
    showLogin("/entrar?next=https%3A%2F%2Fexterno.invalid");
    fillSignup();
    await submit("Criar conta e confirmar e-mail");
    expect(mocks.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(
      `${window.location.origin}/entrar`,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Não foi possível criar a conta/,
    );
    expect(screen.queryByText("RAW PROVIDER ERROR")).not.toBeInTheDocument();
  });
  it("impede duas solicitações simultâneas de criação da conta", async () => {
    let finish!: (value: unknown) => void;
    mocks.signUp.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    showLogin();
    fillSignup();
    const form = screen
      .getByRole("button", { name: "Criar conta e confirmar e-mail" })
      .closest("form")!;
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ data: { session: null }, error: null });
    });
    expect(
      screen.getByRole("heading", { name: "Confira seu e-mail" }),
    ).toBeVisible();
  });
  it("orienta a confirmar o endereço sem reenviar automaticamente", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: { code: "email_not_confirmed" },
    });
    showLogin();
    fireEvent.click(screen.getByRole("button", { name: "Entrar com senha" }));
    fireEvent.change(screen.getByLabelText(/Seu e-mail/), {
      target: { value: "convidado@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^Senha/), {
      target: { value: "SenhaSegura1234" },
    });
    await submit("Entrar");
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Confirme seu e-mail antes/,
    );
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Limites de envio no login", () => {
  it("explica o 429, mantém a pausa ao recarregar e não tenta enviar automaticamente", async () => {
    mocks.signInWithOtp.mockResolvedValue({
      error: { status: 429, code: "over_email_send_rate_limit" },
    });
    showLogin();
    fireEvent.change(screen.getByLabelText(/Seu e-mail/), {
      target: { value: "teste@example.com" },
    });
    await submit();
    expect(
      screen.getByText(/atingiu um limite de solicitações/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Solicitar novamente em 60 s" }),
    ).toBeDisabled();
    cleanup();
    showLogin();
    expect(
      screen.getByRole("button", { name: "Solicitar novamente em 60 s" }),
    ).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(
      screen.getByRole("button", { name: "Receber acesso por e-mail" }),
    ).toBeEnabled();
    expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("permite entrar com senha durante a pausa de envio de e-mail", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: { status: 429 } });
    showLogin();
    fireEvent.change(screen.getByLabelText(/Seu e-mail/), {
      target: { value: "teste@example.com" },
    });
    await submit();
    fireEvent.click(screen.getByRole("button", { name: "Entrar com senha" }));
    fireEvent.change(screen.getByLabelText(/^Senha/), {
      target: { value: "uma-senha-de-teste" },
    });
    await submit("Entrar");
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "teste@example.com",
      password: "uma-senha-de-teste",
    });
    expect(screen.queryByText(/atingiu um limite/)).not.toBeInTheDocument();
  });

  it("permite validar o código recebido, mas evita reenvio imediato", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    showLogin();
    fireEvent.change(screen.getByLabelText(/Seu e-mail/), {
      target: { value: "teste@example.com" },
    });
    await submit();
    fireEvent.change(screen.getByLabelText(/Código de acesso/), {
      target: { value: "123456" },
    });
    await submit("Entrar");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      email: "teste@example.com",
      token: "123456",
      type: "email",
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Usar outro e-mail ou reenviar código",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Solicitar novamente em 60 s" }),
    ).toBeDisabled();
  });

  it("explica e limita também a recuperação de senha quando o provedor responde 429", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { status: 429 } });
    showLogin();
    fireEvent.change(screen.getByLabelText(/Seu e-mail/), {
      target: { value: "teste@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar com senha" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Esqueci minha senha" }),
    );
    await submit("Enviar instruções");
    expect(
      screen.getByText(/atingiu um limite de solicitações/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Solicitar novamente em 60 s" }),
    ).toBeDisabled();
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("não atribui outros erros de envio a um limite do serviço", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: { status: 500 } });
    showLogin();
    fireEvent.change(screen.getByLabelText(/Seu e-mail/), {
      target: { value: "teste@example.com" },
    });
    await submit();
    expect(
      screen.getByText(/Não foi possível enviar o e-mail de acesso/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Receber acesso por e-mail" }),
    ).toBeEnabled();
  });
});
