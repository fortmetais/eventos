import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { updateFirstPassword } from "../src/core/first-password.js";

const accountId = "bc04aac8-b4ab-4d3e-a248-57fbde4922fc";
const strongPassword = "UmaSenhaNova!2026";

function setup(required = true) {
  const account = {
    id: accountId,
    email: "account@example.test",
    profile: { name: "Private profile" },
    platformAdmin: true,
  };
  const rowLock = vi.fn().mockResolvedValue([{ conta_id: accountId }]);
  const db = {
    account: { upsert: vi.fn().mockResolvedValue(account) },
    membership: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    invitation: { update: vi.fn() },
    $transaction: vi.fn(async (work) => work({ $queryRaw: rowLock })),
  };
  const updater = vi.fn().mockResolvedValue(undefined);
  const app = createApp({
    db: db as unknown as PrismaClient,
    resolveIdentity: async () => ({
      id: accountId,
      email: account.email,
      passwordChangeRequired: required,
    }),
    rateLimits: false,
    firstPasswordUpdater: updater,
  });
  return { app, db, updater, rowLock };
}

describe("troca obrigatória da primeira senha", () => {
  it("preserva a consulta de acesso de contas sem senha temporária", async () => {
    const { app, db } = setup(false);
    const response = await request(app)
      .get("/api/v1/me/access")
      .set("Authorization", "Bearer normal-session")
      .expect(200);
    expect(response.body.account.profile).toEqual({ name: "Private profile" });
    expect(response.body.account.platformAdmin).toBe(true);
    expect(response.body.passwordChangeRequired).toBeUndefined();
    expect(db.membership.findMany).toHaveBeenCalledOnce();
  });

  it("expõe apenas a conta básica e não consulta vínculos ou permissões", async () => {
    const { app, db } = setup();
    const response = await request(app)
      .get("/api/v1/me/access")
      .set("Authorization", "Bearer temporary-session")
      .expect(200);
    expect(response.body).toEqual({
      account: {
        id: accountId,
        email: "account@example.test",
        profile: {},
        platformAdmin: false,
      },
      organizations: [],
      passwordChangeRequired: true,
    });
    expect(db.membership.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ["get", "/api/v1/me/profile"],
    ["get", "/api/v1/me/access/"],
    ["post", "/api/v1/invitations/invitation-token/accept"],
    ["post", "/api/v1/me/first-password/"],
  ] as const)(
    "bloqueia %s %s antes de consultar dados",
    async (method, path) => {
      const { app, db, updater } = setup();
      const response = await request(app)
        [method](path)
        .set("Authorization", "Bearer temporary-session")
        .send({ password: strongPassword })
        .expect(403);
      expect(response.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
      expect(db.account.upsert).not.toHaveBeenCalled();
      expect(db.membership.create).not.toHaveBeenCalled();
      expect(db.invitation.update).not.toHaveBeenCalled();
      expect(updater).not.toHaveBeenCalled();
    },
  );

  it("troca a senha sob bloqueio da conta e exige novo login", async () => {
    const { app, db, updater, rowLock } = setup();
    const response = await request(app)
      .post("/api/v1/me/first-password")
      .set("Authorization", "Bearer temporary-session")
      .send({ password: strongPassword })
      .expect(200);
    expect(response.body).toEqual({ passwordChanged: true, signInAgain: true });
    expect(updater).toHaveBeenCalledExactlyOnceWith(accountId, strongPassword);
    expect(rowLock).toHaveBeenCalledOnce();
    expect(rowLock.mock.invocationCallOrder[0]).toBeLessThan(
      updater.mock.invocationCallOrder[0],
    );
    expect(db.membership.create).not.toHaveBeenCalled();
    expect(db.invitation.update).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { password: "short" },
    { password: "x".repeat(129) },
    { password: strongPassword, accountId: "another-account" },
  ])("recusa dados inválidos sem atualizar senha: %j", async (body) => {
    const { app, updater, rowLock } = setup();
    await request(app)
      .post("/api/v1/me/first-password")
      .set("Authorization", "Bearer temporary-session")
      .send(body)
      .expect(422);
    expect(updater).not.toHaveBeenCalled();
    expect(rowLock).not.toHaveBeenCalled();
  });

  it("recusa conta sem troca obrigatória e sessão ausente", async () => {
    const { app, updater } = setup(false);
    const normal = await request(app)
      .post("/api/v1/me/first-password")
      .set("Authorization", "Bearer normal-session")
      .send({ password: strongPassword })
      .expect(403);
    expect(normal.body.error.code).toBe("PASSWORD_CHANGE_NOT_REQUIRED");
    await request(app)
      .post("/api/v1/me/first-password")
      .send({ password: strongPassword })
      .expect(401);
    expect(updater).not.toHaveBeenCalled();
  });
});

describe("atualização administrativa da primeira senha", () => {
  afterEach(() => vi.useRealTimers());

  function admin(required: unknown) {
    let metadata = {
      provider: "email",
      organizationHint: "preserve-me",
      must_change_password: required,
    };
    const getUserById = vi.fn(async () => ({
      data: { user: { id: accountId, app_metadata: metadata } },
      error: null,
    }));
    const updateUserById = vi.fn(async (_id, update) => {
      metadata = update.app_metadata;
      return { data: { user: { id: accountId } }, error: null };
    });
    return { getUserById, updateUserById };
  }
  type PasswordAdmin = NonNullable<Parameters<typeof updateFirstPassword>[2]>;

  it("salva senha, flag e corte de sessões juntos, preserva metadados e revalida repetição", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T15:40:20.123Z"));
    const stub = admin(true);
    await updateFirstPassword(
      accountId,
      strongPassword,
      stub as unknown as PasswordAdmin,
    );
    expect(stub.getUserById).toHaveBeenCalledExactlyOnceWith(accountId);
    expect(stub.updateUserById).toHaveBeenCalledExactlyOnceWith(accountId, {
      password: strongPassword,
      app_metadata: {
        provider: "email",
        organizationHint: "preserve-me",
        must_change_password: false,
        pw_changed_after: "2026-11-12T15:40:20.000Z",
      },
    });
    await expect(
      updateFirstPassword(
        accountId,
        strongPassword,
        stub as unknown as PasswordAdmin,
      ),
    ).rejects.toMatchObject({ status: 409, code: "PASSWORD_ALREADY_CHANGED" });
    expect(stub.updateUserById).toHaveBeenCalledOnce();
  });

  it.each([false, "true", undefined])(
    "exige flag privilegiada booleana (%s)",
    async (flag) => {
      const stub = admin(flag);
      await expect(
        updateFirstPassword(
          accountId,
          strongPassword,
          stub as unknown as PasswordAdmin,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(stub.updateUserById).not.toHaveBeenCalled();
    },
  );

  it("não atualiza quando a consulta da conta falha", async () => {
    const stub = admin(true);
    stub.getUserById.mockResolvedValue({
      data: { user: null },
      error: { message: "unavailable" },
    } as never);
    await expect(
      updateFirstPassword(
        accountId,
        strongPassword,
        stub as unknown as PasswordAdmin,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(stub.updateUserById).not.toHaveBeenCalled();
  });
});
