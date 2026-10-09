import { randomUUID } from "node:crypto";
import {
  Prisma,
  type Membership,
  type RegistrationStatus,
} from "@prisma/client";
import { assert, AppError } from "../../core/errors.js";
import { hashToken, newToken, json } from "../../core/security.js";
import {
  campaignIsOpen,
  type FormConfig,
} from "../events/events.validation.js";
import {
  assignmentSchema,
  draftUpdateSchema,
  manualLinkSchema,
  statusSchema,
  teamSchema,
  transitions,
  validateSubmission,
} from "./registrations.validation.js";
import { RegistrationsRepository } from "./registrations.repository.js";
import type { DecisionNoticesService } from "./decision-notices.service.js";
import {
  DepartmentsRepository,
  basicTeam,
  allocatedStatuses,
  departmentName,
} from "../events/departments.repository.js";
import { departmentCapacitySchema } from "../events/departments.validation.js";

export class RegistrationsService {
  constructor(
    private repo: RegistrationsRepository,
    private volunteersOnly = false,
    private notices?: DecisionNoticesService,
  ) {}
  async createDraft(campaignId: string) {
    const campaign = await this.repo.db.campaign.findUnique({
      where: { id: campaignId },
      include: {
        event: { include: { organization: true } },
        forms: {
          where: { publishedAt: { not: null } },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });
    assert(
      campaign && campaign.forms.length && campaignIsOpen(campaign),
      409,
      "As inscrições desta campanha não estão abertas.",
      "CAMPAIGN_CLOSED",
    );
    assert(
      !this.volunteersOnly || campaign.kind === "VOLUNTEER",
      404,
      "Campanha indisponível.",
    );
    const token = newToken();
    const draft = await this.repo.db.draft.create({
      data: {
        campaignId,
        formVersionId: campaign.forms[0].id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 14 * 86400000),
        health: { create: { data: {} } },
      },
    });
    return { id: draft.id, token, expiresAt: draft.expiresAt };
  }
  async authorizedDraft(draftId: string, token: string) {
    const draft = await this.repo.draft(draftId, hashToken(token));
    assert(
      draft && draft.expiresAt > new Date(),
      401,
      "A credencial desta inscrição expirou ou é inválida.",
    );
    assert(
      !this.volunteersOnly || draft.campaign.kind === "VOLUNTEER",
      404,
      "Inscrição indisponível.",
    );
    return draft;
  }
  async getDraft(draftId: string, token: string) {
    const draft = await this.authorizedDraft(draftId, token);
    if (draft.registration)
      return {
        id: draft.id,
        campaignId: draft.campaignId,
        form: draft.form,
        submitted: true,
        registration: draft.registration,
        email: (draft.payload as Record<string, unknown>).email ?? "",
      };
    return {
      id: draft.id,
      campaignId: draft.campaignId,
      payload: draft.payload,
      health: draft.health?.data ?? {},
      form: draft.form,
      submitted: false,
      expiresAt: draft.expiresAt,
    };
  }
  async saveDraft(draftId: string, token: string, input: unknown) {
    const data = draftUpdateSchema.parse(input);
    return this.repo.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT rascunho_id FROM inscricoes.rascunhos WHERE rascunho_id = ${draftId}::uuid FOR UPDATE`;
      const draft = await tx.draft.findFirst({
        where: {
          id: draftId,
          tokenHash: hashToken(token),
          expiresAt: { gt: new Date() },
        },
        include: { registration: true, campaign: { select: { kind: true } } },
      });
      assert(draft, 401, "Credencial inválida ou expirada.");
      assert(
        !this.volunteersOnly || draft.campaign.kind === "VOLUNTEER",
        404,
        "Inscrição indisponível.",
      );
      assert(!draft.registration, 409, "Esta inscrição já foi enviada.");
      if (data.payload.photoAssetId)
        assert(
          await tx.mediaAsset.findFirst({
            where: { id: data.payload.photoAssetId, draftId },
          }),
          422,
          "Foto inválida para esta inscrição.",
        );
      await tx.draft.update({
        where: { id: draftId },
        data: { payload: json(data.payload) },
      });
      await tx.draftHealth.upsert({
        where: { draftId },
        create: { draftId, data: json(data.health) },
        update: { data: json(data.health) },
      });
      return { saved: true };
    });
  }
  async submit(draftId: string, token: string) {
    return this.repo.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT rascunho_id FROM inscricoes.rascunhos WHERE rascunho_id = ${draftId}::uuid FOR UPDATE`;
        const draft = await tx.draft.findFirst({
          where: {
            id: draftId,
            tokenHash: hashToken(token),
            expiresAt: { gt: new Date() },
          },
          include: {
            health: true,
            registration: {
              select: { id: true, protocol: true, status: true },
            },
            form: true,
            campaign: {
              include: { event: { include: { organization: true } } },
            },
          },
        });
        assert(draft, 401, "Credencial inválida ou expirada.");
        assert(
          !this.volunteersOnly || draft.campaign.kind === "VOLUNTEER",
          404,
          "Inscrição indisponível.",
        );
        if (draft.registration) return draft.registration;
        await tx.$queryRaw`SELECT campanha_id FROM eventos.campanhas WHERE campanha_id = ${draft.campaignId}::uuid FOR UPDATE`;
        const campaign = await tx.campaign.findUniqueOrThrow({
          where: { id: draft.campaignId },
          include: { event: { include: { organization: true } } },
        });
        assert(
          campaignIsOpen(campaign),
          409,
          "A campanha encerrou ou foi pausada. Seu rascunho foi preservado.",
          "CAMPAIGN_CLOSED",
        );
        const { payload, health } = validateSubmission(
          draft.payload,
          draft.health?.data ?? {},
          draft.form.config as unknown as FormConfig,
          campaign.event.startsAt,
          campaign.kind,
        );
        const photo = await tx.mediaAsset.findFirst({
          where: {
            id: payload.photoAssetId,
            draftId,
            organizationId: campaign.event.organizationId,
            purpose: "REGISTRATION",
          },
        });
        assert(photo, 422, "Adicione uma foto válida.");
        if (payload.preferredTeamId)
          assert(
            await tx.team.findFirst({
              where: { id: payload.preferredTeamId, eventId: campaign.eventId },
              select: basicTeam,
            }),
            422,
            "Escolha uma equipe deste evento.",
          );
        const name = payload.name.trim().replace(/\s+/g, " ");
        const cpf = payload.cpf?.replace(/\D/g, "") || null;
        const duplicate = await tx.registration.findFirst({
          where: {
            campaignId: campaign.id,
            status: { notIn: ["CANCELLED", "REJECTED"] },
            person: {
              organizationId: campaign.event.organizationId,
              OR: [
                ...(cpf ? [{ cpf }] : []),
                {
                  name: { equals: name, mode: "insensitive" },
                  birthDate: new Date(payload.birthDate),
                  phone: payload.phone,
                },
              ],
            },
          },
        });
        assert(
          !duplicate,
          409,
          "Já existe uma inscrição ativa com esses dados. Procure a organização para conferir.",
          "DUPLICATE_REGISTRATION",
        );
        // Cada envio cria um cadastro local. Nunca unir pessoas/históricos por identificadores não verificados.
        const person = await tx.person.create({
          data: {
            organizationId: campaign.event.organizationId,
            name,
            birthDate: new Date(payload.birthDate),
            phone: payload.phone,
            email: payload.email || null,
            cpf,
          },
        });
        const protocol = `INS-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
        const registration = await tx.registration.create({
          data: {
            protocol,
            draftId,
            personId: person.id,
            campaignId: campaign.id,
            formVersionId: draft.formVersionId,
            snapshot: json(payload),
            health: { create: { data: json(health) } },
            consent: {
              create: {
                version: draft.formVersionId,
                termsText: (draft.form.config as unknown as FormConfig).terms,
                accepted: true,
                imageAuthorized: payload.imageAuthorized,
                guardianAuthorized: payload.guardianAuthorization ?? false,
              },
            },
          },
          select: { id: true, protocol: true, status: true },
        });
        await tx.draftHealth.deleteMany({ where: { draftId } });
        return registration;
      },
      { timeout: 15000 },
    );
  }
  async list(
    organizationId: string,
    filters: {
      eventId?: string;
      campaignId?: string;
      status?: RegistrationStatus;
    },
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.RegistrationWhereInput = {
      campaign: {
        event: { organizationId },
        ...(this.volunteersOnly ? { kind: "VOLUNTEER" } : {}),
        ...(filters.eventId ? { eventId: filters.eventId } : {}),
      },
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };
    const [items, total] = await this.repo.list(
      where,
      (page - 1) * pageSize,
      pageSize,
    );
    return { items, total, page, pageSize };
  }
  async detail(organizationId: string, registrationId: string) {
    const result = await this.repo.find(organizationId, registrationId);
    assert(result, 404, "Inscrição não encontrada.");
    assert(
      !this.volunteersOnly || result.campaign.kind === "VOLUNTEER",
      404,
      "Inscrição indisponível.",
    );
    return result;
  }
  async transition(
    organizationId: string,
    registrationId: string,
    actorId: string,
    input: unknown,
  ) {
    const data = statusSchema.parse(input);
    const noticesReady = this.notices ? await this.notices.ready() : false;
    const departmentsRepo = new DepartmentsRepository(this.repo.db);
    const departmentsReady = await departmentsRepo.ready();
    let noticeId: string | null = null;
    let decisionNoticeMissing = false;
    const result = await this.repo.db.$transaction(
      async (tx) => {
        const candidate = await tx.registration.findFirst({
          where: {
            id: registrationId,
            campaign: { event: { organizationId } },
          },
          select: { campaignId: true, campaign: { select: { kind: true } } },
        });
        assert(candidate, 404, "Inscrição não encontrada.");
        assert(
          !this.volunteersOnly || candidate.campaign.kind === "VOLUNTEER",
          404,
          "Inscrição indisponível.",
        );
        await tx.$queryRaw`SELECT campanha_id FROM eventos.campanhas WHERE campanha_id = ${candidate.campaignId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT inscricao_id FROM inscricoes.inscricoes WHERE inscricao_id = ${registrationId}::uuid FOR UPDATE`;
        const registration = await tx.registration.findUniqueOrThrow({
          where: { id: registrationId },
          include: {
            campaign: { include: { event: true } },
            team: { select: basicTeam },
          },
        });
        assert(
          transitions[registration.status].includes(data.status),
          409,
          "Esta mudança de estado não é permitida.",
        );
        assert(
          !["CANCELLED", "COMPLETED"].includes(
            registration.campaign.event.status,
          ) || data.status === "CANCELLED",
          409,
          "Este evento não aceita novas confirmações.",
        );
        let status: RegistrationStatus = data.status;
        if (status === "WAITLIST")
          assert(
            registration.campaign.allowWaitlist,
            409,
            "Esta campanha não possui lista de espera.",
          );
        if (status === "CONFIRMED") {
          if (registration.campaign.kind === "VOLUNTEER" && noticesReady)
            await this.notices!.requirePresence(tx, registrationId);
          if (registration.campaign.kind === "VOLUNTEER")
            assert(
              registration.team?.eventId === registration.campaign.eventId,
              409,
              "Aloque o servo em um departamento antes da confirmação.",
            );
          const confirmed = await tx.registration.count({
            where: { campaignId: registration.campaignId, status: "CONFIRMED" },
          });
          if (
            registration.campaign.capacity !== null &&
            confirmed >= registration.campaign.capacity
          ) {
            if (registration.campaign.allowWaitlist) status = "WAITLIST";
            else
              throw new AppError(
                409,
                "Não há vagas disponíveis.",
                "CAPACITY_REACHED",
              );
          }
        }
        if (
          registration.teamId &&
          departmentsReady &&
          registration.campaign.kind === "VOLUNTEER"
        ) {
          if (
            [...allocatedStatuses].includes(status as "APPROVED" | "CONFIRMED")
          )
            await departmentsRepo.requireSpace(
              tx,
              organizationId,
              registration.campaign.eventId,
              registration.teamId,
              registrationId,
            );
          else
            await tx.$queryRaw`SELECT equipe_id FROM eventos.equipes WHERE equipe_id = ${registration.teamId}::uuid FOR UPDATE`;
        }
        const historyId = randomUUID();
        const updated = await tx.registration.update({
          where: { id: registrationId },
          data: {
            status,
            // Estados fora da alocação liberam a vaga e exigem nova escolha ao retornar.
            ...(![...allocatedStatuses].includes(
              status as "APPROVED" | "CONFIRMED",
            )
              ? { teamId: null }
              : {}),
            history: {
              create: {
                id: historyId,
                actorId,
                fromStatus: registration.status,
                toStatus: status,
                reason: data.reason,
              },
            },
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId,
            action: `REGISTRATION_${status}`,
            entityId: registrationId,
          },
        });
        if (
          registration.campaign.kind === "VOLUNTEER" &&
          ["APPROVED", "REJECTED"].includes(status)
        ) {
          if (noticesReady) {
            noticeId = await this.notices!.prepare(
              tx,
              registrationId,
              historyId,
              actorId,
              status,
              registration.campaign.event.startsAt,
            );
          } else decisionNoticeMissing = Boolean(this.notices);
        } else if (
          registration.campaign.kind === "VOLUNTEER" &&
          noticesReady &&
          !["APPROVED", "CONFIRMED"].includes(status)
        ) {
          await this.notices!.invalidate(tx, registrationId);
        }
        return updated;
      },
      { timeout: 15000 },
    );
    if (noticeId) {
      try {
        await this.notices!.deliver(noticeId);
      } catch {
        console.error(
          JSON.stringify({ level: "error", event: "decision_notice_pending" }),
        );
        return {
          ...result,
          noticeWarning:
            "Decisão registrada. O aviso ficou pendente; confira o envio abaixo.",
        };
      }
    }
    return {
      ...result,
      ...(decisionNoticeMissing
        ? {
            noticeWarning:
              "Decisão registrada. Os avisos ao candidato aguardam a configuração do banco e dos links.",
          }
        : {}),
    };
  }
  async createTeam(
    organizationId: string,
    eventId: string,
    input: unknown,
    actorId: string,
  ) {
    const data = teamSchema.parse(input);
    await new DepartmentsRepository(this.repo.db).requireReady();
    return this.repo.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT evento_id FROM eventos.eventos WHERE evento_id = ${eventId}::uuid AND organizacao_id = ${organizationId}::uuid FOR UPDATE`;
      const event = await tx.event.findFirst({
        where: { id: eventId, organizationId },
      });
      assert(event, 404, "Evento não encontrado.");
      assert(
        ["DRAFT", "PUBLISHED"].includes(event.status),
        409,
        "Este evento não aceita novos departamentos.",
      );
      const existing = await tx.team.findMany({
        where: { eventId },
        select: basicTeam,
      });
      assert(
        existing.length < 30,
        422,
        "Cadastre no máximo 30 departamentos por evento.",
      );
      assert(
        !existing.some((team) => departmentName(team.name) === data.name),
        409,
        "Já existe um departamento com este nome neste evento.",
      );
      const team = await tx.team.create({ data: { ...data, eventId } });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "DEPARTMENT_CREATED",
          entityId: team.id,
        },
      });
      return team;
    });
  }
  async departmentCapacity(
    organizationId: string,
    eventId: string,
    teamId: string,
    actorId: string,
    input: unknown,
  ) {
    const { capacity } = departmentCapacitySchema.parse(input);
    const repo = new DepartmentsRepository(this.repo.db);
    await repo.requireReady();
    return this.repo.db.$transaction(async (tx) => {
      const team = await tx.team.findFirst({
        where: { id: teamId, eventId, event: { organizationId } },
        select: basicTeam,
      });
      assert(team, 404, "Departamento não encontrado.");
      await repo.requireSpaceForCapacity(
        tx,
        organizationId,
        eventId,
        teamId,
        capacity,
      );
      const updated = await tx.team.update({
        where: { id: teamId },
        data: { capacity },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "DEPARTMENT_CAPACITY_UPDATED",
          entityId: teamId,
        },
      });
      return updated;
    });
  }
  async assign(
    organizationId: string,
    registrationId: string,
    input: unknown,
    actorId: string,
  ) {
    const { teamId } = assignmentSchema.parse(input);
    const departmentsRepo = new DepartmentsRepository(this.repo.db);
    await departmentsRepo.requireReady();
    return this.repo.db.$transaction(async (tx) => {
      const candidate = await tx.registration.findFirst({
        where: { id: registrationId, campaign: { event: { organizationId } } },
        select: { campaignId: true },
      });
      assert(candidate, 404, "Inscrição não encontrada.");
      await tx.$queryRaw`SELECT campanha_id FROM eventos.campanhas WHERE campanha_id = ${candidate.campaignId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT inscricao_id FROM inscricoes.inscricoes WHERE inscricao_id = ${registrationId}::uuid FOR UPDATE`;
      const registration = await tx.registration.findFirst({
        where: { id: registrationId, campaign: { event: { organizationId } } },
        include: { campaign: { include: { event: true } } },
      });
      assert(registration, 404, "Inscrição não encontrada.");
      assert(
        registration.campaign.kind === "VOLUNTEER" &&
          ["APPROVED", "CONFIRMED"].includes(registration.status),
        409,
        "Aloque somente servos aprovados.",
      );
      assert(
        !["CANCELLED", "COMPLETED"].includes(
          registration.campaign.event.status,
        ),
        409,
        "Este evento não aceita alocação de servos.",
      );
      // Ordem estável também nas trocas entre dois departamentos.
      for (const id of [
        ...new Set(
          [registration.teamId, teamId].filter((value): value is string =>
            Boolean(value),
          ),
        ),
      ].sort())
        await tx.$queryRaw`SELECT e.equipe_id FROM eventos.equipes e JOIN eventos.eventos v ON v.evento_id = e.evento_id
          WHERE e.equipe_id = ${id}::uuid AND v.organizacao_id = ${organizationId}::uuid FOR UPDATE OF e`;
      await departmentsRepo.requireSpace(
        tx,
        organizationId,
        registration.campaign.eventId,
        teamId,
        registrationId,
      );
      const updated = await tx.registration.update({
        where: { id: registrationId },
        data: { teamId },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "DEPARTMENT_ASSIGNED",
          entityId: registrationId,
        },
      });
      return updated;
    });
  }
  async health(
    organizationId: string,
    registrationId: string,
    membership: Membership,
    actorId: string,
  ) {
    const registration = await this.repo.db.registration.findFirst({
      where: { id: registrationId, campaign: { event: { organizationId } } },
      select: { campaign: { select: { eventId: true } }, health: true },
    });
    assert(registration, 404, "Inscrição não encontrada.");
    assert(
      membership.healthEventIds.includes(registration.campaign.eventId),
      403,
      "Você não tem autorização de saúde para este evento.",
    );
    await this.repo.db.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: "HEALTH_VIEWED",
        entityId: registrationId,
      },
    });
    return registration.health?.data ?? {};
  }
  async healthList(
    organizationId: string,
    eventId: string,
    membership: Membership,
  ) {
    assert(
      membership.healthEventIds.includes(eventId),
      403,
      "Evento sem autorização de saúde.",
    );
    assert(
      await this.repo.db.event.findFirst({
        where: { id: eventId, organizationId },
      }),
      404,
      "Evento não encontrado.",
    );
    return this.repo.db.registration.findMany({
      where: {
        campaign: { eventId, event: { organizationId } },
        status: { notIn: ["CANCELLED", "REJECTED"] },
      },
      select: {
        id: true,
        protocol: true,
        person: { select: { name: true } },
        campaign: { select: { kind: true } },
      },
      orderBy: { person: { name: "asc" } },
    });
  }
  async manualLink(
    organizationId: string,
    registrationId: string,
    actorId: string,
    input: unknown,
  ) {
    const data = manualLinkSchema.parse(input);
    return this.repo.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT inscricao_id FROM inscricoes.inscricoes WHERE inscricao_id = ${registrationId}::uuid FOR UPDATE`;
      const registration = await tx.registration.findFirst({
        where: { id: registrationId, campaign: { event: { organizationId } } },
      });
      assert(registration, 404, "Inscrição não encontrada.");
      assert(!registration.accountId, 409, "A inscrição já está vinculada.");
      const candidates = await tx.account.findMany({
        where: { email: data.email },
        select: { id: true },
        take: 2,
      });
      assert(
        candidates.length === 1,
        422,
        "Peça à pessoa para entrar na plataforma com o e-mail verificado antes de realizar o vínculo.",
      );
      await tx.registration.update({
        where: { id: registrationId },
        data: { accountId: candidates[0].id },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "REGISTRATION_LINKED_BY_REVIEW",
          entityId: registrationId,
        },
      });
      await tx.statusHistory.create({
        data: {
          registrationId,
          actorId,
          fromStatus: registration.status,
          toStatus: registration.status,
          reason: `Vínculo após comprovação: ${data.reason}`,
        },
      });
      return { linked: true };
    });
  }
}
