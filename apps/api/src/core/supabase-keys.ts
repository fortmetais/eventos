type KeySettings = {
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function legacyRole(key: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString("utf8"),
    );
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function supabaseKeys(settings: KeySettings) {
  const publicKey =
    settings.SUPABASE_PUBLISHABLE_KEY || settings.SUPABASE_ANON_KEY;
  const secretKey =
    settings.SUPABASE_SECRET_KEY || settings.SUPABASE_SERVICE_ROLE_KEY;
  if (
    publicKey &&
    (publicKey.startsWith("sb_secret_") ||
      legacyRole(publicKey) === "service_role")
  )
    throw new Error(
      "Uma chave privada foi configurada como chave pública do Supabase. Corrija o .env antes de iniciar a API.",
    );
  if (
    secretKey &&
    (secretKey.startsWith("sb_publishable_") ||
      legacyRole(secretKey) === "anon")
  )
    throw new Error(
      "A chave privada do Supabase deve ser secret ou service_role. Corrija o .env da API.",
    );
  return { SUPABASE_ANON_KEY: publicKey, SUPABASE_SERVICE_ROLE_KEY: secretKey };
}
