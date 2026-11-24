import type { Prisma, PrismaClient } from "@prisma/client";
import { assert } from "../../core/errors.js";
import { DepartmentsRepository } from "../events/departments.repository.js";
import { departmentCapacitySchema } from "../events/departments.validation.js";
import { requireOrganizationManager } from "../organizations/organization-functions.service.js";
import { CamperTeamsRepository } from "./camper-teams.repository.js";
import { RegistrationsRepository } from "./registrations.repository.js";
import { RegistrationsService } from "./registrations.service.js";
import { teamSchema } from "./registrations.validation.js";

export class CampaignTeamsService {
  private campers: CamperTeamsRepository;
  private legacy: RegistrationsService;
  constructor(
    private db: PrismaClient,
    private volunteersOnly = false,
  ) {
    this.campers = new CamperTeamsRepository(db);
    this.legacy = new RegistrationsService(
      new RegistrationsRepository(db),
      volunteersOnly,
    );
  }

  private async campaign(
    organizationId: string,
    campaignId: string,
    db: PrismaClient | Prisma.TransactionClient = this.db,
  ) {
    const campaign = await db.campaign.findFirst({
      where: {
        id: campaignId,
        event: { organizationId },
        ...(this.volunteersOnly ? { kind: "VOLUNTEER" } : {}),
      },
      include: { event: { select: { status: true } } },
    });
    assert(campaign, 404, "Campanha não encontrada nesta organização.");
    return campaign;
  }

  private async lockCampaign(
    tx: Prisma.TransactionClient,
    organizationId: string,
    campaignId: string,
    actorId: string,
  ) {
    await requireOrganizationManager(tx, organizationId, actorId);
    const candidate = await this.campaign(organizationId, campaignId, tx);
    await tx.$queryRaw`SELECT evento_id FROM eventos.eventos WHERE evento_id=${candidate.eventId}::uuid AND organizacao_id=${organizationId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT campanha_id FROM eventos.campanhas WHERE campanha_id=${campaignId}::uuid FOR UPDATE`;
    const campaign = await this.campaign(organizationId, campaignId, tx);
    assert(
      ["DRAFT", "PUBLISHED"].includes(campaign.event.status),
      409,
      "Este evento não aceita alterações de equipes.",
    );
    return campaign;
  }

  async list(organizationId: string, campaignId: string) {
    const campaign = await this.campaign(organizationId, campaignId);
    if (campaign.kind === "CAMPER")
      return this.campers.list(organizationId, campaignId);
    return (
      await new DepartmentsRepository(this.db).list(organizationId, [
        campaign.eventId,
      ])
    ).map((team) => ({ ...team, campaignId, kind: "VOLUNTEER" as const }));
  }

  async create(
    organizationId: string,
    campaignId: string,
    actorId: string,
    input: unknown,
  ) {
    const values = teamSchema.parse(input);
    const campaign = await this.campaign(organizationId, campaignId);
    if (campaign.kind === "VOLUNTEER") {
      const team = await this.legacy.createTeam(
        organizationId,
        campaign.eventId,
        values,
        actorId,
      );
      return {
        ...team,
        campaignId,
        kind: "VOLUNTEER" as const,
        occupied: 0,
        available: team.capacity,
      };
    }
    await this.campers.requireReady();
    return this.db.$transaction(async (tx) => {
      const current = await this.lockCampaign(
        tx,
        organizationId,
        campaignId,
        actorId,
      );
      assert(
        !(await tx.camperTeam.findUnique({
          where: { campaignId_name: { campaignId, name: values.name } },
        })),
        409,
        "Já existe uma equipe com este nome nesta campanha.",
      );
      const team = await tx.camperTeam.create({
        data: { ...values, campaignId },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "CAMPER_TEAM_CREATED",
          entityId: team.id,
        },
      });
      return {
        ...team,
        eventId: current.eventId,
        kind: "CAMPER" as const,
        occupied: 0,
        available: team.capacity,
      };
    });
  }

  async capacity(
    organizationId: string,
    campaignId: string,
    teamId: string,
    actorId: string,
    input: unknown,
  ) {
    const { capacity } = departmentCapacitySchema.parse(input);
    const campaign = await this.campaign(organizationId, campaignId);
    if (campaign.kind === "VOLUNTEER") {
      await this.legacy.departmentCapacity(
        organizationId,
        campaign.eventId,
        teamId,
        actorId,
        { capacity },
      );
      const team = (await this.list(organizationId, campaignId)).find(
        (team) => team.id === teamId,
      );
      assert(team, 404, "Departamento não encontrado.");
      return team;
    }
    await this.campers.requireReady();
    return this.db.$transaction(async (tx) => {
      const current = await this.lockCampaign(
        tx,
        organizationId,
        campaignId,
        actorId,
      );
      const occupied = await this.campers.requireSpaceForCapacity(
        tx,
        organizationId,
        campaignId,
        teamId,
        capacity,
      );
      const team = await tx.camperTeam.update({
        where: { id: teamId },
        data: { capacity },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "CAMPER_TEAM_CAPACITY_UPDATED",
          entityId: teamId,
        },
      });
      return {
        ...team,
        eventId: current.eventId,
        kind: "CAMPER" as const,
        occupied,
        available: Math.max(0, capacity - occupied),
      };
    });
  }

  async remove(
    organizationId: string,
    campaignId: string,
    teamId: string,
    actorId: string,
  ) {
    const campaign = await this.campaign(organizationId, campaignId);
    if (campaign.kind === "VOLUNTEER")
      return this.legacy.deleteDepartment(
        organizationId,
        campaign.eventId,
        teamId,
        actorId,
      );
    await this.campers.requireReady();
    return this.db.$transaction(async (tx) => {
      await this.lockCampaign(tx, organizationId, campaignId, actorId);
      await this.campers.lock(tx, organizationId, campaignId, teamId);
      assert(
        (await tx.registration.count({ where: { camperTeamId: teamId } })) ===
          0,
        409,
        "Uma equipe com participantes vinculados não pode ser excluída.",
        "CAMPER_TEAM_IN_USE",
      );
      await tx.camperTeam.delete({ where: { id: teamId } });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "CAMPER_TEAM_DELETED",
          entityId: teamId,
        },
      });
      return { deleted: true };
    });
  }
}
