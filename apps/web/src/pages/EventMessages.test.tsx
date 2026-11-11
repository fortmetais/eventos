import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EventMessages } from "./EventMessages";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("./Organization", () => ({
  useOrganization: () => ({
    organizationId: "org",
    membership: { role: "ORGANIZER" },
  }),
}));
const standard =
  "Olá, {{nome}}! Bem-vindo ao {{evento}}. Departamento: {{departamento}}. Acesse {{link}} até {{validade}}.";
const path = "/organizations/org/events/event/accept-message";
const initial = {
  ready: true,
  event: { id: "event", name: "FAC Teste" },
  revision: 0,
  template: standard,
  defaultTemplate: standard,
  customized: false,
  fields: [
    { key: "departamento", label: "Departamento alocado", example: "COZINHA" },
  ],
  previewValues: {
    nome: "Maria Exemplo",
    evento: "FAC Teste",
    departamento: "COZINHA",
    link: "[link pessoal]",
    validade: "[validade]",
  },
};
beforeEach(() => {
  mocks.api.mockReset().mockImplementation(async (url, options) =>
    url.endsWith("/events")
      ? [{ id: "event", name: "FAC Teste" }]
      : options?.method === "PUT"
        ? {
            ...initial,
            revision: 1,
            template: options.body.template ?? standard,
          }
        : initial,
  );
});
afterEach(cleanup);
const view = () =>
  render(
    <MemoryRouter initialEntries={["/mensagens?evento=event"]}>
      <EventMessages />
    </MemoryRouter>,
  );
describe("Editor de mensagem de aceite", () => {
  it("mostra a prévia local e salva a revisão explicitamente sem enviar mensagens", async () => {
    view();
    const editor = await screen.findByRole("textbox", {
      name: /Texto da mensagem/,
    });
    await waitFor(() => expect(editor).toHaveValue(standard));
    expect(
      within(
        screen.getByRole("region", { name: "Prévia da mensagem" }),
      ).getByText(/Departamento: COZINHA/),
    ).toBeVisible();
    fireEvent.change(editor, {
      target: {
        value: "Paz e bem, {{nome}}! {{evento}} · {{link}} · {{validade}}",
      },
    });
    expect(mocks.api.mock.calls.every(([, options]) => !options?.method)).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar mensagem" }));
    expect(
      await screen.findByText(/Mensagem salva para este evento/),
    ).toBeVisible();
    expect(mocks.api).toHaveBeenCalledWith(
      path,
      expect.objectContaining({
        method: "PUT",
        body: {
          revision: 0,
          template: "Paz e bem, {{nome}}! {{evento}} · {{link}} · {{validade}}",
        },
      }),
    );
  });
  it("insere a informação no cursor e permite restaurar antes de salvar", async () => {
    view();
    const editor = (await screen.findByRole("textbox", {
      name: /Texto da mensagem/,
    })) as HTMLTextAreaElement;
    await waitFor(() => expect(editor).toHaveValue(standard));
    editor.focus();
    editor.setSelectionRange(0, 0);
    fireEvent.click(
      screen.getByRole("button", { name: "Inserir departamento alocado" }),
    );
    expect(editor.value).toBe("{{departamento}}" + standard);
    fireEvent.click(
      screen.getByRole("button", { name: "Restaurar texto padrão" }),
    );
    expect(editor).toHaveValue(standard);
    await waitFor(() =>
      expect(
        mocks.api.mock.calls.every(([, options]) => !options?.method),
      ).toBe(true),
    );
  });
});
