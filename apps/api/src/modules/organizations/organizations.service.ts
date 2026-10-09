import type { Account } from "@prisma/client";
import type { z } from "zod";
import { assert } from "../../core/errors.js";
import { hashToken, newToken } from "../../core/security.js";
import type { InvitationMailer } from "../../core/mail.js";
import { config } from "../../config.js";
import { OrganizationsRepository } from "./organizations.repository.js";
import {
  invitationSchema,
  membershipSchema,
  organizationSchema,
} from "./organizations.validation.js";

export class OrganizationsService {
  constructor(
    private repo: OrganizationsRepository,
    private mail: InvitationMailer,
  ) {}
  async list(page: number, pageSize: number) {
    const [items, total] = await this.repo.list(
      (page - 1) * pageSize,
      pageSize,
    );
    return { items, total, page, pageSize };
  }
  create(data: unknown) {
    return this.repo.create(organizationSchema.parse(data));
  }
  mine(accountId: string) {
    return this.repo.mine(accountId);
  }
  async members(organizationId: string) {
    const eventsEnabled = await this.repo.eventsAvailable();
    const [members, invitations, events] = await Promise.all([
      this.repo.members(organizationId),
      this.repo.invitations(organizationId),
      eventsEnabled
        ? this.repo.db.event.findMany({
            where: { organizationId },
            select: { id: true, name: true },
            orderBy: { startsAt: "desc" },
          })
        : Promise.resolve([]),
    ]);
    return { members, invitations, events };
  }
  async invite(organizationId: string, actorId: string, input: unknown) {
    const data = invitationSchema.parse(input);
    const organization = await this.repo.db.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const token = newToken();
    const invitation = await this.repo.db.invitation.create({
      data: {
        ...data,
        organizationId,
        createdBy: actorId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
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
    return this.repo.db.$transaction(async (tx) => {
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
          role: invitation.role,
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
  async updateOrganization(organizationId: string, input: unknown) {
    const data = organizationSchema
      .extend({ active: membershipSchema.shape.active })
      .parse(input);
    assert(
      await this.repo.db.organization.findUnique({
        where: { id: organizationId },
      }),
      404,
      "Organização não encontrada.",
    );
    return this.repo.db.organization.update({
      where: { id: organizationId },
      data,
    });
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
      await tx.$queryRaw`SELECT organizacao_id FROM organizacoes.organizacoes WHERE organizacao_id = ${organizationId}::uuid FOR UPDATE`;
      const member = await tx.membership.findFirst({
        where: { id: memberId, organizationId },
      });
      assert(member, 404, "Membro não encontrado.");
      if (
        member.role === "ORGANIZER" &&
        member.active &&
        (!data.active || data.role !== "ORGANIZER")
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
        data,
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
  async revoke(organizationId: string, invitationId: string) {
    const result = await this.repo.db.invitation.updateMany({
      where: { id: invitationId, organizationId, acceptedAt: null },
      data: { revokedAt: new Date() },
    });
    assert(result.count, 404, "Convite não encontrado.");
    return { revoked: true };
  }
}
