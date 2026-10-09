import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { AppError } from "./errors.js";
import type { IdentityResolver } from "./auth.js";

let client: SupabaseClient | undefined;
export function supabaseAdmin() {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY)
    throw new AppError(
      503,
      "O acesso e o armazenamento ainda não foram configurados.",
      "SETUP_REQUIRED",
    );
  return (client ??= createClient(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ));
}
export const resolveSupabaseIdentity: IdentityResolver = async (token) => {
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user?.email || !data.user.email_confirmed_at) return null;
  return { id: data.user.id, email: data.user.email };
};
export interface PrivateStorage {
  upload(key: string, buffer: Buffer): Promise<void>;
  signedUrl(key: string): Promise<string>;
  remove(key: string): Promise<void>;
}
async function requirePrivateBucket() {
  const { data, error } = await supabaseAdmin().storage.getBucket(
    config.SUPABASE_PRIVATE_BUCKET,
  );
  if (error || !data || data.public)
    throw new AppError(
      503,
      "O armazenamento privado de fotos ainda não está disponível.",
      "PRIVATE_STORAGE_REQUIRED",
    );
}
export const privateStorage: PrivateStorage = {
  async upload(key, buffer) {
    await requirePrivateBucket();
    const { error } = await supabaseAdmin()
      .storage.from(config.SUPABASE_PRIVATE_BUCKET)
      .upload(key, buffer, { contentType: "image/webp", upsert: false });
    if (error)
      throw new AppError(
        503,
        "Não foi possível guardar sua foto. Tente novamente.",
        "STORAGE_UNAVAILABLE",
      );
  },
  async signedUrl(key) {
    await requirePrivateBucket();
    const { data, error } = await supabaseAdmin()
      .storage.from(config.SUPABASE_PRIVATE_BUCKET)
      .createSignedUrl(key, 120);
    if (error || !data)
      throw new AppError(503, "Foto indisponível no momento.");
    return data.signedUrl;
  },
  async remove(key) {
    const { error } = await supabaseAdmin()
      .storage.from(config.SUPABASE_PRIVATE_BUCKET)
      .remove([key]);
    if (error) throw new AppError(503, "Não foi possível remover o arquivo.");
  },
};
