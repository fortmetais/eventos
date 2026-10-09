import type { PrismaClient } from "@prisma/client";
import type { z } from "zod";
import type { organizationSchema } from "./organizations.validation.js";
export class OrganizationsRepository {
  constructor(
    public db: PrismaClient,
    private eventsEnabled: boolean | (() => Promise<boolean>) = true,
  ) {}
  async eventsAvailable() {
    return typeof this.eventsEnabled === "function"
      ? this.eventsEnabled()
      : this.eventsEnabled;
  }
  async list(skip: number, take: number) {
    const eventsEnabled = await this.eventsAvailable();
    return this.db.$transaction([
      this.db.organization.findMany({
        skip,
        take,
        orderBy: { name: "asc" },
        include: {
          _count: { select: { events: eventsEnabled, memberships: true } },
        },
      }),
      this.db.organization.count(),
    ]);
  }
  create(data: z.infer<typeof organizationSchema>) {
    return this.db.organization.create({ data });
  }
  mine(accountId: string) {
    return this.db.membership.findMany({
      where: { accountId, active: true, organization: { active: true } },
      include: { organization: true },
      orderBy: { organization: { name: "asc" } },
    });
  }
  members(organizationId: string) {
    return this.db.membership.findMany({
      where: { organizationId },
      include: { account: { select: { id: true, email: true } } },
      orderBy: { role: "asc" },
    });
  }
  invitations(organizationId: string) {
    return this.db.invitation.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
