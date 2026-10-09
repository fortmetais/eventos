import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { EventSetups } from "./EventSetups";

const mocks = vi.hoisted(() => ({ api: vi.fn(), role: "ORGANIZER" }));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({ volunteerRegistrationsEnabled: true }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mocks.api,
}));
vi.mock("./Organization", () => ({
  useOrganization: () => ({
    organizationId: "org-a",
    organization: { city: "Toledo" },
    membership: { role: mocks.role },
  }),
}));
beforeEach(() => {
  mocks.api.mockReset();
  mocks.api.mockResolvedValue([]);
  mocks.role = "ORGANIZER";
  vi.stubGlobal("scrollTo", vi.fn());
  URL.createObjectURL = vi.fn(() => "blob:test-artwork");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function view() {
  render(
    <MemoryRouter>
      <EventSetups />
    </MemoryRouter>,
  );
}
async function begin() {
  view();
  await userEvent.click(
    await screen.findByRole("button", { name: "Novo evento" }),
  );
  for (const [label, value] of [
    ["Nome do evento", "FAC 2027"],
    ["Departamento 1", "MANUTENÇÃO"],
    ["Vagas — departamento 1", "5"],
    ["Data do evento", "2027-01-10"],
    ["Local do evento", "Chácara FAC"],
    ["Descrição", "Encontro comunitário para todos."],
    ["Abertura — servos", "2026-11-20T09:00"],
    ["Encerramento — servos", "2026-12-01T18:00"],
    ["Abertura — campistas", "2026-11-01T09:00"],
    ["Encerramento — campistas", "2026-12-10T18:00"],
  ])
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), {
      target: { value },
    });
}
describe("Preparação de eventos", () => {
  it("um dia e períodos independentes são enviados juntos no horário de Brasília", async () => {
    await begin();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar evento" }),
    );
    await screen.findByText(
      "Evento salvo em preparação, com departamentos, vagas e períodos de inscrição.",
    );
    const call = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "POST",
    )!;
    const data = JSON.parse(call[1].body.get("data"));
    expect(data.event.city).toBe("Toledo");
    expect(data.departments).toEqual([{ name: "MANUTENÇÃO", capacity: 5 }]);
    expect(data.event.endsAt).toBe(data.event.startsAt);
    expect(data.campaigns[0].opensAt).toBe("2026-11-20T09:00:00-03:00");
    expect(data.campaigns[1].opensAt).toBe("2026-11-01T09:00:00-03:00");
  });
  it("período inválido preserva o formulário e não envia uma criação", async () => {
    await begin();
    fireEvent.change(screen.getByLabelText(/^Encerramento — servos/), {
      target: { value: "2026-11-20T09:00" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar evento" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "encerramento das inscrições de servos",
    );
    expect(screen.getByLabelText(/^Nome do evento/)).toHaveValue("FAC 2027");
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
  });
  it("permite adicionar e remover departamentos e preserva o evento quando há nomes repetidos", async () => {
    await begin();
    await userEvent.click(
      screen.getByRole("button", { name: "Adicionar departamento" }),
    );
    fireEvent.change(screen.getByLabelText(/^Departamento 2/), {
      target: { value: " manutenção " },
    });
    fireEvent.change(screen.getByLabelText(/^Vagas — departamento 2/), {
      target: { value: "2" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar evento" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "nomes diferentes",
    );
    expect(screen.getByLabelText(/^Nome do evento/)).toHaveValue("FAC 2027");
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    await userEvent.click(
      screen.getByRole("button", { name: "Remover departamento 2" }),
    );
    expect(screen.queryByLabelText(/^Departamento 2/)).not.toBeInTheDocument();
    expect(screen.getByText("Total de vagas de servos: 5")).toBeInTheDocument();
  });
  it("intervalo e arte são enviados; uma falha mantém os dados e a prévia", async () => {
    await begin();
    await userEvent.click(
      screen.getByRole("checkbox", { name: "O evento dura mais de um dia" }),
    );
    fireEvent.change(screen.getByLabelText(/^Data de término/), {
      target: { value: "2027-01-12" },
    });
    const file = new File(["imagem"], "arte.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText(/^Selecionar arte/), file);
    expect(
      await screen.findByAltText("Prévia da arte do evento"),
    ).toHaveAttribute("src", "blob:test-artwork");
    mocks.api.mockImplementation(async (_path, options) => {
      if (options?.method === "POST")
        throw new Error("Falha de conexão de teste.");
      return [];
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar evento" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha de conexão de teste.",
    );
    expect(screen.getByLabelText(/^Data de término/)).toHaveValue("2027-01-12");
    const call = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "POST",
    )!;
    expect(JSON.parse(call[1].body.get("data")).event.endsAt).toBe(
      "2027-01-12",
    );
    expect(call[1].body.get("artwork")).toBe(file);
    expect(screen.getByAltText("Prévia da arte do evento")).toBeInTheDocument();
  });
  it("secretaria consulta sem criar; banco pendente oferece atualização", async () => {
    mocks.role = "SECRETARY";
    view();
    await screen.findByText("Prepare seu primeiro evento");
    expect(
      screen.queryByRole("button", { name: "Novo evento" }),
    ).not.toBeInTheDocument();
    cleanup();
    mocks.role = "ORGANIZER";
    mocks.api.mockRejectedValue(new Error("Configuração inicial pendente."));
    view();
    await screen.findByText("Configuração inicial pendente.");
    expect(
      screen.getByRole("button", { name: "Atualizar eventos" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Novo evento" }),
    ).not.toBeInTheDocument();
  });
});
