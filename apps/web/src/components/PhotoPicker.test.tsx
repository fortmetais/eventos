import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhotoPicker } from "./PhotoPicker";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
let getUserMedia: ReturnType<typeof vi.fn>;
let stop: ReturnType<typeof vi.fn>;
let media: MediaStream;
beforeEach(() => {
  mocks.api.mockReset();
  stop = vi.fn();
  media = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  getUserMedia = vi.fn().mockResolvedValue(media);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
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
const picker = (uploaded = vi.fn()) =>
  render(<PhotoPicker endpoint="/me/photo" onUploaded={uploaded} />);

describe("Foto pela câmera", () => {
  it("solicita apenas vídeo ao clicar e libera a câmera ao cancelar", async () => {
    picker();
    expect(getUserMedia).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
    await waitFor(() =>
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled(),
    );
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false }),
    );
    expect(
      screen.getByRole("button", { name: "Capturar foto" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(stop).toHaveBeenCalledOnce();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("libera uma câmera cuja permissão chega depois de sair da página", async () => {
    let resolve!: (value: MediaStream) => void;
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((done) => {
        resolve = done;
      }),
    );
    const view = picker();
    await userEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
    view.unmount();
    resolve(media);
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("mostra orientação quando a permissão é negada e mantém a escolha de arquivo", async () => {
    getUserMedia.mockRejectedValue(
      new DOMException("Denied", "NotAllowedError"),
    );
    picker();
    await userEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Permita o acesso à câmera",
    );
    expect(screen.getByRole("button", { name: "Escolher foto" })).toBeEnabled();
  });

  it("captura JPEG, permite enquadrar e só envia após confirmação", async () => {
    const uploaded = vi.fn();
    mocks.api.mockResolvedValue({ id: "photo-id", url: "/photo.jpg" });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["photo"], { type: "image/jpeg" })),
    );
    picker(uploaded);
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
    await userEvent.click(
      screen.getByRole("button", { name: "Capturar foto" }),
    );
    expect(stop).toHaveBeenCalledOnce();
    expect(mocks.api).not.toHaveBeenCalled();
    const photo = await screen.findByRole("img");
    Object.defineProperties(photo, {
      naturalWidth: { value: 640 },
      naturalHeight: { value: 480 },
    });
    fireEvent.load(photo);
    await userEvent.click(
      screen.getByRole("button", { name: "Usar esta foto" }),
    );
    expect(uploaded).toHaveBeenCalledWith("photo-id", "/photo.jpg");
    const form = mocks.api.mock.calls[0][1].body as FormData;
    expect((form.get("photo") as File).type).toBe("image/jpeg");
    expect(JSON.parse(form.get("crop") as string)).toEqual({
      left: 0.125,
      top: 0,
      size: 1,
    });
  });
});
