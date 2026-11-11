import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DecisionResponse, ShortDecisionResponse } from "./DecisionResponse";
import { decodeDecisionLink } from "../lib/decision-link";
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
  it("abre o link compacto com a credencial completa, permite recarregar e confirma somente ao clicar", async () => {
    const id = "00112233-4455-4677-8899-aabbccddeeff";
    const tokenBytes = Buffer.from(Array.from({ length: 32 }, (_, i) => i * 7));
    const token = tokenBytes.toString("base64url");
    const code = Buffer.concat([
      Buffer.from(id.replaceAll("-", ""), "hex"),
      tokenBytes,
    ]).toString("base64url");
    expect(decodeDecisionLink(code)).toEqual({ noticeId: id, token });
    history.replaceState({}, "", `/r#${code}`);
    const first = render(
      <MemoryRouter initialEntries={["/r"]}>
        <Routes>
          <Route path="/r" element={<ShortDecisionResponse />} />
          <Route path="/resposta/:noticeId" element={<DecisionResponse />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Confirmar minha presença" }),
    ).toBeVisible();
    expect(location.hash).toBe("");
    expect(sessionStorage.getItem(`fac:decision:${id}`)).toBe(token);
    expect(mocks.api.mock.calls.every(([path]) => path.endsWith("/view"))).toBe(
      true,
    );
    expect(mocks.api).toHaveBeenCalledWith(
      `/public/decision-responses/${id}/view`,
      expect.objectContaining({ body: { token } }),
    );
    first.unmount();
    render(
      <MemoryRouter initialEntries={[`/resposta/${id}`]}>
        <Routes>
          <Route path="/resposta/:noticeId" element={<DecisionResponse />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Confirmar minha presença" }),
    );
    expect(mocks.api).toHaveBeenLastCalledWith(
      `/public/decision-responses/${id}`,
      expect.objectContaining({ body: { token } }),
    );
  });
  it.each(["", "incompleto", "A".repeat(64), "!".repeat(64)])(
    "rejeita link compacto inválido sem consultar dados privados: %s",
    async (code) => {
      history.replaceState({}, "", `/r#${code}`);
      render(
        <MemoryRouter>
          <ShortDecisionResponse />
        </MemoryRouter>,
      );
      expect(await screen.findByRole("alert")).toBeVisible();
      expect(mocks.api).not.toHaveBeenCalled();
      expect(location.hash).toBe("");
    },
  );
  it("campista recebe aprovação e confirmação sem orientações de trabalho", async () => {
    mocks.api.mockResolvedValue({ ...summary, participation: "CAMPER" });
    view();
    expect(
      await screen.findByRole("heading", {
        name: "Sua inscrição foi aprovada!",
      }),
    ).toBeVisible();
    expect(screen.getByText(/participar como campista/)).toBeVisible();
    mocks.api.mockResolvedValue({
      ...summary,
      participation: "CAMPER",
      confirmedAt: "2026-10-14T12:00:00Z",
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar minha presença" }),
    );
    expect(
      await screen.findByText(
        /conforme as vagas e a autorização do responsável/,
      ),
    ).toBeVisible();
  });
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
