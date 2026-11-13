import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { defaultLayout } from "@fac/form-layout";
import { ApiError } from "../lib/api";
import type { FormConfig, Registration } from "../lib/types";
import { RegistrationCorrection } from "./RegistrationCorrection";

const mocks = vi.hoisted(() => ({ api: vi.fn(), saved: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mocks.api,
}));
let registration: Registration;
let config: FormConfig;
beforeEach(() => {
  config = {
    askCpf: true,
    askAddress: true,
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
        label: "Cidade onde mora",
        type: "text",
        required: true,
        options: [],
      },
      {
        id: "paroquia",
        label: "Qual paróquia frequenta?",
        type: "text",
        required: false,
        options: [],
      },
      {
        id: "equipes_preferencia",
        label: "Preferências de equipes",
        type: "multiple",
        required: false,
        maxSelections: 3,
        options: ["Equipe A", "Equipe B", "Equipe C", "Equipe D"],
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
        options: [],
        mustBeTrue: true,
      },
      {
        id: "aceite_orientacoes",
        label: "Aceito orientações",
        type: "boolean",
        required: false,
        options: [],
      },
    ],
  };
  config.layout = defaultLayout(config, "VOLUNTEER");
  for (const step of config.layout.steps)
    for (const field of step.fields)
      if (field.key === "question:oculto") field.hidden = true;
  registration = {
    id: "reg",
    origin: "PUBLIC_FORM",
    updatedAt: "2026-11-05T12:00:00.000Z",
    person: { email: "login@example.com" },
    snapshot: {
      name: "Maria Exemplo",
      birthDate: "2000-01-01",
      phone: "44999999999",
      email: "original@example.com",
      answers: { cidade: "Loanda", oculto: "Resposta histórica" },
      photoAssetId: "photo-original",
      termsAccepted: true,
      imageAuthorized: true,
    },
    campaign: { kind: "VOLUNTEER", event: { startsAt: "2027-02-05" } },
    form: { config },
  } as unknown as Registration;
  mocks.api.mockReset().mockResolvedValue(registration);
  mocks.saved.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);
function view(
  options: Partial<React.ComponentProps<typeof RegistrationCorrection>> = {},
) {
  return render(
    <RegistrationCorrection
      organizationId="org"
      registration={registration}
      onSaved={mocks.saved}
      {...options}
    />,
  );
}
function change(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function save() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
}

