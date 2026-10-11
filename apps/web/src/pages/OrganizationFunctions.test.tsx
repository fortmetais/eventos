import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OrganizationFunctions } from "./OrganizationFunctions";
import { Members } from "./Organization";

const mocks = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mocks.api,
}));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({
    refresh: mocks.refresh,
    access: { account: { platformAdmin: false } },
  }),
}));
const functions = [
  {
    id: "function-organizer",
    organizationId: "org-a",
    name: "Organizador",
    role: "ORGANIZER",
    defaultRole: "ORGANIZER",
    active: true,
    description: null,
    _count: { members: 1, invitations: 0 },
  },
  {
    id: "function-custom",
    organizationId: "org-a",
    name: "Coordenação de inscrições",
    role: "SECRETARY",
    active: true,
    description: "Acompanhar as candidaturas",
    _count: { members: 1, invitations: 1 },
  },
  {
    id: "function-inactive",
    organizationId: "org-a",
    name: "Saúde anterior",
    role: "HEALTH",
    active: false,
    description: null,
    _count: { members: 1, invitations: 0 },
  },
];
const member = {
  id: "member-a",
  organizationId: "org-a",
  role: "HEALTH",
  functionId: "function-inactive",
  function: functions[2],
  active: true,
  healthEventIds: ["event-a"],
  account: { email: "membro@example.test" },
};
const response = {
  functions,
  members: [member],
  events: [{ id: "event-a", name: "Evento autorizado" }],
  invitations: [
    {
      id: "invitation-a",
      email: "convite@example.test",
      role: "SECRETARY",
      functionId: "function-custom",
      function: functions[1],
      expiresAt: "2020-01-01",
      acceptedAt: null,
      revokedAt: null,
    },
  ],
};
beforeEach(() => {
  mocks.api.mockReset();
  mocks.refresh.mockReset();
  mocks.refresh.mockResolvedValue(undefined);
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.api.mockImplementation(async (path) =>
    path.endsWith("/functions") ? functions : response,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function view(page: "functions" | "members" = "functions") {
  render(
    <MemoryRouter initialEntries={["/organizations/org-a/" + page]}>
      <Routes>
        <Route
          path="/organizations/:organizationId/functions"
          element={<OrganizationFunctions />}
        />
        <Route
          path="/organizations/:organizationId/members"
          element={<Members />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
describe("Catálogo de funções", () => {
  it("cria função com nome, descrição e perfil de acesso", async () => {
    view();
    await userEvent.click(
      await screen.findByRole("button", { name: "Nova função" }),
    );
    await userEvent.type(
      screen.getByLabelText(/^Nome da função/),
      "Equipe de recepção",
    );
    await userEvent.type(
      screen.getByLabelText(/^Descrição/),
      "Acolhimento dos candidatos",
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/^Perfil de acesso/),
      "SECRETARY",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar função" }),
    );
    await screen.findByText(
      "Função salva. As funções ativas ficam disponíveis em Membros e convites.",
    );
    const call = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "POST",
    )!;
    expect(call[0]).toBe("/organizations/org-a/functions");
    expect(call[1].body).toEqual({
      name: "Equipe de recepção",
      description: "Acolhimento dos candidatos",
      role: "SECRETARY",
      active: true,
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });
  it("avisa o impacto da mudança e apresenta quantos vínculos foram atualizados", async () => {
    mocks.api.mockImplementation(async (_path, options) =>
      options?.method === "PUT"
        ? {
            ...functions[1],
            role: "HEALTH",
            affected: { members: 2, invitations: 3 },
          }
        : functions,
    );
    view();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Editar Coordenação de inscrições",
      }),
    );
    expect(
      screen.getByText(/Alterar o perfil atualiza todos os membros/),
    ).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText(/^Perfil de acesso/),
      "HEALTH",
    );
    expect(
      screen.getByText(/Consulta saúde somente nos eventos autorizados/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar função" }),
    );
    await screen.findByText(/Perfil aplicado a 2 membro\(s\) e 3 convite\(s\)/);
    const call = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    )!;
    expect(call[0]).toBe("/organizations/org-a/functions/function-custom");
    expect(call[1].body.role).toBe("HEALTH");
  });
  it("erro de último organizador mantém o formulário; envio em andamento bloqueia novas ações", async () => {
    let reject: (e: Error) => void = () => {};
    mocks.api.mockImplementation(async (_path, options) =>
      options?.method === "PUT"
        ? new Promise((_resolve, fail) => {
            reject = fail;
          })
        : functions,
    );
    view();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Editar Organizador",
      }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/^Perfil de acesso/),
      "SECRETARY",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar função" }),
    );
    expect(screen.getByRole("button", { name: "Nova função" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Cancelar edição" }),
    ).toBeDisabled();
    reject(new Error("Mantenha pelo menos um organizador ativo."));
    await screen.findByRole("alert");
    expect(screen.getByLabelText(/^Nome da função/)).toHaveValue("Organizador");
    expect(screen.getByLabelText(/^Perfil de acesso/)).toHaveValue("SECRETARY");
  });
  it("inativa sem excluir o histórico e permite reativar pela edição", async () => {
    view();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Inativar Coordenação de inscrições",
      }),
    );
    await screen.findByText(
      /Função inativada. Membros vinculados mantêm o acesso/,
    );
    expect(
      mocks.api.mock.calls.some(
        ([path, options]) =>
          path.endsWith("/function-custom") && options?.method === "DELETE",
      ),
    ).toBe(true);
    await userEvent.click(
      await screen.findByRole("button", { name: "Editar Saúde anterior" }),
    );
    expect(
      screen.getByRole("checkbox", {
        name: "Disponível para novos membros e convites",
      }),
    ).not.toBeChecked();
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Disponível para novos membros e convites",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar função" }),
    );
    await screen.findByText(
      "Função salva. As funções ativas ficam disponíveis em Membros e convites.",
    );
    expect(
      mocks.api.mock.calls.find(([, options]) => options?.method === "PUT")?.[1]
        .body.active,
    ).toBe(true);
  });
});
describe("Funções em membros e convites", () => {
  it("convite usa ID da função ativa e mostra o nome personalizado", async () => {
    mocks.api.mockImplementation(async (_path, options) =>
      options?.method === "POST" ? { delivery: "sent" } : response,
    );
    view("members");
    await screen.findByText("membro@example.test");
    const selector = screen.getByLabelText(/^Função \*/);
    expect(
      within(selector).queryByRole("option", { name: /Saúde anterior/ }),
    ).not.toBeInTheDocument();
    await userEvent.selectOptions(selector, "function-custom");
    await userEvent.type(
      screen.getByLabelText(/^E-mail da pessoa/),
      "novo@example.test",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar convite" }),
    );
    await screen.findByText("Convite enviado por e-mail.");
    const call = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "POST",
    )!;
    expect(call[1].body).toEqual({
      email: "novo@example.test",
      functionId: "function-custom",
    });
    expect(
      screen.getByRole("link", { name: "Gerenciar funções" }),
    ).toHaveAttribute("href", "/organizacao/org-a/funcoes");
  });
  it("função inativa permanece no membro atual e mudança de perfil limpa autorizações anteriores", async () => {
    view("members");
    await userEvent.click(
      await screen.findByRole("button", { name: "Editar permissões" }),
    );
    const selector = screen.getByLabelText(/^Função do membro/);
    expect(selector).toHaveValue("function-inactive");
    expect(
      within(selector).getByRole("option", {
        name: /inativa \(vínculo atual\)/,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Evento autorizado" }),
    ).toBeChecked();
    await userEvent.selectOptions(selector, "function-custom");
    expect(
      screen.getByRole("checkbox", { name: "Evento autorizado" }),
    ).not.toBeChecked();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar permissões" }),
    );
    const call = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "PATCH",
    )!;
    expect(call[1].body).toEqual({
      functionId: "function-custom",
      active: true,
      healthEventIds: [],
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });
  it("sem funções ativas não permite enviar convite e orienta a cadastrar ou reativar", async () => {
    mocks.api.mockResolvedValue({ ...response, functions: [functions[2]] });
    view("members");
    await screen.findByText(/Cadastre ou reative uma função/);
    expect(
      screen.getByRole("button", { name: "Enviar convite" }),
    ).toBeDisabled();
  });
});
