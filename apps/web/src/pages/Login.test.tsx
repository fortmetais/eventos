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
}));
vi.mock("../lib/auth", () => ({ useAuth: mocks.useAuth }));
function showLogin() {
  return render(
    <MemoryRouter>
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
