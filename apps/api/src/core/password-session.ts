/** Called only after Supabase has verified the token and returned fresh app_metadata. */
export function passwordSessionIsCurrent(token: string, changedAfter: unknown) {
  if (changedAfter === undefined) return true;
  if (typeof changedAfter !== "string") return false;
  const cutoff = Date.parse(changedAfter);
  if (!Number.isFinite(cutoff)) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return false;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return (
      typeof payload.iat === "number" &&
      Number.isFinite(payload.iat) &&
      payload.iat * 1000 >= cutoff
    );
  } catch {
    return false;
  }
}
