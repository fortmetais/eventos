import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "../lib/auth";
import type { Access } from "../lib/types";
import { Explore } from "./Explore";
import { Login, NewPassword } from "./Login";
import { Invitation } from "./Organization";
import { Layout } from "../components/Layout";
import { pendingInvitation } from "../lib/navigation";

const mocks = vi.hoisted(() => ({ useAuth: vi.fn(), api: vi.fn() }));
vi.mock("../lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("../lib/api", () => ({ api: mocks.api }));

const token = "a".repeat(43);
const invitationPath = `/convite/${token}`;
const session = {
  user: { id: "user", email: "organizador@example.com" },
} as Session;
function access(ids: string[] = [], admin = false): Access {
  return {
    account: {
      id: "user",
      email: session.user.email!,
      platformAdmin: admin,
      profile: {},
    },
    organizations: ids.map((id) => ({
      id: `member-${id}`,
      organizationId: id,
      accountId: "user",
      role: "ORGANIZER",
      active: true,
      healthEventIds: [],
      organization: {
        id,
        name: `Paróquia ${id}`,
        city: "Toledo",
        state: "PR",
        kind: "PARISH",
        active: true,
      },
    })),
  };
}
function authState(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  const state: ReturnType<typeof useAuth> = {
    client: null,
    session: null,
    access: null,
    loading: false,
    error: "",
    eventsEnabled: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    ...overrides,
  };
  mocks.useAuth.mockReturnValue(state);
  return state;
}
function OrganizationPanel() {
  return <h1>Painel da organização {useParams().organizationId}</h1>;
}
function Flow({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Explore />} />
          <Route path="/entrar" element={<Login />} />
          <Route path="/nova-senha" element={<NewPassword />} />
          <Route path="/convite/:token" element={<Invitation />} />
          <Route
            path="/organizacao/:organizationId"
            element={<OrganizationPanel />}
          />
          <Route
            path="/organizacao"
            element={<h1>Selecionar organização</h1>}
          />
          <Route path="/admin" element={<h1>Administração da plataforma</h1>} />
          <Route path="/meu-perfil" element={<h1>Perfil pessoal</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.resetAllMocks();
  authState();
});
afterEach(cleanup);

describe("Entrada de organizadores", () => {
  it("abre o painel do único vínculo ao visitar o início", async () => {
    authState({ session, access: access(["a"]) });
    render(<Flow path="/" />);
    expect(
      await screen.findByRole("heading", { name: "Painel da organização a" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Comece pela sua comunidade."),
    ).not.toBeInTheDocument();
  });
  it("oferece seleção apenas quando há vários vínculos", async () => {
    authState({ session, access: access(["a", "b"]) });
    render(<Flow path="/" />);
    expect(
      await screen.findByRole("heading", { name: "Selecionar organização" }),
    ).toBeInTheDocument();
  });
  it("mantém o cadastro de paróquias na entrada do administrador da plataforma", () => {
    authState({ session, access: access([], true) });
    render(<Flow path="/" />);
    expect(
      screen.getByRole("heading", { name: "Comece pela sua comunidade." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Administrar organizações" }),
    ).toHaveAttribute("href", "/admin");
  });
  it("orienta uma conta sem vínculo a aceitar seu convite sem oferecer cadastro de paróquias", () => {
    authState({ session, access: access() });
    render(<Flow path="/" />);
    expect(
      screen.getByText(/abra o link do convite recebido/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cadastre as paróquias/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Minhas organizações" }),
    ).not.toBeInTheDocument();
  });
  it("retoma o convite na mesma aba quando o link de acesso volta ao início", async () => {
    const view = render(<Flow path={invitationPath} />);
    expect(
      screen.getByRole("link", { name: "Entrar para aceitar" }),
    ).toHaveAttribute(
      "href",
      `/entrar?next=${encodeURIComponent(invitationPath)}`,
    );
    view.unmount();
    authState({ session, access: access() });
    render(<Flow path="/" />);
    expect(
      await screen.findByRole("heading", { name: "Você recebeu um convite" }),
    ).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
    expect(pendingInvitation()).toBe(invitationPath);
  });
  it("envia o retorno ao convite junto ao pedido de acesso por e-mail", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    authState({
      client: { auth: { signInWithOtp } } as unknown as SupabaseClient,
    });
    render(
      <Flow path={`/entrar?next=${encodeURIComponent(invitationPath)}`} />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("textbox", { name: /Seu e-mail/ }),
      session.user.email!,
    );
    await user.click(
      screen.getByRole("button", { name: /Receber acesso por e-mail/ }),
    );
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: session.user.email,
      options: {
        emailRedirectTo: `${window.location.origin}/entrar?next=${encodeURIComponent(invitationPath)}`,
      },
    });
    expect(
      await screen.findByText(/Abra o link de acesso recebido/),
    ).toBeInTheDocument();
  });
  it("retorna ao convite após o primeiro acesso confirmado em outra aba", async () => {
    const view = render(<Flow path={invitationPath} />);
    view.unmount();
    // A aba do e-mail não compartilha sessionStorage; a conta ainda não tem vínculos.
    sessionStorage.clear();
    authState({ session, access: access(), eventsEnabled: true });
    render(<Flow path="/" />);
    expect(
      await screen.findByRole("button", { name: "Aceitar convite" }),
    ).toBeInTheDocument();
    expect(pendingInvitation()).toBe(invitationPath);
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("retoma o convite quando a conclusão do cadastro leva inicialmente à área pessoal", async () => {
    const view = render(<Flow path={invitationPath} />);
    view.unmount();
    authState({ session, access: access() });
    render(<Flow path="/meu-perfil" />);
    expect(
      await screen.findByRole("button", { name: "Aceitar convite" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Perfil pessoal" }),
    ).not.toBeInTheDocument();
  });
  it("preserva o convite no e-mail de definição de senha", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    authState({
      client: { auth: { resetPasswordForEmail } } as unknown as SupabaseClient,
    });
    render(
      <Flow path={`/entrar?next=${encodeURIComponent(invitationPath)}`} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Entrar com senha" }));
    await user.click(
      screen.getByRole("button", { name: "Esqueci minha senha" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /Seu e-mail/ }),
      session.user.email!,
    );
    await user.click(screen.getByRole("button", { name: "Enviar instruções" }));
    expect(resetPasswordForEmail).toHaveBeenCalledWith(session.user.email, {
      redirectTo: `${window.location.origin}/nova-senha?next=${encodeURIComponent(invitationPath)}`,
    });
    expect(pendingInvitation()).toBe(invitationPath);
  });
  it("volta ao convite depois de salvar a senha em um navegador sem contexto anterior", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    authState({
      session,
      access: access(),
      client: { auth: { updateUser } } as unknown as SupabaseClient,
    });
    render(
      <Flow path={`/nova-senha?next=${encodeURIComponent(invitationPath)}`} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Nova senha"), "senha-nova-do-teste");
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));
    expect(updateUser).toHaveBeenCalledWith({
      password: "senha-nova-do-teste",
    });
    expect(
      await screen.findByRole("button", { name: "Aceitar convite" }),
    ).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("permite continuar depois e remove o retorno pendente", async () => {
    authState({ session, access: access() });
    render(<Flow path={invitationPath} />);
    await userEvent
      .setup()
      .click(screen.getByRole("link", { name: "Continuar depois" }));
    expect(
      await screen.findByRole("heading", { name: "Bem-vindo ao Encontro." }),
    ).toBeInTheDocument();
    expect(pendingInvitation()).toBeNull();
    expect(sessionStorage.getItem("encontro.pendingInvitation")).toBeNull();
    expect(localStorage.getItem("encontro.pendingInvitation")).toBeNull();
  });
  it("aguarda as permissões após entrar com senha e volta ao convite sem aceitá-lo automaticamente", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    const auth = authState({
      client: { auth: { signInWithPassword } } as unknown as SupabaseClient,
    });
    const path = `/entrar?next=${encodeURIComponent(invitationPath)}`;
    const view = render(<Flow path={path} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Entrar com senha" }));
    await user.type(
      screen.getByRole("textbox", { name: /Seu e-mail/ }),
      session.user.email!,
    );
    await user.type(screen.getByLabelText(/^Senha/), "senha-apenas-do-teste");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled());
    mocks.useAuth.mockReturnValue({ ...auth, session, access: null });
    view.rerender(<Flow path={path} />);
    expect(
      screen.queryByRole("button", { name: "Aceitar convite" }),
    ).not.toBeInTheDocument();
    mocks.useAuth.mockReturnValue({ ...auth, session, access: access() });
    view.rerender(<Flow path={path} />);
    expect(
      await screen.findByRole("button", { name: "Aceitar convite" }),
    ).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("abre a organização que enviou o convite mesmo quando já existe outro vínculo", async () => {
    const auth = authState({ session, access: access(["a"]) });
    auth.refresh = vi.fn().mockImplementation(async () => {
      mocks.useAuth.mockReturnValue({ ...auth, access: access(["a", "b"]) });
    });
    mocks.api.mockResolvedValue({ organizationId: "b" });
    render(<Flow path={invitationPath} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Aceitar convite" }));
    expect(mocks.api).toHaveBeenCalledWith(`/invitations/${token}/accept`, {
      method: "POST",
    });
    expect(
      await screen.findByRole("heading", { name: "Painel da organização b" }),
    ).toBeInTheDocument();
    expect(auth.refresh).toHaveBeenCalledOnce();
    expect(pendingInvitation()).toBeNull();
  });
  it("mantém a recusa do servidor ao tentar aceitar com outro e-mail", async () => {
    authState({ session, access: access() });
    mocks.api.mockRejectedValue(
      new Error("Entre com o e-mail que recebeu o convite."),
    );
    render(<Flow path={invitationPath} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Aceitar convite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Entre com o e-mail que recebeu o convite.",
    );
    expect(screen.queryByText(/Painel da organização/)).not.toBeInTheDocument();
  });
  it.each([
    "https://outro.example",
    "//outro.example",
    "/\\outro.example",
    "/entrar",
  ])("recusa retorno externo ou circular: %s", async (next) => {
    authState({ session, access: access(["a"]) });
    render(<Flow path={`/entrar?next=${encodeURIComponent(next)}`} />);
    expect(
      await screen.findByRole("heading", { name: "Painel da organização a" }),
    ).toBeInTheDocument();
  });
});
