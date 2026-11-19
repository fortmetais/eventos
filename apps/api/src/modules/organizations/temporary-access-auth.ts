import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, assert } from "../../core/errors.js";
import { supabaseAdmin } from "../../core/supabase.js";

export interface TemporaryAccessUser {
  id: string;
  email?: string;
  app_metadata: Record<string, unknown>;
}
export interface TemporaryAccessAuth {
  findUserByEmail(email: string): Promise<TemporaryAccessUser | null>;
  createUser(
    email: string,
    password: string,
    metadata: Record<string, unknown>,
  ): Promise<TemporaryAccessUser>;
  updateUser(
    userId: string,
    password: string,
    metadata: Record<string, unknown>,
  ): Promise<TemporaryAccessUser>;
}
type Admin = Pick<
  SupabaseClient["auth"]["admin"],
  "listUsers" | "getUserById" | "createUser" | "updateUserById"
>;

export function temporaryAccessAuth(
  resolveAdmin: () => Admin = () => supabaseAdmin().auth.admin,
): TemporaryAccessAuth {
  const unavailable = () =>
    new AppError(503, "Não foi possível preparar o acesso. Tente novamente.");
  return {
    async findUserByEmail(email) {
      const admin = resolveAdmin();
      // Auth has no exact-email lookup in the admin SDK. Match exact addresses
      // across pages, then refresh metadata before any privileged modification.
      for (let page = 1; page <= 100; page++) {
        const result = await admin.listUsers({ page, perPage: 1000 });
        if (result.error) throw unavailable();
        const matching = result.data.users.filter(
          (user) => user.email?.toLowerCase() === email.toLowerCase(),
        );
        assert(
          matching.length <= 1,
          409,
          "Há mais de uma conta para este e-mail.",
        );
        if (matching[0]) {
          const current = await admin.getUserById(matching[0].id);
          if (current.error || !current.data.user) throw unavailable();
          assert(
            current.data.user.email?.toLowerCase() === email.toLowerCase(),
            409,
            "O e-mail da conta mudou. Confira o convite antes de continuar.",
          );
          return current.data.user;
        }
        if (result.data.users.length < 1000) return null;
      }
      throw unavailable();
    },
    async createUser(email, password, metadata) {
      const result = await resolveAdmin().createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: metadata,
      });
      if (result.error || !result.data.user) throw unavailable();
      return result.data.user;
    },
    async updateUser(userId, password, metadata) {
      const result = await resolveAdmin().updateUserById(userId, {
        password,
        email_confirm: true,
        app_metadata: metadata,
      });
      if (result.error || !result.data.user) throw unavailable();
      return result.data.user;
    },
  };
}
