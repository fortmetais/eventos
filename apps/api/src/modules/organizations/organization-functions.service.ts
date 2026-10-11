import type { MemberRole, Prisma, PrismaClient } from "@prisma/client";
import { assert } from "../../core/errors.js";
import {
  functionNameKey,
  organizationFunctionSchema,
} from "./organization-functions.validation.js";

export async function lockOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  await tx.$queryRaw`SELECT organizacao_id FROM organizacoes.organizacoes WHERE organizacao_id = ${organizationId}::uuid FOR UPDATE`;
  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
  });
  assert(organization?.active, 404, "Organização indisponível.");
  return organization;
}
export async function requireOrganizationManager(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorId: string,
) {
  const organization = await lockOrganization(tx, organizationId);
  const actor = await tx.account.findUnique({
    where: { id: actorId },
    select: { platformAdmin: true },
  });
  const member = actor?.platformAdmin
    ? null
    : await tx.membership.findUnique({
        where: {
          organizationId_accountId: { organizationId, accountId: actorId },
        },
      });
  assert(
    actor?.platformAdmin || (member?.active && member.role === "ORGANIZER"),
    403,
    "Você não tem permissão para administrar esta organização.",
  );
  return organization;
}
export async function resolveOrganizationFunction(
  tx: Prisma.TransactionClient,
  organizationId: string,
  selection: { functionId?: string; role?: MemberRole },
  retainedId?: string | null,
) {
  let value;
  if (selection.functionId)
    value = await tx.organizationFunction.findFirst({
      where: { id: selection.functionId, organizationId },
    });
  else if (selection.role) {
    value = await tx.organizationFunction.findFirst({
      where: {
        organizationId,
        role: selection.role,
        defaultRole: selection.role,
        active: true,
      },
    });
    value ??= await tx.organizationFunction.findFirst({
      where: { organizationId, role: selection.role, active: true },
      orderBy: { name: "asc" },
    });
  }
  assert(value, 422, "Selecione uma função desta organização.");
  assert(
    value.active || value.id === retainedId,
    422,
    "Esta função está inativa. Selecione uma função ativa.",
  );
  return value;
}
export class OrganizationFunctionsService {
  constructor(private db: PrismaClient) {}
  list(organizationId: string) {
    return this.db.organizationFunction.findMany({
      where: { organizationId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            members: true,
            invitations: {
              where: {
                acceptedAt: null,
                revokedAt: null,
                expiresAt: { gt: new Date() },
              },
            },
          },
        },
      },
    });
  }
  async create(organizationId: string, actorId: string, input: unknown) {
    const data = organizationFunctionSchema.parse(input);
    return this.db.$transaction(async (tx) => {
      await requireOrganizationManager(tx, organizationId, actorId);
      const value = await tx.organizationFunction.create({
        data: { ...data, organizationId, nameKey: functionNameKey(data.name) },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "FUNCTION_CREATED",
          entityId: value.id,
        },
      });
      return value;
    });
  }
  async update(
    organizationId: string,
    functionId: string,
    actorId: string,
    input: unknown,
  ) {
    const data = organizationFunctionSchema.parse(input);
    return this.db.$transaction(async (tx) => {
      await requireOrganizationManager(tx, organizationId, actorId);
      const current = await tx.organizationFunction.findFirst({
        where: { id: functionId, organizationId },
      });
      assert(current, 404, "Função não encontrada.");
      const changedProfile = current.role !== data.role;
      if (changedProfile && current.role === "ORGANIZER") {
        const members = await tx.membership.findMany({
          where: {
            organizationId,
            functionId,
            active: true,
            role: "ORGANIZER",
          },
          select: { id: true },
        });
        if (members.length) {
          const remaining = await tx.membership.count({
            where: {
              organizationId,
              active: true,
              role: "ORGANIZER",
              id: { notIn: members.map((m) => m.id) },
            },
          });
          assert(
            remaining > 0,
            409,
            "Mantenha pelo menos um organizador ativo. Atribua outra função de organizador antes de mudar este perfil.",
          );
        }
      }
      const value = await tx.organizationFunction.update({
        where: { id: functionId },
        data: { ...data, nameKey: functionNameKey(data.name) },
      });
      const members = changedProfile
        ? await tx.membership.updateMany({
            where: { organizationId, functionId },
            data: { role: data.role, healthEventIds: [] },
          })
        : { count: 0 };
      const invitations = changedProfile
        ? await tx.invitation.updateMany({
            where: {
              organizationId,
              functionId,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            data: { role: data.role },
          })
        : { count: 0 };
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "FUNCTION_UPDATED",
          entityId: functionId,
        },
      });
      return {
        ...value,
        affected: { members: members.count, invitations: invitations.count },
      };
    });
  }
  async deactivate(
    organizationId: string,
    functionId: string,
    actorId: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await requireOrganizationManager(tx, organizationId, actorId);
      const value = await tx.organizationFunction.findFirst({
        where: { id: functionId, organizationId },
      });
      assert(value, 404, "Função não encontrada.");
      const result = await tx.organizationFunction.update({
        where: { id: functionId },
        data: { active: false },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId,
          action: "FUNCTION_DEACTIVATED",
          entityId: functionId,
        },
      });
      return result;
    });
  }
}
