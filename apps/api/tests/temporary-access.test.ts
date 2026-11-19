import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import {
  temporaryAccessAuth,
  type TemporaryAccessUser,
} from "../src/modules/organizations/temporary-access-auth.js";
import { temporaryAccessPassword } from "../src/modules/organizations/temporary-access.service.js";
import { hashToken } from "../src/core/security.js";

const organizationId = "1107bd24-ec7f-46f7-80f6-8020466a11ea";
const invitationId = "4a5b2006-9760-409b-87fd-b48905042454";
const targetId = "ec1fe4fd-5353-4072-afd4-2b9ff6fd50ba";
const route = `/api/v1/admin/organizations/${organizationId}/invitations/${invitationId}/temporary-access`;
const reason = "Solicitado presencialmente pelo responsável da organização.";
const body = (requestId = randomUUID()) => ({
  reason,
  acknowledgeEmailBypass: true,
  requestId,
});

function setup(existing = true, rateLimits = false) {
  const actor = {
    id: "2e443760-6ff8-4d56-aa98-98be45b9c415",
    email: "admin@example.test",
    platformAdmin: true,
    profile: {},
  };
  const invitation = {
    id: invitationId,
    organizationId,
    email: "person@example.test",
    acceptedAt: null as Date | null,
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 86400000),
    organization: { active: true },
  };
  let user: TemporaryAccessUser | null = existing
    ? {
        id: targetId,
        email: invitation.email,
        app_metadata: { provider: "email", custom: "preserve" },
      }
    : null;
  const audits = new Map<string, any>();
  const commits: string[] = [];
  const controls = {
    protectedAccount: false,
    failSuccessAudit: false,
    failAllAuditUpdates: false,
  };
  const auditLog = {
    findUnique: vi.fn(async ({ where }) => audits.get(where.id) ?? null),
    findFirst: vi.fn(
      async ({ where }) =>
        [...audits.values()].find(
          (item) =>
            ["PENDING", "POSSIBLY_APPLIED"].includes(item.details.status) &&
            (item.entityId === invitationId ||
              item.details.targetEmailHash === hashToken(invitation.email)),
        ) ?? null,
    ),
    create: vi.fn(async ({ data }) => {
      audits.set(data.id, structuredClone(data));
      return data;
    }),
    update: vi.fn(async ({ where, data }) => {
      if (
        controls.failAllAuditUpdates ||
        (controls.failSuccessAudit && data.details.status === "SUCCESS")
      )
        throw new Error("audit unavailable");
      const value = { ...audits.get(where.id), ...structuredClone(data) };
      audits.set(where.id, value);
      return value;
    }),
  };
  const db = {
    account: {
      upsert: vi.fn(async ({ where, create }) =>
        where.id === actor.id
          ? actor
          : { ...actor, ...create, platformAdmin: false },
      ),
      findFirst: vi.fn(async () =>
        controls.protectedAccount ? { id: targetId } : null,
      ),
    },
    invitation: { findUnique: vi.fn(async () => invitation), update: vi.fn() },
    membership: { create: vi.fn() },
    auditLog,
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (work) => {
      const snapshot = structuredClone(audits);
      try {
        const result = await work(db);
        commits.push("commit");
        return result;
      } catch (error) {
        audits.clear();
        for (const [key, value] of snapshot) audits.set(key, value);
        throw error;
      }
    }),
  };
  const auth = {
    findUserByEmail: vi.fn(async () => structuredClone(user)),
    createUser: vi.fn(async (email, _password, metadata) => {
      expect(commits.length).toBeGreaterThan(0);
      user = { id: targetId, email, app_metadata: metadata };
      return user;
    }),
    updateUser: vi.fn(async (id, _password, metadata) => {
      expect(commits.length).toBeGreaterThan(0);
      user = { id, email: invitation.email, app_metadata: metadata };
      return user;
    }),
  };
  const send = vi.fn();
  const app = createApp({
    db: db as unknown as PrismaClient,
    resolveIdentity: async (token) =>
      token === "admin"
        ? actor
        : { ...actor, id: randomUUID(), platformAdmin: false },
    temporaryAccessAuth: auth,
    mail: { send },
    rateLimits,
  });
  return { app, db, auth, actor, invitation, audits, controls, send, commits };
}

