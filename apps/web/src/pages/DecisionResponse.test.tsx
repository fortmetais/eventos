import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DecisionResponse } from "./DecisionResponse";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mocks.api,
}));
const summary = {
  kind: "ACEITE",
  candidateName: "Pessoa",
  confirmedAt: null,
  expiresAt: "2027-05-25T18:00:00Z",
  event: {
    name: "FAC 2027",
    organization: "Paróquia de teste",
    startsAt: "2027-06-01",
    endsAt: "2027-06-03",
  },
};
beforeEach(() => {
  sessionStorage.clear();
  history.replaceState({}, "", `/#token=${"t".repeat(43)}`);
  mocks.api.mockReset();
  mocks.api.mockResolvedValue(summary);
});
afterEach(cleanup);
const view = () =>
  render(
    <MemoryRouter initialEntries={["/resposta/notice"]}>
      <Routes>
        <Route path="/resposta/:noticeId" element={<DecisionResponse />} />
      </Routes>
    </MemoryRouter>,
  );
describe("Resposta do candidato", () => {
  it("abrir link não confirma; botão envia resposta e conserva protocolo de confirmação", async () => {
    view();
    const button = await screen.findByRole("button", {
      name: "Confirmar minha presença",
    });
    expect(mocks.api.mock.calls).toHaveLength(1);
    expect(mocks.api.mock.calls[0][0]).toMatch(/\/view$/);
    expect(location.hash).toBe("");
    mocks.api.mockResolvedValue({
      ...summary,
      confirmedAt: "2026-10-09T12:00:00Z",
    });
    await userEvent.click(button);
    expect(
      await screen.findByRole("heading", {
        name: "Sua presença está confirmada!",
      }),
    ).toBeVisible();
    expect(mocks.api.mock.calls.at(-1)![0]).toBe(
      "/public/decision-responses/notice",
    );
    expect(
      screen.queryByRole("button", { name: "Confirmar minha presença" }),
    ).not.toBeInTheDocument();
  });
  it("link de recusa acolhe e não oferece confirmar presença", async () => {
    mocks.api.mockResolvedValue({ ...summary, kind: "RECUSA" });
    view();
    expect(
      await screen.findByRole("heading", { name: "Não foi dessa vez!" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Confirmar minha presença" }),
    ).not.toBeInTheDocument();
    expect(mocks.api.mock.calls).toHaveLength(1);
  });
});
