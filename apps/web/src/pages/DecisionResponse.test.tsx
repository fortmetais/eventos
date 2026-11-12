import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
const spirituality = {
  startsAt: "2026-11-14T17:00:00.000Z",
  answer: null as boolean | null,
  respondedAt: null as string | null,
  canRespond: true,
};
const spiritualSummary = {
  ...summary,
  participation: "VOLUNTEER",
  canRespond: true,
  spirituality,
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
      await screen.findByRole("button", { name: "Vou participar" }),
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
      await screen.findByRole("button", { name: "Vou participar" }),
    );
    expect(mocks.api).toHaveBeenLastCalledWith(
      `/public/decision-responses/${id}`,
      expect.objectContaining({ body: { token, resposta: "VOU" } }),
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
      screen.getByRole("button", { name: "Vou participar" }),
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
      name: "Vou participar",
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
        name: "Você informou que vai participar!",
      }),
    ).toBeVisible();
    expect(mocks.api.mock.calls.at(-1)![0]).toBe(
      "/public/decision-responses/notice",
    );
    expect(
      screen.getByRole("button", { name: "Vou participar" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Não irei" })).toBeVisible();
  });
  it("link de recusa acolhe e não oferece confirmar presença", async () => {
    mocks.api.mockResolvedValue({ ...summary, kind: "RECUSA" });
    view();
    expect(
      await screen.findByRole("heading", { name: "Não foi dessa vez!" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Vou participar" }),
    ).not.toBeInTheDocument();
    expect(mocks.api.mock.calls).toHaveLength(1);
  });
  it("registra a resposta negativa e permite alterá-la dentro do prazo", async () => {
    view();
    const no = await screen.findByRole("button", { name: "Não irei" });
    mocks.api.mockResolvedValue({
      ...summary,
      declinedAt: "2026-11-12T12:00:00Z",
      canRespond: true,
    });
    await userEvent.click(no);
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/public/decision-responses/notice",
      expect.objectContaining({
        body: { token: "t".repeat(43), resposta: "NAO_IREI" },
      }),
    );
    expect(await screen.findByText(/informou que não irá/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Vou participar" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Não irei" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("mantém a introdução, os dois grupos e o rodapé na ordem sem exibir validade", async () => {
    mocks.api.mockResolvedValue(spiritualSummary);
    view();
    const event = await screen.findByRole("group", {
      name: "Participação no evento",
    });
    const question = screen.getByText(
      "Você participará da espiritualidade do dia 14/11/2026 às 14:00 horas?",
    );
    const spiritual = screen.getByRole("group", {
      name: "Participação na espiritualidade",
    });
    const introduction = screen.getByText(/Pessoa, ficamos felizes/);
    const footer = screen.getByText(
      "Você pode confirmar sem criar conta. A organização definirá sua equipe.",
    );
    const precedes = (before: Element, after: Element) =>
      !!(
        before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    expect(precedes(introduction, event)).toBe(true);
    expect(precedes(event, question)).toBe(true);
    expect(precedes(question, spiritual)).toBe(true);
    expect(precedes(spiritual, footer)).toBe(true);
    expect(
      screen.getByRole("heading", { name: summary.event.name }),
    ).toBeVisible();
    expect(screen.getByText(summary.event.organization)).toBeVisible();
    expect(screen.getByText("01/06/2027 até 03/06/2027")).toBeVisible();
    expect(
      screen.queryByText(/Responda até|alterar sua resposta até/),
    ).toBeNull();
    expect(screen.queryByText(/25\/05\/2027/)).toBeNull();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    for (const button of screen.getAllByRole("button"))
      expect(button).toHaveAttribute("aria-pressed", "false");
  });
  it("responde ao evento e à espiritualidade de forma independente e permite trocar ambas", async () => {
    mocks.api.mockResolvedValue(spiritualSummary);
    view();
    const event = within(
      await screen.findByRole("group", { name: "Participação no evento" }),
    );
    const spiritual = within(
      screen.getByRole("group", { name: "Participação na espiritualidade" }),
    );
    const declined = {
      ...spiritualSummary,
      declinedAt: "2026-11-12T12:00:00Z",
    };
    mocks.api.mockResolvedValue(declined);
    await userEvent.click(event.getByRole("button", { name: "Não irei" }));
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/public/decision-responses/notice",
      expect.objectContaining({
        body: { token: "t".repeat(43), resposta: "NAO_IREI" },
      }),
    );
    expect(spiritual.getByRole("button", { name: "Sim" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const spiritualYes = {
      ...declined,
      spirituality: {
        ...spirituality,
        answer: true,
        respondedAt: "2026-11-12T12:01:00Z",
      },
    };
    mocks.api.mockResolvedValue(spiritualYes);
    await userEvent.click(spiritual.getByRole("button", { name: "Sim" }));
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/public/decision-responses/notice/spirituality",
      expect.objectContaining({
        body: { token: "t".repeat(43), response: true },
      }),
    );
    expect(event.getByRole("button", { name: "Não irei" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(spiritual.getByRole("button", { name: "Sim" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const confirmed = {
      ...spiritualYes,
      confirmedAt: "2026-11-12T12:02:00Z",
      declinedAt: null,
    };
    mocks.api.mockResolvedValue(confirmed);
    await userEvent.click(
      event.getByRole("button", { name: "Vou participar" }),
    );
    expect(
      event.getByRole("button", { name: "Vou participar" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(event.getByRole("button", { name: "Não irei" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    mocks.api.mockResolvedValue({
      ...confirmed,
      spirituality: { ...spirituality, answer: false },
    });
    await userEvent.click(spiritual.getByRole("button", { name: "Não" }));
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/public/decision-responses/notice/spirituality",
      expect.objectContaining({
        body: { token: "t".repeat(43), response: false },
      }),
    );
    expect(spiritual.getByRole("button", { name: "Não" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      event.getByRole("button", { name: "Vou participar" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Pessoa, ficamos felizes/)).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByText(/alterar sua resposta até/)).toBeNull();
  });
  it("restaura as duas respostas ao abrir novamente sem enviar respostas automaticamente", async () => {
    mocks.api.mockResolvedValue({
      ...spiritualSummary,
      confirmedAt: "2026-11-12T12:00:00Z",
      spirituality: { ...spirituality, answer: false },
    });
    const first = view();
    expect(
      await screen.findByRole("button", { name: "Vou participar" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Não" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    first.unmount();
    view();
    expect(
      await screen.findByRole("button", { name: "Vou participar" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Não" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(mocks.api.mock.calls.every(([path]) => path.endsWith("/view"))).toBe(
      true,
    );
  });
  it.each([undefined, null])(
    "não mostra espiritualidade sem a configuração da API: %s",
    async (configuration) => {
      mocks.api.mockResolvedValue({
        ...summary,
        participation: "CAMPER",
        spirituality: configuration,
      });
      view();
      await screen.findByRole("button", { name: "Vou participar" });
      expect(
        screen.queryByText(/Você participará da espiritualidade/),
      ).toBeNull();
      expect(screen.getAllByRole("button")).toHaveLength(2);
    },
  );
  it("bloqueia novas respostas em link expirado mantendo perguntas e escolhas visíveis", async () => {
    mocks.api.mockResolvedValue({
      ...spiritualSummary,
      confirmedAt: "2026-11-12T12:00:00Z",
      canRespond: false,
      spirituality: { ...spirituality, answer: true, canRespond: false },
    });
    view();
    const button = await screen.findByRole("button", {
      name: "Vou participar",
    });
    expect(button).toHaveAttribute("aria-pressed", "true");
    for (const control of screen.getAllByRole("button"))
      expect(control).toBeDisabled();
    expect(screen.getByText(/Este link expirou/)).toBeVisible();
    expect(screen.queryByText(/25\/05\/2027/)).toBeNull();
    await userEvent.click(button);
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
  it("desativa os dois grupos durante o envio e preserva respostas e blocos na falha", async () => {
    const answered = {
      ...spiritualSummary,
      confirmedAt: "2026-11-12T12:00:00Z",
      spirituality: { ...spirituality, answer: true },
    };
    mocks.api.mockResolvedValue(answered);
    view();
    await screen.findByRole("button", { name: "Vou participar" });
    let reject!: (reason: Error) => void;
    mocks.api.mockImplementationOnce(
      () => new Promise((_, rejectResponse) => (reject = rejectResponse)),
    );
    await userEvent.click(screen.getByRole("button", { name: "Não" }));
    for (const control of screen.getAllByRole("button"))
      expect(control).toBeDisabled();
    reject(new Error("Não foi possível salvar. Tente novamente."));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar. Tente novamente.",
    );
    await waitFor(() => {
      for (const control of screen.getAllByRole("button"))
        expect(control).toBeEnabled();
    });
    expect(
      screen.getByRole("button", { name: "Vou participar" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sim" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/Pessoa, ficamos felizes/)).toBeVisible();
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
});
