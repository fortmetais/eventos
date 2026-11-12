import {
  Prisma,
  type PrismaClient,
  type RegistrationStatus,
} from "@prisma/client";
import { basicTeam } from "../events/departments.repository.js";
export type RegistrationFilters = {
  eventId?: string;
  campaignId?: string;
  status?: RegistrationStatus;
  origin?: "PUBLIC_FORM" | "IMPORT";
  completeness?: "PENDING" | "COMPLETE";
  presence?: "VOU" | "NAO_IREI" | "SEM_RESPOSTA";
  spirituality?: "SIM" | "NAO" | "SEM_RESPOSTA";
  q?: string;
  sort?: "NAME_ASC" | "NAME_DESC" | "RECEIVED_ASC" | "ACCEPTED_FIRST";
  includeClosed?: boolean;
};

// Prisma exposes English enum names, while the existing PostgreSQL enums use
// the mapped Portuguese labels. Raw SQL must use the storage representation.
const storedStatus = {
  RECEIVED: "RECEBIDA",
  REVIEW: "EM_ANALISE",
  APPROVED: "APROVADA",
  CONFIRMED: "CONFIRMADA",
  WAITLIST: "LISTA_ESPERA",
  REJECTED: "RECUSADA",
  CANCELLED: "CANCELADA",
} satisfies Record<RegistrationStatus, string>;

// Built-in functions keep this query usable on gradual installations without
// adding the unaccent extension. NFC and NFD Portuguese names share the order.
const normalizedName = Prisma.sql`lower(translate(p.nome,
  'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäåéèêëíìîïóòôõöúùûüçņ̃́̀̂̃̈̊',
  'AAAAAAEEEEIIIIOOOOOUUUUCNaaaaaaeeeeiiiiooooouuuucn'))`;

