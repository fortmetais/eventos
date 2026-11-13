import { createHmac } from "node:crypto";
import type { Invitation } from "@prisma/client";
import { hashToken } from "../../core/security.js";

type LinkIdentity = Pick<
  Invitation,
  "id" | "organizationId" | "email" | "expiresAt"
>;

// Separate purpose from confirmation/guardian tokens that share the server key.
export function invitationLinkToken(value: LinkIdentity, secret: string) {
  return createHmac("sha256", secret)
    .update(
      `organization-invitation:v1:${value.id}:${value.organizationId}:${value.email}:${value.expiresAt.toISOString()}`,
    )
    .digest("base64url");
}

export function recoverInvitationToken(
  value: LinkIdentity & Pick<Invitation, "tokenHash">,
  secret: string | undefined,
) {
  if (!secret) return null;
  const token = invitationLinkToken(value, secret);
  return hashToken(token) === value.tokenHash ? token : null;
}