describe("Correção administrativa dos dados da ficha", () => {
  it.each(["PUBLIC_FORM", "IMPORT"] as const)(
    "edita %s sem justificativa manual e registra histórico automático",
    async (origin) => {
      registration.origin = origin;
      view();
      expect(screen.getByRole("form", { name: "Editar ficha" })).toBeVisible();
      expect(screen.getByLabelText("Nome completo")).toHaveValue(
        "Maria Exemplo",
      );
      expect(
        screen.getByRole("button", { name: "Salvar alterações" }),
      ).toBeDisabled();
      change("Nome completo", "Maria Exemplo Corrigida");
      expect(
        screen.getByRole("button", { name: "Salvar alterações" }),
      ).toBeEnabled();
      expect(
        screen.queryByLabelText(/Motivo da correção/),
      ).not.toBeInTheDocument();

      save();
      expect(
        await screen.findByText("Correção registrada no histórico da ficha."),
      ).toBeVisible();
      expect(mocks.api).toHaveBeenCalledWith(
        "/organizations/org/registrations/reg/corrections",
        {
          method: "PATCH",
          body: {
            updatedAt: registration.updatedAt,
            overrides: { name: "Maria Exemplo Corrigida" },
            reason: "Correção da ficha pela organização.",
          },
        },
      );
      expect(mocks.saved).toHaveBeenCalledWith(registration);
      expect(registration.snapshot.photoAssetId).toBe("photo-original");
      expect(registration.snapshot.termsAccepted).toBe(true);
    },
  );
  it("usa o e-mail de contato sem substituir o endereço original nem o login", async () => {
    registration.snapshot.contactEmail = "contato@example.com";
    view();
    expect(screen.getByLabelText("E-mail de contato")).toHaveValue(
      "contato@example.com",
    );
    expect(screen.getByText(/Não muda o e-mail de login/)).toBeVisible();
    change("E-mail de contato", "novo@example.com");

    save();
    await screen.findByText(/Correção registrada/);
    expect(mocks.api.mock.calls[0][1].body.overrides).toEqual({
      email: "novo@example.com",
    });
    expect(registration.snapshot.email).toBe("original@example.com");
    expect(registration.person.email).toBe("login@example.com");
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
  it("permite limpar contato explicitamente sem recuperar o e-mail de prova", () => {
    registration.snapshot.contactEmail = "";
    view();
    expect(screen.getByLabelText("E-mail de contato")).toHaveValue("");
  });
  it("oferece máscaras e contatos de emergência e responsável sem editar autorização", async () => {
    registration.snapshot.guardianName = "Responsável anterior";
    registration.snapshot.guardianAuthorization = true;
    view();
    change("CPF", "52998224725");
    change("Telefone/WhatsApp", "44988887777");
    change("Telefone do contato de emergência com DDD", "44977776666");
    change("Telefone do responsável com DDD", "44966665555");
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
    expect(screen.getByLabelText("Telefone/WhatsApp")).toHaveValue(
      "(44) 98888-7777",
    );
    expect(
      screen.getByLabelText("Telefone do contato de emergência com DDD"),
    ).toHaveValue("(44) 97777-6666");
    expect(
      screen.getByLabelText("Telefone do responsável com DDD"),
    ).toHaveValue("(44) 96666-5555");
    fireEvent.change(
      screen.getByLabelText("Parentesco / relação do contato de emergência"),
      { target: { value: "Irmã" } },
    );
    fireEvent.change(screen.getByLabelText(/Parentesco do responsável/), {
      target: { value: "Mãe" },
    });

    save();
    await screen.findByText(/Correção registrada/);
    expect(mocks.api.mock.calls[0][1].body.overrides).toEqual({
      cpf: "529.982.247-25",
      phone: "(44) 98888-7777",
      emergencyPhone: "(44) 97777-6666",
      guardianPhone: "(44) 96666-5555",
      emergencyRelationship: "Irmã",
      guardianRelationship: "Mãe",
    });
    expect(
      screen.queryByLabelText(/Aceito regras atuais/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Aceito orientações/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /autoriza|termos|imagem/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /foto|câmera/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/alergia|medicamento|condição de saúde/i),
    ).not.toBeInTheDocument();
    expect(registration.snapshot.guardianAuthorization).toBe(true);
    expect(
      screen.getByText(
        "As alterações ficam registradas no histórico, com autor e data.",
      ),
    ).toBeVisible();
  });
  it("mostra responsável ao corrigir nascimento para menor ou quando indicado pela autorização", () => {
    const rendered = view();
    expect(
      screen.queryByLabelText("Nome do responsável"),
    ).not.toBeInTheDocument();
    change("Data de nascimento", "2010-01-01");
    expect(screen.getByLabelText("Nome do responsável")).toBeVisible();
    rendered.unmount();
    view({ guardianApplicable: true });
    expect(screen.getByLabelText("Nome do responsável")).toBeVisible();
  });
  it("respeita campos ocultos e opções da versão da ficha", () => {
    for (const step of config.layout!.steps)
      for (const field of step.fields)
        if (
          [
            "base:cpf",
            "base:address",
            "base:shirt",
            "base:availability",
          ].includes(field.key)
        )
          field.hidden = true;
    view();
    for (const label of [
      "CPF",
      "Endereço",
      "Tamanho da camiseta",
      "Sua disponibilidade",
      "Pergunta oculta",
    ])
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Cidade onde mora" }),
    ).toHaveValue("Loanda");
    expect(
      screen.getByRole("combobox", { name: "Qual paróquia frequenta?" }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("Nome do responsável"),
    ).not.toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("oferece o telefone alternativo de emergência para campistas conforme a versão da ficha", async () => {
    delete config.volunteer;
    config.camper = {
      template: "CAMPER_REGISTRATION_V1",
      requirements: "Orientações",
      arrivalInstructions: "Chegada",
    };
    config.layout = defaultLayout(config, "CAMPER");
    registration.campaign.kind = "CAMPER";
    view();
    expect(
      screen.queryByLabelText("Sua disponibilidade"),
    ).not.toBeInTheDocument();
    change("Telefone alternativo de emergência", "44966665555");
    expect(
      screen.getByLabelText("Telefone alternativo de emergência"),
    ).toHaveValue("(44) 96666-5555");

    save();
    await screen.findByText(/Correção registrada/);
    expect(mocks.api.mock.calls[0][1].body.overrides).toEqual({
      emergencyAlternativePhone: "(44) 96666-5555",
    });
  });
  it.each(["PUBLIC_FORM", "IMPORT"] as const)(
    "aplica o limite de preferências de acordo com a origem %s",
    async (origin) => {
      registration.origin = origin;
      view();
      for (const name of ["Equipe A", "Equipe B", "Equipe C", "Equipe D"])
        fireEvent.click(screen.getByRole("checkbox", { name }));
      const fourth = screen.getByRole("checkbox", { name: "Equipe D" });
      if (origin === "PUBLIC_FORM") {
        expect(fourth).not.toBeChecked();
        expect(screen.getByText("Selecione até 3 opções.")).toBeVisible();
      } else expect(fourth).toBeChecked();

      save();
      await screen.findByText(/Correção registrada/);
      expect(
        mocks.api.mock.calls[0][1].body.overrides[
          "question:equipes_preferencia"
        ],
      ).toHaveLength(origin === "PUBLIC_FORM" ? 3 : 4);
    },
  );
  it("preserva o rascunho quando o servidor informa conflito", async () => {
    const error = vi.fn();
    mocks.api.mockRejectedValue(
      new ApiError(
        "Dados alterados em outra tela.",
        409,
        undefined,
        "REGISTRATION_REVISION_CONFLICT",
      ),
    );
    view({ onError: error });
    change("Nome completo", "Maria Corrigida");

    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Recarregue a ficha/,
    );
    expect(screen.getByLabelText("Nome completo")).toHaveValue(
      "Maria Corrigida",
    );
    expect(error).toHaveBeenCalled();
    expect(mocks.saved).not.toHaveBeenCalled();
  });
  it("preserva a orientação de um bloqueio de autorização sem sugerir que recarregar o resolve", async () => {
    mocks.api.mockRejectedValue(
      new ApiError(
        "Esta ficha já possui termo do responsável. Revise a autorização antes de alterar o nascimento.",
        409,
        undefined,
        "GUARDIAN_DOCUMENT_EXISTS",
      ),
    );
    view();
    change("Data de nascimento", "2009-01-01");

    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Revise a autorização/,
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/Recarregue/);
    expect(screen.getByLabelText("Data de nascimento")).toHaveValue(
      "2009-01-01",
    );
    expect(mocks.saved).not.toHaveBeenCalled();
  });
  it("mostra a validação do servidor junto ao campo e move o foco para ele", async () => {
    mocks.api.mockRejectedValue(
      new ApiError("Confira os campos informados.", 422, {
        fieldErrors: {
          "overrides.phone": ["Informe um telefone com DDD válido."],
        },
      }),
    );
    view();
    change("Telefone/WhatsApp", "44");

    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Confira os campos informados.",
    );
    expect(
      screen.getByText("Informe um telefone com DDD válido."),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText("Telefone/WhatsApp")).toHaveFocus(),
    );
  });
  it("limpa alterações e não considera máscara equivalente uma mudança", () => {
    const dirty = vi.fn();
    view({ onDirtyChange: dirty });
    change("Telefone/WhatsApp", "(44) 99999-9999");
    expect(dirty).not.toHaveBeenCalledWith(true);
    change("Nome completo", "Maria Corrigida");

    expect(dirty).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Maria Exemplo");
    expect(dirty).toHaveBeenLastCalledWith(false);
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("permite cancelar sem uma justificativa e avisa o modal para voltar à consulta", () => {
    const cancel = vi.fn();
    const dirty = vi.fn();
    view({ onCancel: cancel, onDirtyChange: dirty });
    change("Nome completo", "Nome não salvo");
    expect(dirty).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(dirty).toHaveBeenLastCalledWith(false);
    expect(mocks.api).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText(/Motivo da correção/),
    ).not.toBeInTheDocument();
  });
  it("impede envios simultâneos e desativa controles durante o salvamento", async () => {
    let resolve!: (value: Registration) => void;
    mocks.api.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    view();
    change("Nome completo", "Maria Corrigida");

    const form = screen.getByRole("form", { name: "Editar ficha" });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Nome completo")).toBeDisabled();
    await act(async () => resolve(registration));
    expect(screen.getByLabelText("Nome completo")).toBeEnabled();
  });
});
