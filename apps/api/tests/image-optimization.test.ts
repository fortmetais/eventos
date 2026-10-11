import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { PrivateStorage } from "../src/core/supabase.js";
import {
  eventThumbnail,
  organizationThumbnail,
  publicThumbnailUrl,
  uploadImagePair,
} from "../src/core/image-thumbnails.js";
import { MediaService } from "../src/modules/media/media.service.js";
import type { MediaRepository } from "../src/modules/media/media.repository.js";

describe("Fotos sem compressão intermediária", () => {
  const service = new MediaService({} as MediaRepository, {} as PrivateStorage);
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    "preserva o recorte na orientação EXIF %s",
    async (orientation) => {
      const width = 120,
        height = 80,
        pixels = Buffer.alloc(width * height * 3);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const p = (y * width + x) * 3;
          pixels[p] = x * 2;
          pixels[p + 1] = y * 3;
          pixels[p + 2] = x < 60 ? 30 : 200;
        }
      const input = await sharp(pixels, { raw: { width, height, channels: 3 } })
        .withMetadata({ orientation })
        .jpeg({ quality: 100 })
        .toBuffer();
      const oriented = await sharp(input)
        .autoOrient()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const dimensions = (await sharp(input).metadata()).autoOrient;
      const side = Math.floor(
        Math.min(dimensions.width, dimensions.height) * 0.5,
      );
      const expected = await sharp(oriented.data, { raw: oriented.info })
        .extract({
          left: Math.round(dimensions.width * 0.25),
          top: Math.round(dimensions.height * 0.25),
          width: side,
          height: side,
        })
        .resize(500, 500)
        .webp({ quality: 82 })
        .toBuffer();
      const actual = await service.optimize(
        {
          buffer: input,
          size: input.length,
          mimetype: "image/jpeg",
        } as Express.Multer.File,
        { left: 0.25, top: 0.25, size: 0.5 },
      );
      expect(actual.equals(expected)).toBe(true);
      expect(await sharp(actual).metadata()).toMatchObject({
        width: 500,
        height: 500,
        format: "webp",
      });
    },
  );
});

describe("Miniaturas públicas", () => {
  it("deriva a URL pelo bucket e mantém imagens antigas sem miniatura", () => {
    const url =
      "https://project.supabase.co/storage/v1/object/public/artes-eventos/org/arte.webp";
    expect(
      publicThumbnailUrl(url, "org/arte.webp", "org/arte-thumb.webp"),
    ).toBe(url.replace("arte.webp", "arte-thumb.webp"));
    expect(
      organizationThumbnail({ logoUrl: "https://external.test/logo.png" })
        .logoThumbnailUrl,
    ).toBeNull();
    expect(
      eventThumbnail({ imageUrl: url, imageKey: "org/arte.webp" })
        .imageThumbnailUrl,
    ).toBeNull();
    expect(
      publicThumbnailUrl(
        "https://external.test/different.png",
        "org/arte.webp",
        "org/arte-thumb.webp",
      ),
    ).toBeNull();
  });
  it("remove os dois arquivos se o segundo upload falhar", async () => {
    const storage = {
      upload: vi
        .fn()
        .mockResolvedValueOnce({
          bucket: "artes-eventos",
          key: "org/arte.webp",
          url: "https://cdn.test/org/arte.webp",
        })
        .mockRejectedValueOnce(new Error("upload failed")),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      uploadImagePair(
        storage,
        "org/arte.webp",
        Buffer.from("main"),
        Buffer.from("thumb"),
      ),
    ).rejects.toThrow("upload failed");
    expect(storage.remove).toHaveBeenCalledWith(
      "artes-eventos",
      "org/arte.webp",
    );
    expect(storage.remove).toHaveBeenCalledWith(
      "artes-eventos",
      "org/arte-thumb.webp",
    );
  });
});
