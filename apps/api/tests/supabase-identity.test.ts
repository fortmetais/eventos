import { beforeEach, describe, expect, it, vi } from "vitest";
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser } }),
}));
vi.mock("../src/config.js", () => ({
  config: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  },
}));
import { resolveSupabaseIdentity } from "../src/core/supabase.js";
import { passwordSessionIsCurrent } from "../src/core/password-session.js";

const identity = {
  id: "bc04aac8-b4ab-4d3e-a248-57fbde4922fc",
  email: "account@example.test",
  email_confirmed_at: "2026-11-12T00:00:00Z",
};
function token(payload: unknown) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}
function returnedUser(app_metadata: object = {}, user_metadata: object = {}) {
  getUser.mockResolvedValue({
    data: { user: { ...identity, app_metadata, user_metadata } },
    error: null,
  });
}

describe("identidade verificada para troca obrigatória", () => {
  beforeEach(() => getUser.mockReset());

  it("confia na flag atual de app_metadata retornada pelo servidor", async () => {
    returnedUser({ must_change_password: true });
    const jwt = token({ app_metadata: { must_change_password: false } });
    expect(await resolveSupabaseIdentity(jwt)).toEqual({
      id: identity.id,
      email: identity.email,
      passwordChangeRequired: true,
    });
    expect(getUser).toHaveBeenCalledExactlyOnceWith(jwt);
  });

  it("não confia em user_metadata ou em metadados antigos do JWT", async () => {
    returnedUser({}, { must_change_password: true });
    expect(
      await resolveSupabaseIdentity(
        token({ app_metadata: { must_change_password: true } }),
      ),
    ).toEqual({ id: identity.id, email: identity.email });
  });

  it("recusa sessões anteriores à troca e aceita login posterior", async () => {
    returnedUser({ pw_changed_after: "2026-11-12T15:40:20.123Z" });
    const previous = Math.floor(Date.parse("2026-11-12T15:40:20Z") / 1000);
    expect(await resolveSupabaseIdentity(token({ iat: previous }))).toBeNull();
    expect(await resolveSupabaseIdentity(token({ iat: previous + 1 }))).toEqual(
      { id: identity.id, email: identity.email },
    );
  });

  it("aceita novo login emitido no mesmo segundo do corte", async () => {
    returnedUser({ pw_changed_after: "2026-11-12T15:40:20.000Z" });
    const changedAt = Date.parse("2026-11-12T15:40:20Z") / 1000;
    expect(
      await resolveSupabaseIdentity(token({ iat: changedAt - 1 })),
    ).toBeNull();
    expect(await resolveSupabaseIdentity(token({ iat: changedAt }))).toEqual({
      id: identity.id,
      email: identity.email,
    });
  });

  it("não aceita token quando a verificação do Supabase falha", async () => {
    getUser.mockResolvedValue({
      data: { user: identity },
      error: { message: "invalid token" },
    });
    expect(
      await resolveSupabaseIdentity(token({ iat: 9999999999 })),
    ).toBeNull();
  });
});

describe("corte das sessões com a senha temporária", () => {
  it("preserva contas sem corte configurado", () => {
    expect(passwordSessionIsCurrent("opaque-valid-token", undefined)).toBe(
      true,
    );
  });

  it.each([
    ["bad-token", "2026-11-12T00:00:00Z"],
    [token({}), "2026-11-12T00:00:00Z"],
    [token({ iat: "1794441600" }), "2026-11-12T00:00:00Z"],
    [token(null), "2026-11-12T00:00:00Z"],
    [token({ iat: 9999999999 }), "not-a-date"],
    [token({ iat: 9999999999 }), true],
    [token({ iat: 9999999999 }), null],
    ["header.!!!.signature", "2026-11-12T00:00:00Z"],
  ])("recusa sessão/corte inválido", (jwt, cutoff) => {
    expect(passwordSessionIsCurrent(jwt, cutoff)).toBe(false);
  });
});
