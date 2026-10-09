import type { Prisma, PrismaClient } from "@prisma/client";
export class ProfilesRepository {
  constructor(public db: PrismaClient) {}
  get(accountId: string) {
    return this.db.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { id: true, email: true, profile: true },
    });
  }
  update(accountId: string, profile: Prisma.InputJsonValue) {
    return this.db.account.update({
      where: { id: accountId },
      data: { profile },
      select: { id: true, email: true, profile: true },
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
