import type { Account } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { organizationThumbnail } from "../../core/image-thumbnails.js";
import type { ArtworkStorage } from "../../core/artwork-storage.js";
import { uploadOrganizationLogo } from "./organization-logo.js";
import { z } from "zod";
import { assert } from "../../core/errors.js";
import { hashToken, newToken } from "../../core/security.js";
import type { InvitationMailer } from "../../core/mail.js";
import { config } from "../../config.js";
import { OrganizationsRepository } from "./organizations.repository.js";
import {
  OrganizationFunctionsService,
  requireOrganizationManager,
  resolveOrganizationFunction,
} from "./organization-functions.service.js";
import {
  invitationSchema,
  membershipSchema,
  organizationSchema,
} from "./organizations.validation.js";

export class OrganizationsService {
  constructor(
    private repo: OrganizationsRepository,
    private mail: InvitationMailer,
    private logoStorage: ArtworkStorage,
  ) {}
  async list(page: number, pageSize: number) {
    const [items, total] = await this.repo.list(
      (page - 1) * pageSize,
      pageSize,
    );
    return { items: items.map(organizationThumbnail), total, page, pageSize };
  }
  async create(input: unknown, file?: Express.Multer.File) {
    const data = organizationSchema.parse(input);
    const id = randomUUID();
    const logo = file
      ? await uploadOrganizationLogo(this.logoStorage, id, file)
      : null;
    try {
      return organizationThumbnail(
        await this.repo.db.organization.create({
          data: {
            ...data,
            id,
            ...(logo
              ? {
                  logoUrl: logo.url,
                  logoBucket: logo.bucket,
                  logoKey: logo.key,
                  logoThumbnailKey: logo.thumbnailKey,
                }
              : {}),
          },
        }),
      );
    } catch (error) {
      if (logo) await this.removeLogo(logo.bucket, logo.key, logo.thumbnailKey);
      throw error;
    }
  }
  private async removeLogo(
    bucket: string,
    key: string,
    thumbnailKey?: string | null,
  ) {
    if (thumbnailKey) await this.removeLogo(bucket, thumbnailKey);
    await this.logoStorage.remove(bucket, key).catch(() => {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "organization_logo_cleanup_failed",
        }),
      );
    });
  }
  async mine(accountId: string) {
    return (await this.repo.mine(accountId)).map((member) => ({
      ...member,
      organization: organizationThumbnail(member.organization),
    }));
  }
  async members(organizationId: string) {
    const eventsEnabled = await this.repo.eventsAvailable();
    const [members, invitations, events, functions] = await Promise.all([
      this.repo.members(organizationId),
      this.repo.invitations(organizationId),
      eventsEnabled
        ? this.repo.db.event.findMany({
            where: { organizationId },
            select: { id: true, name: true },
            orderBy: { startsAt: "desc" },
          })
        : Promise.resolve([]),
      new OrganizationFunctionsService(this.repo.db).list(organizationId),
    ]);
    return { members, invitations, events, functions };
  }
  async invite(organizationId: string, actorId: string, input: unknown) {
    const data = invitationSchema.parse(input);
    const token = newToken();
    const { invitation, organization } = await this.repo.db.$transaction(
      async (tx) => {
        const organization = await requireOrganizationManager(
          tx,
          organizationId,
          actorId,
        );
        const selected = await resolveOrganizationFunction(
          tx,
          organizationId,
          data,
        );
        const invitation = await tx.invitation.create({
          data: {
            email: data.email,
            role: selected.role,
            functionId: selected.id,
            organizationId,
            createdBy: actorId,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 7 * 86400000),
          },
        });
        return { invitation, organization };
      },
    );
    const link = `${config.WEB_URL}/convite/${token}`;
    const sent = await this.mail.send(data.email, organization.name, link);
    return {
      id: invitation.id,
      expiresAt: invitation.expiresAt,
      delivery: sent ? "sent" : "manual",
      link,
    };
  }
  async accept(token: string, user: Account) {
    const target = await this.repo.db.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { organizationId: true },
    });
    assert(target, 410, "Convite expirado, revogado ou já utilizado.");
    return this.repo.db.$transaction(async (tx) => {
      // A mesma ordem de bloqueio usada em funções, convites e membros evita
      // aceitar um convite com perfil anterior durante uma alteração de função.
      await tx.$queryRaw`SELECT organizacao_id FROM organizacoes.organizacoes WHERE organizacao_id = ${target.organizationId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT convite_id FROM organizacoes.convites WHERE hash_token = ${hashToken(token)} FOR UPDATE`;
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { organization: true },
      });
      assert(
        invitation &&
          !invitation.acceptedAt &&
          !invitation.revokedAt &&
          invitation.expiresAt > new Date() &&
          invitation.organization.active,
        410,
        "Convite expirado, revogado ou já utilizado.",
      );
      assert(
        invitation.email === user.email,
        403,
        "Entre com o e-mail que recebeu o convite.",
      );
      const selected = invitation.functionId
        ? await tx.organizationFunction.findFirst({
            where: {
              id: invitation.functionId,
              organizationId: invitation.organizationId,
            },
          })
        : await resolveOrganizationFunction(tx, invitation.organizationId, {
            role: invitation.role,
          });
      assert(selected, 410, "A função do convite não está mais disponível.");
      const existing = await tx.membership.findUnique({
        where: {
          organizationId_accountId: {
            organizationId: invitation.organizationId,
            accountId: user.id,
          },
        },
      });
      assert(
        !existing,
        409,
        "Você já possui um vínculo com esta organização. Solicite a atualização ao responsável.",
      );
      const claimed = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date() },
      });
      assert(claimed.count === 1, 410, "Convite já utilizado.");
      const membership = await tx.membership.create({
        data: {
          organizationId: invitation.organizationId,
          accountId: user.id,
          role: selected.role,
          functionId: selected.id,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          actorId: user.id,
          action: "INVITATION_ACCEPTED",
          entityId: invitation.id,
        },
      });
      return membership;
    });
  }
  async updateOrganization(
    organizationId: string,
    actor: Account,
    input: unknown,
    file?: Express.Multer.File,
    allowStatusChange = false,
  ) {
    assert(
      !allowStatusChange || actor.platformAdmin,
      403,
      "Acesso restrito ao administrador da plataforma.",
    );
    const data = (
      allowStatusChange
        ? organizationSchema.extend({ active: z.boolean() })
        : organizationSchema
    ).parse(input);
    if (!allowStatusChange)
      await this.repo.db.$transaction((tx) =>
        requireOrganizationManager(tx, organizationId, actor.id),
      );
    assert(
      await this.repo.db.organization.findUnique({
        where: { id: organizationId },
      }),
      404,
      "Organização não encontrada.",
    );
    const logo = file
      ? await uploadOrganizationLogo(this.logoStorage, organizationId, file)
      : null;
    let previous: {
      logoBucket: string | null;
      logoKey: string | null;
      logoThumbnailKey: string | null;
    } | null = null;
    let result;
    try {
      result = await this.repo.db.$transaction(async (tx) => {
        if (allowStatusChange)
          await tx.$queryRaw`SELECT organizacao_id FROM organizacoes.organizacoes WHERE organizacao_id = ${organizationId}::uuid FOR UPDATE`;
        const organization = allowStatusChange
          ? await tx.organization.findUnique({ where: { id: organizationId } })
          : await requireOrganizationManager(tx, organizationId, actor.id);
        assert(organization, 404, "Organização não encontrada.");
        const replaced =
          logo ||
          (data.logoUrl !== undefined && data.logoUrl !== organization.logoUrl);
        if (replaced) previous = organization;
        const updated = await tx.organization.update({
          where: { id: organizationId },
          data: {
            ...data,
            ...(logo
              ? {
                  logoUrl: logo.url,
                  logoBucket: logo.bucket,
                  logoKey: logo.key,
                  logoThumbnailKey: logo.thumbnailKey,
                }
              : replaced
                ? { logoBucket: null, logoKey: null, logoThumbnailKey: null }
                : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            actorId: actor.id,
            action: "ORGANIZATION_UPDATED",
            entityId: organizationId,
          },
        });
        return updated;
      });
    } catch (error) {
      if (logo) await this.removeLogo(logo.bucket, logo.key, logo.thumbnailKey);
      throw error;
    }
    // Só excluir após confirmar o novo cadastro; nunca usar bucket/chave da requisição.
    const old = previous as {
      logoBucket: string | null;
      logoKey: string | null;
      logoThumbnailKey: string | null;
    } | null;
    if (old?.logoBucket && old.logoKey)
      await this.removeLogo(old.logoBucket, old.logoKey, old.logoThumbnailKey);
    return organizationThumbnail(result);
  }
  async updateMember(
    organizationId: string,
    memberId: string,
    actorId: string,
    input: unknown,
  ) {
    const data: z.infer<typeof membershipSchema> =
      membershipSchema.parse(input);
    return this.repo.db.$transaction(async (tx) => {
      await requireOrganizationManager(tx, organizationId, actorId);
      const member = await tx.membership.findFirst({
        where: { id: memberId, organizationId },
      });
      assert(member, 404, "Membro não encontrado.");
      const selected = await resolveOrganizationFunction(
        tx,
        organizationId,
        !data.functionId && data.role === member.role && member.functionId
          ? { functionId: member.functionId }
          : data,
        member.functionId,
      );
      if (
        member.role === "ORGANIZER" &&
        member.active &&
        (!data.active || selected.role !== "ORGANIZER")
      ) {
        const others = await tx.membership.count({
          where: {
            organizationId,
            active: true,
            role: "ORGANIZER",
            id: { not: memberId },
          },
        });
        assert(others > 0, 409, "Mantenha pelo menos um organizador ativo.");
      }
      assert(
        (await this.repo.eventsAvailable()) || data.healthEventIds.length === 0,
        422,
        "As permissões de saúde serão configuradas na etapa dos eventos.",
      );
      const events =
        (await this.repo.eventsAvailable()) && data.healthEventIds.length
          ? await tx.event.count({
              where: {
                organizationId,
                id: { in: [...new Set(data.healthEventIds)] },
              },
            })
          : 0;
      assert(
        events === new Set(data.healthEventIds).size,
        422,
        "Selecione eventos desta organização.",
      );
      const result = await tx.membership.update({
        where: { id: memberId },
        data: {
          active: data.active,
          role: selected.role,
          functionId: selected.id,
          healthEventIds: data.healthEventIds,
        },
        include: { function: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "MEMBERSHIP_UPDATED",
          entityId: memberId,
        },
      });
      return result;
    });
  }
  async revoke(organizationId: string, invitationId: string, actorId: string) {
    return this.repo.db.$transaction(async (tx) => {
      await requireOrganizationManager(tx, organizationId, actorId);
      const result = await tx.invitation.updateMany({
        where: { id: invitationId, organizationId, acceptedAt: null },
        data: { revokedAt: new Date() },
      });
      assert(result.count, 404, "Convite não encontrado.");
      return { revoked: true };
    });
  }
}
