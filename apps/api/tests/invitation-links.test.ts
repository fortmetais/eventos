import { describe, expect, it } from "vitest";
import {
  invitationLinkToken,
  recoverInvitationToken,
} from "../src/modules/organizations/invitation-links.js";
import { hashToken, newToken } from "../src/core/security.js";

const secret = "chave-local-de-teste-para-convites-123456";
const identity = {
  id: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000002",
  email: "convidado@example.test",
  expiresAt: new Date("2030-03-12T12:00:00.123Z"),
};
describe("Recuperação de link de convite", () => {
  it("recupera o mesmo token validado pelo hash, sem armazenar texto do link", () => {
    const token = invitationLinkToken(identity, secret);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = { ...identity, tokenHash: hashToken(token) };
    expect(recoverInvitationToken(stored, secret)).toBe(token);
    expect(recoverInvitationToken(stored, undefined)).toBeNull();
    expect(recoverInvitationToken(stored, secret + "outra-chave")).toBeNull();
  });
  it("não tenta reconstruir tokens aleatórios de convites antigos", () => {
    expect(
      recoverInvitationToken(
        { ...identity, tokenHash: hashToken(newToken()) },
        secret,
      ),
    ).toBeNull();
  });
  it.each([
    { id: "00000000-0000-4000-8000-000000000003" },
    { organizationId: "00000000-0000-4000-8000-000000000004" },
    { email: "outra@example.test" },
    { expiresAt: new Date("2030-03-12T12:00:00.124Z") },
  ])(
    "vincula o token a todos os dados de identificação e ao prazo (%j)",
    (change) => {
      const tokenHash = hashToken(invitationLinkToken(identity, secret));
      expect(
        recoverInvitationToken({ ...identity, ...change, tokenHash }, secret),
      ).toBeNull();
    },
  );
});
