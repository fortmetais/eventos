import "dotenv/config";
import { supabaseAdmin } from "../src/core/supabase.js";
import { config } from "../src/config.js";
const client = supabaseAdmin();
const { data } = await client.storage.getBucket(config.SUPABASE_PRIVATE_BUCKET);
if (data?.public)
  throw new Error(
    "O bucket existente é público. Configure-o como privado no Supabase antes de continuar.",
  );
if (!data) {
  const { error } = await client.storage.createBucket(
    config.SUPABASE_PRIVATE_BUCKET,
    {
      public: false,
      fileSizeLimit: 2 * 1024 * 1024,
      allowedMimeTypes: ["image/webp"],
    },
  );
  if (error)
    throw new Error(
      "Não foi possível criar o bucket privado. Confira a configuração do Supabase.",
    );
}
console.info(
  "Armazenamento privado preparado. Não foram criadas políticas de acesso direto pelo navegador.",
);
