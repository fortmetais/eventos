import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrganizationForm } from "./OrganizationForm";
import type { Organization } from "../lib/types";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<object>()),
  api: mocks.api,
}));
let onSaved: Mock<() => void>,
  onClose: Mock<() => void>,
  onBusyChange: Mock<(busy: boolean) => void>;
const org: Organization = {
  id: "org",
  name: "Comunidade teste",
  kind: "COMMUNITY",
  city: "Loanda",
  state: "PR",
  contact: "Contato teste",
  cnpj: "12345678000195",
  legalName: "Entidade teste",
  tradeName: "Comunidade",
  street: "Rua teste",
  number: "100",
  complement: "Sala 2",
  neighborhood: "Centro",
  postalCode: "87900000",
  logoUrl: "https://test.invalid/logo.webp",
  active: true,
};
beforeEach(() => {
  mocks.api.mockReset();
  mocks.api.mockResolvedValue(org);
  onSaved = vi.fn();
  onClose = vi.fn();
  onBusyChange = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:logo-test");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);
function show(organization: Organization | null = org) {
  return render(
    <OrganizationForm
      organization={organization}
      onSaved={onSaved}
      onClose={onClose}
      onBusyChange={onBusyChange}
    />,
  );
}
const field = (name: string) =>
  screen.getByLabelText(new RegExp("^" + name + "(?: \\*)?$"));
function fileInput() {
  return screen.getByLabelText(/Arquivo do logotipo/);
}
describe("Ficha da organização e envio de logotipo", () => {
  it("preenche os dados existentes e salva a edição sem apagar o logotipo", async () => {
    show();
    expect(field("CNPJ")).toHaveValue(org.cnpj);
    expect(field("Razão social")).toHaveValue(org.legalName);
    expect(field("Nome fantasia")).toHaveValue(org.tradeName);
    expect(field("Rua / avenida")).toHaveValue(org.street);
    expect(field("Número")).toHaveValue(org.number);
    expect(field("Complemento")).toHaveValue(org.complement);
    expect(field("Bairro")).toHaveValue(org.neighborhood);
    expect(field("CEP")).toHaveValue(org.postalCode);
    expect(screen.queryByLabelText(/URL HTTPS/)).not.toBeInTheDocument();
    fireEvent.change(field("Rua / avenida"), { target: { value: "Nova rua" } });
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar organização" }),
    );
    expect(mocks.api).toHaveBeenCalledWith("/admin/organizations/org", {
      method: "PUT",
      body: expect.objectContaining({
        street: "Nova rua",
        legalName: org.legalName,
        active: true,
      }),
    });
    expect(mocks.api.mock.calls[0][1].body).not.toHaveProperty("logoUrl");
    expect(onSaved).toHaveBeenCalledOnce();
  });
  it("cadastra todos os dados e o arquivo em um único salvamento", async () => {
    show(null);
    for (const [label, value] of [
      ["Nome", org.name],
      ["Cidade", org.city],
      ["Contato", org.contact!],
      ["CNPJ", "12.345.678/0001-95"],
      ["Razão social", org.legalName!],
      ["Nome fantasia", org.tradeName!],
      ["Rua / avenida", org.street!],
      ["Número", org.number!],
      ["Complemento", org.complement!],
      ["Bairro", org.neighborhood!],
      ["CEP", "87900-000"],
    ])
      fireEvent.change(field(label), { target: { value } });
    const logo = new File(["png"], "logo.png", { type: "image/png" });
    await userEvent.upload(fileInput(), logo);
    expect(screen.getByAltText("Prévia do logotipo")).toHaveAttribute(
      "src",
      "blob:logo-test",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Cadastrar organização" }),
    );
    const options = mocks.api.mock.calls[0][1];
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("logo")).toBe(logo);
    expect(JSON.parse(options.body.get("data"))).toMatchObject({
      legalName: org.legalName,
      cnpj: "12.345.678/0001-95",
      street: org.street,
      postalCode: "87900-000",
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });
  it("permite manter cadastro antigo sem dados complementares", async () => {
    show({
      ...org,
      cnpj: null,
      legalName: null,
      tradeName: null,
      street: null,
      number: null,
      complement: null,
      neighborhood: null,
      postalCode: null,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar organização" }),
    );
    expect(mocks.api.mock.calls[0][1].body).toMatchObject({
      cnpj: null,
      legalName: null,
      postalCode: null,
    });
  });
  it("preserva dados e arquivo após falha e permite tentar novamente", async () => {
    mocks.api.mockRejectedValueOnce(
      new Error("Não foi possível guardar o logotipo."),
    );
    show();
    const file = new File(["png"], "logo.png", { type: "image/png" });
    await userEvent.upload(fileInput(), file);
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar organização" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível guardar o logotipo.",
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(field("Razão social")).toHaveValue(org.legalName);
    expect(screen.getByAltText("Prévia do logotipo")).toHaveAttribute(
      "src",
      "blob:logo-test",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar organização" }),
    );
    expect(mocks.api.mock.calls[1][1].body.get("logo")).toBe(file);
    expect(onSaved).toHaveBeenCalledOnce();
  });
  it("bloqueia arquivo muito grande e permite descartá-lo", async () => {
    show();
    const large = new File(["png"], "logo.png", { type: "image/png" });
    Object.defineProperty(large, "size", { value: 10 * 1024 * 1024 + 1 });
    await userEvent.upload(fileInput(), large);
    expect(screen.getByRole("alert")).toHaveTextContent("até 10 MB");
    expect(
      screen.getByRole("button", { name: "Salvar organização" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Descartar arquivo selecionado" }),
    );
    expect(screen.getByAltText("Prévia do logotipo")).toHaveAttribute(
      "src",
      org.logoUrl,
    );
    expect(
      screen.getByRole("button", { name: "Salvar organização" }),
    ).toBeEnabled();
  });
  it("bloqueia prévia ilegível para não salvar sem a imagem escolhida", async () => {
    show();
    await userEvent.upload(
      fileInput(),
      new File(["png"], "logo.png", { type: "image/png" }),
    );
    fireEvent.error(screen.getByAltText("Prévia do logotipo"));
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar organização" }),
    );
    expect(mocks.api).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Escolha outra imagem");
  });
  it("impede dois salvamentos simultâneos e bloqueia a edição enquanto envia", async () => {
    let finish!: () => void;
    mocks.api.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    show();
    const form = screen
      .getByRole("button", { name: "Salvar organização" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.api).toHaveBeenCalledOnce();
    expect(field("Nome")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeDisabled();
    await act(async () => {
      finish();
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });
});
