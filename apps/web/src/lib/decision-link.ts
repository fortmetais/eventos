/** Decode the compact UUID + unchanged credential. This is transport encoding, not authorization. */
export function decodeDecisionLink(code: string) {
  if (!/^[A-Za-z0-9_-]{64}$/.test(code))
    throw new Error("Abra o link completo recebido da organização.");
  const bytes = atob(code.replaceAll("-", "+").replaceAll("_", "/"));
  const hex = [...bytes.slice(0, 16)]
    .map((byte) => byte.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  const noticeId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      noticeId,
    )
  )
    throw new Error(
      "Este link é inválido. Confira o link recebido da organização.",
    );
  const token = btoa(bytes.slice(16))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return { noticeId, token };
}
