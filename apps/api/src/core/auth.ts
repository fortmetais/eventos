import type { Request, RequestHandler } from "express";
import type {
  Account,
  MemberRole,
  Membership,
  PrismaClient,
} from "@prisma/client";
import { assert } from "./errors.js";
import { id } from "./security.js";

export interface VerifiedIdentity {
  id: string;
  email: string;
}
export type IdentityResolver = (
  token: string,
) => Promise<VerifiedIdentity | null>;
declare global {
  namespace Express {
    interface Request {
      account?: Account;
      membership?: Membership;
    }
  }
}
export function authentication(
  db: PrismaClient,
  resolve: IdentityResolver,
): RequestHandler {
  return async (request, _response, next) => {
    const token = request.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    assert(token, 401, "Entre na sua conta para continuar.");
    const identity = await resolve(token);
    assert(
      identity && id.safeParse(identity.id).success,
      401,
      "Sessão inválida ou expirada.",
    );
    request.account = await db.account.upsert({
      where: { id: identity.id },
      create: { id: identity.id, email: identity.email.toLowerCase() },
      update: { email: identity.email.toLowerCase() },
    });
    next();
  };
}
export const platformAdmin: RequestHandler = (request, _response, next) => {
  assert(
    request.account?.platformAdmin,
    403,
    "Acesso restrito ao administrador da plataforma.",
  );
  next();
};
export function organizationAccess(
  db: PrismaClient,
  roles: MemberRole[],
  allowPlatformAdmin = false,
): RequestHandler {
  return async (request, _response, next) => {
    const organizationId = id.parse(request.params.organizationId);
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
    });
    assert(organization?.active, 404, "Organização indisponível.");
    if (allowPlatformAdmin && request.account?.platformAdmin) {
      next();
      return;
    }
    const membership = await db.membership.findUnique({
      where: {
        organizationId_accountId: {
          organizationId,
          accountId: request.account!.id,
        },
      },
    });
    assert(
      membership?.active && roles.includes(membership.role),
      403,
      "Você não tem permissão para esta organização.",
    );
    request.membership = membership;
    next();
  };
}
export function account(request: Request) {
  assert(request.account, 401, "Entre na sua conta.");
  return request.account;
}
