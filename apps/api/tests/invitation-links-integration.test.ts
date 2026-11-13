import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashToken, newToken } from "../src/core/security.js";

const url = process.env.TEST_FUNCTION_DATABASE_URL;
(url ? describe : describe.skip)("Cópia dos links dos convites", () => {
  if (
    url &&
    (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
      new URL(url).pathname !== "/fac_function_tests")
  )
    throw new Error("Use somente fac_function_tests local e isolado.");
  const db = new PrismaClient({
    datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_function_tests",
  });
  const users = Object.fromEntries(
    ["organizer", "secretary", "other", "candidate", "wrong", "admin"].map(
      (name) => [
        name,
        {
          id: randomUUID(),
          email: `${name}-${randomUUID()}@invitation-links.test`,
        },
      ],
    ),
  );
  const send = vi.fn(async () => true);
  const app = createApp({
    db,
    eventsEnabled: false,
    camperRegistrationsEnabled: false,
    eventManagementEnabled: true,
    rateLimits: false,
    invitationLinkSecret: "segredo-exclusivo-de-convites-teste-1234567890",
    mail: { send },
    resolveIdentity: async (token) => users[token] ?? null,
  });
  const noSecretApp = createApp({
    db,
    eventsEnabled: false,
    camperRegistrationsEnabled: false,
    eventManagementEnabled: true,
    rateLimits: false,
    invitationLinkSecret: "",
    mail: { send },
    resolveIdentity: async (token) => users[token] ?? null,
  });
  const auth = (user = "organizer") => ({ Authorization: `Bearer ${user}` });
  let org: string, otherOrg: string;
  const path = (invitationId: string, organizationId = org) =>
    `/api/v1/organizations/${organizationId}/invitations/${invitationId}/link`;
  const membersPath = () => `/api/v1/organizations/${org}/members`;
  async function invite() {
    return (
      await request(app)
        .post(`/api/v1/organizations/${org}/invitations`)
        .set(auth())
        .send({ email: users.candidate.email, role: "ORGANIZER" })
        .expect(201)
    ).body as { id: string; link: string; expiresAt: string };
  }
  async function legacy() {
    const token = newToken();
    const invitation = await db.invitation.create({
      data: {
        organizationId: org,
        email: users.candidate.email,
        role: "ORGANIZER",
        createdBy: users.organizer.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return { invitation, token };
  }
  beforeAll(async () => {
    await db.account.createMany({
      data: Object.entries(users).map(([name, user]) => ({
        ...user,
        platformAdmin: name === "admin",
      })),
    });
  });
  beforeEach(async () => {
    send.mockClear();
    const createOrganization = (name: string) =>
      db.organization.create({
        data: {
          name: `${name} ${randomUUID()}`,
          city: "Loanda",
          state: "PR",
          contact: "Teste",
        },
      });
    org = (await createOrganization("Convites A")).id;
    otherOrg = (await createOrganization("Convites B")).id;
    await db.membership.createMany({
      data: [
        {
          organizationId: org,
          accountId: users.organizer.id,
          role: "ORGANIZER",
        },
        {
          organizationId: org,
          accountId: users.secretary.id,
          role: "SECRETARY",
        },
        {
          organizationId: otherOrg,
          accountId: users.other.id,
          role: "ORGANIZER",
        },
      ],
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it("recupera exatamente o link enviado sem incluir segredos na listagem", async () => {
    const invitation = await invite();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual([
      users.candidate.email,
      expect.any(String),
      invitation.link,
    ]);
    const listed = (
      await request(app).get(membersPath()).set(auth()).expect(200)
    ).body;
    expect(listed.invitationLinksReady).toBe(true);
    const item = listed.invitations.find(
      (value: { id: string }) => value.id === invitation.id,
    );
    expect(item.canCopyLink).toBe(true);
    expect(item).not.toHaveProperty("tokenHash");
    expect(item).not.toHaveProperty("hash_token");
    expect(item).not.toHaveProperty("link");
    const before = await db.invitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    const result = await request(app)
      .post(path(invitation.id))
      .set(auth())
      .send({})
      .expect(200);
    expect(result.body).toMatchObject({
      link: invitation.link,
      expiresAt: invitation.expiresAt,
      regenerated: false,
    });
    expect(
      await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } }),
    ).toEqual(before);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await db.auditLog.count({
        where: {
          organizationId: org,
          entityId: invitation.id,
          action: "INVITATION_LINK_ACCESSED",
        },
      }),
    ).toBe(1);
  });

  it("exige decisão explícita para substituir o link de um convite antigo", async () => {
    const { invitation, token } = await legacy();
    const listed = (
      await request(app).get(membersPath()).set(auth()).expect(200)
    ).body;
    expect(
      listed.invitations.find(
        (value: { id: string }) => value.id === invitation.id,
      ).canCopyLink,
    ).toBe(false);
    const unavailable = await request(app)
      .post(path(invitation.id))
      .set(auth())
      .send({})
      .expect(409);
    expect(unavailable.body.error.code).toBe("INVITATION_LINK_UNAVAILABLE");
    expect(
      await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } }),
    ).toEqual(invitation);
    const result = await request(app)
      .post(path(invitation.id))
      .set(auth())
      .send({ regenerate: true })
      .expect(200);
    expect(result.body.regenerated).toBe(true);
    const replacement = await db.invitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(replacement).toEqual({
      ...invitation,
      tokenHash: expect.any(String),
    });
    expect(replacement.tokenHash).not.toBe(invitation.tokenHash);
    expect(
      hashToken(new URL(result.body.link).pathname.split("/").at(-1)!),
    ).toBe(replacement.tokenHash);
    expect(send).not.toHaveBeenCalled();
    await request(app)
      .post(`/api/v1/invitations/${token}/accept`)
      .set(auth("candidate"))
      .expect(410);
    const copied = await request(app)
      .post(path(invitation.id))
      .set(auth())
      .send({})
      .expect(200);
    expect(copied.body).toMatchObject({
      link: result.body.link,
      regenerated: false,
    });
    expect(
      await db.auditLog.count({
        where: {
          organizationId: org,
          entityId: invitation.id,
          action: "INVITATION_LINK_REGENERATED",
        },
      }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: {
          organizationId: org,
          entityId: invitation.id,
          action: "INVITATION_LINK_ACCESSED",
        },
      }),
    ).toBe(2);
  });

  it("duas gerações simultâneas produzem um só link e uma só substituição", async () => {
    const { invitation } = await legacy();
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post(path(invitation.id))
          .set(auth())
          .send({ regenerate: true }),
      ),
    );
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(results[0].body.link).toBe(results[1].body.link);
    expect(results.filter((result) => result.body.regenerated)).toHaveLength(1);
    expect(
      await db.auditLog.count({
        where: {
          organizationId: org,
          entityId: invitation.id,
          action: "INVITATION_LINK_REGENERATED",
        },
      }),
    ).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["acceptedAt", "revokedAt", "expiresAt"] as const)(
    "não copia nem regenera convite inativo por %s",
    async (field) => {
      const { invitation } = await legacy();
      const data =
        field === "expiresAt"
          ? {
              createdAt: new Date(Date.now() - 3600000),
              expiresAt: new Date(Date.now() - 1000),
            }
          : { [field]: new Date() };
      const inactive = await db.invitation.update({
        where: { id: invitation.id },
        data,
      });
      const listed = (
        await request(app).get(membersPath()).set(auth()).expect(200)
      ).body;
      expect(
        listed.invitations.find(
          (value: { id: string }) => value.id === invitation.id,
        ).canCopyLink,
      ).toBe(false);
      for (const body of [{}, { regenerate: true }])
        await request(app)
          .post(path(invitation.id))
          .set(auth())
          .send(body)
          .expect(410);
      expect(
        await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } }),
      ).toEqual(inactive);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("isola organizações, exige gestor e permite o administrador", async () => {
    const invitation = await invite();
    await request(app).post(path(invitation.id)).send({}).expect(401);
    for (const role of ["secretary", "other", "candidate"])
      await request(app)
        .post(path(invitation.id))
        .set(auth(role))
        .send({})
        .expect(403);
    await request(app)
      .post(path(invitation.id, otherOrg))
      .set(auth("other"))
      .send({})
      .expect(404);
    const admin = await request(app)
      .post(path(invitation.id))
      .set(auth("admin"))
      .send({})
      .expect(200);
    expect(admin.body.link).toBe(invitation.link);
    await db.membership.updateMany({
      where: { organizationId: org, accountId: users.organizer.id },
      data: { active: false },
    });
    await request(app)
      .post(path(invitation.id))
      .set(auth())
      .send({})
      .expect(403);
  });

  it("aceitar exige o destinatário e encerra a possibilidade de copiar", async () => {
    const invitation = await invite();
    const token = new URL(invitation.link).pathname.split("/").at(-1)!;
    await request(app)
      .post(`/api/v1/invitations/${token}/accept`)
      .set(auth("wrong"))
      .expect(403);
    await request(app)
      .post(`/api/v1/invitations/${token}/accept`)
      .set(auth("candidate"))
      .expect(200);
    await request(app)
      .post(path(invitation.id))
      .set(auth())
      .send({})
      .expect(410);
    await request(app)
      .post(`/api/v1/invitations/${token}/accept`)
      .set(auth("candidate"))
      .expect(410);
    const listed = (
      await request(app).get(membersPath()).set(auth()).expect(200)
    ).body;
    expect(listed.invitations[0]).toMatchObject({
      id: invitation.id,
      canCopyLink: false,
      acceptedAt: expect.any(String),
    });
  });

  it("sem segredo preserva criação e informa que os links não estão disponíveis", async () => {
    const invitation = (
      await request(noSecretApp)
        .post(`/api/v1/organizations/${org}/invitations`)
        .set(auth())
        .send({ email: users.candidate.email, role: "ORGANIZER" })
        .expect(201)
    ).body;
    const listed = (
      await request(noSecretApp).get(membersPath()).set(auth()).expect(200)
    ).body;
    expect(listed.invitationLinksReady).toBe(false);
    expect(listed.invitations[0].canCopyLink).toBe(false);
    await request(noSecretApp)
      .post(path(invitation.id))
      .set(auth())
      .send({ regenerate: true })
      .expect(503);
    await request(noSecretApp)
      .post(
        `/api/v1/invitations/${new URL(invitation.link).pathname.split("/").at(-1)}/accept`,
      )
      .set(auth("candidate"))
      .expect(200);
  });

  it("rejeita campos desconhecidos e não muda o convite", async () => {
    const { invitation } = await legacy();
    await request(app)
      .post(path(invitation.id))
      .set(auth())
      .send({ regenerate: true, email: "outro@example.test" })
      .expect(422);
    expect(
      await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } }),
    ).toEqual(invitation);
    expect(send).not.toHaveBeenCalled();
  });
});
