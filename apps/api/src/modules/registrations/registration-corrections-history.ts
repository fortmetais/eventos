import type { PrismaClient } from "@prisma/client";
import { fieldVisible } from "@fac/form-layout";
import type { FormConfig } from "../events/events.validation.js";
import {
  asCorrectionObject,
  correctionBaseLabels,
} from "./registration-corrections.validation.js";

export type CorrectionHistoryValue =
  string | number | boolean | string[] | null;
export type RegistrationCorrectionHistory = {
  id: string;
  createdAt: Date;
  actor: { id: string; name: string; email: string };
  reason: string;
  changes: {
    field: string;
    label: string;
    before: CorrectionHistoryValue;
    after: CorrectionHistoryValue;
  }[];
};

function isDisplayValue(value: unknown): value is CorrectionHistoryValue {
  return (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length <= 2000) ||
    (Array.isArray(value) &&
      value.length <= 100 &&
      value.every((entry) => typeof entry === "string" && entry.length <= 100))
  );
}

/** Private field-level history, without the complete evidence snapshots or credentials. */
export async function readRegistrationCorrections(
  db: PrismaClient,
  organizationId: string,
  registrationId: string,
  config: FormConfig,
): Promise<RegistrationCorrectionHistory[]> {
  const [schema] = await db.$queryRaw<{ ready: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='organizacoes' AND table_name='auditoria' AND column_name='detalhes') AS ready`;
  if (!schema?.ready) return [];
  const labels = new Map(Object.entries(correctionBaseLabels));
  const reserved = new Set([
    "aceite_formacao",
    "aceite_regras",
    "aceite_orientacoes",
  ]);
  const kind = config.layout?.kind ?? (config.camper ? "CAMPER" : "VOLUNTEER");
  for (const question of config.questions ?? [])
    if (
      !question.mustBeTrue &&
      !reserved.has(question.id) &&
      fieldVisible(config, kind, `question:${question.id}`)
    )
      labels.set(`question:${question.id}`, question.label);
  const rows = await db.$queryRaw<
    {
      id: string;
      createdAt: Date;
      actorId: string;
      actorName: string | null;
      actorEmail: string;
      reason: string | null;
      changes: unknown;
    }[]
  >`
    SELECT a.auditoria_id::text AS id, a.criado_em AS "createdAt",
      a.autor_id::text AS "actorId", c.email AS "actorEmail",
      CASE WHEN jsonb_typeof(c.perfil->'name')='string' THEN c.perfil->>'name' ELSE NULL END AS "actorName",
      a.detalhes->>'reason' AS reason, a.detalhes->'changes' AS changes
    FROM organizacoes.auditoria a
    JOIN acesso.contas c ON c.conta_id=a.autor_id
    WHERE a.organizacao_id=${organizationId}::uuid
      AND a.entidade_id=${registrationId}
      AND a.acao='REGISTRATION_DATA_CORRECTED'
      AND EXISTS (SELECT 1 FROM inscricoes.inscricoes r
        JOIN eventos.campanhas p ON p.campanha_id=r.campanha_id
        JOIN eventos.eventos e ON e.evento_id=p.evento_id
        WHERE r.inscricao_id=${registrationId}::uuid AND e.organizacao_id=${organizationId}::uuid)
    ORDER BY a.criado_em DESC, a.auditoria_id DESC`;
  return rows
    .map((row) => {
      const changes: RegistrationCorrectionHistory["changes"] = [];
      for (const [field, raw] of Object.entries(
        asCorrectionObject(row.changes),
      )) {
        const label = labels.get(field),
          change = asCorrectionObject(raw);
        if (
          label &&
          isDisplayValue(change.before) &&
          isDisplayValue(change.after)
        )
          changes.push({
            field,
            label,
            before: change.before,
            after: change.after,
          });
      }
      return {
        id: row.id,
        createdAt: row.createdAt,
        actor: {
          id: row.actorId,
          name: row.actorName?.trim().slice(0, 150) || row.actorEmail,
          email: row.actorEmail,
        },
        reason: row.reason?.slice(0, 1000) ?? "",
        changes,
      };
    })
    .filter((row) => row.changes.length > 0);
}
