import { config } from "../config.js";
import { AppError, assert } from "./errors.js";
import { supabaseAdmin } from "./supabase.js";

export interface ArtworkStorage {
  upload(
    key: string,
    buffer: Buffer,
  ): Promise<{ bucket: string; key: string; url: string }>;
  remove(bucket: string, key: string): Promise<void>;
}

export async function prepareArtworkBucket() {
  const bucket = config.SUPABASE_ARTWORK_BUCKET;
  assert(
    bucket !== config.SUPABASE_PRIVATE_BUCKET,
    503,
    "A arte do evento precisa de um armazenamento separado das fotos de identificação.",
  );
  const storage = supabaseAdmin().storage;
  let { data, error } = await storage.getBucket(bucket);
  if (error && error.message.toLowerCase().includes("not found")) {
    await storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/webp"],
    });
    ({ data, error } = await storage.getBucket(bucket));
  }
  if (error || !data?.public)
    throw new AppError(
      503,
      "Não foi possível preparar o armazenamento da arte. Confira a configuração do Supabase.",
      "ARTWORK_STORAGE_REQUIRED",
    );
  return bucket;
}

export const artworkStorage: ArtworkStorage = {
  async upload(key, buffer) {
    const bucket = await prepareArtworkBucket();
    const storage = supabaseAdmin().storage.from(bucket);
    const { error } = await storage.upload(key, buffer, {
      contentType: "image/webp",
      upsert: false,
    });
    if (error)
      throw new AppError(
        503,
        "Não foi possível guardar a arte. Tente novamente.",
        "ARTWORK_STORAGE_UNAVAILABLE",
      );
    return { bucket, key, url: storage.getPublicUrl(key).data.publicUrl };
  },
  async remove(bucket, key) {
    // Nunca remover arquivos de outros buckets por uma entrada da requisição.
    assert(
      bucket === config.SUPABASE_ARTWORK_BUCKET,
      503,
      "Armazenamento da arte não reconhecido.",
    );
    const { error } = await supabaseAdmin().storage.from(bucket).remove([key]);
    if (error)
      throw new AppError(503, "Não foi possível remover a arte anterior.");
  },
};
