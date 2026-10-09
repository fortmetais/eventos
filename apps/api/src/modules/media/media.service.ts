import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { config } from "../../config.js";
import { assert, AppError } from "../../core/errors.js";
import type { PrivateStorage } from "../../core/supabase.js";
import { hashToken } from "../../core/security.js";
import { MediaRepository } from "./media.repository.js";
const cropSchema = z
  .object({
    left: z.number().min(0).max(1),
    top: z.number().min(0).max(1),
    size: z.number().positive().max(1),
  })
  .strict();
export class MediaService {
  constructor(
    private repo: MediaRepository,
    private storage: PrivateStorage,
  ) {}
  async optimize(file: Express.Multer.File | undefined, cropInput: unknown) {
    assert(file, 422, "Escolha uma foto.");
    assert(
      ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype),
      422,
      "Use JPEG, PNG ou WebP.",
    );
    assert(file.size <= 10 * 1024 * 1024, 413, "A foto deve ter até 10 MB.");
    let buffer: Buffer;
    try {
      const source = sharp(file.buffer, {
        limitInputPixels: 40000000,
        animated: false,
      });
      const metadata = await source.metadata();
      assert(
        ["jpeg", "png", "webp"].includes(metadata.format ?? "") &&
          (metadata.pages ?? 1) === 1,
        422,
        "Escolha uma fotografia JPEG, PNG ou WebP estática.",
      );
      const oriented = await source.rotate().toBuffer();
      const dimensions = await sharp(oriented).metadata();
      let image = sharp(oriented);
      if (cropInput) {
        const crop = cropSchema.parse(
          typeof cropInput === "string" ? JSON.parse(cropInput) : cropInput,
        );
        const width = dimensions.width!,
          height = dimensions.height!;
        const side = Math.max(
          1,
          Math.floor(crop.size * Math.min(width, height)),
        );
        const left = Math.round(crop.left * width);
        const top = Math.round(crop.top * height);
        assert(
          left + side <= width && top + side <= height,
          422,
          "O enquadramento deve ficar dentro da foto.",
        );
        image = image.extract({ left, top, width: side, height: side });
      }
      buffer = await image
        .resize(500, 500, { fit: "cover", position: "centre" })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (error) {
      if (error instanceof AppError || error instanceof z.ZodError) throw error;
      throw new AppError(
        422,
        "Não foi possível ler esta foto. Escolha outro arquivo.",
      );
    }
    return buffer;
  }
  async uploadDraft(
    draftId: string,
    token: string,
    file: Express.Multer.File | undefined,
    crop: unknown,
  ) {
    const draft = await this.repo.db.draft.findFirst({
      where: {
        id: draftId,
        tokenHash: hashToken(token),
        expiresAt: { gt: new Date() },
      },
      include: { registration: true, campaign: { include: { event: true } } },
    });
    assert(draft, 401, "Credencial inválida ou expirada.");
    assert(!draft.registration, 409, "Esta inscrição já foi enviada.");
    const buffer = await this.optimize(file, crop);
    const assetId = randomUUID();
    const objectKey = `organizations/${draft.campaign.event.organizationId}/registrations/${draftId}/${assetId}.webp`;
    await this.storage.upload(objectKey, buffer);
    try {
      const asset = await this.repo.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT rascunho_id FROM inscricoes.rascunhos WHERE rascunho_id = ${draftId}::uuid FOR UPDATE`;
        const current = await tx.draft.findFirst({
          where: {
            id: draftId,
            tokenHash: hashToken(token),
            expiresAt: { gt: new Date() },
          },
          include: { registration: true },
        });
        assert(
          current && !current.registration,
          409,
          "A inscrição já foi enviada ou expirou.",
        );
        return tx.mediaAsset.create({
          data: {
            id: assetId,
            organizationId: draft.campaign.event.organizationId,
            draftId,
            objectKey,
            bucket: config.SUPABASE_PRIVATE_BUCKET,
            purpose: "REGISTRATION",
            mimeType: "image/webp",
            size: buffer.length,
          },
        });
      });
      return { id: asset.id, url: await this.storage.signedUrl(objectKey) };
    } catch (error) {
      await this.storage.remove(objectKey).catch(() => {});
      throw error;
    }
  }
  async uploadProfile(
    accountId: string,
    file: Express.Multer.File | undefined,
    crop: unknown,
  ) {
    const buffer = await this.optimize(file, crop);
    const assetId = randomUUID();
    const objectKey = `accounts/${accountId}/${assetId}.webp`;
    await this.storage.upload(objectKey, buffer);
    try {
      const asset = await this.repo.db.mediaAsset.create({
        data: {
          id: assetId,
          accountId,
          objectKey,
          bucket: config.SUPABASE_PRIVATE_BUCKET,
          purpose: "PROFILE",
          mimeType: "image/webp",
          size: buffer.length,
        },
      });
      return { id: asset.id, url: await this.storage.signedUrl(objectKey) };
    } catch (error) {
      await this.storage.remove(objectKey).catch(() => {});
      throw error;
    }
  }
  async draftPhoto(draftId: string, token: string, assetId: string) {
    const draft = await this.repo.db.draft.findFirst({
      where: {
        id: draftId,
        tokenHash: hashToken(token),
        expiresAt: { gt: new Date() },
      },
    });
    assert(draft, 401, "Credencial inválida ou expirada.");
    const asset = await this.repo.db.mediaAsset.findFirst({
      where: { id: assetId, draftId },
    });
    assert(asset, 404, "Foto indisponível.");
    return { url: await this.storage.signedUrl(asset.objectKey) };
  }
  async registrationPhoto(
    registrationId: string,
    scope: { organizationId: string } | { accountId: string },
  ) {
    const registration = await this.repo.db.registration.findFirst({
      where: {
        id: registrationId,
        ...("organizationId" in scope
          ? { campaign: { event: { organizationId: scope.organizationId } } }
          : { accountId: scope.accountId }),
      },
    });
    assert(registration, 404, "Inscrição não encontrada.");
    const assetId = (registration.snapshot as Record<string, unknown>)
      .photoAssetId;
    assert(typeof assetId === "string", 404, "Foto indisponível.");
    const asset = await this.repo.db.mediaAsset.findFirst({
      where: { id: assetId, draftId: registration.draftId },
    });
    assert(asset, 404, "Foto indisponível.");
    return { url: await this.storage.signedUrl(asset.objectKey) };
  }
  async profilePhoto(accountId: string, assetId: string) {
    const asset = await this.repo.db.mediaAsset.findFirst({
      where: { id: assetId, accountId, purpose: "PROFILE" },
    });
    assert(asset, 404, "Foto indisponível.");
    return { url: await this.storage.signedUrl(asset.objectKey) };
  }
}
