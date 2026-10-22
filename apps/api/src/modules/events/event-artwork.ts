import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { AppError, assert } from "../../core/errors.js";
import type { ArtworkStorage } from "../../core/artwork-storage.js";
import { uploadImagePair } from "../../core/image-thumbnails.js";
import type { Event } from "@prisma/client";

export type StoredArtwork = {
  bucket: string;
  key: string;
  thumbnailKey?: string | null;
};
export type EventArtworkValues = Partial<
  Pick<
    Event,
    | "imageUrl"
    | "imageBucket"
    | "imageKey"
    | "imageThumbnailKey"
    | "mobileImageUrl"
    | "mobileImageBucket"
    | "mobileImageKey"
  >
>;
export class EventArtwork {
  constructor(private storage: ArtworkStorage) {}
  private async uploadArtwork(
    organizationId: string,
    eventId: string,
    file: Express.Multer.File,
    mobile = false,
  ) {
    assert(
      file.size <= 10 * 1024 * 1024,
      413,
      "Escolha uma arte com até 10 MB.",
    );
    let buffer: Buffer;
    let thumbnail: Buffer | undefined;
    try {
      const image = sharp(file.buffer, {
        limitInputPixels: 40_000_000,
        animated: false,
      });
      const metadata = await image.metadata();
      assert(
        ["jpeg", "png", "webp"].includes(metadata.format ?? "") &&
          (metadata.pages ?? 1) === 1,
        422,
        "Escolha uma arte JPEG, PNG ou WebP, sem animação.",
      );
      // Preserve todo o cartaz, inclusive textos; não aplicar corte 9:16 automático.
      buffer = await image
        .clone()
        .rotate()
        .resize({
          width: mobile ? 960 : 1920,
          height: mobile ? 1280 : 1920,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: mobile ? 84 : 88 })
        .toBuffer();
      if (!mobile)
        thumbnail = await image
          .autoOrient()
          .resize(320, 570, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        422,
        "A imagem não pôde ser lida. Escolha outro arquivo JPEG, PNG ou WebP.",
      );
    }
    const key = `${organizationId}/${eventId}/${randomUUID()}${mobile ? "-mobile" : ""}.webp`;
    if (mobile)
      return {
        ...(await this.storage.upload(key, buffer)),
        thumbnailKey: null,
      };
    return uploadImagePair(this.storage, key, buffer, thumbnail!);
  }
  mobileValues(
    image: (StoredArtwork & { url: string }) | undefined,
    remove?: boolean,
  ) {
    return image
      ? {
          mobileImageUrl: image.url,
          mobileImageBucket: image.bucket,
          mobileImageKey: image.key,
        }
      : remove
        ? {
            mobileImageUrl: null,
            mobileImageBucket: null,
            mobileImageKey: null,
          }
        : {};
  }
  async uploadChanges(
    organizationId: string,
    eventId: string,
    file?: Express.Multer.File,
    mobileFile?: Express.Multer.File,
  ) {
    const desktop = file
      ? await this.uploadArtwork(organizationId, eventId, file)
      : undefined;
    try {
      const mobile = mobileFile
        ? await this.uploadArtwork(organizationId, eventId, mobileFile, true)
        : undefined;
      return { desktop, mobile };
    } catch (error) {
      if (desktop)
        await this.cleanup(desktop.bucket, desktop.key, desktop.thumbnailKey);
      throw error;
    }
  }
  async cleanup(bucket: string, key: string, thumbnailKey?: string | null) {
    if (thumbnailKey) await this.cleanup(bucket, thumbnailKey);
    try {
      await this.storage.remove(bucket, key);
    } catch {
      console.warn(JSON.stringify({ event: "artwork_cleanup_pending" }));
    }
  }
}
