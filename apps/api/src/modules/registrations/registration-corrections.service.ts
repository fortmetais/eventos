import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { assert } from "../../core/errors.js";
import { json } from "../../core/security.js";
import { registrationInclude } from "./registrations.repository.js";
import { requiresGuardian } from "./guardian.validation.js";
import { readRegistrationCorrections } from "./registration-corrections-history.js";
import { normalizeName } from "../participant-imports/workbook.js";
import type { FormConfig } from "../events/events.validation.js";
import {
  asCorrectionObject,
  correctionImportPending,
  registrationCorrectionSchema,
  validateRegistrationCorrections,
} from "./registration-corrections.validation.js";

export class RegistrationCorrectionsService {
  constructor(
    private db: PrismaClient,
    private volunteersOnly = false,
  ) {}

  private async requireReady() {
    const [result] = await this.db.$queryRaw<{ ready: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='organizacoes' AND table_name='auditoria' AND column_name='detalhes')
        AND CASE WHEN to_regprocedure('inscricoes.proteger_respostas_inscricao()') IS NOT NULL
          THEN strpos(pg_get_functiondef(to_regprocedure('inscricoes.proteger_respostas_inscricao()')), 'fac.registration_correction') > 0
          ELSE false END AS ready`;
    assert(
      result?.ready,
      503,
      "As correções de ficha aguardam a atualização 21 do banco.",
      "REGISTRATION_CORRECTION_SETUP_REQUIRED",
    );
  }

  async correct(
    organizationId: string,
    registrationId: string,
    actorId: string,
    input: unknown,
    importedOnly = false,
  ) {
    const data = registrationCorrectionSchema.parse(input);
    await this.requireReady();
    const candidate = await this.db.registration.findFirst({
      where: { id: registrationId, campaign: { event: { organizationId } } },
      select: { campaignId: true },
    });
    assert(candidate, 404, "Inscrição não encontrada.");
    const [guardianTable] = await this.db.$queryRaw<
      { ready: boolean }[]
    >`SELECT to_regclass('inscricoes.autorizacoes_responsavel') IS NOT NULL AS ready`;
    await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT campanha_id FROM eventos.campanhas WHERE campanha_id=${candidate.campaignId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT inscricao_id FROM inscricoes.inscricoes WHERE inscricao_id=${registrationId}::uuid FOR UPDATE`;
        const registration = await tx.registration.findFirst({
          where: {
            id: registrationId,
            campaign: { event: { organizationId } },
          },
          include: {
            person: true,
            form: true,
            health: true,
            consent: true,
            campaign: { include: { event: { include: { teams: true } } } },
          },
        });
        assert(
          registration &&
            (!this.volunteersOnly ||
              registration.campaign.kind === "VOLUNTEER") &&
            (!importedOnly ||
              (registration.origin === "IMPORT" &&
                registration.campaign.kind === "VOLUNTEER")),
          404,
          "Inscrição não encontrada.",
        );
        assert(
          registration.updatedAt.getTime() === Date.parse(data.updatedAt),
          409,
          "Esta ficha foi alterada em outra tela. Atualize antes de corrigir.",
          "REGISTRATION_REVISION_CONFLICT",
        );
        await tx.$queryRaw`SELECT pessoa_id FROM pessoas.pessoas WHERE pessoa_id=${registration.personId}::uuid FOR UPDATE`;
        const person = await tx.person.findUniqueOrThrow({
          where: { id: registration.personId },
        });
        const form = registration.form.config as unknown as FormConfig;
        const result = validateRegistrationCorrections(data.overrides, {
          current: registration.snapshot,
          form,
          kind: registration.campaign.kind,
          origin: registration.origin,
          eventStartsAt: registration.campaign.event.startsAt,
          teams: registration.campaign.event.teams,
        });
        const changed = Object.keys(result.changes);
        if (!changed.length) return;
        const guardian = guardianTable?.ready
          ? await tx.guardianAuthorization.findUnique({
              where: { registrationId },
              select: { signedAt: true },
            })
          : null;
        assert(
          !guardian ||
            !changed.some((key) => ["name", "birthDate", "cpf"].includes(key)),
          409,
          "Nome, nascimento ou CPF não podem ser corrigidos enquanto existe um termo do responsável. A alteração depende de revisão do termo pela organização.",
          "GUARDIAN_DOCUMENT_REVIEW_REQUIRED",
        );
        const current = asCorrectionObject(registration.snapshot);
        assert(
          !(
            registration.origin !== "IMPORT" &&
            registration.status === "CONFIRMED" &&
            changed.includes("birthDate") &&
            !requiresGuardian(
              String(current.birthDate),
              registration.campaign.event.startsAt,
            ) &&
            requiresGuardian(
              String(result.snapshot.birthDate),
              registration.campaign.event.startsAt,
            ) &&
            !guardian?.signedAt
          ),
          409,
          "Reabra a análise antes de corrigir o nascimento: a nova data exige autorização do responsável para esta participação.",
          "GUARDIAN_REVIEW_REQUIRED",
        );

        const personChanges: Prisma.PersonUpdateInput = {};
        if (changed.includes("name")) personChanges.name = result.snapshot.name;
        if (changed.includes("birthDate"))
          personChanges.birthDate = new Date(result.snapshot.birthDate);
        if (changed.includes("phone"))
          personChanges.phone = result.snapshot.phone;
        if (changed.includes("cpf"))
          personChanges.cpf = result.snapshot.cpf ?? null;
        let personId = person.id;
        if (Object.keys(personChanges).length) {
          const count = await tx.registration.count({
            where: { personId: person.id },
          });
          if (count > 1) {
            const copy = await tx.person.create({
              data: {
                organizationId: person.organizationId,
                name: changed.includes("name")
                  ? result.snapshot.name
                  : person.name,
                birthDate: changed.includes("birthDate")
                  ? new Date(result.snapshot.birthDate)
                  : person.birthDate,
                phone: changed.includes("phone")
                  ? result.snapshot.phone
                  : person.phone,
                cpf: changed.includes("cpf")
                  ? (result.snapshot.cpf ?? null)
                  : person.cpf,
                email: person.email,
              },
            });
            personId = copy.id;
          } else
            await tx.person.update({
              where: { id: person.id },
              data: personChanges,
            });
        }
        const now = new Date(
          Math.max(Date.now(), registration.updatedAt.getTime() + 1),
        );
        let importData: Prisma.JsonValue | null = registration.importData;
        if (registration.origin === "IMPORT") {
          const previous = asCorrectionObject(registration.importData);
          const answers = asCorrectionObject(result.snapshot.answers);
          const preferences = Array.isArray(answers.equipes_preferencia)
            ? answers.equipes_preferencia
            : [];
          importData = json({
            ...previous,
            pending: correctionImportPending({
              previous: previous.pending,
              snapshot: result.snapshot,
              form,
              kind: registration.campaign.kind,
              startsAt: registration.campaign.event.startsAt,
              health: registration.health?.data,
              accepted: registration.consent?.accepted === true,
              guardianSigned: Boolean(guardian?.signedAt),
              changed,
            }),
            ...(changed.includes("question:equipes_preferencia")
              ? {
                  departmentIds: registration.campaign.event.teams
                    .filter((team) => preferences.includes(team.name))
                    .map((team) => team.id),
                }
              : {}),
            identityAliases: [
              ...new Set([
                ...(Array.isArray(previous.identityAliases)
                  ? previous.identityAliases
                  : []),
                `${normalizeName(String(current.name ?? person.name))}|${String(current.birthDate ?? person.birthDate.toISOString().slice(0, 10))}`,
                `${normalizeName(String(result.snapshot.name))}|${String(result.snapshot.birthDate)}`,
              ]),
            ],
            corrections: [
              ...(Array.isArray(previous.corrections)
                ? previous.corrections
                : []),
              {
                actorId,
                at: now.toISOString(),
                reason: data.reason,
                changes: result.changes,
              },
            ],
          });
        }
        const auditId = randomUUID();
        await tx.auditLog.create({
          data: {
            id: auditId,
            organizationId,
            actorId,
            action: "REGISTRATION_DATA_CORRECTED",
            entityId: registrationId,
            details: json({
              reason: data.reason,
              actorId,
              origin: registration.origin,
              changes: result.changes,
              before: {
                snapshot: registration.snapshot,
                personId: registration.personId,
                importData: registration.importData,
              },
              after: { snapshot: result.snapshot, personId, importData },
            }),
          },
        });
        await tx.$queryRaw`SELECT set_config('fac.registration_correction', ${auditId}, true)`;
        await tx.registration.update({
          where: { id: registrationId },
          data: {
            snapshot: json(result.snapshot),
            personId,
            ...(registration.origin === "IMPORT"
              ? { importData: json(importData) }
              : {}),
            updatedAt: now,
          },
        });
        await tx.statusHistory.create({
          data: {
            registrationId,
            actorId,
            fromStatus: registration.status,
            toStatus: registration.status,
            reason: `Correção de ficha (${result.labels.join(", ")}): ${data.reason}`,
          },
        });
      },
      { timeout: 30000 },
    );
    const registration = await this.db.registration.findFirstOrThrow({
      where: { id: registrationId, campaign: { event: { organizationId } } },
      include: { ...registrationInclude, form: true, consent: true },
    });
    return {
      ...registration,
      corrections: await readRegistrationCorrections(
        this.db,
        organizationId,
        registrationId,
        registration.form.config as unknown as FormConfig,
      ),
    };
  }
}
