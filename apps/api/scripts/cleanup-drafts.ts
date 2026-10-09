import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { privateStorage } from "../src/core/supabase.js";
const db = new PrismaClient();
try {
  const expired = await db.draft.findMany({
    where: { expiresAt: { lt: new Date() }, registration: null },
    include: { assets: true },
    take: 500,
  });
  for (const draft of expired) {
    for (const asset of draft.assets)
      await privateStorage.remove(asset.objectKey);
    await db.$transaction([
      db.mediaAsset.deleteMany({ where: { draftId: draft.id } }),
      db.draft.delete({ where: { id: draft.id } }),
    ]);
  }
  console.info(
    `${expired.length} rascunhos expirados removidos. Inscrições enviadas foram preservadas.`,
  );
} finally {
  await db.$disconnect();
}
