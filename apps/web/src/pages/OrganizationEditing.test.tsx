import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OrganizationDashboard, OrganizationLayout } from "./Organization";
import type { Access, Role } from "../lib/types";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  useAuth: vi.fn(),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mocks.api,
}));
vi.mock("../lib/auth", () => ({ useAuth: mocks.useAuth }));
const organization = {
  id: "org-a",
  name: "Comunidade teste",
  kind: "COMMUNITY" as const,
  city: "Loanda",
  state: "PR",
  contact: "Contato teste",
  active: true,
  cnpj: "12345678000195",
  postalCode: "87900000",
  street: "Rua teste",
  logoUrl: "https://test.invalid/logo.webp",
};
function view(role: Role = "ORGANIZER", eventManagementEnabled = true) {
  const access: Access = {
    account: {
      id: "user",
      email: "user@test.invalid",
      platformAdmin: false,
      profile: {},
    },
    organizations: [
      {
        id: "member-a",
        organizationId: organization.id,
        accountId: "user",
        role,
        active: true,
        healthEventIds: [],
        organization,
      },
    ],
  };
  mocks.useAuth.mockReturnValue({
    access,
    refresh: mocks.refresh,
    eventsEnabled: false,
    eventManagementEnabled,
  });
  render(
    <MemoryRouter initialEntries={["/organizacao/org-a"]}>
      <Routes>
        <Route
          path="/organizacao/:organizationId"
          element={<OrganizationLayout />}
        >
          <Route index element={<OrganizationDashboard />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  mocks.api.mockReset();
  mocks.refresh.mockReset();
  mocks.api.mockResolvedValue(organization);
  mocks.refresh.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => "blob:logo-test");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("Edição da própria organização", () => {
  it.each([true, false])(
    "abre, salva os dados e atualiza o acesso (preparação de eventos: %s)",
    async (preparation) => {
      view("ORGANIZER", preparation);
      await userEvent.click(
        screen.getByRole("button", { name: "Editar informações" }),
      );
      expect(screen.getByLabelText("CNPJ")).toHaveValue("12.345.678/0001-95");
      expect(screen.getByLabelText("CEP")).toHaveValue("87900-000");
      expect(
        screen.queryByLabelText("Organização ativa"),
      ).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(/Rua \/ avenida/), {
        target: { value: "Nova rua" },
      });
      await userEvent.upload(
        screen.getByLabelText(/Arquivo do logotipo/),
        new File(["png"], "logo.png", { type: "image/png" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Salvar organização" }),
      );
      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
      const [path, options] = mocks.api.mock.calls[0];
      expect(path).toBe("/organizations/org-a");
      expect(options.method).toBe("PUT");
      expect(options.body).toBeInstanceOf(FormData);
      const payload = JSON.parse(options.body.get("data"));
      expect(payload).toMatchObject({
        street: "Nova rua",
        cnpj: "12.345.678/0001-95",
        postalCode: "87900-000",
      });
      expect(payload).not.toHaveProperty("active");
      expect(
        screen.getByRole("button", { name: "Editar informações" }),
      ).toBeInTheDocument();
    },
  );
  it.each(["SECRETARY", "HEALTH"] as const)(
    "não oferece edição para o perfil %s",
    (role) => {
      view(role);
      expect(
        screen.queryByRole("button", { name: "Editar informações" }),
      ).not.toBeInTheDocument();
    },
  );
  it("preserva o formulário após falha e permite cancelar sem salvar", async () => {
    mocks.api.mockRejectedValueOnce(new Error("Falha ao salvar."));
    view();
    await userEvent.click(
      screen.getByRole("button", { name: "Editar informações" }),
    );
    fireEvent.change(screen.getByLabelText(/Nome \*/), {
      target: { value: "Novo nome" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar organização" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao salvar.",
    );
    expect(screen.getByLabelText(/Nome \*/)).toHaveValue("Novo nome");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(
      screen.getByRole("button", { name: "Editar informações" }),
    ).toBeInTheDocument();
  });
});
