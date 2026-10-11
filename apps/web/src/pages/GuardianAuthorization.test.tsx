import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { GuardianAuthorization } from "./GuardianAuthorization";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
const record = {
  id: "test",
  protocol: "INS-TEST",
  signedAt: null,
  expiresAt: "2027-01-01T12:00:00Z",
  signature: null,
  signedData: null,
  termsText: "Texto do termo para conferência",
  receiptHash: null,
  snapshot: {
    participantName: "Pessoa Menor",
    participantPhone: "44999999999",
    participantCpf: "",
    birthDate: "2012-01-01",
    participantCity: "Toledo",
    team: "Campista",
    guardianName: "Responsável",
    guardianPhone: "44999998888",
    guardianEmail: "",
    guardianRelationship: "Pai",
    familyName: "Contato Familiar",
    familyPhone: "44999997777",
    event: {
      name: "Evento Atual",
      organization: "Organização Atual",
      location: "Chácara",
      city: "Toledo",
      startsAt: "2027-01-01",
      endsAt: "2027-01-03",
    },
  },
  health: {
    hasMedication: false,
    medication: "",
    hasAllergies: false,
    allergies: "",
  },
};
beforeEach(() => {
  sessionStorage.clear();
  history.replaceState({}, "", `/#token=${"t".repeat(43)}`);
  mocks.api.mockReset();
  mocks.api.mockResolvedValue(record);
});
afterEach(cleanup);
const view = () =>
  render(
    <MemoryRouter initialEntries={["/autorizacao/test"]}>
      <Routes>
        <Route
          path="/autorizacao/:authorizationId"
          element={<GuardianAuthorization />}
        />
      </Routes>
    </MemoryRouter>,
  );
describe("Preenchimento do termo pelo responsável", () => {
  it("abrir não assina e apresenta campos, termo e desenho com imagem opcional", async () => {
    view();
    expect(await screen.findByText("Pessoa Menor")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Evento Atual" })).toBeVisible();
    expect(screen.getByLabelText(/CPF do responsável/)).toBeRequired();
    expect(
      screen.getByRole("img", { name: "Área para desenhar a assinatura" }),
    ).toBeVisible();
    expect(screen.getByLabelText(/Autorizo o uso de imagem/)).not.toBeChecked();
    expect(
      screen.getByLabelText(/Autorizo o uso de imagem/),
    ).not.toBeRequired();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api.mock.calls[0][0]).toMatch(/\/view$/);
    expect(location.hash).toBe("");
  });
  it("erro de link impede o formulário e não tenta assinar", async () => {
    mocks.api.mockRejectedValue(new Error("Este link expirou."));
    view();
    expect(await screen.findByText("Este link expirou.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Assinar e enviar autorização" }),
    ).not.toBeInTheDocument();
  });
  it("termo assinado mostra comprovante e preserva a recusa de imagem", async () => {
    mocks.api.mockResolvedValue({
      ...record,
      signedAt: "2026-10-09T12:00:00Z",
      signedData: {
        name: "Pai Teste",
        cpf: "52998224725",
        imageAuthorized: false,
        city: "Toledo",
      },
      signature: [
        [
          { x: 10, y: 10 },
          { x: 100, y: 100 },
        ],
      ],
      receiptHash: "abc123",
    });
    view();
    expect(await screen.findByText(/Termo assinado em/)).toBeVisible();
    expect(screen.getByText("Não autorizadas")).toBeVisible();
    expect(screen.getByText(/abc123/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Assinar e enviar autorização" }),
    ).not.toBeInTheDocument();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    await userEvent.click(
      screen.getByRole("button", { name: /salvar comprovante/ }),
    );
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });
});
