import {
  Prisma,
  type PrismaClient,
  type RegistrationStatus,
  type CampaignKind,
} from "@prisma/client";
import { assert } from "../../core/errors.js";

const statuses: RegistrationStatus[] = [
  "RECEIVED",
  "REVIEW",
  "APPROVED",
  "CONFIRMED",
  "WAITLIST",
  "REJECTED",
  "CANCELLED",
];
const storedStatus: Record<string, RegistrationStatus> = {
  RECEBIDA: "RECEIVED",
  EM_ANALISE: "REVIEW",
  APROVADA: "APPROVED",
  CONFIRMADA: "CONFIRMED",
  LISTA_ESPERA: "WAITLIST",
  RECUSADA: "REJECTED",
  CANCELADA: "CANCELLED",
};
export type EventRegistrationMetrics = {
  total: number;
  byStatus: Record<RegistrationStatus, number>;
  candidateGoing: number | null;
};
export type EventDepartmentOccupancy = {
  id: string;
  name: string;
  capacity: number | null;
  occupied: number;
  available: number | null;
  occupiedByCampaign: Record<string, number>;
};
export type EventRegistrationSummary = {
  eventId: string;
  generatedAt: string;
  presenceAvailable: boolean;
  totals: EventRegistrationMetrics;
  campaigns: (EventRegistrationMetrics & { id: string; kind: CampaignKind })[];
  departmentsAvailable: boolean;
  departments: EventDepartmentOccupancy[];
};
function emptyMetrics(presenceAvailable: boolean): EventRegistrationMetrics {
  return {
    total: 0,
    byStatus: Object.fromEntries(
      statuses.map((status) => [status, 0]),
    ) as Record<RegistrationStatus, number>,
    candidateGoing: presenceAvailable ? 0 : null,
  };
}

export class EventRegistrationSummaryService {
  constructor(
    private db: PrismaClient,
    private volunteersOnly = false,
  ) {}

