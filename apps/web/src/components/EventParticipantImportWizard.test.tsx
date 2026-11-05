import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EventParticipantImportWizard } from "./EventParticipantImportWizard";
import { ApiError } from "../lib/api";
import type {
  EventImportBatch,
  EventImportRow,
  ImportMetadata,
} from "../lib/participant-imports";

const mocks = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  api: mocks.api,
}));
const base = "/organizations/org/participant-imports";
const metadata: ImportMetadata = {
  ready: true,
  eventReady: true,
  prefillEnabled: false,
  destinations: [
    {
      campaignId: "campaign",
      eventId: "event",
      eventName: "3º FAC",
      eventStatus: "PUBLISHED",
      forms: [{ id: "form", version: 2, publishedAt: "2026-10-01" }],
    },
  ],
  batches: [],
};
function makeRow(id = "row", number = 2): EventImportRow {
  return {
    id,
    rowNumber: number,
    revision: 0,
    executionState: "PENDING",
    decision: "KEEP",
    reviewed: false,
    overrides: {},
    original: {
      headers: ["Nome", "Nascimento", "Celular", "Sexo", "Instagram"],
      cells: ["Maria Teste", "2000-01-01", "44999999999", "feminino", "@teste"],
    },
    payload: {
      name: "Maria Teste",
      birthDate: "2000-01-01",
      phone: "44999999999",
      answers: { sexo: "Feminino" },
    },
    historical: {},
    errors: [],
    warnings: [],
    pending: ["Foto não informada"],
    duplicateRows: [],
    candidates: [],
    replaceId: null,
    registrationId: null,
  };
}
let batch: EventImportBatch;
let rejectSettings = false;
beforeEach(() => {
  rejectSettings = false;
  batch = {
    id: "batch",
    mode: "EVENT",
    state: "MAPPING",
    step: 2,
    revision: 0,
    fileName: "respostas.csv",
    sheet: "CSV",
    campaign: {
      id: "campaign",
      event: { id: "event", name: "3º FAC", startsAt: "2027-02-05" },
    },
    formVersionId: "form",
    headers: ["Nome", "Nascimento", "Celular", "Sexo", "Instagram"],
    catalog: [
      { id: "name", label: "Nome completo", type: "text" },
      { id: "birthDate", label: "Nascimento", type: "date" },
      { id: "phone", label: "Celular", type: "text" },
      {
        id: "question:sexo",
        label: "Sexo",
        type: "single",
        options: [
          { value: "Feminino", label: "Feminino" },
          { value: "Masculino", label: "Masculino" },
        ],
      },
      {
        id: "metadata:instagram",
        label: "Instagram",
        type: "text",
        historical: true,
      },
      {
        id: "historical",
        label: "Guardar somente no histórico",
        type: "text",
        historical: true,
      },
    ],
    mapping: [
      "name",
      "birthDate",
      "phone",
      "question:sexo",
      "metadata:instagram",
    ].map((target, column) => ({ column, target, confirmed: false })),
    rules: [],
    summary: { total: 2, selected: 1, discarded: 0, pending: 1, imported: 0 },
    columns: [
      {
        column: 3,
        samples: ["feminino"],
        values: [{ value: "feminino", count: 2 }],
      },
    ],
    rows: [
      makeRow(),
      {
        ...makeRow("row2", 3),
        decision: "PENDING",
        errors: ["Confira o celular com DDD."],
      },
    ],
    page: 1,
    pageSize: 50,
  };
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  mocks.api
    .mockReset()
    .mockImplementation(
      async (path: string, options?: { method?: string; body?: any }) => {
        if (path === `${base}/event`) return structuredClone(batch);
        if (path === "/organizations/org/registrations/native")
          return {
            id: "native",
            origin: "PUBLIC_FORM",
            snapshot: {
              name: "Maria Teste",
              birthDate: "2000-01-01",
              phone: "44999999999",
              answers: { sexo: "Feminino" },
            },
          };
        if (path.startsWith(`${base}/batch?`)) return structuredClone(batch);
        if (path === `${base}/batch/settings`) {
          if (rejectSettings)
            throw new ApiError(
              "O lote foi alterado por outro organizador.",
              409,
            );
          if (options!.body.mapping) batch.mapping = options!.body.mapping;
          if (options!.body.rules) batch.rules = options!.body.rules;
          if (options!.body.step) batch.step = options!.body.step;
          batch.revision++;
          if (batch.step >= 3) batch.state = "REVIEW";
          return structuredClone(batch);
        }
        if (path === `${base}/batch/rows/row2`) {
          const row = batch.rows[1];
          row.overrides = options!.body.overrides;
          row.decision = options!.body.decision;
          row.reviewed = true;
          row.revision++;
          row.payload.phone = options!.body.overrides.phone;
          row.errors = [];
          batch.revision++;
          return structuredClone(batch);
        }
        if (path === `${base}/batch/review`) {
          for (const row of batch.rows)
            if (options!.body.rowIds.includes(row.id)) {
              row.reviewed = true;
              row.decision = "KEEP";
              row.ready = true;
              row.revision++;
            }
          batch.revision++;
          return structuredClone(batch);
        }
        if (path === `${base}/batch/confirm`) {
          for (const row of batch.rows)
            if (options!.body.rowIds.includes(row.id)) {
              row.executionState = "IMPORTED";
              row.registrationId = `registration-${row.id}`;
            }
          batch.summary.imported = batch.rows.filter(
            (row) => row.executionState === "IMPORTED",
          ).length;
          batch.state = "PARTIALLY_CONFIRMED";
          batch.step = 6;
          batch.revision++;
          return structuredClone(batch);
        }
        if (path === `${base}/batch/cancel`) {
          batch.state = "CANCELLED";
          batch.revision++;
          return structuredClone(batch);
        }
        throw new Error(`Consulta inesperada: ${path}`);
      },
    );
});
afterEach(cleanup);
function view(initialBatchId?: string, meta = metadata) {
  render(
    <MemoryRouter initialEntries={["/minha-organizacao/cadastros-anteriores"]}>
      <EventParticipantImportWizard
        organizationId="org"
        metadata={meta}
        initialBatchId={initialBatchId}
        onRefresh={mocks.refresh}
      />
    </MemoryRouter>,
  );
}

