import { Prisma, type PrismaClient } from "@prisma/client";
import { assert } from "../../core/errors.js";
import { allocatedStatuses } from "../events/departments.repository.js";

export class CamperTeamsRepository {
  constructor(private db: PrismaClient) {}

  async requireReady() {
    const [row] = await this.db.$queryRaw<{ ready: boolean }[]>`
      SELECT to_regclass('eventos.equipes_campistas') IS NOT NULL AND EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='inscricoes'
          AND table_name='inscricoes' AND column_name='equipe_campista_id'
      ) AS ready`;
    assert(
      row?.ready,
      503,
      "A configuração das equipes de campistas ainda não foi concluída. Procure a administração.",
      "CAMPER_TEAM_SETUP_REQUIRED",
    );
  }

  async list(organizationId: string, campaignId: string) {
    await this.requireReady();
    const teams = await this.db.camperTeam.findMany({
      where: { campaignId, campaign: { event: { organizationId } } },
      include: {
        campaign: { select: { eventId: true } },
        _count: {
          select: {
            registrations: {
              where: { status: { in: [...allocatedStatuses] } },
            },
          },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return teams.map(({ campaign, _count, ...team }) => ({
      ...team,
      eventId: campaign.eventId,
      kind: "CAMPER" as const,
      occupied: _count.registrations,
      available: Math.max(0, team.capacity - _count.registrations),
    }));
  }

  async lock(
    tx: Prisma.TransactionClient,
    organizationId: string,
    campaignId: string,
    teamId: string,
  ) {
    await tx.$queryRaw`SELECT t.equipe_campista_id FROM eventos.equipes_campistas t
      JOIN eventos.campanhas c ON c.campanha_id=t.campanha_id
      JOIN eventos.eventos e ON e.evento_id=c.evento_id
      WHERE t.equipe_campista_id=${teamId}::uuid AND t.campanha_id=${campaignId}::uuid
        AND c.publico::text='CAMPISTA' AND e.organizacao_id=${organizationId}::uuid
      FOR UPDATE OF t`;
    const team = await tx.camperTeam.findFirst({
      where: {
        id: teamId,
        campaignId,
        campaign: { kind: "CAMPER", event: { organizationId } },
      },
    });
    assert(team, 422, "Equipe inválida para esta campanha de campistas.");
    return team;
  }

  async requireSpace(
    tx: Prisma.TransactionClient,
    organizationId: string,
    campaignId: string,
    teamId: string,
    registrationId: string,
  ) {
    const team = await this.lock(tx, organizationId, campaignId, teamId);
    const occupied = await tx.registration.count({
      where: {
        camperTeamId: teamId,
        campaignId,
        id: { not: registrationId },
        status: { in: [...allocatedStatuses] },
      },
    });
    assert(
      occupied < team.capacity,
      409,
      "Não há vagas disponíveis nesta equipe de campistas.",
      "CAMPER_TEAM_FULL",
    );
    return team;
  }

  async requireSpaceForCapacity(
    tx: Prisma.TransactionClient,
    organizationId: string,
    campaignId: string,
    teamId: string,
    capacity: number,
  ) {
    await this.lock(tx, organizationId, campaignId, teamId);
    const occupied = await tx.registration.count({
      where: {
        camperTeamId: teamId,
        campaignId,
        status: { in: [...allocatedStatuses] },
      },
    });
    assert(
      capacity >= occupied,
      409,
      "As vagas não podem ser menores que o número de campistas alocados nesta equipe.",
      "CAMPER_TEAM_CAPACITY_BELOW_OCCUPIED",
    );
    return occupied;
  }
}
