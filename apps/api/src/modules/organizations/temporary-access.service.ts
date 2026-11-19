import type { Account, Prisma, PrismaClient } from "@prisma/client";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { AppError, assert } from "../../core/errors.js";
import { logOperationalEvent } from "../../core/operational-log.js";
import { hashToken, id } from "../../core/security.js";
import { requireResolvedTemporaryAccess } from "../../core/temporary-access-operations.js";
import type { TemporaryAccessAuth } from "./temporary-access-auth.js";

export const temporaryAccessInput = z
  .object({
    reason: z.string().trim().min(10).max(500),
    acknowledgeEmailBypass: z.literal(true),
    requestId: z.uuid(),
  })
  .strict();
const action = "TEMPORARY_ACCESS";

export function temporaryAccessPassword() {
  let password: string;
  do {
    password = randomBytes(32).toString("base64url");
  } while (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password)
  );
  const symbols = "!@#%*+?";
  return password + symbols[randomInt(symbols.length)];
}
function alreadyGranted(): never {
  throw new AppError(
    409,
    "Esta liberação já foi processada. A senha não pode ser recuperada; inicie uma nova geração se necessário.",
    "TEMPORARY_ACCESS_ALREADY_GRANTED",
  );
}
async function pendingInvitation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  invitationId: string,
) {
  await tx.$queryRaw`SELECT convite_id FROM organizacoes.convites WHERE convite_id=${invitationId}::uuid FOR UPDATE`;
  const invitation = await tx.invitation.findUnique({
    where: { id: invitationId },
    include: { organization: true },
  });
  assert(
    invitation &&
      invitation.organizationId === organizationId &&
      invitation.organization.active,
    404,
    "Convite indisponível para esta organização.",
  );
  assert(
    !invitation.acceptedAt &&
      !invitation.revokedAt &&
      invitation.expiresAt > new Date(),
    410,
    "O convite precisa estar pendente e dentro da validade.",
    "INVITATION_NOT_PENDING",
  );
  return invitation;
}

export class TemporaryAccessService {
  constructor(
    private db: PrismaClient,
    private auth: TemporaryAccessAuth,
    private webUrl: string,
  ) {}
  async grant(
    organizationId: string,
    invitationId: string,
    actor: Account,
    input: unknown,
  ) {
    assert(actor.platformAdmin, 403, "Acesso restrito ao administrador geral.");
    id.parse(organizationId);
    id.parse(invitationId);
    const data = temporaryAccessInput.parse(input);
    const details = {
      reason: data.reason,
      requestId: data.requestId,
      acknowledgeEmailBypass: true,
      targetEmailHash: "",
    };
    // Commit the reservation before touching Auth. Losing a response must never
    // make the same request usable for another password reset.
    await this.db.$transaction(async (tx) => {
      const invitation = await pendingInvitation(
        tx,
        organizationId,
        invitationId,
      );
      assert(
        invitation.email.toLowerCase() !== actor.email.toLowerCase(),
        403,
        "Não é permitido gerar acesso temporário para a própria conta.",
        "TEMPORARY_ACCESS_PROTECTED_ACCOUNT",
      );
      const email = invitation.email.toLowerCase();
      details.targetEmailHash = hashToken(email);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))::text AS locked`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.requestId}, 1))::text AS locked`;
      if (await tx.auditLog.findUnique({ where: { id: data.requestId } }))
        alreadyGranted();
      await requireResolvedTemporaryAccess(tx, email, invitationId);
      await tx.auditLog.create({
        data: {
          id: data.requestId,
          organizationId,
          actorId: actor.id,
          action,
          entityId: invitationId,
          details: { ...details, status: "PENDING" },
        },
      });
    });
    let mutationStarted = false;
    let authUserId: string | undefined;
    try {
      return await this.db.$transaction(
        async (tx) => {
          const invitation = await pendingInvitation(
            tx,
            organizationId,
            invitationId,
          );
          const email = invitation.email.toLowerCase();
          assert(
            hashToken(email) === details.targetEmailHash,
            409,
            "O e-mail do convite mudou. Confira o cadastro antes de continuar.",
          );
          // Shared with first-password and other invitations for the same address.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))::text AS locked`;
          const user = await this.auth.findUserByEmail(email);
          authUserId = user?.id;
          assert(
            !user || user.id !== actor.id,
            403,
            "Não é permitido gerar acesso temporário para a própria conta.",
            "TEMPORARY_ACCESS_PROTECTED_ACCOUNT",
          );
          const userId = user?.id ?? "00000000-0000-0000-0000-000000000000";
          await tx.$queryRaw`SELECT conta_id FROM acesso.contas WHERE lower(email)=${email} OR conta_id=${userId}::uuid FOR UPDATE`;
          const protectedAccount = await tx.account.findFirst({
            where: {
              platformAdmin: true,
              OR: [
                { email: { equals: email, mode: "insensitive" } },
                { id: userId },
              ],
            },
            select: { id: true },
          });
          assert(
            !protectedAccount,
            403,
            "Não é permitido alterar o acesso de outro administrador geral por um convite.",
            "TEMPORARY_ACCESS_PROTECTED_ACCOUNT",
          );
          const previous = user?.app_metadata ?? {};
          if (previous.temporary_access_operation_id === data.requestId)
            alreadyGranted();
          const metadata = {
            ...previous,
            must_change_password: true,
            temporary_access_operation_id: data.requestId,
          };
          const temporaryPassword = temporaryAccessPassword();
          assert(
            invitation.expiresAt > new Date(),
            410,
            "O convite expirou enquanto o acesso estava sendo preparado.",
            "INVITATION_NOT_PENDING",
          );
          mutationStarted = true;
          const granted = user
            ? await this.auth.updateUser(user.id, temporaryPassword, metadata)
            : await this.auth.createUser(email, temporaryPassword, metadata);
          authUserId = granted.id;
          assert(
            granted.email?.toLowerCase() === email &&
              (!user || granted.id === user.id),
            503,
            "A conta retornada não corresponde ao convite.",
          );
          await tx.auditLog.update({
            where: { id: data.requestId },
            data: {
              details: {
                ...details,
                status: "SUCCESS",
                authUserId: granted.id,
              },
            },
          });
          const loginUrl = new URL("/entrar", this.webUrl);
          loginUrl.searchParams.set("modo", "senha");
          loginUrl.searchParams.set("email", email);
          return {
            email,
            temporaryPassword,
            loginUrl: loginUrl.toString(),
            mustChangePassword: true,
            emailsSent: false,
          };
        },
        { timeout: 60000, maxWait: 10000 },
      );
    } catch (error) {
      // Auth is external to this transaction: retain the reservation even if
      // completion auditing fails, and never return an uncertain password.
      await this.db.auditLog
        .update({
          where: { id: data.requestId },
          data: {
            details: {
              ...details,
              status: mutationStarted ? "POSSIBLY_APPLIED" : "FAILED",
              ...(authUserId ? { authUserId } : {}),
            },
          },
        })
        .catch(() => {
          logOperationalEvent({
            level: "error",
            event: "temporary_access_audit_update_failed",
          });
        });
      if (mutationStarted)
        throw new AppError(
          503,
          "O acesso pode ter sido alterado, mas não foi possível concluir o registro. A senha não pode ser recuperada. Confira a conta antes de iniciar uma nova geração.",
          "TEMPORARY_ACCESS_POSSIBLY_APPLIED",
          { operationPossiblyApplied: true, requestId: data.requestId },
        );
      throw error;
    }
  }
}
