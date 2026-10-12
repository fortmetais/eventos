import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { ArtworkStorage } from "../../core/artwork-storage.js";
import { AppError, assert } from "../../core/errors.js";

export async function uploadFormBanner(
  storage: ArtworkStorage,
  organizationId: string,
  eventId: string,
  file: Express.Multer.File,
) {
  assert(
    file.size <= 10 * 1024 * 1024,
    413,
    "Escolha um banner com até 10 MB.",
  );
  assert(
    ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype),
    422,
    "Escolha um banner JPEG, PNG ou WebP.",
  );
  let result;
  try {
    const image = sharp(file.buffer, {
      limitInputPixels: 40_000_000,
      animated: true,
    });
    const metadata = await image.metadata();
    assert(
      ["jpeg", "png", "webp"].includes(metadata.format ?? "") &&
        (metadata.pages ?? 1) === 1,
      422,
      "Escolha um banner JPEG, PNG ou WebP sem animação.",
    );
    result = await image
      .autoOrient()
      .resize(1600, 800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
    const ratio = result.info.width / result.info.height;
    assert(
      ratio >= 2 && ratio <= 6,
      422,
      "Envie um banner horizontal, entre 2:1 e 6:1. Recomendamos 1600 × 400 pixels (4:1).",
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      422,
      "Não foi possível ler o banner. Escolha outra imagem.",
    );
  }
  const asset = await storage.upload(
    `organizacoes/${organizationId}/eventos/${eventId}/fichas/banners/${randomUUID()}.webp`,
    result.data,
  );
  return { ...asset, width: result.info.width, height: result.info.height };
}
