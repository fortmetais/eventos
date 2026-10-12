import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { defaultLayout } from "@fac/form-layout";
import { Registration } from "./Registration";
import type {
  Draft,
  FormConfig,
  FormVersion,
  PublicCampaign,
} from "../lib/types";
const mocks = vi.hoisted(() => ({ api: vi.fn(), photo: vi.fn() }));
vi.mock("../lib/api", () => ({
  api: mocks.api,
  ApiError: class extends Error {},
}));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ session: null }) }));

function formVersion(
  version: number,
  hiddenAvailability: boolean,
): FormVersion {
  const config: FormConfig = {
    askCpf: false,
    askAddress: false,
    askShirt: false,
    questions: [],
    terms: "Termos gerais",
    volunteer: {
      template: "VOLUNTEER_INTENTION_V1",
      description: `Apresentação da versão ${version}`,
      requirements: `Regras da versão ${version}`,
      training: `Preparação da versão ${version}`,
    },
  };
  config.layout = defaultLayout(config, "VOLUNTEER");
  for (const step of config.layout.steps)
    for (const field of step.fields)
      if (
        ![
          "base:name",
          "base:phone",
          "base:birthDate",
          "base:termsAccepted",
          "base:guardian",
        ].includes(field.key)
      )
        field.hidden =
          field.key === "base:availability" ? hiddenAvailability : true;
  return {
    id: `form-${version}`,
    version,
    config,
    publishedAt: "2026-10-11T12:00:00Z",
  };
}
function campaign(form: FormVersion): PublicCampaign {
  return {
    id: "campaign",
    kind: "VOLUNTEER",
    opensAt: "2026-10-01",
    closesAt: "2027-01-01",
    paused: false,
    capacity: null,
    allowWaitlist: false,
    open: true,
    form,
    event: {
      id: "event",
      organizationId: "organization",
      name: "FAC do teste",
      description: "Evento",
      location: "Chácara",
      city: "Loanda",
      startsAt: "2027-01-01",
      endsAt: "2027-01-03",
      status: "PUBLISHED",
      type: { name: "FAC" },
      campaigns: [],
      teams: [],
      organization: {
        id: "organization",
        name: "Paróquia do teste",
        city: "Loanda",
        state: "PR",
        kind: "PARISH",
        active: true,
      },
    },
  };
}
const credential = {
  id: "draft",
  token: "token-do-teste",
  expiresAt: "2027-01-01",
};
let published: PublicCampaign;
let draft: Draft;
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  mocks.photo
    .mockReset()
    .mockResolvedValue({ url: "https://storage.test/photo.webp?token=fresh" });
  localStorage.clear();
  published = campaign(formVersion(3, true));
  draft = {
    id: "draft",
    campaignId: "campaign",
    submitted: false,
    form: published.form,
    payload: {},
    health: {},
  };
  mocks.api
    .mockReset()
    .mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === "/public/campaigns/campaign") return published;
      if (path === "/public/campaigns/campaign/drafts") return credential;
      if (path === "/public/drafts/draft")
        return options?.method === "PUT" ? {} : draft;
      if (path === "/public/drafts/draft/photos/photo") return mocks.photo();
      throw new Error(`Consulta inesperada: ${path}`);
    });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function view() {
  return render(
    <MemoryRouter initialEntries={["/inscricao/campaign"]}>
      <Routes>
        <Route path="/inscricao/:campaignId" element={<Registration />} />
      </Routes>
    </MemoryRouter>,
  );
}
function storeDraft() {
  localStorage.setItem("fac:draft:campaign", JSON.stringify(credential));
}
async function fillIdentification() {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Nome completo", { exact: false }),
    "Pessoa candidata",
  );
  await user.type(
    screen.getByLabelText("Telefone / WhatsApp", { exact: false }),
    "44999999999",
  );
  await user.type(
    screen.getByLabelText("Data de nascimento", { exact: false }),
    "1990-01-01",
  );
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}
describe("Entrada e versão da inscrição", () => {
  it.each(["layout", "legado"])(
    "usa o menu e a máscara do responsável ao retomar uma ficha com renderizador %s",
    async (renderer) => {
      const user = userEvent.setup();
      draft.payload = {
        name: "Menor do rascunho",
        phone: "44999999999",
        birthDate: "2012-01-01",
        photoAssetId: "photo",
        availability: "Desde sexta-feira",
        emergencyName: "Contato de teste",
        emergencyPhone: "44988888888",
        emergencyRelationship: "Pai",
        guardianName: "Responsável do rascunho",
        guardianPhone: "44977776666",
        guardianRelationship: "Avó",
      };
      draft.health = {
        hasAllergies: false,
        hasMedication: false,
        hasDiet: false,
        hasCondition: false,
        hasNeeds: false,
      };
      if (renderer === "legado") delete draft.form.config.layout;
      storeDraft();
      view();
      await user.click(
        await screen.findByRole("button", { name: "Continuar inscrição" }),
      );
      for (let index = 0; index < (renderer === "legado" ? 3 : 1); index++)
        await user.click(screen.getByRole("button", { name: "Continuar" }));
      const phone = screen.getByLabelText("Telefone do responsável", {
        exact: false,
      });
      expect(phone).toHaveValue("(44) 97777-6666");
      expect(phone).toHaveAttribute("placeholder", "(00) 00000-0000");
      const relationship = screen.getByRole("combobox", {
        name: /Parentesco do responsável/,
      });
      expect(relationship).toHaveValue("Avó");
      expect(
        screen.getByRole("option", { name: "Avó (resposta anterior)" }),
      ).toBeInTheDocument();
      await user.clear(phone);
      await user.paste("+55 (44) 98888-7777");
      expect(phone).toHaveValue("(44) 98888-7777");
      await user.selectOptions(relationship, "Mãe");
      await user.click(screen.getByRole("button", { name: "Continuar" }));
      expect(
        await screen.findByRole("heading", { name: "Está tudo certo?" }),
      ).toBeVisible();
      expect(mocks.api).toHaveBeenCalledWith(
        "/public/drafts/draft",
        expect.objectContaining({
          method: "PUT",
          body: expect.objectContaining({
            payload: expect.objectContaining({
              guardianPhone: "(44) 98888-7777",
              guardianRelationship: "Mãe",
            }),
          }),
        }),
      );
    },
  );

  it("renova a foto ao entrar na revisão e recupera um link expirado sem perder a inscrição", async () => {
    const user = userEvent.setup();
    const field = draft.form.config
      .layout!.steps.flatMap((step) => step.fields)
      .find((field) => field.key === "base:photoAssetId")!;
    field.hidden = false;
    draft.payload = {
      name: "Pessoa do rascunho",
      phone: "44999999999",
      birthDate: "1990-01-01",
      photoAssetId: "photo",
    };
    mocks.photo
      .mockResolvedValueOnce({
        url: "https://storage.test/photo.webp?token=upload",
      })
      .mockResolvedValueOnce({
        url: "https://storage.test/photo.webp?token=review",
      })
      .mockResolvedValue({
        url: "https://storage.test/photo.webp?token=recovered",
      });
    storeDraft();
    view();
    await user.click(
      await screen.findByRole("button", { name: "Continuar inscrição" }),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      await screen.findByAltText("Prévia da foto de identificação"),
    ).toHaveAttribute("src", "https://storage.test/photo.webp?token=upload");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByAltText("Sua foto")).toHaveAttribute(
      "src",
      "https://storage.test/photo.webp?token=review",
    );
    fireEvent.error(screen.getByAltText("Sua foto"));
    expect(await screen.findByAltText("Sua foto")).toHaveAttribute(
      "src",
      "https://storage.test/photo.webp?token=recovered",
    );
    expect(mocks.photo).toHaveBeenCalledTimes(3);
    expect(mocks.api).toHaveBeenCalledWith(
      "/public/drafts/draft/photos/photo",
      {
        draftToken: credential.token,
        signal: expect.any(AbortSignal),
      },
    );
    expect(JSON.parse(localStorage.getItem("fac:draft:campaign")!)).toEqual(
      credential,
    );
    expect(mocks.api).toHaveBeenCalledWith(
      "/public/drafts/draft",
      expect.objectContaining({
        method: "PUT",
        body: expect.objectContaining({
          payload: expect.objectContaining({ photoAssetId: "photo" }),
        }),
      }),
    );
  });

  it("preserva a credencial, respostas e foto do rascunho se somente a prévia ficar indisponível", async () => {
    const user = userEvent.setup();
    draft.form.config
      .layout!.steps.flatMap((step) => step.fields)
      .find((field) => field.key === "base:photoAssetId")!.hidden = false;
    draft.payload = {
      name: "Pessoa do rascunho",
      phone: "44999999999",
      birthDate: "1990-01-01",
      photoAssetId: "photo",
    };
    mocks.photo.mockRejectedValueOnce(new Error("Foto indisponível"));
    storeDraft();
    view();
    await screen.findByText("Regras da versão 3");
    expect(mocks.photo).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Continuar inscrição" }),
    );
    expect(
      screen.getByLabelText("Nome completo", { exact: false }),
    ).toHaveValue("Pessoa do rascunho");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      await screen.findByText("Não foi possível carregar a foto."),
    ).toBeVisible();
    expect(JSON.parse(localStorage.getItem("fac:draft:campaign")!)).toEqual(
      credential,
    );
    expect(
      screen.queryByText(/O rascunho anterior não pôde ser retomado/),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Tentar carregar foto" }),
    );
    await screen.findByAltText("Prévia da foto de identificação");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByAltText("Sua foto")).toHaveAttribute(
      "src",
      "https://storage.test/photo.webp?token=fresh",
    );
  });

  it("não carrega fotos descartadas por um campo oculto da ficha", async () => {
    const user = userEvent.setup();
    draft.payload = {
      name: "Pessoa",
      phone: "44999999999",
      birthDate: "1990-01-01",
      photoAssetId: "photo",
    };
    storeDraft();
    view();
    await user.click(
      await screen.findByRole("button", { name: "Continuar inscrição" }),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByRole("heading", { name: "Está tudo certo?" });
    expect(mocks.photo).not.toHaveBeenCalled();
    expect(screen.queryByAltText("Sua foto")).not.toBeInTheDocument();
  });

  it("exibe no cabeçalho o banner da versão retomada, conservando a imagem original", async () => {
    const user = userEvent.setup();
    published.form.config.banner = {
      url: "https://storage.test/novo.webp",
      bucket: "artes-eventos",
      key: "novo.webp",
      width: 1600,
      height: 400,
    };
    draft.form = formVersion(2, false);
    draft.form.config.banner = {
      ...published.form.config.banner,
      url: "https://storage.test/anterior.webp",
      key: "anterior.webp",
    };
    storeDraft();
    view();
    expect(
      await screen.findByAltText("Banner do evento FAC do teste"),
    ).toHaveAttribute("src", "https://storage.test/anterior.webp");
    await user.click(
      screen.getByRole("button", { name: "Continuar inscrição" }),
    );
    expect(
      screen.getByAltText("Banner do evento FAC do teste"),
    ).toHaveAttribute("src", "https://storage.test/anterior.webp");
  });
  it("mostra regras/preparação antes das etapas e oculta disponibilidade em inscrição nova", async () => {
    const user = userEvent.setup();
    view();
    expect(await screen.findByText("Regras da versão 3")).toBeVisible();
    expect(screen.getByText("Preparação da versão 3")).toBeVisible();
    expect(
      screen.queryByLabelText("Nome completo", { exact: false }),
    ).not.toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalledWith(
      "/public/campaigns/campaign/drafts",
      expect.anything(),
    );
    await user.click(screen.getByRole("button", { name: "Começar inscrição" }));
    await screen.findByLabelText("Nome completo", { exact: false });
    await fillIdentification();
    expect(
      screen.getByRole("heading", { name: "Está tudo certo?" }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("Sua disponibilidade", { exact: false }),
    ).not.toBeInTheDocument();
  });
  it("retoma a versão original somente após Continuar inscrição, preservando dados e disponibilidade", async () => {
    const user = userEvent.setup();
    draft.form = formVersion(2, false);
    draft.payload = {
      name: "Pessoa do rascunho",
      phone: "44999999999",
      birthDate: "1990-01-01",
      availability: "Disponível desde sexta-feira",
    };
    storeDraft();
    view();
    expect(await screen.findByText("Regras da versão 2")).toBeVisible();
    expect(screen.getByText(/A versão atual é a 3/)).toBeVisible();
    expect(
      screen.queryByLabelText("Nome completo", { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      mocks.api.mock.calls.some(
        ([, options]) =>
          options?.method === "PUT" || options?.method === "POST",
      ),
    ).toBe(false);
    await user.click(
      screen.getByRole("button", { name: "Continuar inscrição" }),
    );
    expect(
      await screen.findByLabelText("Nome completo", { exact: false }),
    ).toHaveValue("Pessoa do rascunho");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      screen.getByLabelText("Sua disponibilidade", { exact: false }),
    ).toHaveValue("Disponível desde sexta-feira");
    expect(screen.getByText("Ficha — versão 2")).toBeVisible();
    expect(mocks.api).not.toHaveBeenCalledWith(
      "/public/campaigns/campaign/drafts",
      expect.anything(),
    );
  });
  it("consulta a versão vinculada ao rascunho criado, mesmo se houve publicação após abrir a apresentação", async () => {
    const user = userEvent.setup();
    published = campaign(formVersion(2, false));
    draft.form = formVersion(3, true);
    view();
    await screen.findByText("Regras da versão 2");
    await user.click(screen.getByRole("button", { name: "Começar inscrição" }));
    await screen.findByLabelText("Nome completo", { exact: false });
    expect(screen.getByText("Ficha — versão 3")).toBeVisible();
    await fillIdentification();
    expect(
      screen.getByRole("heading", { name: "Está tudo certo?" }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("Sua disponibilidade", { exact: false }),
    ).not.toBeInTheDocument();
  });
  it("permite reler regras mantendo a resposta e a versão do rascunho", async () => {
    const user = userEvent.setup();
    storeDraft();
    view();
    await user.click(
      await screen.findByRole("button", {
        name: "Continuar inscrição",
      }),
    );
    await user.type(
      screen.getByLabelText("Nome completo", { exact: false }),
      "Nome preenchido",
    );
    await user.click(
      screen.getByRole("button", { name: "Ver regras e preparação" }),
    );
    await screen.findByText("Regras da versão 3");
    expect(mocks.api).toHaveBeenCalledWith(
      "/public/drafts/draft",
      expect.objectContaining({
        method: "PUT",
        body: expect.objectContaining({
          payload: expect.objectContaining({ name: "Nome preenchido" }),
        }),
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Continuar inscrição" }),
    );
    expect(
      screen.getByLabelText("Nome completo", { exact: false }),
    ).toHaveValue("Nome preenchido");
    expect(JSON.parse(localStorage.getItem("fac:draft:campaign")!)).toEqual(
      credential,
    );
  });
  it("espera a tentativa de retomada antes de oferecer criar outro rascunho", async () => {
    storeDraft();
    let reject: (error: Error) => void = () => {};
    mocks.api.mockImplementation((path: string) =>
      path === "/public/drafts/draft"
        ? new Promise((_resolve, fail) => {
            reject = fail;
          })
        : Promise.resolve(published),
    );
    view();
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/public/drafts/draft",
        expect.anything(),
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Começar inscrição" }),
    ).not.toBeInTheDocument();
    reject(new Error("Credencial expirada"));
    expect(
      await screen.findByRole("button", { name: "Começar inscrição" }),
    ).toBeVisible();
    expect(
      screen.getByText(/O rascunho anterior não pôde ser retomado/),
    ).toBeVisible();
  });
});
