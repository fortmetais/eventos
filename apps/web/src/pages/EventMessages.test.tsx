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
    {
      key: "primeiro_nome",
      label: "Primeiro nome do candidato",
      example: "Maria",
    },
    { key: "departamento", label: "Departamento alocado", example: "COZINHA" },
    { key: "evento", label: "Nome do evento", example: "FAC Teste" },
    { key: "validade", label: "Validade do link", example: "[validade]" },
  ],
  previewValues: {
    nome: "Maria Exemplo",
    primeiro_nome: "Maria",
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
    expect(screen.getByText(/Alterações ainda não salvas/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Salvar mensagem" }));
    expect(
      await screen.findByText(/Mensagem salva para este evento/),
    ).toBeVisible();
    expect(
      screen.queryByText(/Alterações ainda não salvas/),
    ).not.toBeInTheDocument();
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
  it("insere só o primeiro nome e preserva a variável ao salvar", async () => {
    view();
    const editor = (await screen.findByRole("textbox", {
      name: /Texto da mensagem/,
    })) as HTMLTextAreaElement;
    await waitFor(() => expect(editor).toHaveValue(standard));
    const start = standard.indexOf("{{nome}}");
    editor.focus();
    editor.setSelectionRange(start, start + "{{nome}}".length);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Inserir primeiro nome do candidato",
      }),
    );
    const updated = standard.replace("{{nome}}", "{{primeiro_nome}}");
    expect(editor).toHaveValue(updated);
    const preview = screen.getByRole("region", { name: "Prévia da mensagem" });
    expect(within(preview).getByText(/Olá, Maria!/)).toBeVisible();
    expect(preview).not.toHaveTextContent("Maria Exemplo");
    fireEvent.click(screen.getByRole("button", { name: "Salvar mensagem" }));
    await screen.findByText(/Mensagem salva para este evento/);
    expect(mocks.api).toHaveBeenCalledWith(
      path,
      expect.objectContaining({
        method: "PUT",
        body: { revision: 0, template: updated },
      }),
    );
  });
  it("mostra todos os campos faltantes e completa somente o rascunho antes de salvar", async () => {
    view();
    const editor = await screen.findByRole("textbox", {
      name: /Texto da mensagem/,
    });
    await waitFor(() => expect(editor).toHaveValue(standard));
    const draft =
      "A Paz de Jesus! Recebemos sua inscrição para servir no 3º Acampamento FAC, de 5 a 9 de fevereiro de 2027.";
    fireEvent.change(editor, { target: { value: draft } });
    const requirements = screen.getByRole("region", {
      name: "Informações obrigatórias para salvar",
    });
    expect(
      within(requirements).getByText("{{nome}} ou {{primeiro_nome}}", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      within(requirements).getByText("{{link}}", { exact: true }),
    ).toBeVisible();
    expect(
      within(requirements).queryByText("{{evento}}", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Salvar mensagem" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar mensagem" }));
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Adicionar informações obrigatórias",
      }),
    );
    const completed =
      "Olá, {{primeiro_nome}}!\n\n" +
      draft +
      "\n\nConfirme sua presença pelo link: {{link}}";
    expect(editor).toHaveValue(completed);
    expect(
      screen.queryByRole("region", {
        name: "Informações obrigatórias para salvar",
      }),
    ).not.toBeInTheDocument();
    expect(
      mocks.api.mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(false);
    expect(screen.getByText(/Alterações ainda não salvas/)).toBeVisible();
    const preview = screen.getByRole("region", { name: "Prévia da mensagem" });
    expect(preview).toHaveTextContent("Olá, Maria!");
    expect(preview).toHaveTextContent(
      "3º Acampamento FAC, de 5 a 9 de fevereiro de 2027.",
    );
    expect(preview).toHaveTextContent("[link pessoal]");
    expect(preview).not.toHaveTextContent("{{");
    fireEvent.click(screen.getByRole("button", { name: "Salvar mensagem" }));
    await screen.findByText(/Mensagem salva para este evento/);
    expect(mocks.api).toHaveBeenCalledWith(
      path,
      expect.objectContaining({
        method: "PUT",
        body: { revision: 0, template: completed },
      }),
    );
  });
  it("permite salvar o texto do usuário sem exigir evento ou validade automáticos", async () => {
    view();
    const editor = await screen.findByRole("textbox", {
      name: /Texto da mensagem/,
    });
    await waitFor(() => expect(editor).toHaveValue(standard));
    expect(
      screen.getByRole("button", { name: "Inserir nome do evento" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Inserir validade do link" }),
    ).toBeVisible();
    expect(screen.getByText(/Evento e validade são opcionais/)).toBeVisible();
    const draft =
      "Olá, {{primeiro_nome}}! A Paz de Jesus! ❤️🙏🏻\n\nRecebemos sua inscrição para servir no 3º Acampamento FAC!\n\n📅 Acampamento: 5 a 9 de fevereiro de 2027.\n\nConfirme sua presença pelo link: {{link}}";
    fireEvent.change(editor, { target: { value: draft } });
    expect(
      screen.queryByRole("region", {
        name: "Informações obrigatórias para salvar",
      }),
    ).not.toBeInTheDocument();
    const preview = screen.getByRole("region", { name: "Prévia da mensagem" });
    expect(preview).toHaveTextContent("Olá, Maria!");
    expect(preview).toHaveTextContent("[link pessoal]");
    expect(preview).not.toHaveTextContent("{{");
    expect(
      screen.getByRole("button", { name: "Salvar mensagem" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar mensagem" }));
    await screen.findByText(/Mensagem salva para este evento/);
    expect(mocks.api).toHaveBeenCalledWith(
      path,
      expect.objectContaining({
        method: "PUT",
        body: { revision: 0, template: draft },
      }),
    );
    expect(editor).toHaveValue(draft);
    const input = editor as HTMLTextAreaElement;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    fireEvent.click(
      screen.getByRole("button", { name: "Inserir nome do evento" }),
    );
    expect(input.value).toContain("{{evento}}");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    fireEvent.click(
      screen.getByRole("button", { name: "Inserir validade do link" }),
    );
    expect(input.value).toContain("{{validade}}");
    expect(preview).toHaveTextContent("FAC Teste");
    expect(preview).toHaveTextContent("[validade]");
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT"),
    ).toHaveLength(1);
  });
  it("inclui o nome apenas quando ausente, sem duplicar link ou outros campos", async () => {
    view();
    const editor = await screen.findByRole("textbox", {
      name: /Texto da mensagem/,
    });
    await waitFor(() => expect(editor).toHaveValue(standard));
    const draft =
      "O {{evento}} está chegando. Confirme sua presença: {{link}} até {{validade}}.";
    fireEvent.change(editor, { target: { value: draft } });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Adicionar informações obrigatórias",
      }),
    );
    expect(editor).toHaveValue("Olá, {{primeiro_nome}}!\n\n" + draft);
    expect(
      screen.getByRole("button", { name: "Salvar mensagem" }),
    ).toBeEnabled();
  });
  it("segue os requisitos informados pela API", async () => {
    const settings = {
      ...initial,
      requiredFields: [
        { keys: ["departamento"], label: "Departamento alocado" },
      ],
    };
    mocks.api.mockImplementation(async (url) =>
      url.endsWith("/events") ? [{ id: "event", name: "FAC Teste" }] : settings,
    );
    view();
    const editor = await screen.findByRole("textbox", {
      name: /Texto da mensagem/,
    });
    await waitFor(() => expect(editor).toHaveValue(standard));
    const draft = "Mensagem personalizada para a equipe do evento.";
    fireEvent.change(editor, { target: { value: draft } });
    const requirements = screen.getByRole("region", {
      name: "Informações obrigatórias para salvar",
    });
    expect(requirements).toHaveTextContent("{{departamento}}");
    expect(requirements).not.toHaveTextContent("{{evento}}");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Adicionar informações obrigatórias",
      }),
    );
    expect(editor).toHaveValue(
      draft + "\n\nDepartamento alocado: {{departamento}}.",
    );
  });
  it("preserva a edição quando a API rejeita o conteúdo sem sugerir recarga", async () => {
    mocks.api.mockImplementation(async (url, options) => {
      if (options?.method === "PUT")
        throw Object.assign(new Error("Informação automática desconhecida."), {
          status: 422,
        });
      return url.endsWith("/events")
        ? [{ id: "event", name: "FAC Teste" }]
        : { ...initial };
    });
    view();
    const editor = await screen.findByRole("textbox", {
      name: /Texto da mensagem/,
    });
    await waitFor(() => expect(editor).toHaveValue(standard));
    const draft = standard + " {{apelido}}";
    fireEvent.change(editor, { target: { value: draft } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar mensagem" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informação automática desconhecida.",
    );
    expect(editor).toHaveValue(draft);
    expect(
      screen.queryByRole("button", { name: "Recarregar modelo salvo" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Alterações ainda não salvas/)).toBeVisible();
  });
  it("oferece recarga explícita somente quando outra edição alterou o modelo", async () => {
    const newServerTemplate = standard.replace("Olá", "Paz e bem");
    let conflict = false;
    mocks.api.mockImplementation(async (url, options) => {
      if (options?.method === "PUT") {
        conflict = true;
        throw Object.assign(
          new Error("A mensagem foi alterada em outra tela."),
          { status: 409 },
        );
      }
      return url.endsWith("/events")
        ? [{ id: "event", name: "FAC Teste" }]
        : { ...initial, template: conflict ? newServerTemplate : standard };
    });
    view();
    const editor = await screen.findByRole("textbox", {
      name: /Texto da mensagem/,
    });
    await waitFor(() => expect(editor).toHaveValue(standard));
    const draft = standard + " Estamos esperando você!";
    fireEvent.change(editor, { target: { value: draft } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar mensagem" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A mensagem foi alterada em outra tela.",
    );
    expect(editor).toHaveValue(draft);
    fireEvent.click(
      screen.getByRole("button", { name: "Recarregar modelo salvo" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: /Texto da mensagem/ }),
      ).toHaveValue(newServerTemplate),
    );
    expect(
      screen.queryByText(/Alterações ainda não salvas/),
    ).not.toBeInTheDocument();
  });
});
