import type { Prisma, PrismaClient } from "@prisma/client";
import { assert } from "../../core/errors.js";
export class ProfilesRepository {
  constructor(public db: PrismaClient) {}
  get(accountId: string) {
    return this.db.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { id: true, email: true, profile: true },
    });
  }
  update(accountId: string, profile: Prisma.InputJsonObject) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT conta_id FROM acesso.contas WHERE conta_id = ${accountId}::uuid FOR UPDATE`;
      if (typeof profile.photoAssetId === "string")
        assert(
          await tx.mediaAsset.findFirst({
            where: { id: profile.photoAssetId, accountId, purpose: "PROFILE" },
          }),
          422,
          "Foto inválida para este perfil.",
        );
      const account = await tx.account.findUniqueOrThrow({
        where: { id: accountId },
        select: { profile: true },
      });
      const current =
        account.profile &&
        typeof account.profile === "object" &&
        !Array.isArray(account.profile)
          ? account.profile
          : {};
      return tx.account.update({
        where: { id: accountId },
        data: { profile: { ...current, ...profile } },
        select: { id: true, email: true, profile: true },
      });
    });
  }
  registrations(accountId: string) {
    return this.db.registration.findMany({
      where: { accountId },
      select: {
        id: true,
        protocol: true,
        status: true,
        createdAt: true,
        snapshot: true,
        team: { select: { name: true } },
        campaign: {
          select: {
            kind: true,
            event: {
              select: {
                id: true,
                name: true,
                startsAt: true,
                endsAt: true,
                organization: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
