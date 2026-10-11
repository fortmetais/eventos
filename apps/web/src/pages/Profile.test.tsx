import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Profile as ProfileData } from "../lib/types";
import { Profile } from "./Profile";

const mocks = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
vi.mock("../lib/auth", () => ({
  useAuth: () => ({
    eventsEnabled: false,
    volunteerRegistrationsReady: true,
    refresh: mocks.refresh,
  }),
}));

const photoId = "83840445-f5ce-4f63-b3b2-ac6d5f1ed03a";
let saved: ProfileData;
let uploadResult: () => Promise<{ id: string; url: string }>;
let getPhoto: (id: string) => Promise<{ url: string }>;
let updateError: Error | null;
beforeEach(() => {
  updateError = null;
  saved = { name: "Pessoa Teste", city: "Loanda" };
  uploadResult = async () => {
    return { id: photoId, url: "/new-photo.jpg" };
  };
  getPhoto = async () => ({ url: "/new-photo.jpg" });
  mocks.refresh.mockReset();
  mocks.refresh.mockResolvedValue(undefined);
  mocks.api.mockReset();
  mocks.api.mockImplementation(
    async (path: string, options?: { method?: string; body?: ProfileData }) => {
      if (path === "/me/profile" && options?.method === "PUT") {
        if (updateError) throw updateError;
        saved = { ...saved, ...options.body };
        return {
          id: "account",
          email: "pessoa@example.com",
          profile: { ...saved },
        };
      }
      if (path === "/me/profile")
        return {
          id: "account",
          email: "pessoa@example.com",
          profile: { ...saved },
        };
      if (path === "/me/registrations") return [];
      if (path === "/me/photo") {
        const uploaded = await uploadResult();
        saved = { ...saved, photoAssetId: uploaded.id };
        return uploaded;
      }
      if (path.startsWith("/me/photos/"))
        return getPhoto(path.slice("/me/photos/".length));
      throw new Error(`Chamada inesperada: ${path}`);
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
  });
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:photo"),
      revokeObjectURL: vi.fn(),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const view = () =>
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
async function edit() {
  await screen.findByRole("heading", { name: "Olá, Pessoa." });
  await userEvent.click(
    screen.getByRole("button", { name: "Editar meu perfil" }),
  );
}
async function selectFile() {
  await userEvent.upload(
    screen.getByLabelText("Arquivo da foto de identificação"),
    new File(["photo"], "foto.jpg", { type: "image/jpeg" }),
  );
  await loadPreview();
}
async function loadPreview() {
  const image = await screen.findByRole("img", {
    name: "Prévia da foto de identificação",
  });
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 640 },
    naturalHeight: { configurable: true, value: 480 },
  });
  fireEvent.load(image);
}
async function usePhoto() {
  await userEvent.click(screen.getByRole("button", { name: "Usar esta foto" }));
  await screen.findByText(/Foto do perfil salva/);
}
async function capturePhoto() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) =>
    done(new Blob(["photo"], { type: "image/jpeg" })),
  );
  await userEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
  await waitFor(() =>
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(),
  );
  const video = screen.getByLabelText("Prévia da câmera");
  Object.defineProperties(video, {
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
  });
  fireEvent.loadedData(video);
  await userEvent.click(screen.getByRole("button", { name: "Capturar foto" }));
  await loadPreview();
}

