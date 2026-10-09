import { describe, expect, it } from "vitest";
import { supabaseKeys } from "../src/core/supabase-keys.js";
const legacy = (role: string) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
describe("Configuração de chaves Supabase", () => {
  it("usa chaves atuais sem publicar a chave privada", () => {
    const keys = supabaseKeys({
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      SUPABASE_SECRET_KEY: "sb_secret_test",
    });
    expect(keys.SUPABASE_ANON_KEY).toBe("sb_publishable_test");
    expect(keys.SUPABASE_SERVICE_ROLE_KEY).toBe("sb_secret_test");
  });
  it("aceita as chaves legadas compatíveis", () => {
    expect(
      supabaseKeys({
        SUPABASE_ANON_KEY: legacy("anon"),
        SUPABASE_SERVICE_ROLE_KEY: legacy("service_role"),
      }).SUPABASE_ANON_KEY,
    ).toBe(legacy("anon"));
  });
  it("bloqueia chaves privadas na configuração pública", () => {
    expect(() => supabaseKeys({ SUPABASE_ANON_KEY: "sb_secret_test" })).toThrow(
      "chave privada",
    );
    expect(() =>
      supabaseKeys({ SUPABASE_PUBLISHABLE_KEY: legacy("service_role") }),
    ).toThrow("chave privada");
  });
  it("bloqueia uma chave pública usada como chave administrativa", () => {
    expect(() =>
      supabaseKeys({ SUPABASE_SECRET_KEY: "sb_publishable_test" }),
    ).toThrow("chave privada");
    expect(() =>
      supabaseKeys({ SUPABASE_SERVICE_ROLE_KEY: legacy("anon") }),
    ).toThrow("chave privada");
  });
});
