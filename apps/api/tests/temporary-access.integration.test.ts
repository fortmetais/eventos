import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, type Account } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { TemporaryAccessService } from "../src/modules/organizations/temporary-access.service.js";
import type {
  TemporaryAccessAuth,
  TemporaryAccessUser,
} from "../src/modules/organizations/temporary-access-auth.js";
import { hashToken } from "../src/core/security.js";

const url = process.env.TEST_TEMPORARY_ACCESS_DATABASE_URL;
const integration = url ? describe : describe.skip;
integration("acesso temporário com PostgreSQL isolado", () => {
  if (url && new URL(url).pathname !== "/fac_temporary_access_tests")
    throw new Error(
      "Os testes exigem a base exclusiva fac_temporary_access_tests.",
    );
  const db = new PrismaClient({
    datasourceUrl:
      url ?? "postgresql://fac_test@127.0.0.1:1/fac_temporary_access_tests",
  });
  const organizationId = randomUUID();
  let actor: Account;
  beforeAll(async () => {
    actor = await db.account.create({
      data: {
        id: randomUUID(),
        email: `${randomUUID()}@example.test`,
        platformAdmin: true,
      },
    });
    await db.organization.create({
      data: {
        id: organizationId,
        name: "Organização de teste",
        city: "Maringá",
        state: "PR",
        contact: "44999991111",
      },
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  async function invitation(email: string) {
    return db.invitation.create({
      data: {
        organizationId,
        email,
        role: "SECRETARY",
        tokenHash: hashToken(randomUUID()),
        createdBy: actor.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  }
  function input(requestId = randomUUID()) {
    return {
      requestId,
      reason: "Identidade conferida presencialmente pelo administrador.",
      acknowledgeEmailBypass: true,
    };
  }
  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  it("serializa duas requisições com o mesmo ID sem redefinir outra senha", async () => {
    const pending = await invitation(`${randomUUID()}@example.test`);
    const payload = input();
    const started = deferred();
    const release = deferred();
    const user: TemporaryAccessUser = {
      id: randomUUID(),
      email: pending.email,
      app_metadata: {},
    };
    const auth = {
      findUserByEmail: vi.fn(async () => user),
      createUser: vi.fn(),
      updateUser: vi.fn(async (_id, _password, metadata) => {
        started.resolve();
        await release.promise;
        return { ...user, app_metadata: metadata };
      }),
    } satisfies TemporaryAccessAuth;
    const service = new TemporaryAccessService(
      db,
      auth,
      "https://example.test",
    );
    const first = service.grant(organizationId, pending.id, actor, payload);
    await Promise.race([started.promise, first]);
    const second = service.grant(organizationId, pending.id, actor, payload);
    // The second request waits for the invitation row held by the first.
    release.resolve();
    const results = await Promise.allSettled([first, second]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1]).toMatchObject({
      status: "rejected",
      reason: { code: "TEMPORARY_ACCESS_ALREADY_GRANTED" },
    });
    expect(auth.updateUser).toHaveBeenCalledOnce();
    expect(
      (
        await db.auditLog.findUniqueOrThrow({
          where: { id: payload.requestId },
        })
      ).details,
    ).toMatchObject({ status: "SUCCESS", authUserId: user.id });
    expect(
      (await db.invitation.findUniqueOrThrow({ where: { id: pending.id } }))
        .acceptedAt,
    ).toBeNull();
    expect(await db.membership.count({ where: { organizationId } })).toBe(0);
  });

  it("serializa convites diferentes para o mesmo e-mail e relê metadados atuais", async () => {
    const email = `${randomUUID()}@example.test`;
    const [one, two] = await Promise.all([
      invitation(email),
      invitation(email),
    ]);
    let user: TemporaryAccessUser = {
      id: randomUUID(),
      email,
      app_metadata: { preserved: true },
    };
    let active = 0;
    let maximum = 0;
    const auth: TemporaryAccessAuth = {
      findUserByEmail: vi.fn(async () => structuredClone(user)),
      createUser: vi.fn(),
      updateUser: vi.fn(async (_id, _password, metadata) => {
        active++;
        maximum = Math.max(maximum, active);
        // Read another DB connection while this transaction owns the email lock.
        await db.auditLog.count({ where: { organizationId } });
        user = { ...user, app_metadata: metadata };
        active--;
        return user;
      }),
    };
    const service = new TemporaryAccessService(
      db,
      auth,
      "https://example.test",
    );
    const results = await Promise.allSettled([
      service.grant(organizationId, one.id, actor, input()),
      service.grant(organizationId, two.id, actor, input()),
    ]);
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        expect(result.reason.code).toBe("TEMPORARY_ACCESS_IN_PROGRESS");
        await service.grant(
          organizationId,
          [one, two][index].id,
          actor,
          input(),
        );
      }
    }
    expect(maximum).toBe(1);
    expect(auth.updateUser).toHaveBeenCalledTimes(2);
    expect(user.app_metadata.preserved).toBe(true);
  });

  it("não toca Auth quando a reserva de auditoria não pode ser persistida", async () => {
    const pending = await invitation(`${randomUUID()}@example.test`);
    const payload = input();
    const auth: TemporaryAccessAuth = {
      findUserByEmail: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
    };
    const service = new TemporaryAccessService(
      db,
      auth,
      "https://example.test",
    );
    await expect(
      service.grant(
        organizationId,
        pending.id,
        { ...actor, id: randomUUID() },
        payload,
      ),
    ).rejects.toBeDefined();
    expect(auth.findUserByEmail).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(
      await db.auditLog.findUnique({ where: { id: payload.requestId } }),
    ).toBeNull();
  });
});
