import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { NewPassword } from "./NewPassword";
import { pendingInvitation } from "../lib/navigation";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  updateUser: vi.fn(),
  api: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("../lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
const token = "a".repeat(43);
const invitation = `/convite/${token}`;
const password = "senha-de-teste-com-12";
function Destination() {
  return <p>Destino: {useLocation().pathname}</p>;
}
function view(path = "/nova-senha") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/nova-senha" element={<NewPassword />} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
}
function fill(first = password, second = first) {
  fireEvent.change(screen.getByLabelText("Nova senha"), {
    target: { value: first },
  });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
    target: { value: second },
  });
}
function submit() {
  fireEvent.submit(
    screen.getByRole("button", { name: "Salvar senha" }).closest("form")!,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.api.mockResolvedValue({ passwordChanged: true, signInAgain: true });
  mocks.logout.mockResolvedValue(undefined);
  mocks.useAuth.mockReturnValue({
    client: { auth: { updateUser: mocks.updateUser } },
    session: { user: { id: "user", email: "pessoa@example.test" } },
    access: {},
    loading: false,
    error: "",
    logout: mocks.logout,
  });
});
afterEach(cleanup);

describe("Definição de senha", () => {
  it("troca obrigatória usa a API autenticada e exige novo login antes do convite", async () => {
    const auth = mocks.useAuth();
    mocks.useAuth.mockReturnValue({
      ...auth,
      access: { passwordChangeRequired: true },
    });
    view(`/nova-senha?next=${encodeURIComponent(invitation)}`);
    expect(screen.getByText(/substitua a senha temporária/)).toBeVisible();
    fill();
    submit();
    await screen.findByRole("heading", { name: "Senha atualizada" });
    expect(mocks.api).toHaveBeenCalledWith("/me/first-password", {
      method: "POST",
      body: { password },
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("link", { name: "Entrar com a nova senha" }),
    ).toHaveAttribute(
      "href",
      `/entrar?modo=senha&next=${encodeURIComponent(invitation)}`,
    );
    expect(
      screen.queryByText(`Destino: ${invitation}`),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });
  it("aguarda o encerramento da sessão antes de oferecer novo login", async () => {
    let finishLogout: () => void = () => {};
    mocks.logout.mockReturnValue(
      new Promise<void>((resolve) => {
        finishLogout = resolve;
      }),
    );
    mocks.useAuth.mockReturnValue({
      ...mocks.useAuth(),
      access: { passwordChangeRequired: true },
    });
    view(`/nova-senha?next=${encodeURIComponent(invitation)}`);
    fill();
    submit();
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("link", { name: "Entrar com a nova senha" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Salvando senha…" }),
    ).toBeDisabled();
    await act(async () => {
      finishLogout();
    });
    expect(
      await screen.findByRole("link", { name: "Entrar com a nova senha" }),
    ).toHaveAttribute(
      "href",
      `/entrar?modo=senha&next=${encodeURIComponent(invitation)}`,
    );
  });
  it("mantém a troca obrigatória quando a API não permite salvar", async () => {
    mocks.useAuth.mockReturnValue({
      ...mocks.useAuth(),
      access: { passwordChangeRequired: true },
    });
    mocks.api.mockRejectedValue(new Error("Falha controlada no teste"));
    view();
    fill();
    submit();
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("heading", { name: "Senha atualizada" }),
    ).not.toBeInTheDocument();
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("recusa senhas curtas e confirmação diferente sem chamar o provedor", () => {
    view();
    fill("curta");
    submit();
    expect(screen.getByText(/pelo menos 12 caracteres\./)).toBeVisible();
    fill(password, "outro-valor-de-confirmacao");
    submit();
    expect(screen.getByText("As senhas precisam ser iguais.")).toBeVisible();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("preserva exatamente a senha digitada e volta ao convite sem aceitá-lo", async () => {
    view(`/nova-senha?next=${encodeURIComponent(invitation)}`);
    fill("  senha-com-espacos  ");
    submit();
    expect(mocks.updateUser).toHaveBeenCalledWith({
      password: "  senha-com-espacos  ",
    });
    await screen.findByText(`Destino: ${invitation}`);
    expect(pendingInvitation()).toBe(invitation);
  });
  it("retoma convite salvo mesmo sem o parâmetro next", async () => {
    const { rememberInvitation } = await import("../lib/navigation");
    rememberInvitation(invitation);
    view();
    fill();
    submit();
    await screen.findByText(`Destino: ${invitation}`);
  });
  it("orienta login com retorno à definição da senha quando não há sessão", () => {
    mocks.useAuth.mockReturnValue({
      client: { auth: { updateUser: mocks.updateUser } },
      session: null,
      access: null,
      loading: false,
      error: "",
    });
    view(`/nova-senha?next=${encodeURIComponent(invitation)}`);
    expect(
      screen.getByText(/Entre com seu e-mail ou abra o link de recuperação/),
    ).toBeVisible();
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
    const login = screen.getByRole("link", {
      name: "Entrar para definir senha",
    });
    const url = new URL(login.getAttribute("href")!, "https://encontro.test");
    expect(url.pathname).toBe("/entrar");
    expect(url.searchParams.get("next")).toBe(
      `/nova-senha?next=${encodeURIComponent(invitation)}`,
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it.each(["https://fora.example/", "/nova-senha?next=/nova-senha"])(
    "não retorna a destino externo ou à própria página: %s",
    async (destination) => {
      view(`/nova-senha?next=${encodeURIComponent(destination)}`);
      fill();
      submit();
      await screen.findByText("Destino: /meu-perfil");
    },
  );
  it("bloqueia submissão duplicada enquanto salva", async () => {
    let finish: (value: { error: null }) => void = () => {};
    mocks.updateUser.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    view();
    fill();
    const form = screen
      .getByRole("button", { name: "Salvar senha" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Salvando senha…" }),
    ).toBeDisabled();
    await act(async () => {
      finish({ error: null });
    });
    await screen.findByText("Destino: /meu-perfil");
  });
  it("limpa os campos após salvar quando as permissões ainda não carregaram", async () => {
    const auth = mocks.useAuth();
    mocks.useAuth.mockReturnValue({ ...auth, access: null });
    view();
    fill();
    submit();
    await screen.findByText(/Senha salva\./);
    expect(screen.getByLabelText("Nova senha")).toHaveValue("");
    expect(screen.getByLabelText("Confirmar nova senha")).toHaveValue("");
  });
  it("mostra falha do provedor sem exibir dados internos", async () => {
    mocks.updateUser.mockResolvedValue({
      error: { message: "detalhe interno" },
    });
    view();
    fill();
    submit();
    await screen.findByText(/Não foi possível salvar a senha/);
    expect(screen.queryByText("detalhe interno")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar senha" })).toBeEnabled();
  });
  it("trata falha de rede e permite tentar novamente", async () => {
    mocks.updateUser.mockRejectedValue(new Error("falha interna"));
    view();
    fill();
    submit();
    await waitFor(() =>
      expect(screen.getByText(/Confira sua conexão/)).toBeVisible(),
    );
    expect(screen.queryByText("falha interna")).not.toBeInTheDocument();
  });
});
