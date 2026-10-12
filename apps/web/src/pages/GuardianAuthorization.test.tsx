import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { GuardianAuthorization } from "./GuardianAuthorization";
import { loadBrazilianCities, normalizeCitySearch } from "../lib/brazil-cities";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("../lib/brazil-cities", async (original) => ({
  ...(await original<typeof import("../lib/brazil-cities")>()),
  loadBrazilianCities: vi.fn(),
}));
const cities = ["Loanda - PR", "Santa Helena - PR", "Santa Helena - SC"].map(
  (label) => ({ label, search: normalizeCitySearch(label) }),
);
const record = {
  id: "test",
  protocol: "INS-TEST",
  signedAt: null,
  expiresAt: "2027-01-01T12:00:00Z",
  signature: null,
  signedData: null,
  termsText: "Texto do termo para conferência",
  receiptHash: null,
  snapshot: {
    participantName: "Pessoa Menor",
    participantPhone: "44999999999",
    participantCpf: "",
    birthDate: "2012-01-01",
    participantCity: "Toledo",
    team: "Campista",
    guardianName: "Responsável",
    guardianPhone: "44999998888",
    guardianEmail: "",
    guardianRelationship: "Pai",
    familyName: "Contato Familiar",
    familyPhone: "44999997777",
    event: {
      name: "Evento Atual",
      organization: "Organização Atual",
      location: "Chácara",
      city: "Toledo",
      startsAt: "2027-01-01",
      endsAt: "2027-01-03",
    },
  },
  health: {
    hasMedication: false,
    medication: "",
    hasAllergies: false,
    allergies: "",
  },
};
beforeEach(() => {
  sessionStorage.clear();
  history.replaceState({}, "", `/#token=${"t".repeat(43)}`);
  mocks.api.mockReset();
  mocks.api.mockResolvedValue(record);
  vi.mocked(loadBrazilianCities).mockReset().mockResolvedValue(cities);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const view = () =>
  render(
    <MemoryRouter initialEntries={["/autorizacao/test"]}>
      <Routes>
        <Route
          path="/autorizacao/:authorizationId"
          element={<GuardianAuthorization />}
        />
      </Routes>
    </MemoryRouter>,
  );
function drawSignature() {
  const pad = screen.getByRole("img", {
    name: "Área para desenhar a assinatura",
  });
  Object.defineProperty(pad, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 300,
    width: 1000,
    height: 300,
    toJSON: () => ({}),
  });
  for (const [type, clientX, clientY] of [
    ["pointerdown", 10, 10],
    ["pointermove", 100, 100],
    ["pointerup", 100, 100],
  ] as const) {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      clientX,
      clientY,
    });
    Object.defineProperty(event, "pointerId", { value: 1 });
    fireEvent(pad, event);
  }
}

