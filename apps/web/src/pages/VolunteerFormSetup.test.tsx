import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { VolunteerFormSetup } from "./VolunteerFormSetup";

const mocks = vi.hoisted(() => ({ api: vi.fn(), role: "ORGANIZER" }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mocks.api,
}));
vi.mock("./Organization", () => ({
  useOrganization: () => ({
    organizationId: "org-a",
    membership: { role: mocks.role },
  }),
}));
const template = {
  askCpf: false,
  askAddress: false,
  askShirt: true,
  terms: "Termos para avaliar a candidatura.",
  volunteer: {
    template: "VOLUNTEER_INTENTION_V1",
    requirements: "Critérios de participação neste evento.",
    training: "Preparação da comunidade antes do evento.",
  },
  questions: [
    {
      id: "equipes_preferencia",
      label: "Equipes de preferência",
      type: "multiple",
      required: true,
      options: ["Cozinha", "Secretaria"],
      maxSelections: 3,
    },
  ],
};
beforeEach(() => {
  mocks.api.mockReset();
  mocks.role = "ORGANIZER";
  mocks.api.mockImplementation(async (_path, options) => {
    if (options?.method === "POST")
      throw new Error("Falha ao publicar. Tente novamente.");
    return {
      event: { id: "event-a", name: "FAC 2027", status: "DRAFT" },
      campaign: {
        id: "campaign-a",
        opensAt: "2027-01-01T09:00:00-03:00",
        closesAt: "2027-02-01T18:00:00-03:00",
        paused: false,
        capacity: null,
        allowWaitlist: false,
      },
      form: null,
      departmentsReady: true,
      departments: [
        { id: "team-a", eventId: "event-a", name: "Cozinha", capacity: 3 },
        { id: "team-b", eventId: "event-a", name: "Secretaria", capacity: 2 },
      ],
      template,
    };
  });
});
afterEach(cleanup);
function view() {
  render(
    <MemoryRouter initialEntries={["/org/event-a"]}>
      <Routes>
        <Route path="/org/:eventId" element={<VolunteerFormSetup />} />
      </Routes>
    </MemoryRouter>,
  );
}
describe("Publicação da ficha de servos", () => {
  it("falha de publicação preserva regras e preparação informadas", async () => {
    view();
    const field = await screen.findByLabelText(/^Preparação e formações/);
    fireEvent.change(field, {
      target: { value: "Encontro de preparação no sábado anterior." },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Publicar ficha de servos" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha ao publicar",
    );
    expect(field).toHaveValue("Encontro de preparação no sábado anterior.");
    expect(
      screen.queryByLabelText("Link da ficha de servos"),
    ).not.toBeInTheDocument();
  });
  it("preferências vêm dos departamentos do evento e não permitem digitar equipes soltas", async () => {
    view();
    await screen.findByText("Departamentos para preferência");
    expect(
      screen.queryByLabelText(/^Equipes para preferência/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Cozinha")).toBeInTheDocument();
    expect(screen.getByText("Secretaria")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Publicar ficha de servos" }),
    );
    await screen.findByRole("alert");
    const request = mocks.api.mock.calls.find(
      ([, options]) => options?.method === "POST",
    )!;
    expect(request[1].body.questions[0].options).toEqual([
      "Cozinha",
      "Secretaria",
    ]);
    expect(screen.getByLabelText(/^Regras e requisitos/)).toHaveValue(
      template.volunteer.requirements,
    );
  });
});
