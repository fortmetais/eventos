import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { RegistrationDetail } from "./RegistrationDetail";
import { Modal } from "./Modal";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  team: null as { id: string; name: string } | null,
}));
vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ eventsEnabled: true }) }));
vi.mock("../pages/Organization", () => ({
  useOrganization: () => ({ membership: { role: "ORGANIZER" } }),
}));
vi.mock("./GuardianNotice", () => ({
  GuardianNotice: () => <p>Autorização preservada</p>,
}));
vi.mock("./DecisionNotice", () => ({ DecisionNotice: () => null }));
vi.mock("../lib/hooks", () => ({
  useRemote: (path: string) => ({
    loading: false,
    error: "",
    refresh: mocks.refresh,
    data: path.endsWith("/events")
      ? [
          {
            id: "event",
            teams: [
              { id: "team", name: "SECRETARIA", available: 0, capacity: 1 },
            ],
          },
        ]
      : {
          id: "candidate",
          protocol: "INS-2026-TESTE",
          status: "RECEIVED",
          origin: "PUBLIC_FORM",
          accountId: "account",
          team: mocks.team,
          person: { name: "Maria Teste" },
          snapshot: {
            name: "Maria Teste",
            birthDate: "2000-01-01",
            phone: "44999999999",
            photoAssetId: "photo",
            answers: {},
          },
          history: [],
          campaign: {
            kind: "VOLUNTEER",
            allowWaitlist: true,
            event: {
              id: "event",
              name: "Evento Teste",
              startsAt: "2027-02-05",
            },
          },
        },
  }),
}));
afterEach(cleanup);
beforeEach(() => {
  mocks.api.mockReset();
  mocks.refresh.mockClear();
  mocks.team = null;
  mocks.api.mockResolvedValue({
    url: "https://example.test/photo.webp",
    status: "APPROVED",
  });
});

describe("Ficha completa extraída", () => {
  it("protege a decisão recém-selecionada quando Escape ocorre logo após a edição", async () => {
    const close = vi.fn();
    function Fixture() {
      const [dirty, setDirty] = useState(false);
      return (
        <Modal title="Ficha do participante" dirty={dirty} onClose={close}>
          <RegistrationDetail
            organizationId="org"
            registrationId="candidate"
            onChanged={vi.fn()}
            onDirtyChange={setDirty}
          />
        </Modal>
      );
    }
    render(<Fixture />);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
      "APPROVED",
    );
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Continuar editando" }),
    );
    expect(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
    ).toHaveValue("APPROVED");
    expect(close).not.toHaveBeenCalled();
  });
  it("não sinaliza alteração ao carregar departamento já salvo", () => {
    mocks.team = { id: "team", name: "SECRETARIA" };
    const onDirtyChange = vi.fn();
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Alocar em departamento" }),
    ).toHaveValue("team");
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });
  it("preserva identificação, foto autenticada e autorização sem consultar saúde", async () => {
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Maria Teste" })).toBeVisible();
    expect(
      await screen.findByRole("img", { name: "Foto de Maria Teste" }),
    ).toHaveAttribute("src", "https://example.test/photo.webp");
    expect(screen.getByText("Autorização preservada")).toBeVisible();
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/candidate/photo",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(
      mocks.api.mock.calls.some(([path]) => path.endsWith("/health")),
    ).toBe(false);
  });

  it("permite aceitar recebida com motivo padrão e informa edições não salvas", async () => {
    const onDirtyChange = vi.fn();
    const onChanged = vi.fn();
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={onChanged}
        onDirtyChange={onDirtyChange}
      />,
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Decisão sobre a candidatura" }),
      "APPROVED",
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar decisão" }),
    );
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/candidate/status",
      expect.objectContaining({
        method: "PATCH",
        body: {
          status: "APPROVED",
          reason: expect.stringContaining("pela organização"),
        },
      }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("permite indicar departamento lotado antes da aprovação, sem alegar reserva", async () => {
    const onChanged = vi.fn();
    render(
      <RegistrationDetail
        organizationId="org"
        registrationId="candidate"
        onChanged={onChanged}
      />,
    );
    const department = screen.getByRole("combobox", {
      name: "Alocar em departamento",
    });
    await userEvent.selectOptions(department, "team");
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar departamento" }),
    );
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/candidate/team",
      { method: "PUT", body: { teamId: "team" } },
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