describe("Preenchimento do termo pelo responsável", () => {
  it("formata telefones e CPF já informados sem alterar dados ao abrir", async () => {
    mocks.api.mockResolvedValue({
      ...record,
      snapshot: {
        ...record.snapshot,
        familyPhone: "+55 (44) 99999-7777",
        guardianPhone: "+55 44 99999 8888",
        participantCpf: "52998224725",
      },
    });
    view();
    await screen.findByText("Pessoa Menor");
    expect(screen.getByLabelText(/Celular do contato com DDD/)).toHaveValue(
      "(44) 99999-7777",
    );
    expect(screen.getByLabelText(/Celular do responsável com DDD/)).toHaveValue(
      "(44) 99999-8888",
    );
    expect(screen.getByLabelText(/CPF do participante/)).toHaveValue(
      "529.982.247-25",
    );
    expect(screen.getByLabelText(/CPF do participante/)).not.toBeRequired();
    expect(screen.getByLabelText(/CPF do responsável/)).toHaveValue("");
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });

  it("aplica máscaras ao digitar ou colar e mantém o CPF do participante opcional", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText("Pessoa Menor");
    const phone = screen.getByLabelText(/Celular do responsável com DDD/);
    const familyPhone = screen.getByLabelText(/Celular do contato com DDD/);
    const cpf = screen.getByLabelText(/CPF do responsável/);
    const participantCpf = screen.getByLabelText(/CPF do participante/);

    await user.clear(phone);
    await user.type(phone, "11987654321");
    expect(phone).toHaveValue("(11) 98765-4321");
    await user.clear(familyPhone);
    await user.paste("+55 (44) 99988-7766");
    expect(familyPhone).toHaveValue("(44) 99988-7766");
    await user.type(cpf, "52998224725");
    expect(cpf).toHaveValue("529.982.247-25");
    await user.click(participantCpf);
    await user.paste("123.456.789-09");
    expect(participantCpf).toHaveValue("123.456.789-09");
    await user.clear(participantCpf);
    expect(participantCpf).toHaveValue("");
    expect(participantCpf).not.toBeRequired();
    expect(cpf).toBeRequired();
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });

  it("oferece vínculos legais padronizados em um menu obrigatório", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText("Pessoa Menor");
    const relationship = screen.getByRole("combobox", {
      name: /Parentesco \/ vínculo legal/,
    });
    expect(relationship).toHaveAttribute("name", "relationship");
    expect(relationship).toBeRequired();
    expect(relationship).toHaveValue("Pai");
    expect(
      within(relationship)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Selecione",
      "Pai",
      "Mãe",
      "Tutor(a) legal",
      "Responsável com guarda judicial",
    ]);
    await user.selectOptions(relationship, "Tutor(a) legal");
    expect(relationship).toHaveValue("Tutor(a) legal");
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });

  it("preserva o parentesco anterior até o responsável escolher um vínculo padronizado", async () => {
    const user = userEvent.setup();
    mocks.api.mockResolvedValue({
      ...record,
      snapshot: {
        ...record.snapshot,
        guardianRelationship: "Tia com guarda anterior",
      },
    });
    view();
    await screen.findByText("Pessoa Menor");
    const relationship = screen.getByRole("combobox", {
      name: /Parentesco \/ vínculo legal/,
    });
    expect(relationship).toHaveValue("Tia com guarda anterior");
    expect(
      within(relationship).getByRole("option", {
        name: "Tia com guarda anterior (resposta anterior)",
      }),
    ).toBeVisible();
    await user.selectOptions(relationship, "Mãe");
    expect(relationship).toHaveValue("Mãe");
    expect(
      within(relationship).queryByRole("option", {
        name: /Tia com guarda anterior/,
      }),
    ).not.toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });

  it("busca Cidade - UF e seleciona com teclado sem assinar a autorização", async () => {
    const user = userEvent.setup();
    view();
    await screen.findByText("Pessoa Menor");
    const city = screen.getByRole("combobox", {
      name: "Cidade da assinatura",
    });
    expect(city).toBeRequired();
    expect(city).toHaveAttribute("name", "city");
    expect(loadBrazilianCities).not.toHaveBeenCalled();
    await user.type(city, "santa helena");
    expect(
      await screen.findByRole("option", { name: "Santa Helena - PR" }),
    ).toBeVisible();
    expect(
      screen.getByRole("option", { name: "Santa Helena - SC" }),
    ).toBeVisible();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(city).toHaveValue("Santa Helena - SC");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Desenhe sua assinatura antes de enviar."),
    ).not.toBeInTheDocument();
  });

  it("mantém preenchimento manual e a cidade informada quando o catálogo falha", async () => {
    const user = userEvent.setup();
    vi.mocked(loadBrazilianCities).mockRejectedValue(new Error("Sem conexão"));
    view();
    await screen.findByText("Pessoa Menor");
    const city = screen.getByRole("combobox", {
      name: "Cidade da assinatura",
    });
    await user.type(city, "Loanda");
    expect(
      await screen.findByText(/Você pode informar Cidade - UF/),
    ).toBeVisible();
    await user.tab();
    expect(city).toHaveValue("Loanda");
    await user.click(city);
    await user.type(city, " - PR");
    await user.tab();
    expect(city).toHaveValue("Loanda - PR");
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });

  it("envia dados formatados somente após os aceites e uma assinatura explícita", async () => {
    const user = userEvent.setup();
    mocks.api.mockImplementation(async (path, options) => {
      if (path.endsWith("/view")) return record;
      return {
        ...record,
        signedAt: "2026-10-12T12:00:00Z",
        signedData: options.body.data,
        signature: options.body.data.signature,
        receiptHash: "receipt-test",
      };
    });
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    view();
    await screen.findByText("Pessoa Menor");
    await user.type(screen.getByLabelText(/CPF do responsável/), "52998224725");
    await user.type(
      screen.getByLabelText(/CPF do participante/),
      "12345678909",
    );
    for (const [label, value] of [
      [/Celular do responsável com DDD/, "44999998888"],
      [/Celular do contato com DDD/, "44999997777"],
    ] as const) {
      await user.clear(screen.getByLabelText(label));
      await user.paste(value);
    }
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Parentesco \/ vínculo legal/ }),
      "Responsável com guarda judicial",
    );
    const city = screen.getByRole("combobox", {
      name: "Cidade da assinatura",
    });
    await user.type(city, "loanda");
    await user.click(
      await screen.findByRole("option", { name: "Loanda - PR" }),
    );
    for (const name of [
      /Declaro ser responsável legal/,
      /Li o termo de responsabilidade/,
      /Concordo com o tratamento dos dados/,
    ]) {
      await user.click(screen.getByRole("checkbox", { name }));
    }
    expect(mocks.api).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Assinar e enviar autorização" }),
    );
    expect(
      await screen.findByText("Desenhe sua assinatura antes de enviar."),
    ).toBeVisible();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    drawSignature();
    await user.click(
      screen.getByRole("button", { name: "Assinar e enviar autorização" }),
    );
    expect(await screen.findByText(/Termo assinado em/)).toBeVisible();
    expect(mocks.api).toHaveBeenCalledTimes(2);
    expect(mocks.api.mock.calls[1]).toEqual([
      "/public/guardian-authorizations/test/sign",
      {
        method: "POST",
        body: {
          token: "t".repeat(43),
          data: expect.objectContaining({
            phone: "(44) 99999-8888",
            familyPhone: "(44) 99999-7777",
            cpf: "529.982.247-25",
            participantCpf: "123.456.789-09",
            relationship: "Responsável com guarda judicial",
            city: "Loanda - PR",
            participationAccepted: true,
            responsibilityAccepted: true,
            privacyAccepted: true,
            imageAuthorized: false,
            signature: [
              [
                { x: 10, y: 10 },
                { x: 100, y: 100 },
              ],
            ],
          }),
        },
      },
    ]);
  });

  it("não transforma saúde omitida na inscrição em uma resposta negativa", async () => {
    mocks.api.mockResolvedValue({
      ...record,
      health: {},
      snapshot: { ...record.snapshot, familyName: "", familyPhone: "" },
    });
    view();
    await screen.findByText("Pessoa Menor");
    expect(screen.getByLabelText(/Usa medicamento contínuo/)).toHaveValue("");
    expect(screen.getByLabelText(/Possui alergia a medicamentos/)).toHaveValue(
      "",
    );
  });
  it("abrir não assina e apresenta campos, termo e desenho com imagem opcional", async () => {
    view();
    expect(await screen.findByText("Pessoa Menor")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Evento Atual" })).toBeVisible();
    expect(screen.getByLabelText(/CPF do responsável/)).toBeRequired();
    expect(
      screen.getByRole("img", { name: "Área para desenhar a assinatura" }),
    ).toBeVisible();
    expect(screen.getByLabelText(/Autorizo o uso de imagem/)).not.toBeChecked();
    expect(
      screen.getByLabelText(/Autorizo o uso de imagem/),
    ).not.toBeRequired();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api.mock.calls[0][0]).toMatch(/\/view$/);
    expect(location.hash).toBe("");
  });
  it("erro de link impede o formulário e não tenta assinar", async () => {
    mocks.api.mockRejectedValue(new Error("Este link expirou."));
    view();
    expect(await screen.findByText("Este link expirou.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Assinar e enviar autorização" }),
    ).not.toBeInTheDocument();
  });
  it("termo assinado mostra comprovante e preserva a recusa de imagem", async () => {
    mocks.api.mockResolvedValue({
      ...record,
      signedAt: "2026-10-09T12:00:00Z",
      signedData: {
        name: "Pai Teste",
        cpf: "52998224725",
        imageAuthorized: false,
        city: "Toledo",
      },
      signature: [
        [
          { x: 10, y: 10 },
          { x: 100, y: 100 },
        ],
      ],
      receiptHash: "abc123",
    });
    view();
    expect(await screen.findByText(/Termo assinado em/)).toBeVisible();
    expect(screen.getByText("Não autorizadas")).toBeVisible();
    expect(screen.getByText(/abc123/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Assinar e enviar autorização" }),
    ).not.toBeInTheDocument();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    await userEvent.click(
      screen.getByRole("button", { name: /salvar comprovante/ }),
    );
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });
});
