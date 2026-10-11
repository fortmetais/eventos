import type { PrismaClient } from "@prisma/client";
import { eventThumbnail } from "../../core/image-thumbnails.js";
import { AppError } from "../../core/errors.js";
import { DepartmentsRepository } from "./departments.repository.js";

export class EventSetupsRepository {
  constructor(public db: PrismaClient) {}
  async ready() {
    const result = await this.db.$queryRaw<{ ready: boolean }[]>`
      SELECT to_regclass('eventos.tipos_evento') IS NOT NULL
        AND to_regclass('eventos.eventos') IS NOT NULL
        AND to_regclass('eventos.campanhas') IS NOT NULL AS ready`;
    return result[0]?.ready === true;
  }
  async requireReady() {
    if (!(await this.ready()))
      throw new AppError(
        503,
        "O cadastro de eventos aguarda a configuração inicial do banco. Após a configuração, atualize esta página.",
        "EVENT_SETUP_REQUIRED",
      );
  }
  async registrationsReady() {
    const [stage] = await this.db.$queryRaw<{ exists: boolean }[]>`
      SELECT to_regclass('inscricoes.inscricoes') IS NOT NULL AS exists`;
    return stage?.exists === true;
  }
  async list(organizationId: string) {
    const events = await this.db.event.findMany({
      where: { organizationId },
      include: { type: true, campaigns: { orderBy: { kind: "asc" } } },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    });
    // Equipes surgem no SQL 06; não consultar a tabela em instalações anteriores.
    const [stage] = await this.db.$queryRaw<
      { exists: boolean }[]
    >`SELECT to_regclass('eventos.equipes') IS NOT NULL AS exists`;
    const departments = new DepartmentsRepository(this.db);
    const teams = stage?.exists
      ? await departments.list(
          organizationId,
          events.map((event) => event.id),
        )
      : [];
    const departmentsReady = await departments.ready();
    const registrations = (await this.registrationsReady())
      ? await this.db.registration.groupBy({
          by: ["campaignId"],
          where: {
            campaignId: {
              in: events.flatMap((event) => event.campaigns.map((c) => c.id)),
            },
          },
        })
      : [];
    const campaignsWithRegistrations = new Set(
      registrations.map((r) => r.campaignId),
    );
    return events.map((event) => ({
      ...eventThumbnail(event),
      teams: teams.filter((team) => team.eventId === event.id),
      departmentsReady,
      hasRegistrations: event.campaigns.some((c) =>
        campaignsWithRegistrations.has(c.id),
      ),
    }));
  }
}
