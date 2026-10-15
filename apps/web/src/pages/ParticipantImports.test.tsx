import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ParticipantImports } from "./ParticipantImports";
import type { ImportBatch } from "../lib/participant-imports";
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  role: "ORGANIZER",
  ready: true,
}));
vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("./Organization", () => ({
  useOrganization: () => ({
    organizationId: "org",
    membership: { role: mocks.role },
  }),
}));
const base = "/organizations/org/participant-imports";
const values = {
  name: "Maria Teste",
  birthDate: "2000-01-01",
  phone: "123",
  city: "Loanda",
  sex: "Feminino",
  shirt: "G",
};
let batch: ImportBatch;
beforeEach(() => {
  mocks.role = "ORGANIZER";
  mocks.ready = true;
  batch = {
    id: "batch",
    fileName: "antigos.xlsx",
    sheet: "Respostas",
    state: "PREVIEW",
    page: 1,
    pageSize: 50,
    summary: { total: 1, selected: 0, pending: 1, discarded: 0 },
    rows: [
      {
        id: "row",
        rowNumber: 2,
        values: { ...values },
        original: {
          headers: ["Paróquia"],
          cells: ["Resposta original privada"],
        },
        decision: "PENDING",
        replaceId: null,
        reviewed: false,
        pending: true,
        errors: ["Confira o celular com DDD."],
        warnings: [],
        duplicateRows: [],
        candidates: [],
      },
    ],
  };
  mocks.api
    .mockReset()
    .mockImplementation(
      async (path: string, options?: { body?: any; method?: string }) => {
        if (path === base)
          return { ready: mocks.ready, prefillEnabled: false, batches: [] };
        if (path.includes("previous-participants"))
          return { items: [], total: 0 };
        if (path === base + "/inspect")
          return {
            sheets: [
              {
                name: "Respostas",
                rowCount: 1,
                headers: [
                  "Nome",
                  "Nascimento",
                  "Celular",
                  "Cidade",
                  "Sexo",
                  "Camiseta",
                ],
                mapping: {
                  name: 0,
                  birthDate: 1,
                  phone: 2,
                  city: 3,
                  sex: 4,
                  shirt: 5,
                },
              },
            ],
          };
        if (path === base + "/preview" || path.startsWith(base + "/batch?"))
          return structuredClone(batch);
        if (path === base + "/batch/rows/row") {
          batch.rows[0].values = options!.body.values;
          batch.rows[0].decision = options!.body.decision;
          batch.rows[0].pending = false;
          batch.rows[0].errors = [];
          batch.summary.pending = 0;
          batch.summary.selected = 1;
          return { saved: true };
        }
        if (path === base + "/batch/confirm") {
          batch.state = "CONFIRMED";
          return { confirmed: true };
        }
        throw new Error(`Consulta inesperada: ${path}`);
      },
    );
});
afterEach(cleanup);
function view(path = "/cadastros") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ParticipantImports />
    </MemoryRouter>,
  );
}
describe("Importação pelo painel", () => {
  it("lê, confere colunas, corrige uma pendência e confirma a carga", async () => {
    view();
    expect(
      await screen.findByText(/autopreenchimento público está desativado/),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText(/^Arquivo Excel/), {
      target: { files: [new File(["fixture"], "antigos.xlsx")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ler planilha" }));
    expect(await screen.findByLabelText("Aba da planilha")).toHaveValue(
      "Respostas",
    );
    fireEvent.click(screen.getByRole("button", { name: "Preparar prévia" }));
    expect(
      await screen.findByRole("button", { name: "Confirmar importação" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar linha 2" }));
    const editor = screen.getByRole("region", { name: "Revisar linha 2" });
    fireEvent.change(within(editor).getByLabelText("Celular"), {
      target: { value: "44999999999" },
    });
    fireEvent.change(within(editor).getByLabelText("Decisão para esta linha"), {
      target: { value: "KEEP" },
    });
    expect(
      within(editor).getByText("Resposta original privada"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(editor).getByRole("button", { name: "Salvar revisão" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirmar importação" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar importação" }),
    );
    expect(await screen.findByText(/Lote confirmado/)).toBeVisible();
    expect(mocks.api).toHaveBeenCalledWith(
      base + "/batch/rows/row",
      expect.objectContaining({
        body: {
          values: { ...values, phone: "44999999999" },
          decision: "KEEP",
          replaceId: null,
        },
      }),
    );
  });
  it("retoma a prévia pelo endereço após recarregar", async () => {
    view("/cadastros?lote=batch");
    expect(
      await screen.findByRole("button", { name: "Revisar linha 2" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirmar importação" }),
    ).toBeDisabled();
  });
  it("não consulta dados quando o usuário não é organizador", () => {
    mocks.role = "SECRETARY";
    view();
    expect(screen.getByText(/restrita ao organizador/)).toBeVisible();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("explica a etapa pendente de banco e desabilita o envio", async () => {
    mocks.ready = false;
    view();
    expect(
      await screen.findByText(/importação aguarda a configuração/),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Arquivo Excel/)).toBeDisabled();
  });
});