describe("Persistência da foto do perfil", () => {
  it("aguarda o perfil inicial antes de permitir editar e confirmar uma foto", async () => {
    const implementation = mocks.api.getMockImplementation()!;
    let finish!: (value: unknown) => void;
    mocks.api.mockImplementation((path, options) => {
      if (path === "/me/profile" && !options?.method)
        return new Promise((resolve) => {
          finish = resolve;
        });
      return implementation(path, options);
    });
    view();
    expect(
      screen.getByRole("button", { name: "Editar meu perfil" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Tirar foto" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      finish({
        id: "account",
        email: "pessoa@example.com",
        profile: { ...saved },
      });
    });
    expect(
      screen.getByRole("button", { name: "Editar meu perfil" }),
    ).toBeEnabled();
    await edit();
    expect(screen.getByLabelText(/Nome completo/)).toHaveValue("Pessoa Teste");
  });

  it.each(["arquivo", "câmera"])(
    "salva a foto por %s e a recupera após recarregar sem Salvar perfil",
    async (source) => {
      const first = view();
      await edit();
      await userEvent.clear(screen.getByLabelText(/Nome completo/));
      await userEvent.type(
        screen.getByLabelText(/Nome completo/),
        "Nome digitado",
      );
      if (source === "arquivo") await selectFile();
      else await capturePhoto();
      expect(
        screen.getByRole("button", { name: "Salvar perfil" }),
      ).toBeEnabled();
      await usePhoto();
      expect(screen.getByLabelText(/Nome completo/)).toHaveValue(
        "Nome digitado",
      );
      expect(
        mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT"),
      ).toHaveLength(0);
      first.unmount();
      view();
      expect(
        await screen.findByRole("img", { name: "Sua foto de perfil" }),
      ).toHaveAttribute("src", "/new-photo.jpg");
      expect(saved.name).toBe("Pessoa Teste");
    },
  );

  it("bloqueia salvar e fechar a edição durante upload e permite salvar os demais campos depois", async () => {
    let finish!: (value: { id: string; url: string }) => void;
    uploadResult = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const first = view();
    await edit();
    await selectFile();
    await userEvent.clear(screen.getByLabelText("Cidade"));
    await userEvent.type(screen.getByLabelText("Cidade"), "Toledo");
    await userEvent.click(
      screen.getByRole("button", { name: "Usar esta foto" }),
    );
    expect(
      screen.getByRole("button", { name: "Salvar perfil" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Editar meu perfil" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Descartar foto" }),
    ).toBeDisabled();
    fireEvent.submit(
      screen.getByRole("button", { name: "Salvar perfil" }).closest("form")!,
    );
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT"),
    ).toHaveLength(0);
    await act(async () => {
      finish({ id: photoId, url: "/new-photo.jpg" });
    });
    expect(screen.getByRole("button", { name: "Salvar perfil" })).toBeEnabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar perfil" }),
    );
    await screen.findByText(/Perfil atualizado/);
    const update = mocks.api.mock.calls.find(
      ([path, options]) => path === "/me/profile" && options?.method === "PUT",
    );
    expect(update?.[1].body).not.toHaveProperty("photoAssetId");
    expect(saved).toMatchObject({ city: "Toledo", photoAssetId: photoId });
    first.unmount();
    view();
    expect(
      await screen.findByRole("img", { name: "Sua foto de perfil" }),
    ).toHaveAttribute("src", "/new-photo.jpg");
  });

  it("permite descartar arquivo pendente e salvar sem trocar a foto", async () => {
    view();
    await edit();
    await selectFile();
    expect(screen.getByText(/A foto escolhida será salva/)).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Descartar foto" }),
    );
    expect(screen.getByRole("button", { name: "Salvar perfil" })).toBeEnabled();
    expect(mocks.api.mock.calls.some(([path]) => path === "/me/photo")).toBe(
      false,
    );
  });

  it("mostra erro quando não consegue recuperar a foto já salva", async () => {
    saved.photoAssetId = photoId;
    getPhoto = async () => {
      throw new Error("Foto indisponível.");
    };
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar sua foto de perfil",
    );
  });

  it("ignora a resposta atrasada da foto antiga depois de salvar uma nova", async () => {
    const oldId = "727d00ad-1b77-4591-b79d-dc689cbfbdb7";
    saved.photoAssetId = oldId;
    let finish!: (value: { url: string }) => void;
    getPhoto = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    view();
    await edit();
    await selectFile();
    await usePhoto();
    await act(async () => {
      finish({ url: "/old-photo.jpg" });
    });
    expect(
      screen.getByRole("img", { name: "Prévia da foto de identificação" }),
    ).toHaveAttribute("src", "/new-photo.jpg");
  });

  it.each(["arquivo", "câmera"])(
    "Salvar perfil confirma a foto por %s antes dos dados e preserva ambos ao recarregar",
    async (source) => {
      const first = view();
      await edit();
      await userEvent.clear(screen.getByLabelText("Cidade"));
      await userEvent.type(screen.getByLabelText("Cidade"), "Toledo");
      if (source === "arquivo") await selectFile();
      else await capturePhoto();
      await userEvent.click(
        screen.getByRole("button", { name: "Salvar perfil" }),
      );
      await screen.findByText(/Perfil atualizado/);
      const mutations = mocks.api.mock.calls.filter(
        ([path, options]) => path === "/me/photo" || options?.method === "PUT",
      );
      expect(
        mutations.map(([path, options]) => [path, options.method]),
      ).toEqual([
        ["/me/photo", "POST"],
        ["/me/profile", "PUT"],
      ]);
      expect(mutations[1][1].body).not.toHaveProperty("photoAssetId");
      expect(saved).toMatchObject({ city: "Toledo", photoAssetId: photoId });
      first.unmount();
      view();
      expect(
        await screen.findByRole("img", { name: "Sua foto de perfil" }),
      ).toHaveAttribute("src", "/new-photo.jpg");
      await edit();
      expect(screen.getByLabelText("Cidade")).toHaveValue("Toledo");
    },
  );

  it("Salvar perfil sem nova foto grava somente os dados", async () => {
    view();
    await edit();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar perfil" }),
    );
    await screen.findByText(/Perfil atualizado/);
    expect(mocks.api.mock.calls.some(([path]) => path === "/me/photo")).toBe(
      false,
    );
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT"),
    ).toHaveLength(1);
  });

  it("falha da foto impede salvar os dados e mantém a edição e a seleção para tentar novamente", async () => {
    uploadResult = async () => {
      throw new Error("Não foi possível guardar sua foto.");
    };
    view();
    await edit();
    await userEvent.clear(screen.getByLabelText("Cidade"));
    await userEvent.type(screen.getByLabelText("Cidade"), "Toledo");
    await selectFile();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar perfil" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível guardar sua foto.",
    );
    expect(
      screen.getByRole("button", { name: "Usar esta foto" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Salvar perfil" })).toBeEnabled();
    expect(screen.getByLabelText("Cidade")).toHaveValue("Toledo");
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT"),
    ).toHaveLength(0);
    expect(screen.queryByText(/Perfil atualizado/)).not.toBeInTheDocument();
    expect(saved.photoAssetId).toBeUndefined();
  });

  it("envios repetidos aguardam uma única foto antes de salvar e bloqueiam edição durante a operação", async () => {
    let finish!: (value: { id: string; url: string }) => void;
    uploadResult = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    view();
    await edit();
    await selectFile();
    const form = screen
      .getByRole("button", { name: "Salvar perfil" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(
      mocks.api.mock.calls.filter(([path]) => path === "/me/photo"),
    ).toHaveLength(1));
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT"),
    ).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Salvar perfil" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Editar meu perfil" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Cidade")).toBeDisabled();
    await act(async () => {
      finish({ id: photoId, url: "/new-photo.jpg" });
    });
    await screen.findByText(/Perfil atualizado/);
    expect(
      mocks.api.mock.calls.filter(([path]) => path === "/me/photo"),
    ).toHaveLength(1);
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT"),
    ).toHaveLength(1);
  });

  it("não salva nem captura automaticamente enquanto a câmera está aberta", async () => {
    view();
    await edit();
    const capture = vi.spyOn(HTMLCanvasElement.prototype, "toBlob");
    await userEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
    await waitFor(() =>
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar perfil" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Capture a foto ou feche a câmera",
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
    expect(capture).not.toHaveBeenCalled();
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT"),
    ).toHaveLength(0);
    expect(mocks.api.mock.calls.some(([path]) => path === "/me/photo")).toBe(
      false,
    );
    expect(screen.queryByText(/Perfil atualizado/)).not.toBeInTheDocument();
  });

  it("aguarda as dimensões da nova foto antes de enviar o enquadramento", async () => {
    view();
    await edit();
    await userEvent.upload(
      screen.getByLabelText("Arquivo da foto de identificação"),
      new File(["photo"], "foto.jpg", { type: "image/jpeg" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar perfil" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Aguarde o carregamento da foto",
    );
    expect(mocks.api.mock.calls.some(([path]) => path === "/me/photo")).toBe(
      false,
    );
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT"),
    ).toHaveLength(0);
    await loadPreview();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar perfil" }),
    );
    await screen.findByText(/Perfil atualizado/);
    const upload = mocks.api.mock.calls.find(([path]) => path === "/me/photo");
    const form = upload?.[1].body as unknown as FormData;
    expect(JSON.parse(form.get("crop") as string)).toEqual({
      left: 0.125,
      top: 0,
      size: 1,
    });
  });

  it("mantém a foto já salva e permite repetir somente o PUT se os dados falharem", async () => {
    updateError = new Error("Não foi possível salvar os dados.");
    view();
    await edit();
    await userEvent.clear(screen.getByLabelText("Cidade"));
    await userEvent.type(screen.getByLabelText("Cidade"), "Toledo");
    await selectFile();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar perfil" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar os dados.",
    );
    expect(saved.photoAssetId).toBe(photoId);
    expect(saved.city).toBe("Loanda");
    expect(screen.getByLabelText("Cidade")).toHaveValue("Toledo");
    expect(
      screen.getByRole("img", { name: "Prévia da foto de identificação" }),
    ).toHaveAttribute("src", "/new-photo.jpg");
    updateError = null;
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar perfil" }),
    );
    await screen.findByText(/Perfil atualizado/);
    expect(
      mocks.api.mock.calls.filter(([path]) => path === "/me/photo"),
    ).toHaveLength(1);
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT"),
    ).toHaveLength(2);
    expect(saved).toMatchObject({ city: "Toledo", photoAssetId: photoId });
  });

  it("arquivo ilegível apresenta erro e não salva foto nem dados", async () => {
    view();
    await edit();
    await userEvent.upload(
      screen.getByLabelText("Arquivo da foto de identificação"),
      new File(["invalid"], "foto.jpg", { type: "image/jpeg" }),
    );
    fireEvent.error(
      await screen.findByRole("img", {
        name: "Prévia da foto de identificação",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar perfil" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível ler esta foto",
    );
    expect(
      screen.getByRole("button", { name: "Descartar foto" }),
    ).toBeEnabled();
    expect(mocks.api.mock.calls.some(([path]) => path === "/me/photo")).toBe(
      false,
    );
    expect(
      mocks.api.mock.calls.filter(([, options]) => options?.method === "PUT"),
    ).toHaveLength(0);
  });
});
