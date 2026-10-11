import { afterEach, describe, expect, it, vi } from "vitest";
import { preparePhotoUpload } from "./photo-upload";

afterEach(() => vi.restoreAllMocks());
function source(width = 4000, height = 3000) {
  const image = document.createElement("img");
  Object.defineProperties(image, {
    naturalWidth: { value: width },
    naturalHeight: { value: height },
  });
  return image;
}
describe("Envio de fotos menores", () => {
  it("envia somente o enquadramento sem nova perda por JPEG", async () => {
    const image = source();
    const file = new File([new Uint8Array(300_000)], "celular.jpg", {
      type: "image/jpeg",
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const encoding = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) =>
        callback(new Blob([new Uint8Array(20_000)], { type: "image/png" })),
      );
    const prepared = await preparePhotoUpload(file, image, {
      left: 0.25,
      top: 0.1,
      size: 0.5,
    });
    expect(drawImage).toHaveBeenCalledWith(
      image,
      1000,
      300,
      1500,
      1500,
      0,
      0,
      1000,
      1000,
    );
    expect(encoding).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(prepared.file.size).toBe(20_000);
    expect(prepared.file.type).toBe("image/png");
    expect(prepared.crop).toEqual({ left: 0, top: 0, size: 1 });
  });
  it("mantém arquivo e recorte quando a versão preparada seria maior", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["larger"], { type: "image/png" })),
    );
    const file = new File(["small"], "foto.webp", { type: "image/webp" });
    const crop = { left: 0.2, top: 0.1, size: 0.5 };
    expect(await preparePhotoUpload(file, source(), crop)).toEqual({
      file,
      crop,
    });
  });
  it("mantém o envio atual se a preparação falhar e não amplia fotos pequenas", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => {
        throw new Error("Canvas indisponível");
      },
    );
    const file = new File(["photo"], "foto.jpg", { type: "image/jpeg" });
    const crop = { left: 0, top: 0, size: 1 };
    expect(await preparePhotoUpload(file, source(), crop)).toEqual({
      file,
      crop,
    });
    expect(await preparePhotoUpload(file, source(500, 500), crop)).toEqual({
      file,
      crop,
    });
  });
  it("recusa imagens que excedem o limite de pixels do servidor", async () => {
    await expect(
      preparePhotoUpload(
        new File(["photo"], "foto.jpg"),
        source(10000, 10000),
        { left: 0, top: 0, size: 1 },
      ),
    ).rejects.toThrow("40 megapixels");
  });
});
