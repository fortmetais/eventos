import { Prisma, type PrismaClient } from "@prisma/client";
import { DepartmentsRepository, basicTeam } from "./departments.repository.js";
export const publicOrganization = {
  id: true,
  name: true,
  city: true,
  state: true,
  logoUrl: true,
} as const;
export class EventsRepository {
  constructor(
    public db: PrismaClient,
    private volunteersOnly = false,
  ) {}
  async administrative(organizationId: string, authorizedEvents?: string[]) {
    const events = await this.db.event.findMany({
      where: {
        organizationId,
        ...(authorizedEvents ? { id: { in: authorizedEvents } } : {}),
      },
      include: {
        type: true,
        campaigns: {
          ...(this.volunteersOnly
            ? { where: { kind: "VOLUNTEER" as const } }
            : {}),
          include: {
            forms: { orderBy: { version: "desc" } },
            _count: { select: { registrations: true } },
          },
        },
        teams: { select: basicTeam },
      },
      orderBy: { startsAt: "desc" },
    });
    const repo = new DepartmentsRepository(this.db);
    const teams = await repo.list(
      organizationId,
      events.map((event) => event.id),
    );
    const departmentsReady = await repo.ready();
    return events.map((event) => ({
      ...event,
      teams: teams.filter((team) => team.eventId === event.id),
      departmentsReady,
    }));
  }
  async publicList(where: Prisma.EventWhereInput, skip: number, take: number) {
    return this.db.$transaction([
      this.db.event.findMany({
        where,
        skip,
        take,
        orderBy: { startsAt: "asc" },
        include: {
          organization: { select: publicOrganization },
          type: true,
          campaigns: {
            ...(this.volunteersOnly
              ? { where: { kind: "VOLUNTEER" as const } }
              : {}),
            select: {
              id: true,
              kind: true,
              opensAt: true,
              closesAt: true,
              paused: true,
              forms: {
                where: { publishedAt: { not: null } },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      }),
      this.db.event.count({ where }),
    ]);
  }
}
