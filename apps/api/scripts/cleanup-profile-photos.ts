import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { privateStorage } from "../src/core/supabase.js";
import { cleanupProfilePhoto } from "../src/modules/media/profile-photo-cleanup.js";
import { config } from "../src/config.js";

const apply = process.argv.includes("--apply");
const db = new PrismaClient();
let eligible = 0,
  failures = 0;
try {
  const assets = await db.$queryRaw<{ id: string }[]>`
    SELECT a.arquivo_id AS id FROM arquivos.arquivos a
    WHERE a.finalidade = 'PROFILE' AND a.conta_id IS NOT NULL AND a.rascunho_id IS NULL
      AND a.bucket = ${config.SUPABASE_PRIVATE_BUCKET}
      AND NOT EXISTS (SELECT 1 FROM acesso.contas c WHERE c.perfil->>'photoAssetId' = a.arquivo_id::text)
      AND NOT EXISTS (SELECT 1 FROM inscricoes.rascunhos d WHERE d.respostas->>'photoAssetId' = a.arquivo_id::text)
      AND NOT EXISTS (SELECT 1 FROM inscricoes.inscricoes r WHERE r.respostas->>'photoAssetId' = a.arquivo_id::text)
    ORDER BY a.criado_em, a.arquivo_id LIMIT 500`;
  for (const asset of assets) {
    try {
      if (await cleanupProfilePhoto(db, privateStorage, asset.id, !apply))
        eligible++;
    } catch {
      failures++;
    }
  }
  console.info(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      checked: assets.length,
      eligible,
      removed: apply ? eligible : 0,
      failures,
    }),
  );
  if (failures) process.exitCode = 1;
} finally {
  await db.$disconnect();
}
