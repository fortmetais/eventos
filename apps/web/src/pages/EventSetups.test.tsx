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
const publishedEvent = {
  id: "event-a",
  organizationId: "org-a",
  name: "FAC publicado",
  type: { name: "FAC" },
  description: "Acampamento comunitário publicado.",
  location: "Chácara FAC",
  city: "Toledo",
  startsAt: "2027-02-05T00:00:00.000Z",
  endsAt: "2027-02-09T00:00:00.000Z",
  status: "PUBLISHED",
  imageUrl: "https://storage.test/arte.webp",
  hasRegistrations: true,
  teams: [{ id: "team-a", name: "ANJO", capacity: 10 }],
  campaigns: [
    {
      id: "campaign-a",
      kind: "VOLUNTEER",
      opensAt: "2026-09-01T12:00:00.000Z",
      closesAt: "2027-01-31T21:00:00.000Z",
      capacity: null,
      allowWaitlist: false,
    },
  ],
};
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
  it("envia banners separados e normaliza o endereço na edição do evento", async () => {
    mocks.api.mockResolvedValue([
      {
        ...publishedEvent,
        slug: "fac-anterior",
        mobileImageUrl: "https://storage.test/celular.webp",
      },
    ]);
    view();
    expect(
      await screen.findByRole("link", { name: "Ver página do evento" }),
    ).toHaveAttribute("href", "/eventos/fac-anterior");
    await userEvent.click(
      screen.getByRole("button", { name: "Editar evento" }),
    );
    fireEvent.change(screen.getByLabelText(/^Endereço personalizado/), {
      target: { value: "3 FAC São José 2027" },
    });
    fireEvent.blur(screen.getByLabelText(/^Endereço personalizado/));
    expect(screen.getByText(/Link para compartilhar/)).toHaveTextContent(
      "/eventos/3-fac-sao-jose-2027",
    );
    const desktop = new File(["computador"], "desktop.png", {
      type: "image/png",
    });
    const mobile = new File(["celular"], "mobile.png", { type: "image/png" });
    await userEvent.upload(
      screen.getByLabelText(/^Banner para computador/),
      desktop,
    );
    await userEvent.upload(
      screen.getByLabelText(/^Banner para celular/),
      mobile,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar evento" }),
    );
    await waitFor(() =>
      expect(
        mocks.api.mock.calls.some(([, options]) => options?.method === "PUT"),
      ).toBe(true),
    );
    const call = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    )!;
    expect(call[1].body.get("artwork")).toBe(desktop);
    expect(call[1].body.get("mobileArtwork")).toBe(mobile);
    expect(JSON.parse(call[1].body.get("data")).event.slug).toBe(
      "3-fac-sao-jose-2027",
    );
  });
  it("remove apenas o banner do celular e permite desfazer antes de salvar", async () => {
    mocks.api.mockResolvedValue([
      {
        ...publishedEvent,
        mobileImageUrl: "https://storage.test/celular.webp",
      },
    ]);
    view();
    await userEvent.click(
      await screen.findByRole("button", { name: "Editar evento" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remover banner de celular" }),
    );
    expect(
      screen.queryByAltText("Prévia do banner de celular"),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(screen.getByAltText("Prévia do banner de celular")).toHaveAttribute(
      "src",
      "https://storage.test/celular.webp",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remover banner de celular" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar evento" }),
    );
    await waitFor(() =>
      expect(
        mocks.api.mock.calls.some(([, options]) => options?.method === "PUT"),
      ).toBe(true),
    );
    const call = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    )!;
    expect(JSON.parse(call[1].body.get("data")).removeMobileArtwork).toBe(true);
  });
  it("evento publicado com inscrições oferece edição e salva apenas dados e arte", async () => {
    mocks.api.mockResolvedValue([publishedEvent]);
    view();
    await userEvent.click(
      await screen.findByRole("button", { name: "Editar evento" }),
    );
    expect(
      screen.queryByRole("heading", { name: publishedEvent.name }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Ficha de servos" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome do evento/)).toHaveValue(
      publishedEvent.name,
    );
    expect(screen.getByLabelText(/^Data de início/)).toBeDisabled();
    expect(screen.getByLabelText(/^Data de término/)).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "O evento dura mais de um dia" }),
    ).toBeDisabled();
    expect(
      screen.queryByLabelText(/^Abertura — servos/),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Departamento 1/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Nome do evento/), {
      target: { value: "FAC 2027 atualizado" },
    });
    const file = new File(["imagem"], "arte.png", { type: "image/png" });
    await userEvent.upload(
      screen.getByLabelText(/^Banner para computador/),
      file,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar evento" }),
    );
    await screen.findByText(
      "Dados do evento atualizados. Inscrições e fichas foram preservadas.",
    );
    expect(
      await screen.findByRole("heading", { name: publishedEvent.name }),
    ).toBeInTheDocument();
    const call = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    )!;
    expect(call[0]).toBe("/organizations/org-a/event-setups/event-a/details");
    expect(call[1].body.get("artwork")).toBe(file);
    const data = JSON.parse(call[1].body.get("data"));
    expect(Object.keys(data)).toEqual(["event"]);
    expect(data.event).toMatchObject({
      name: "FAC 2027 atualizado",
      startsAt: "2027-02-05",
      endsAt: "2027-02-09",
    });
  });
  it("publicado sem inscrições permite corrigir as datas; secretaria não recebe o botão", async () => {
    mocks.api.mockResolvedValue([
      { ...publishedEvent, hasRegistrations: false },
    ]);
    view();
    await userEvent.click(
      await screen.findByRole("button", { name: "Editar evento" }),
    );
    expect(screen.getByLabelText(/^Data de início/)).toBeEnabled();
    expect(screen.getByLabelText(/^Data de término/)).toBeEnabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancelar edição" }),
    );
    expect(
      await screen.findByRole("heading", { name: publishedEvent.name }),
    ).toBeInTheDocument();
    cleanup();
    mocks.role = "SECRETARY";
    view();
    await screen.findByText(publishedEvent.name);
    expect(
      screen.queryByRole("button", { name: "Editar evento" }),
    ).not.toBeInTheDocument();
  });
  it("falha ao editar publicado preserva dados e arte; envio em andamento bloqueia troca de evento", async () => {
    let fail: (error: Error) => void = () => {};
    mocks.api.mockImplementation(async (_path, options) => {
      if (options?.method === "PUT")
        return new Promise((_resolve, reject) => {
          fail = reject;
        });
      return [publishedEvent];
    });
    view();
    await userEvent.click(
      await screen.findByRole("button", { name: "Editar evento" }),
    );
    fireEvent.change(screen.getByLabelText(/^Local do evento/), {
      target: { value: "Novo local de teste" },
    });
    await userEvent.upload(
      screen.getByLabelText(/^Banner para computador/),
      new File(["imagem"], "arte.png", { type: "image/png" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar evento" }),
    );
    expect(screen.getByRole("button", { name: "Novo evento" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Editar evento" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancelar edição" }),
    ).toBeDisabled();
    fail(new Error("Falha ao salvar o evento."));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao salvar o evento.",
    );
    expect(screen.getByLabelText(/^Local do evento/)).toHaveValue(
      "Novo local de teste",
    );
    expect(
      screen.getByAltText("Prévia do banner de computador"),
    ).toHaveAttribute("src", "blob:test-artwork");
    expect(screen.getByRole("button", { name: "Salvar evento" })).toBeEnabled();
  });
  it("edição de rascunho mantém o formulário completo e a rota de preparação", async () => {
    mocks.api.mockResolvedValue([
      { ...publishedEvent, status: "DRAFT", hasRegistrations: false },
    ]);
    view();
    await userEvent.click(
      await screen.findByRole("button", { name: "Editar evento" }),
    );
    expect(screen.getByLabelText(/^Departamento 1/)).toHaveValue("ANJO");
    fireEvent.change(screen.getByLabelText(/^Abertura — campistas/), {
      target: { value: "2026-09-01T09:00" },
    });
    fireEvent.change(screen.getByLabelText(/^Encerramento — campistas/), {
      target: { value: "2027-01-31T18:00" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar evento" }),
    );
    await screen.findByText(
      "Evento salvo em preparação, com departamentos, vagas e períodos de inscrição.",
    );
    const call = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    )!;
    expect(call[0]).toBe("/organizations/org-a/event-setups/event-a");
    const data = JSON.parse(call[1].body.get("data"));
    expect(data.departments).toEqual([
      { id: "team-a", name: "ANJO", capacity: 10 },
    ]);
    expect(data.campaigns).toHaveLength(2);
  });
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
  it("remove inclusive a última linha errada e exige novo departamento antes de salvar", async () => {
    await begin();
    await userEvent.click(
      screen.getByRole("button", { name: "Remover departamento 1" }),
    );
    expect(screen.queryByLabelText(/^Departamento 1/)).not.toBeInTheDocument();
    expect(screen.getByText("Total de vagas de servos: 0")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar evento" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "pelo menos um departamento",
    );
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    await userEvent.click(
      screen.getByRole("button", { name: "Adicionar departamento" }),
    );
    fireEvent.change(screen.getByLabelText(/^Departamento 1/), {
      target: { value: "ANJO" },
    });
    fireEvent.change(screen.getByLabelText(/^Vagas — departamento 1/), {
      target: { value: "2" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar evento" }),
    );
    const saved = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "POST",
    )!;
    expect(JSON.parse(saved[1].body.get("data")).departments).toEqual([
      { name: "ANJO", capacity: 2 },
    ]);
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
    await userEvent.upload(
      screen.getByLabelText(/^Banner para computador/),
      file,
    );
    expect(
      await screen.findByAltText("Prévia do banner de computador"),
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
    expect(
      screen.getByAltText("Prévia do banner de computador"),
    ).toBeInTheDocument();
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
