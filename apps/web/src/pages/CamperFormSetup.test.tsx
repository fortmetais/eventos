import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { CamperFormSetup } from "./VolunteerFormSetup";
const mocks = vi.hoisted(() => ({ api: vi.fn(), role: "ORGANIZER" }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mocks.api,
}));
vi.mock("./Organization", () => ({
  useOrganization: () => ({
    organizationId: "org",
    membership: { role: mocks.role },
  }),
}));
const template = {
  askCpf: false,
  askAddress: true,
  askShirt: true,
  terms: "Termos gerais da inscrição do campista.",
  camper: {
    template: "CAMPER_REGISTRATION_V1",
    description: "Apresentação do encontro",
    requirements: "Orientações para participar do encontro",
    arrivalInstructions: "Chegue sexta-feira após as 18 horas.",
  },
  questions: [
    {
      id: "cidade",
      label: "Cidade onde mora",
      type: "text",
      required: true,
      options: [],
    },
    {
      id: "estado",
      label: "Estado onde mora",
      type: "single",
      required: true,
      options: ["PR", "SP"],
    },
    {
      id: "aceite_orientacoes",
      label: "Li as orientações",
      type: "boolean",
      required: true,
      mustBeTrue: true,
      options: [],
    },
  ],
};
let setup: any;
beforeEach(() => {
  mocks.role = "ORGANIZER";
  mocks.api.mockReset();
  setup = {
    event: { id: "event", name: "FAC Campistas", status: "DRAFT" },
    campaign: {
      id: "campaign",
      opensAt: "2027-01-01T09:00:00-03:00",
      closesAt: "2027-03-01T09:00:00-03:00",
      capacity: null,
      allowWaitlist: false,
      paused: false,
    },
    form: null,
    departmentsReady: false,
    departments: [],
    template,
  };
  mocks.api.mockImplementation(async (_path, options) => {
    if (options?.method === "PUT") {
      setup.campaign = { ...setup.campaign, ...options.body };
      return setup.campaign;
    }
    if (options?.method === "POST") {
      setup.form = {
        id: "form",
        version: 1,
        publishedAt: "2026-10-14T12:00:00Z",
        config: options.body,
      };
      return { form: setup.form };
    }
    return setup;
  });
});
afterEach(cleanup);
const view = () =>
  render(
    <MemoryRouter initialEntries={["/events/event"]}>
      <Routes>
        <Route path="/events/:eventId" element={<CamperFormSetup />} />
      </Routes>
    </MemoryRouter>,
  );
describe("Configuração da ficha de campistas", () => {
  it("oferece banner, regras, chegada e prévia, sem depender de departamentos", async () => {
    view();
    expect(
      await screen.findByLabelText(/Regras e requisitos para participar/),
    ).toHaveValue(template.camper.requirements);
    expect(
      screen.getByLabelText(/Orientações de chegada e participação/),
    ).toHaveValue(template.camper.arrivalInstructions);
    expect(
      screen.queryByText("Departamentos para preferência"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Publicar ficha de campistas" }),
    ).toBeEnabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Visualizar campos" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Campos da ficha" }),
    ).toBeVisible();
    expect(
      screen.getByRole("textbox", {
        name: "Telefone alternativo de emergência (opcional)",
      }),
    ).toBeVisible();
  });
  it("publica o público correto com vagas e lista de espera e fornece o link", async () => {
    view();
    fireEvent.change(
      await screen.findByLabelText(/Quantidade de vagas de campistas/),
      { target: { value: "30" } },
    );
    await userEvent.click(screen.getByLabelText(/Permitir lista de espera/));
    await userEvent.click(
      screen.getByRole("button", { name: "Publicar ficha de campistas" }),
    );
    expect(
      await screen.findByLabelText("Link da ficha de campistas"),
    ).toHaveValue(`${window.location.origin}/inscricao/campaign`);
    const period = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "PUT",
    );
    expect(period![1].body).toMatchObject({
      kind: "CAMPER",
      capacity: 30,
      allowWaitlist: true,
    });
    const publish = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "POST",
    );
    expect(publish![0]).toBe("/organizations/org/events/event/camper-form");
    expect(publish![1].body.layout.kind).toBe("CAMPER");
    expect(publish![1].body.camper.arrivalInstructions).toBe(
      template.camper.arrivalInstructions,
    );
    expect(publish![1].body.volunteer).toBeUndefined();
  });
  it("erro de publicação conserva campos, orientações e capacidade para tentar novamente", async () => {
    const original = mocks.api.getMockImplementation()!;
    mocks.api.mockImplementation((path, options) => {
      if (options?.method === "POST")
        throw new Error("Publicação indisponível");
      return original(path, options);
    });
    view();
    const capacity = await screen.findByLabelText(/Quantidade de vagas/);
    fireEvent.change(capacity, { target: { value: "20" } });
    const description = screen.getByLabelText(/^Descrição/);
    fireEvent.change(description, {
      target: { value: "Descrição preparada pelo organizador" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Publicar ficha de campistas" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Publicação indisponível",
    );
    expect(description).toHaveValue("Descrição preparada pelo organizador");
    expect(capacity).toHaveValue(20);
  });
  it("somente organizador pode editar e publicar", async () => {
    mocks.role = "SECRETARY";
    view();
    expect(screen.getByText(/Somente organizadores/)).toBeVisible();
    await waitFor(() => expect(mocks.api).not.toHaveBeenCalled());
  });
});