// PostgreSQL 12 has no pg_input_is_valid. Validate ISO syntax and the actual
// calendar day before casting arbitrary historical JSON to a timestamp.
const originalDate = Prisma.sql`r.dados_importacao #>> '{source,submittedAt}'`;
const receivedDate = Prisma.sql`CASE WHEN r.origem = 'IMPORT' AND ${originalDate} ~
  '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\\.[0-9]{1,3})?Z$'
  THEN CASE WHEN substring(${originalDate}, 1, 4)::int > 0
    AND substring(${originalDate}, 9, 2)::int <= extract(day FROM
      make_date(greatest(substring(${originalDate}, 1, 4)::int, 1),
        substring(${originalDate}, 6, 2)::int, 1) + interval '1 month - 1 day')
    THEN (${originalDate})::timestamp ELSE r.criado_em END
  ELSE r.criado_em END`;
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
          spiritualityStartsAt: true,
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
  async reviewList(
    organizationId: string,
    filters: RegistrationFilters,
    volunteersOnly: boolean,
    skip: number,
    take: number,
  ) {
    const clauses: Prisma.Sql[] = [
      Prisma.sql`e.organizacao_id = ${organizationId}::uuid`,
    ];
    if (volunteersOnly) clauses.push(Prisma.sql`c.publico::text = 'SERVO'`);
    if (filters.eventId)
      clauses.push(Prisma.sql`e.evento_id = ${filters.eventId}::uuid`);
    if (filters.campaignId)
      clauses.push(Prisma.sql`r.campanha_id = ${filters.campaignId}::uuid`);
    if (filters.status)
      clauses.push(
        Prisma.sql`r.situacao::text = ${storedStatus[filters.status]}`,
      );
    if (filters.origin) clauses.push(Prisma.sql`r.origem = ${filters.origin}`);
    if (filters.presence) {
      // The partial unique index permits only one unrevoked notice per registration.
      const matchingResponse = Prisma.sql`EXISTS (
      SELECT 1 FROM inscricoes.avisos_decisao a
      WHERE a.inscricao_id = r.inscricao_id AND a.revogado_em IS NULL AND a.tipo = 'ACEITE'
        AND r.situacao::text IN ('APROVADA', 'CONFIRMADA')
        AND ${filters.presence === "VOU" ? Prisma.sql`a.presenca_confirmada_em IS NOT NULL` : filters.presence === "NAO_IREI" ? Prisma.sql`a.presenca_recusada_em IS NOT NULL` : Prisma.sql`(a.presenca_confirmada_em IS NOT NULL OR a.presenca_recusada_em IS NOT NULL)`}
      )`;
      clauses.push(
        filters.presence === "SEM_RESPOSTA"
          ? Prisma.sql`NOT ${matchingResponse}`
          : matchingResponse,
      );
    }
    if (filters.spirituality) {
      clauses.push(
        Prisma.sql`c.publico::text = 'SERVO' AND e.espiritualidade_em IS NOT NULL`,
      );
      clauses.push(
        filters.spirituality === "SEM_RESPOSTA"
          ? Prisma.sql`(r.espiritualidade_em IS DISTINCT FROM e.espiritualidade_em OR r.espiritualidade_participara IS NULL)`
          : Prisma.sql`r.espiritualidade_em = e.espiritualidade_em AND r.espiritualidade_participara = ${filters.spirituality === "SIM"}`,
      );
    }
    if (filters.includeClosed === false)
      clauses.push(
        Prisma.sql`r.situacao::text NOT IN ('RECUSADA', 'CANCELADA')`,
      );
    if (filters.q) {
      const value = filters.q
        .normalize("NFC")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      // strpos uses literal substring matching; % and _ are not SQL wildcards.
      clauses.push(Prisma.sql`strpos(${normalizedName}, ${value}) > 0`);
    }
    if (filters.completeness === "PENDING")
      clauses.push(Prisma.sql`
      r.origem = 'IMPORT' AND ((r.dados_importacao -> 'pending') <> '[]'::jsonb
        OR NOT EXISTS (SELECT 1 FROM inscricoes.aceites a
          WHERE a.inscricao_id = r.inscricao_id AND a.aceito = true))`);
    if (filters.completeness === "COMPLETE")
      clauses.push(Prisma.sql`
      (r.origem = 'PUBLIC_FORM' OR (r.origem = 'IMPORT'
        AND (r.dados_importacao -> 'pending') = '[]'::jsonb
        AND EXISTS (SELECT 1 FROM inscricoes.aceites a
          WHERE a.inscricao_id = r.inscricao_id AND a.aceito = true)))`);
    const from = Prisma.sql`FROM inscricoes.inscricoes r
      JOIN eventos.campanhas c ON c.campanha_id = r.campanha_id
      JOIN eventos.eventos e ON e.evento_id = c.evento_id
      JOIN pessoas.pessoas p ON p.pessoa_id = r.pessoa_id
      WHERE ${Prisma.join(
        clauses.map((clause) => Prisma.sql`(${clause})`),
        " AND ",
      )}`;
    const order =
      filters.sort === "NAME_ASC"
        ? Prisma.sql`${normalizedName} ASC, r.inscricao_id ASC`
        : filters.sort === "NAME_DESC"
          ? Prisma.sql`${normalizedName} DESC, r.inscricao_id ASC`
          : filters.sort === "ACCEPTED_FIRST"
            ? Prisma.sql`CASE WHEN r.situacao::text IN ('APROVADA', 'CONFIRMADA') THEN 0 ELSE 1 END,
              ${normalizedName} ASC, r.inscricao_id ASC`
            : filters.sort === "RECEIVED_ASC"
              ? Prisma.sql`${receivedDate} ASC, r.inscricao_id ASC`
              : Prisma.sql`r.criado_em DESC, r.inscricao_id ASC`;
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT r.inscricao_id AS id ${from} ORDER BY ${order} OFFSET ${skip} LIMIT ${take}`);
      const [count] = await tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT count(*) AS total ${from}`,
      );
      const items = rows.length
        ? await tx.registration.findMany({
            where: {
              id: { in: rows.map((row) => row.id) },
              campaign: { event: { organizationId } },
            },
            include: registrationInclude,
          })
        : [];
      const positions = new Map(rows.map((row, index) => [row.id, index]));
      items.sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
      return [items, Number(count.total)] as const;
    });
  }
  find(organizationId: string, id: string) {
    return this.db.registration.findFirst({
      where: { id, campaign: { event: { organizationId } } },
      include: { ...registrationInclude, form: true, consent: true },
    });
  }
}