  async read(
    organizationId: string,
    eventId: string,
  ): Promise<EventRegistrationSummary> {
    // Every metric is derived from the same snapshot; no participant records or links are loaded.
    return this.db.$transaction(
      async (tx) => {
        const event = await tx.event.findFirst({
          where: {
            id: eventId,
            organizationId,
            organization: { active: true },
          },
          select: {
            id: true,
            campaigns: {
              where: this.volunteersOnly ? { kind: "VOLUNTEER" } : {},
              select: { id: true, kind: true },
              orderBy: { kind: "asc" },
            },
          },
        });
        assert(event, 404, "Evento não encontrado.");
        const [stage] = await tx.$queryRaw<
          { registrations: boolean; presence: boolean; departments: boolean }[]
        >`
        SELECT to_regclass('inscricoes.inscricoes') IS NOT NULL AS registrations,
          to_regclass('inscricoes.avisos_decisao') IS NOT NULL AS presence,
          EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='eventos' AND table_name='equipes' AND column_name='vagas') AS departments`;
        assert(
          stage?.registrations,
          503,
          "O resumo aguarda a configuração das inscrições.",
          "EVENT_REGISTRATION_SUMMARY_SETUP_REQUIRED",
        );
        const presenceAvailable = Boolean(stage.presence);
        const departmentsAvailable = Boolean(stage.departments);
        const campaigns = event.campaigns.map((campaign) => ({
          ...campaign,
          ...emptyMetrics(presenceAvailable),
        }));
        const byId = new Map(
          campaigns.map((campaign) => [campaign.id, campaign]),
        );
        if (campaigns.length) {
          const rows = await tx.$queryRaw<
            {
              campaignId: string;
              status: string;
              total: bigint;
              candidateGoing: bigint | null;
            }[]
          >(Prisma.sql`
          SELECT r.campanha_id::text AS "campaignId", r.situacao::text AS status,
            count(*) AS total,
            ${presenceAvailable ? Prisma.sql`count(a.aviso_id)` : Prisma.sql`NULL::bigint`} AS "candidateGoing"
          FROM inscricoes.inscricoes r
          JOIN eventos.campanhas c ON c.campanha_id=r.campanha_id
          JOIN eventos.eventos e ON e.evento_id=c.evento_id
          ${
            presenceAvailable
              ? Prisma.sql`LEFT JOIN inscricoes.avisos_decisao a
            ON a.inscricao_id=r.inscricao_id AND a.tipo='ACEITE' AND a.revogado_em IS NULL
              AND a.presenca_confirmada_em IS NOT NULL AND r.situacao::text IN ('APROVADA','CONFIRMADA')`
              : Prisma.empty
          }
          WHERE e.organizacao_id=${organizationId}::uuid AND e.evento_id=${eventId}::uuid
            AND r.campanha_id=ANY(${campaigns.map((campaign) => campaign.id)}::uuid[])
          GROUP BY r.campanha_id, r.situacao`);
          for (const row of rows) {
            const campaign = byId.get(row.campaignId),
              status = storedStatus[row.status];
            if (!campaign || !status) continue;
            campaign.byStatus[status] += Number(row.total);
            campaign.total += Number(row.total);
            if (presenceAvailable)
              campaign.candidateGoing! += Number(row.candidateGoing ?? 0);
          }
        }
        const departments: EventDepartmentOccupancy[] = [];
        if (departmentsAvailable) {
          // Capacity is shared by the event. Include allocations from every campaign
          // in the total, while exposing campaign-level counts only for permitted campaigns.
          const rows = await tx.$queryRaw<
            {
              id: string;
              name: string;
              capacity: number | null;
              campaignId: string | null;
              occupied: bigint;
            }[]
          >(Prisma.sql`
            SELECT t.equipe_id::text AS id, t.nome AS name, t.vagas AS capacity,
              r.campanha_id::text AS "campaignId", count(r.inscricao_id) AS occupied
            FROM eventos.equipes t
            JOIN eventos.eventos e ON e.evento_id=t.evento_id
            LEFT JOIN inscricoes.inscricoes r ON r.equipe_id=t.equipe_id
              AND r.situacao::text IN ('APROVADA','CONFIRMADA')
              AND EXISTS (SELECT 1 FROM eventos.campanhas c
                JOIN eventos.eventos v ON v.evento_id=c.evento_id
                WHERE c.campanha_id=r.campanha_id AND v.organizacao_id=${organizationId}::uuid)
            WHERE e.organizacao_id=${organizationId}::uuid AND t.evento_id=${eventId}::uuid
            GROUP BY t.equipe_id, t.nome, t.vagas, r.campanha_id
            ORDER BY t.nome ASC, t.equipe_id ASC, r.campanha_id ASC`);
          const byDepartment = new Map<string, EventDepartmentOccupancy>();
          for (const row of rows) {
            let department = byDepartment.get(row.id);
            if (!department) {
              department = {
                id: row.id,
                name: row.name,
                capacity: row.capacity,
                occupied: 0,
                available: null,
                occupiedByCampaign: Object.fromEntries(
                  campaigns.map((campaign) => [campaign.id, 0]),
                ),
              };
              byDepartment.set(row.id, department);
            }
            const occupied = Number(row.occupied);
            department.occupied += occupied;
            if (
              row.campaignId &&
              Object.hasOwn(department.occupiedByCampaign, row.campaignId)
            )
              department.occupiedByCampaign[row.campaignId] += occupied;
          }
          for (const department of byDepartment.values()) {
            department.available =
              department.capacity === null
                ? null
                : Math.max(0, department.capacity - department.occupied);
            departments.push(department);
          }
        }
        const totals = emptyMetrics(presenceAvailable);
        for (const campaign of campaigns) {
          totals.total += campaign.total;
          for (const status of statuses)
            totals.byStatus[status] += campaign.byStatus[status];
          if (presenceAvailable)
            totals.candidateGoing! += campaign.candidateGoing!;
        }
        return {
          eventId: event.id,
          generatedAt: new Date().toISOString(),
          presenceAvailable,
          totals,
          campaigns,
          departmentsAvailable,
          departments,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
