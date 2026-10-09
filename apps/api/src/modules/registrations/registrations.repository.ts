import type { Prisma, PrismaClient } from "@prisma/client";
import { basicTeam } from "../events/departments.repository.js";
export const registrationInclude = {
  person: true,
  campaign: {
    include: {
      event: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          startsAt: true,
          endsAt: true,
        },
      },
    },
  },
  team: { select: basicTeam },
  history: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.RegistrationInclude;
export class RegistrationsRepository {
  constructor(public db: PrismaClient) {}
  draft(id: string, tokenHash: string) {
    return this.db.draft.findFirst({
      where: { id, tokenHash },
      include: {
        health: true,
        registration: {
          select: { id: true, protocol: true, status: true, accountId: true },
        },
        form: true,
        campaign: { include: { event: { include: { organization: true } } } },
      },
    });
  }
  list(where: Prisma.RegistrationWhereInput, skip: number, take: number) {
    return this.db.$transaction([
      this.db.registration.findMany({
        where,
        skip,
        take,
        include: registrationInclude,
        orderBy: { createdAt: "desc" },
      }),
      this.db.registration.count({ where }),
    ]);
  }
  find(organizationId: string, id: string) {
    return this.db.registration.findFirst({
      where: { id, campaign: { event: { organizationId } } },
      include: { ...registrationInclude, form: true, consent: true },
    });
  }
}