describe("acesso temporário pelo administrador geral", () => {
  it.each([true, false])(
    "gera acesso %s sem enviar e-mail, aceitar convite ou criar vínculo",
    async (existing) => {
      const h = setup(existing);
      const input = body();
      const response = await request(h.app)
        .post(route)
        .set("Authorization", "Bearer admin")
        .send(input)
        .expect(200);
      const result = response.body;
      expect(result).toMatchObject({
        email: h.invitation.email,
        mustChangePassword: true,
        emailsSent: false,
      });
      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(24);
      for (const pattern of [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/])
        expect(result.temporaryPassword).toMatch(pattern);
      const login = new URL(result.loginUrl);
      expect(login.pathname).toBe("/entrar");
      expect([...login.searchParams.keys()].sort()).toEqual(["email", "modo"]);
      expect(login.searchParams.get("modo")).toBe("senha");
      expect(login.hash).toBe("");
      expect(h.send).not.toHaveBeenCalled();
      expect(h.db.invitation.update).not.toHaveBeenCalled();
      expect(h.db.membership.create).not.toHaveBeenCalled();
      const call = existing
        ? h.auth.updateUser.mock.calls[0]
        : h.auth.createUser.mock.calls[0];
      expect(call[1]).toBe(result.temporaryPassword);
      expect(call[2]).toMatchObject({
        must_change_password: true,
        temporary_access_operation_id: input.requestId,
        ...(existing ? { provider: "email", custom: "preserve" } : {}),
      });
      const audit = h.audits.get(input.requestId);
      expect(audit).toMatchObject({
        actorId: h.actor.id,
        organizationId,
        entityId: invitationId,
        action: "TEMPORARY_ACCESS",
        details: {
          reason,
          requestId: input.requestId,
          authUserId: targetId,
          status: "SUCCESS",
        },
      });
      expect(JSON.stringify(audit)).not.toContain(result.temporaryPassword);
      expect(JSON.stringify(audit)).not.toContain(result.loginUrl);
      const locks = h.db.$queryRaw.mock.calls
        .map((call) => call[0].join("?"))
        .join("\n");
      expect(locks).toContain("FOR UPDATE");
      expect(locks).toContain("pg_advisory_xact_lock");
    },
  );

  it("repetição não gera outra senha, inclusive depois de uma nova liberação explícita", async () => {
    const h = setup();
    const first = body();
    await request(h.app)
      .post(route)
      .set("Authorization", "Bearer admin")
      .send(first)
      .expect(200);
    await request(h.app)
      .post(route)
      .set("Authorization", "Bearer admin")
      .send(body())
      .expect(200);
    const repeated = await request(h.app)
      .post(route)
      .set("Authorization", "Bearer admin")
      .send(first)
      .expect(409);
    expect(repeated.body.error.code).toBe("TEMPORARY_ACCESS_ALREADY_GRANTED");
    expect(h.auth.updateUser).toHaveBeenCalledTimes(2);
  });

  it("bloqueia nova geração quando uma reserva anterior continua pendente", async () => {
    const h = setup();
    h.audits.set(randomUUID(), {
      entityId: invitationId,
      details: { status: "PENDING" },
    });
    const response = await request(h.app)
      .post(route)
      .set("Authorization", "Bearer admin")
      .send(body())
      .expect(409);
    expect(response.body.error.code).toBe("TEMPORARY_ACCESS_IN_PROGRESS");
    expect(h.auth.findUserByEmail).not.toHaveBeenCalled();
  });

  it("mantém reserva durável se a auditoria falhar após a alteração no Auth", async () => {
    const h = setup();
    h.controls.failSuccessAudit = true;
    const input = body();
    const response = await request(h.app)
      .post(route)
      .set("Authorization", "Bearer admin")
      .send(input)
      .expect(503);
    expect(response.body.error).toMatchObject({
      code: "TEMPORARY_ACCESS_POSSIBLY_APPLIED",
      fields: { operationPossiblyApplied: true, requestId: input.requestId },
    });
    expect(response.body.temporaryPassword).toBeUndefined();
    expect(h.audits.get(input.requestId).details.status).toBe(
      "POSSIBLY_APPLIED",
    );
    const repeated = await request(h.app)
      .post(route)
      .set("Authorization", "Bearer admin")
      .send(input)
      .expect(409);
    expect(repeated.body.error.code).toBe("TEMPORARY_ACCESS_ALREADY_GRANTED");
    expect(h.auth.updateUser).toHaveBeenCalledOnce();
  });

  it.each(["PENDING", "POSSIBLY_APPLIED"])(
    "bloqueia outro convite para o mesmo e-mail com operação %s",
    async (status) => {
      const h = setup();
      h.audits.set(randomUUID(), {
        entityId: randomUUID(),
        details: { status, targetEmailHash: hashToken(h.invitation.email) },
      });
      const response = await request(h.app)
        .post(route)
        .set("Authorization", "Bearer admin")
        .send(body())
        .expect(409);
      expect(response.body.error.code).toBe("TEMPORARY_ACCESS_IN_PROGRESS");
      expect(h.auth.findUserByEmail).not.toHaveBeenCalled();
    },
  );

  it("falha antes de alterar Auth fica registrada e permite nova solicitação explícita", async () => {
    const h = setup();
    h.auth.findUserByEmail.mockRejectedValueOnce(new Error("auth unavailable"));
    const input = body();
    await request(h.app)
      .post(route)
      .set("Authorization", "Bearer admin")
      .send(input)
      .expect(500);
    expect(h.audits.get(input.requestId).details.status).toBe("FAILED");
    expect(h.auth.updateUser).not.toHaveBeenCalled();
    await request(h.app)
      .post(route)
      .set("Authorization", "Bearer admin")
      .send(body())
      .expect(200);
  });

  it.each(["self", "admin"])("protege conta %s", async (kind) => {
    const h = setup();
    if (kind === "self") h.invitation.email = h.actor.email;
    else h.controls.protectedAccount = true;
    const response = await request(h.app)
      .post(route)
      .set("Authorization", "Bearer admin")
      .send(body())
      .expect(403);
    expect(response.body.error.code).toBe("TEMPORARY_ACCESS_PROTECTED_ACCOUNT");
    expect(h.auth.updateUser).not.toHaveBeenCalled();
    expect(h.auth.createUser).not.toHaveBeenCalled();
  });

  it("organizador e visitante não podem executar a ação", async () => {
    const h = setup();
    await request(h.app).post(route).send(body()).expect(401);
    await request(h.app)
      .post(route)
      .set("Authorization", "Bearer organizer")
      .send(body())
      .expect(403);
    expect(h.db.$transaction).not.toHaveBeenCalled();
    expect(h.auth.findUserByEmail).not.toHaveBeenCalled();
  });

  it.each(["accepted", "revoked", "expired", "wrong-organization", "inactive"])(
    "recusa convite %s",
    async (kind) => {
      const h = setup();
      if (kind === "accepted") h.invitation.acceptedAt = new Date();
      if (kind === "revoked") h.invitation.revokedAt = new Date();
      if (kind === "expired") h.invitation.expiresAt = new Date(0);
      if (kind === "wrong-organization")
        h.invitation.organizationId = randomUUID();
      if (kind === "inactive") h.invitation.organization.active = false;
      await request(h.app)
        .post(route)
        .set("Authorization", "Bearer admin")
        .send(body())
        .expect(
          kind === "inactive" || kind === "wrong-organization" ? 404 : 410,
        );
      expect(h.auth.findUserByEmail).not.toHaveBeenCalled();
    },
  );

  it.each([
    { ...body(), reason: "curto" },
    { ...body(), reason: "x".repeat(501) },
    { ...body(), acknowledgeEmailBypass: false },
    { ...body(), requestId: "invalid" },
    { ...body(), password: "user-supplied-password" },
    { ...body(), email: "someone-else@example.test" },
  ])("recusa corpo inválido sem iniciar operação", async (input) => {
    const h = setup();
    await request(h.app)
      .post(route)
      .set("Authorization", "Bearer admin")
      .send(input)
      .expect(422);
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it("limita solicitações pela conta do administrador", async () => {
    const h = setup(true, true);
    for (let attempt = 0; attempt < 10; attempt++)
      await request(h.app)
        .post(route)
        .set("Authorization", "Bearer admin")
        .send({})
        .expect(422);
    await request(h.app)
      .post(route)
      .set("Authorization", "Bearer admin")
      .send({})
      .expect(429);
  });
});

describe("adaptador administrativo do Auth", () => {
  it("procura endereço exato em mais de uma página e relê os metadados", async () => {
    const target = {
      id: targetId,
      email: "person@example.test",
      app_metadata: { fresh: true },
    };
    const admin = {
      listUsers: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            users: Array.from({ length: 1000 }, (_, i) => ({
              id: String(i),
              email: `other${i}@example.test`,
            })),
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { users: [{ ...target, app_metadata: { old: true } }] },
          error: null,
        }),
      getUserById: vi
        .fn()
        .mockResolvedValue({ data: { user: target }, error: null }),
    };
    const adapter = temporaryAccessAuth(() => admin as never);
    expect(await adapter.findUserByEmail("PERSON@example.test")).toEqual(
      target,
    );
    expect(admin.listUsers).toHaveBeenNthCalledWith(2, {
      page: 2,
      perPage: 1000,
    });
    expect(admin.getUserById).toHaveBeenCalledExactlyOnceWith(targetId);
  });

  it.each(["create", "update"])(
    "%s confirma administrativamente sem iniciar envio de e-mail",
    async (kind) => {
      const user = {
        id: targetId,
        email: "person@example.test",
        app_metadata: {},
      };
      const admin = {
        createUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        updateUserById: vi
          .fn()
          .mockResolvedValue({ data: { user }, error: null }),
      };
      const adapter = temporaryAccessAuth(() => admin as never);
      const password = temporaryAccessPassword();
      const metadata = { must_change_password: true };
      if (kind === "create")
        await adapter.createUser(user.email, password, metadata);
      else await adapter.updateUser(targetId, password, metadata);
      const attrs = { password, email_confirm: true, app_metadata: metadata };
      if (kind === "create")
        expect(admin.createUser).toHaveBeenCalledExactlyOnceWith({
          ...attrs,
          email: user.email,
        });
      else
        expect(admin.updateUserById).toHaveBeenCalledExactlyOnceWith(
          targetId,
          attrs,
        );
    },
  );
});
