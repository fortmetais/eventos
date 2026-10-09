import { Prisma, type PrismaClient } from "@prisma/client";
import { assert } from "../../core/errors.js";

// Select explícito mantém a leitura compatível até o SQL 08 ser aplicado.
export const basicTeam = { id: true, eventId: true, name: true } as const;
export const allocatedStatuses = ["APPROVED", "CONFIRMED"] as const;
export function departmentName(value: string) {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");
}

export class DepartmentsRepository {
  constructor(public db: PrismaClient) {}
  async ready() {
    const rows = await this.db.$queryRaw<{ ready: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'eventos' AND table_name = 'equipes' AND column_name = 'vagas') AS ready`;
    return rows[0]?.ready === true;
  }
  async requireReady() {
    assert(
      await this.ready(),
      503,
      "Os departamentos aguardam o SQL 08_departamentos_e_vagas.sql no DBeaver. Após executá-lo, atualize a página.",
      "DEPARTMENT_SETUP_REQUIRED",
    );
  }
  async list(organizationId: string, eventIds: string[]) {
    if (!eventIds.length) return [];
    const configured = await this.ready();
    const teams = await this.db.team.findMany({
      where: { eventId: { in: eventIds }, event: { organizationId } },
      select: {
        ...basicTeam,
        ...(configured ? { capacity: true } : {}),
        _count: {
          select: {
            registrations: {
              where: {
                status: { in: [...allocatedStatuses] },
                campaign: { event: { organizationId } },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    return teams.map(({ _count, ...team }) => ({
      ...team,
      capacity: team.capacity ?? null,
      occupied: _count.registrations,
      available:
        team.capacity == null
          ? null
          : Math.max(0, team.capacity - _count.registrations),
    }));
  }
  // Chamador bloqueia primeiro campanha/inscrição. A linha do departamento
  // serializa alocações, confirmações e alterações de capacidade concorrentes.
  async requireSpace(
    tx: Prisma.TransactionClient,
    organizationId: string,
    eventId: string,
    teamId: string,
    registrationId: string,
  ) {
    await tx.$queryRaw`SELECT e.equipe_id FROM eventos.equipes e
      JOIN eventos.eventos v ON v.evento_id = e.evento_id
      WHERE e.equipe_id = ${teamId}::uuid AND e.evento_id = ${eventId}::uuid
        AND v.organizacao_id = ${organizationId}::uuid FOR UPDATE OF e`;
    const team = await tx.team.findFirst({
      where: { id: teamId, eventId, event: { organizationId } },
    });
    assert(team, 422, "Departamento inválido para este evento.");
    assert(
      team.capacity !== null,
      409,
      "Defina as vagas deste departamento antes de alocar servos.",
      "DEPARTMENT_CAPACITY_REQUIRED",
    );
    const occupied = await tx.registration.count({
      where: {
        teamId,
        id: { not: registrationId },
        status: { in: [...allocatedStatuses] },
        campaign: { eventId, event: { organizationId } },
      },
    });
    assert(
      occupied < team.capacity,
      409,
      "Não há vagas disponíveis neste departamento.",
      "DEPARTMENT_FULL",
    );
    return team;
  }
  async requireSpaceForCapacity(
    tx: Prisma.TransactionClient,
    organizationId: string,
    eventId: string,
    teamId: string,
    capacity: number,
  ) {
    await tx.$queryRaw`SELECT e.equipe_id FROM eventos.equipes e JOIN eventos.eventos v ON v.evento_id = e.evento_id
      WHERE e.equipe_id = ${teamId}::uuid AND e.evento_id = ${eventId}::uuid AND v.organizacao_id = ${organizationId}::uuid FOR UPDATE OF e`;
    const occupied = await tx.registration.count({
      where: {
        teamId,
        status: { in: [...allocatedStatuses] },
        campaign: { eventId, event: { organizationId } },
      },
    });
    assert(
      capacity >= occupied,
      409,
      "As vagas não podem ser menores que o número de servos alocados neste departamento.",
      "DEPARTMENT_CAPACITY_BELOW_OCCUPIED",
    );
  }
}
