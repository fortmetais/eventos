import type { PrismaClient } from "@prisma/client";
import { config } from "../../config.js";
import type { PrivateStorage } from "../../core/supabase.js";

/** Account writers share this lock and validate the asset inside the transaction. */
export async function cleanupProfilePhoto(
  db: PrismaClient,
  storage: PrivateStorage,
  assetId: string,
  dryRun = false,
) {
  const candidate = await db.mediaAsset.findUnique({ where: { id: assetId } });
  if (
    !candidate?.accountId ||
    candidate.purpose !== "PROFILE" ||
    candidate.bucket !== config.SUPABASE_PRIVATE_BUCKET
  )
    return false;
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT conta_id FROM acesso.contas WHERE conta_id = ${candidate.accountId}::uuid FOR UPDATE`;
      const asset = await tx.mediaAsset.findUnique({ where: { id: assetId } });
      if (
        !asset ||
        asset.purpose !== "PROFILE" ||
        asset.accountId !== candidate.accountId ||
        asset.draftId
      )
        return false;
      const [reference] = await tx.$queryRaw<{ used: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM acesso.contas WHERE perfil->>'photoAssetId' = ${assetId})
        OR EXISTS(SELECT 1 FROM inscricoes.rascunhos WHERE respostas->>'photoAssetId' = ${assetId})
        OR EXISTS(SELECT 1 FROM inscricoes.inscricoes WHERE respostas->>'photoAssetId' = ${assetId}) AS used`;
      if (reference?.used !== false) return false;
      if (!dryRun) {
        // Retain metadata on storage failure so the next cleanup can retry.
        await storage.remove(asset.objectKey);
        await tx.mediaAsset.delete({ where: { id: assetId } });
      }
      return true;
    },
    { timeout: 15_000 },
  );
}

export async function tryCleanupProfilePhoto(
  db: PrismaClient,
  storage: PrivateStorage,
  assetId?: string,
) {
  if (!assetId) return;
  try {
    await cleanupProfilePhoto(db, storage, assetId);
  } catch {
    console.warn(
      JSON.stringify({ event: "profile_photo_cleanup_pending", assetId }),
    );
  }
}
