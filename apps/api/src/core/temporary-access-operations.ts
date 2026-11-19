import type { Prisma } from "@prisma/client";
import { assert } from "./errors.js";
import { hashToken } from "./security.js";

export async function requireResolvedTemporaryAccess(
  tx: Prisma.TransactionClient,
  email: string,
  invitationId?: string,
) {
  const pending = await tx.auditLog.findFirst({
    where: {
      action: "TEMPORARY_ACCESS",
      AND: [
        {
          OR: [
            ...(invitationId ? [{ entityId: invitationId }] : []),
            {
              details: {
                path: ["targetEmailHash"],
                equals: hashToken(email.toLowerCase()),
              },
            },
          ],
        },
        {
          OR: [
            { details: { path: ["status"], equals: "PENDING" } },
            { details: { path: ["status"], equals: "POSSIBLY_APPLIED" } },
          ],
        },
      ],
    },
    select: { id: true },
  });
  assert(
    !pending,
    409,
    "Há uma liberação em andamento ou aguardando revisão para este e-mail. Confira o registro antes de alterar a senha.",
    "TEMPORARY_ACCESS_IN_PROGRESS",
  );
}
