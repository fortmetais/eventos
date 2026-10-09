import type { Access } from "./types";

const pendingInvitationKey = "encontro.pendingInvitation";
const invitationReturnLifetime = 24 * 60 * 60 * 1000;
const invitationPath = /^\/convite\/[A-Za-z0-9_-]{43}$/;

export function localDestination(value: string | null): string | null {
  if (!value?.startsWith("/") || /[\\\u0000-\u0020]/.test(value)) return null;
  const base = "https://encontro.invalid";
  try {
    const url = new URL(value, base);
    if (url.origin !== base || url.pathname === "/entrar") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function organizationDestination(access: Access): string {
  return access.organizations.length === 1
    ? `/organizacao/${access.organizations[0].organizationId}`
    : "/organizacao";
}

export function loginDestination(
  access: Access,
  requested: string | null,
): string {
  return (
    localDestination(requested) ??
    (access.account.platformAdmin
      ? "/admin"
      : access.organizations.length
        ? organizationDestination(access)
        : "/meu-perfil")
  );
}

export function rememberInvitation(path: string | null) {
  if (!path || !invitationPath.test(path)) return;
  // Apenas a credencial de retorno e seu prazo, sem dados pessoais ou permissões.
  const context = { path, expiresAt: Date.now() + invitationReturnLifetime };
  let shared = false;
  try {
    localStorage.setItem(pendingInvitationKey, JSON.stringify(context));
    shared = true;
  } catch {
    // O retorno por URL ou pela aba original continua disponível.
  }
  try {
    sessionStorage.setItem(
      pendingInvitationKey,
      JSON.stringify({ ...context, shared }),
    );
  } catch {
    // O parâmetro next continua funcionando quando o armazenamento é bloqueado.
  }
}

export function pendingInvitation(): string | null {
  let sharedStorageAvailable = false;
  for (const storage of ["localStorage", "sessionStorage"] as const) {
    try {
      const stored = window[storage].getItem(pendingInvitationKey);
      if (storage === "localStorage") sharedStorageAvailable = true;
      if (!stored) continue;
      // Compatibilidade com o retorno já salvo em abas abertas antes desta alteração.
      if (storage === "sessionStorage" && invitationPath.test(stored))
        return stored;
      const context = JSON.parse(stored) as {
        path?: unknown;
        expiresAt?: unknown;
        shared?: boolean;
      };
      // Um aceite em outra aba remove o registro compartilhado: não restaurar a cópia antiga.
      if (
        storage === "sessionStorage" &&
        sharedStorageAvailable &&
        context.shared
      ) {
        window[storage].removeItem(pendingInvitationKey);
        continue;
      }
      if (
        typeof context.path === "string" &&
        invitationPath.test(context.path) &&
        typeof context.expiresAt === "number" &&
        Number.isFinite(context.expiresAt) &&
        context.expiresAt > Date.now()
      )
        return context.path;
      window[storage].removeItem(pendingInvitationKey);
    } catch {
      // Uma aba nova pode retomar pelo armazenamento compartilhado ou pela URL.
    }
  }
  return null;
}

export function clearPendingInvitation() {
  for (const storage of ["sessionStorage", "localStorage"] as const) {
    try {
      window[storage].removeItem(pendingInvitationKey);
    } catch {
      // A ausência de armazenamento não interfere no aceite pela API.
    }
  }
}
