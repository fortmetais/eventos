import type { SupabaseClient } from "@supabase/supabase-js";
import { assert } from "./errors.js";
import { supabaseAdmin } from "./supabase.js";

type PasswordAdmin = Pick<
  SupabaseClient["auth"]["admin"],
  "getUserById" | "updateUserById"
>;
export type FirstPasswordUpdater = (
  accountId: string,
  password: string,
) => Promise<void>;

export async function updateFirstPassword(
  accountId: string,
  password: string,
  admin: PasswordAdmin = supabaseAdmin().auth.admin,
) {
  assert(
    password.length >= 12 && password.length <= 128,
    422,
    "Use uma senha entre 12 e 128 caracteres.",
  );
  const current = await admin.getUserById(accountId);
  assert(
    !current.error && current.data.user,
    503,
    "Não foi possível conferir a conta. Tente novamente.",
  );
  assert(
    current.data.user.app_metadata?.must_change_password === true,
    409,
    "A senha temporária já foi substituída. Entre novamente com sua nova senha.",
    "PASSWORD_ALREADY_CHANGED",
  );
  // Password and privileged flag change together. Nothing is sent by the app's mailer.
  const result = await admin.updateUserById(accountId, {
    password,
    app_metadata: {
      ...current.data.user.app_metadata,
      must_change_password: false,
      pw_changed_after: new Date(
        Math.floor(Date.now() / 1000) * 1000,
      ).toISOString(),
    },
  });
  assert(
    !result.error,
    422,
    "Não foi possível salvar a senha. Use uma senha forte e tente novamente.",
  );
}
