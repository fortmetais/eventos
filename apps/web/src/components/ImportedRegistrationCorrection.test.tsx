import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ImportedRegistrationCorrection } from "./ImportedRegistrationCorrection";
import { ApiError } from "../lib/api";
import type { Registration } from "../lib/types";

const mocks = vi.hoisted(() => ({ api: vi.fn(), saved: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  api: mocks.api,
}));
let registration: Registration & { updatedAt: string };
beforeEach(() => {
  registration = {
    id: "reg",
    origin: "IMPORT",
    updatedAt: "2026-11-05T12:00:00.000Z",
    snapshot: {
      name: "Maria Exemplo",
      birthDate: "2000-01-01",
      phone: "44999999999",
      answers: { cidade: "Loanda", oculto: "Resposta histórica" },
    },
    campaign: { kind: "VOLUNTEER" },
    form: {
      config: {
        askCpf: false,
        askAddress: false,
        askShirt: true,
        terms: "Termos atuais",
        volunteer: {
          template: "VOLUNTEER_INTENTION_V1",
          requirements: "Regras",
          training: "Formação",
        },
        questions: [
          {
            id: "cidade",
            label: "Cidade",
            type: "text",
            required: true,
            options: [],
          },
          {
            id: "oculto",
            label: "Pergunta oculta",
            type: "text",
            required: false,
            options: [],
          },
          {
            id: "aceite_regras",
            label: "Aceito regras atuais",
            type: "boolean",
            required: true,
            mustBeTrue: true,
            options: [],
          },
        ],
        layout: {
          version: 1,
          kind: "VOLUNTEER",
          steps: [
            {
              step: "identification",
              fields: [
                { key: "base:name", hidden: false },
                { key: "base:phone", hidden: false },
                { key: "base:birthDate", hidden: false },
              ],
            },
            {
              step: "about",
              fields: [
                { key: "base:shirt", hidden: false },
                { key: "question:cidade", hidden: false },
                { key: "question:oculto", hidden: true },
              ],
            },
          ],
        },
      },
    },
  } as unknown as Registration & { updatedAt: string };
  mocks.api.mockReset().mockResolvedValue(registration);
  mocks.saved.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);
function view(onError?: (message: string) => void) {
  render(
    <ImportedRegistrationCorrection
      organizationId="org"
      registration={registration}
      onSaved={mocks.saved}
      onError={onError}
    />,
  );
}

describe("Correção de candidatura importada", () => {
  it("exige motivo e envia somente as alterações com a versão atual", async () => {
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "Corrigir dados importados" }),
    );
    expect(
      screen.getByRole("button", {
        name: "Salvar correção dos dados importados",
      }),
    ).toBeDisabled();
    expect(screen.queryByLabelText("Pergunta oculta")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Aceito regras atuais"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Maria Exemplo Corrigida" },
    });
    for (const size of ["G1", "G2", "G3", "G4"])
      expect(screen.getByRole("option", { name: size })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tamanho da camiseta"), {
      target: { value: "G4" },
    });
    fireEvent.change(screen.getByLabelText(/Motivo da correção/), {
      target: { value: "Nome conferido com a participante" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Salvar correção dos dados importados",
      }),
    );
    expect(
      await screen.findByText(/Correção registrada no histórico/),
    ).toBeVisible();
    expect(mocks.api).toHaveBeenCalledWith(
      "/organizations/org/registrations/reg/imported-data",
      {
        method: "PATCH",
        body: {
          updatedAt: "2026-11-05T12:00:00.000Z",
          overrides: { name: "Maria Exemplo Corrigida", shirt: "G4" },
          reason: "Nome conferido com a participante",
        },
      },
    );
    expect(mocks.saved).toHaveBeenCalledWith(registration);
  });
  it("aplica máscara de telefone e preserva os dados digitados quando há conflito", async () => {
    const onError = vi.fn();
    mocks.api.mockRejectedValue(
      new ApiError("Dados alterados em outra tela.", 409),
    );
    view(onError);
    fireEvent.click(
      screen.getByRole("button", { name: "Corrigir dados importados" }),
    );
    fireEvent.change(screen.getByLabelText("Telefone/WhatsApp"), {
      target: { value: "44988887777" },
    });
    expect(screen.getByLabelText("Telefone/WhatsApp")).toHaveValue(
      "(44) 98888-7777",
    );
    fireEvent.change(screen.getByLabelText(/Motivo da correção/), {
      target: { value: "Telefone conferido" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Salvar correção dos dados importados",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Recarregue a candidatura/,
    );
    expect(onError).toHaveBeenCalledWith(
      "Dados alterados em outra tela. Recarregue a candidatura antes de corrigir novamente.",
    );
    expect(screen.getByLabelText("Telefone/WhatsApp")).toHaveValue(
      "(44) 98888-7777",
    );
    await waitFor(() => expect(mocks.saved).not.toHaveBeenCalled());
  });
  it("não oferece correção administrativa importada a inscrições nativas", () => {
    registration.origin = "PUBLIC_FORM";
    view();
    expect(
      screen.queryByRole("button", { name: "Corrigir dados importados" }),
    ).not.toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
