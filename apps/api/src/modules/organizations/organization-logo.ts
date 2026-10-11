import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { uploadImagePair } from "../../core/image-thumbnails.js";
import { AppError, assert } from "../../core/errors.js";
import type { ArtworkStorage } from "../../core/artwork-storage.js";

export async function uploadOrganizationLogo(
  storage: ArtworkStorage,
  organizationId: string,
  file: Express.Multer.File,
) {
  assert(
    file.size <= 10 * 1024 * 1024,
    413,
    "Escolha um logotipo com até 10 MB.",
  );
  assert(
    ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype),
    422,
    "Escolha um logotipo JPEG, PNG ou WebP.",
  );
  let buffer: Buffer;
  let thumbnail: Buffer;
  try {
    const image = sharp(file.buffer, {
      limitInputPixels: 40_000_000,
      animated: true,
    });
    const metadata = await image.metadata();
    assert(
      ["jpeg", "png", "webp"].includes(metadata.format ?? "") &&
        (metadata.pages ?? 1) === 1 &&
        metadata.width &&
        metadata.height,
      422,
      "Escolha um logotipo JPEG, PNG ou WebP sem animação.",
    );
    buffer = await image.clone()
      .rotate()
      .resize(800, 800, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
    thumbnail = await image.autoOrient().resize(160, 160, { fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      422,
      "Não foi possível ler o logotipo. Escolha outra imagem.",
    );
  }
  return uploadImagePair(storage,
    `organizacoes/${organizationId}/logotipo/${randomUUID()}.webp`,
    buffer,
    thumbnail,
  );
}