describe("Assistente de candidaturas importadas", () => {
  it("salva CSV, exige conferir todas as colunas, normaliza e confirma só as linhas escolhidas", async () => {
    view();
    fireEvent.change(screen.getByLabelText(/Evento e campanha/), {
      target: { value: "campaign" },
    });
    fireEvent.change(screen.getByLabelText(/^Arquivo de candidaturas/), {
      target: {
        files: [
          new File(["Nome,Nascimento,Celular"], "respostas.csv", {
            type: "text/csv",
          }),
        ],
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar arquivo e associar colunas" }),
    );
    expect(
      await screen.findByRole("heading", { name: "2. Associar colunas" }),
    ).toBeVisible();
    const uploaded = mocks.api.mock.calls.find(
      ([path]) => path === `${base}/event`,
    )![1].body as FormData;
    expect(uploaded.get("campaignId")).toBe("campaign");
    expect(uploaded.get("formVersionId")).toBe("form");
    expect(
      screen.getByRole("button", { name: "Salvar associações e continuar" }),
    ).toBeDisabled();
    expect(screen.getByText(/0\/5 colunas conferidas/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar associações exibidas" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar associações e continuar" }),
    );
    expect(
      await screen.findByRole("heading", { name: "3. Normalizar respostas" }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Campo para normalizar"), {
      target: { value: "question:sexo" },
    });
    const valueRow = screen.getByText("feminino").closest("tr")!;
    expect(within(valueRow).getByText("2")).toBeVisible();
    fireEvent.change(within(valueRow).getByLabelText("Sexo"), {
      target: { value: "Feminino" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Aplicar e conferir pessoas" }),
    );
    expect(
      await screen.findByRole("heading", { name: "4. Conferir pessoas" }),
    ).toBeVisible();
    expect(mocks.api).toHaveBeenCalledWith(
      `${base}/batch/settings`,
      expect.objectContaining({
        body: expect.objectContaining({
          rules: [
            { target: "question:sexo", from: "feminino", to: "Feminino" },
          ],
        }),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continuar para confirmação" }),
    );
    expect(await screen.findByLabelText("Importar linha 2")).toBeEnabled();
    expect(screen.getByLabelText("Importar linha 3")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Importar linha 2"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar 1 candidatura(s) selecionada(s)",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "6. Resultado da importação",
      }),
    ).toBeVisible();
    expect(mocks.api).toHaveBeenCalledWith(
      `${base}/batch/confirm`,
      expect.objectContaining({
        body: expect.objectContaining({ rowIds: ["row"] }),
      }),
    );
    expect(
      screen.getByRole("link", { name: "Abrir gestão de inscrições" }),
    ).toHaveAttribute("href", "/organizacao/org/inscricoes?evento=event");
    expect(
      screen.getByRole("button", { name: "Revisar linhas restantes" }),
    ).toBeVisible();
  });
  it("retoma a revisão, corrige com versão da linha e preserva a origem consultável", async () => {
    batch.step = 4;
    batch.state = "REVIEW";
    batch.mapping.forEach((m) => (m.confirmed = true));
    batch.rows[1].revision = 7;
    view("batch");
    fireEvent.click(
      await screen.findByRole("button", { name: "Revisar linha 3" }),
    );
    const editor = screen.getByRole("region", {
      name: "Revisar candidatura da linha 3",
    });
    expect(within(editor).getByText("@teste")).toBeInTheDocument();
    fireEvent.change(within(editor).getByLabelText("Celular"), {
      target: { value: "44988888888" },
    });
    fireEvent.change(
      within(editor).getByLabelText("Decisão para a candidatura"),
      { target: { value: "KEEP" } },
    );
    fireEvent.click(
      within(editor).getByRole("button", {
        name: "Salvar revisão da candidatura",
      }),
    );
    expect(await screen.findByText(/Revisão salva/)).toBeVisible();
    expect(mocks.api).toHaveBeenCalledWith(
      `${base}/batch/rows/row2`,
      expect.objectContaining({
        body: expect.objectContaining({
          revision: 7,
          overrides: { phone: "44988888888" },
          decision: "KEEP",
        }),
      }),
    );
  });
  it("explica conflito de revisão e permite recarregar sem confirmar dados antigos", async () => {
    view("batch");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Confirmar associações exibidas",
      }),
    );
    rejectSettings = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar associações e continuar" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Recarregue o lote/,
    );
    expect(
      screen.getByRole("heading", { name: "2. Associar colunas" }),
    ).toBeVisible();
    rejectSettings = false;
    batch.revision = 9;
    fireEvent.click(screen.getByRole("button", { name: "Recarregar lote" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(mocks.api).not.toHaveBeenCalledWith(
      `${base}/batch/confirm`,
      expect.anything(),
    );
  });
  it("cancelamento exige ação explícita antes de incorporar qualquer candidatura", async () => {
    view("batch");
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancelar lote" }),
    );
    expect(screen.getByText(/Deseja cancelar este lote/)).toBeVisible();
    expect(mocks.api).not.toHaveBeenCalledWith(
      `${base}/batch/cancel`,
      expect.anything(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar cancelamento do lote" }),
    );
    expect(
      await screen.findByText(/Lote cancelado\. As respostas/),
    ).toBeVisible();
    expect(batch.summary.imported).toBe(0);
  });
  it("confere em lote apenas as linhas sem conflitos e respeita a prontidão calculada pela API", async () => {
    batch.step = 4;
    batch.state = "REVIEW";
    batch.rows[0].decision = "PENDING";
    batch.rows[0].ready = false;
    view("batch");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Conferir linhas sem conflitos desta página",
      }),
    );
    expect(
      await screen.findByText(/Linhas sem conflitos conferidas/),
    ).toBeVisible();
    expect(mocks.api).toHaveBeenCalledWith(
      `${base}/batch/review`,
      expect.objectContaining({ body: { revision: 0, rowIds: ["row"] } }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continuar para confirmação" }),
    );
    expect(await screen.findByLabelText("Importar linha 2")).toBeEnabled();
    expect(screen.getByLabelText("Importar linha 3")).toBeDisabled();
  });
  it("mantém a seleção ao mudar de página sem selecionar linhas que a API marcou como não prontas", async () => {
    batch.step = 5;
    batch.state = "REVIEW";
    batch.summary.total = 51;
    batch.rows[0].ready = true;
    batch.rows[1].decision = "KEEP";
    batch.rows[1].errors = [];
    batch.rows[1].ready = false;
    view("batch");
    fireEvent.click(await screen.findByLabelText("Importar linha 2"));
    expect(screen.getByLabelText("Importar linha 3")).toBeDisabled();
    batch.rows = [{ ...makeRow("row51", 52), ready: true }];
    batch.page = 2;
    fireEvent.click(screen.getByRole("button", { name: "Próximas linhas" }));
    fireEvent.click(await screen.findByLabelText("Importar linha 52"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar 2 candidatura(s) selecionada(s)",
      }),
    );
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        `${base}/batch/confirm`,
        expect.objectContaining({
          body: expect.objectContaining({ rowIds: ["row", "row51"] }),
        }),
      ),
    );
  });
  it("compara a inscrição nativa e informa que a associação preservará suas respostas", async () => {
    batch.step = 4;
    batch.state = "REVIEW";
    batch.rows[1].candidates = [
      {
        id: "native",
        origin: "PUBLIC_FORM",
        name: "Maria Teste",
        birthDate: "2000-01-01",
        phone: "44999999999",
        status: "APPROVED",
        same: false,
      },
    ];
    view("batch");
    fireEvent.click(
      await screen.findByRole("button", { name: "Revisar linha 3" }),
    );
    const editor = screen.getByRole("region", {
      name: "Revisar candidatura da linha 3",
    });
    fireEvent.change(
      within(editor).getByLabelText("Decisão para a candidatura"),
      { target: { value: "REPLACE" } },
    );
    fireEvent.change(within(editor).getByLabelText("Candidatura existente"), {
      target: { value: "native" },
    });
    expect(
      await screen.findByText(/Esta inscrição foi enviada pela aplicação/),
    ).toBeVisible();
    const comparison = screen.getByRole("region", {
      name: "Comparar candidatura existente",
    });
    expect(
      await within(comparison).findAllByText(/Na candidatura:/),
    ).not.toHaveLength(0);
    expect(
      within(comparison).queryByRole("button", { name: /Manter valor atual/ }),
    ).not.toBeInTheDocument();
  });
});
