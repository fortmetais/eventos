import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient, type OrganizationFunction } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_FUNCTION_DATABASE_URL;
(url ? describe : describe.skip)(
  "Funções por organização e propagação de acesso",
  () => {
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
      [
        "organizer",
        "second",
        "secretary",
        "other",
        "candidate",
        "candidate2",
        "admin",
      ].map((name) => [
        name,
        { id: randomUUID(), email: name + "@functions.test" },
      ]),
    );
    const app = createApp({
      db,
      eventsEnabled: false,
      camperRegistrationsEnabled: false,
      eventManagementEnabled: true,
      rateLimits: false,
      mail: {
        async send() {
          return false;
        },
      },
      resolveIdentity: async (token) => users[token] ?? null,
    });
    const auth = (name = "organizer") => ({ Authorization: "Bearer " + name });
    let org: string, otherOrg: string, defaults: OrganizationFunction[];
    const path = () => "/api/v1/organizations/" + org + "/functions";
    const membersPath = () => "/api/v1/organizations/" + org + "/members";
    const defaultFunction = (role: string) =>
      defaults.find((value) => value.role === role)!;
    async function invite(functionId: string, user = "candidate") {
      const result = await request(app)
        .post("/api/v1/organizations/" + org + "/invitations")
        .set(auth())
        .send({ email: users[user].email, functionId })
        .expect(201);
      return { ...result.body, token: result.body.link.split("/").at(-1) };
    }
    async function create(name = "Coordenação", role = "SECRETARY") {
      return (
        await request(app)
          .post(path())
          .set(auth())
          .send({ name, role, description: "Função de teste" })
          .expect(201)
      ).body as OrganizationFunction;
    }
    beforeAll(async () => {
      for (const [name, user] of Object.entries(users))
        await db.account.create({
          data: { ...user, platformAdmin: name === "admin" },
        });
    });
    beforeEach(async () => {
      org = (
        await db.organization.create({
          data: {
            name: "Funções A " + randomUUID(),
            city: "Loanda",
            state: "PR",
            contact: "Teste",
          },
        })
      ).id;
      otherOrg = (
        await db.organization.create({
          data: {
            name: "Funções B " + randomUUID(),
            city: "Loanda",
            state: "PR",
            contact: "Teste",
          },
        })
      ).id;
      defaults = await db.organizationFunction.findMany({
        where: { organizationId: org },
      });
      await db.membership.createMany({
        data: [
          {
            organizationId: org,
            accountId: users.organizer.id,
            role: "ORGANIZER",
            functionId: defaultFunction("ORGANIZER").id,
          },
          {
            organizationId: org,
            accountId: users.secretary.id,
            role: "SECRETARY",
            functionId: defaultFunction("SECRETARY").id,
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
    it("migração vincula cadastros antigos sem alterar perfis, suspensão ou autorizações; repetição preserva edições", async () => {
      const legacyOrg = "20000000-0000-4000-8000-000000000001";
      const legacy = await db.membership.findMany({
        where: { organizationId: legacyOrg },
        include: { function: true },
        orderBy: { role: "asc" },
      });
      expect(legacy).toHaveLength(2);
      expect(legacy.every((value) => value.function?.role === value.role)).toBe(
        true,
      );
      const health = legacy.find((value) => value.role === "HEALTH")!;
      expect(health.active).toBe(false);
      expect(health.healthEventIds).toEqual(["evento-legado"]);
      const invitation = await db.invitation.findUniqueOrThrow({
        where: { id: "40000000-0000-4000-8000-000000000001" },
        include: { function: true },
      });
      expect(invitation.function?.role).toBe("SECRETARY");
      const value = legacy.find(
        (value) => value.role === "ORGANIZER",
      )!.function!;
      await db.organizationFunction.update({
        where: { id: value.id },
        data: {
          name: "Diretoria legada",
          nameKey: "DIRETORIA LEGADA",
          active: false,
        },
      });
      const connection = new URL(url!);
      const result = spawnSync(
        process.env.PG_BIN
          ? process.env.PG_BIN +
              "/psql" +
              (process.platform === "win32" ? ".exe" : "")
          : process.platform === "win32"
            ? "C:/Program Files/PostgreSQL/12/bin/psql.exe"
            : "psql",
        [
          "-h",
          connection.hostname,
          "-p",
          connection.port,
          "-U",
          "fac_test",
          "-d",
          "fac_function_tests",
          "-v",
          "ON_ERROR_STOP=1",
          "-f",
          fileURLToPath(
            new URL(
              "../../../database/manual/11_funcoes_organizacao.sql",
              import.meta.url,
            ),
          ),
        ],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(
        await db.organizationFunction.count({
          where: { organizationId: legacyOrg },
        }),
      ).toBe(3);
      expect(
        await db.organizationFunction.findUniqueOrThrow({
          where: { id: value.id },
        }),
      ).toMatchObject({ name: "Diretoria legada", active: false });
    });
    it("organizações novas recebem padrões; listagem e nomes normalizados são isolados", async () => {
      expect(defaults.map((value) => value.name).sort()).toEqual(
        ["Organizador", "Secretaria", "Saúde"].sort(),
      );
      const value = await create("Coordenação   de inscrições");
      expect(value.name).toBe("Coordenação de inscrições");
      await request(app)
        .post(path())
        .set(auth())
        .send({ name: " coordenação de INSCRIÇÕES ", role: "HEALTH" })
        .expect(409);
      await request(app)
        .post("/api/v1/organizations/" + otherOrg + "/functions")
        .set(auth("other"))
        .send({ name: value.name, role: "HEALTH" })
        .expect(201);
      const list = await request(app).get(path()).set(auth()).expect(200);
      expect(
        list.body.every((f: OrganizationFunction) => f.organizationId === org),
      ).toBe(true);
      const members = await request(app)
        .get(membersPath())
        .set(auth())
        .expect(200);
      expect(
        members.body.functions.some(
          (f: OrganizationFunction) => f.id === value.id,
        ),
      ).toBe(true);
      expect(members.body.members[0].function).toBeTruthy();
    });
    it("bloqueia secretaria, outra organização, função estrangeira e tentativa de definir perfil pelo cliente", async () => {
      for (const name of ["secretary", "other"]) {
        await request(app).get(path()).set(auth(name)).expect(403);
        await request(app)
          .post(path())
          .set(auth(name))
          .send({ name: "Função inválida", role: "ORGANIZER" })
          .expect(403);
      }
      await request(app)
        .post(path())
        .send({ name: "Função inválida", role: "ORGANIZER" })
        .expect(401);
      const foreign = await db.organizationFunction.findFirstOrThrow({
        where: { organizationId: otherOrg },
      });
      await request(app)
        .put(path() + "/" + foreign.id)
        .set(auth())
        .send({ name: "Ataque cruzado", role: "ORGANIZER" })
        .expect(404);
      await request(app)
        .delete(path() + "/" + foreign.id)
        .set(auth())
        .expect(404);
      await request(app)
        .post("/api/v1/organizations/" + org + "/invitations")
        .set(auth())
        .send({ email: users.candidate.email, functionId: foreign.id })
        .expect(422);
      await request(app)
        .post("/api/v1/organizations/" + org + "/invitations")
        .set(auth())
        .send({
          email: users.candidate.email,
          functionId: defaultFunction("SECRETARY").id,
          role: "ORGANIZER",
        })
        .expect(422);
      const member = await db.membership.findFirstOrThrow({
        where: { organizationId: org, accountId: users.secretary.id },
      });
      await request(app)
        .patch(membersPath() + "/" + member.id)
        .set(auth())
        .send({ functionId: foreign.id, active: true })
        .expect(422);
      await request(app)
        .post(path())
        .set(auth("admin"))
        .send({ name: "Função administrativa", role: "SECRETARY" })
        .expect(201);
    });
    it("mudança de perfil propaga membros ativos e suspensos e convites válidos; históricos permanecem", async () => {
      const value = await create();
      const first = await invite(value.id);
      await request(app)
        .post("/api/v1/invitations/" + first.token + "/accept")
        .set(auth("candidate"))
        .expect(200);
      const pending = await invite(value.id, "candidate2");
      await db.membership.create({
        data: {
          organizationId: org,
          accountId: users.second.id,
          functionId: value.id,
          role: "SECRETARY",
          active: false,
          healthEventIds: ["autorizacao-anterior"],
        },
      });
      const expired = await db.invitation.create({
        data: {
          organizationId: org,
          functionId: value.id,
          email: "expired@test.test",
          role: "SECRETARY",
          tokenHash: "e".repeat(64),
          createdBy: users.organizer.id,
          createdAt: new Date(Date.now() - 86400000),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      const revoked = await db.invitation.create({
        data: {
          organizationId: org,
          functionId: value.id,
          email: "revoked@test.test",
          role: "SECRETARY",
          tokenHash: "f".repeat(64),
          createdBy: users.organizer.id,
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: new Date(),
        },
      });
      const result = await request(app)
        .put(path() + "/" + value.id)
        .set(auth())
        .send({ name: "Equipe de saúde", role: "HEALTH", active: true })
        .expect(200);
      expect(result.body.affected).toEqual({ members: 2, invitations: 1 });
      const members = await db.membership.findMany({
        where: { organizationId: org, functionId: value.id },
      });
      expect(
        members.every(
          (m) => m.role === "HEALTH" && m.healthEventIds.length === 0,
        ),
      ).toBe(true);
      expect(members.find((m) => m.accountId === users.second.id)?.active).toBe(
        false,
      );
      expect(
        (await db.invitation.findUniqueOrThrow({ where: { id: pending.id } }))
          .role,
      ).toBe("HEALTH");
      for (const id of [first.id, expired.id, revoked.id])
        expect(
          (await db.invitation.findUniqueOrThrow({ where: { id } })).role,
        ).toBe("SECRETARY");
      const accepted = await request(app)
        .post("/api/v1/invitations/" + pending.token + "/accept")
        .set(auth("candidate2"))
        .expect(200);
      expect(accepted.body).toMatchObject({
        role: "HEALTH",
        functionId: value.id,
        healthEventIds: [],
      });
      await request(app)
        .get("/api/v1/organizations/" + org + "/event-setups")
        .set(auth("candidate"))
        .expect(403);
    });
    it("inativação não revoga membros nem convites válidos e impede novas atribuições", async () => {
      const value = await create();
      const first = await invite(value.id);
      await request(app)
        .post("/api/v1/invitations/" + first.token + "/accept")
        .set(auth("candidate"))
        .expect(200);
      const pending = await invite(value.id, "candidate2");
      await request(app)
        .delete(path() + "/" + value.id)
        .set(auth())
        .expect(200);
      await request(app)
        .get("/api/v1/organizations/" + org + "/event-setups")
        .set(auth("candidate"))
        .expect(200);
      const accepted = await request(app)
        .post("/api/v1/invitations/" + pending.token + "/accept")
        .set(auth("candidate2"))
        .expect(200);
      expect(accepted.body.functionId).toBe(value.id);
      await request(app)
        .post("/api/v1/organizations/" + org + "/invitations")
        .set(auth())
        .send({ email: users.second.email, functionId: value.id })
        .expect(422);
      const secretary = await db.membership.findFirstOrThrow({
        where: { organizationId: org, accountId: users.secretary.id },
      });
      await request(app)
        .patch(membersPath() + "/" + secretary.id)
        .set(auth())
        .send({ functionId: value.id, active: true })
        .expect(422);
      await request(app)
        .patch(membersPath() + "/" + accepted.body.id)
        .set(auth())
        .send({ functionId: value.id, active: false })
        .expect(200);
      const unchanged = await db.membership.findUniqueOrThrow({
        where: { id: accepted.body.id },
      });
      expect(unchanged.role).toBe("SECRETARY");
    });
    it("protege o último organizador; promoção concede gestão e rebaixamento remove acesso", async () => {
      const organizerFunction = defaultFunction("ORGANIZER");
      const before = await db.organizationFunction.findUniqueOrThrow({
        where: { id: organizerFunction.id },
      });
      await request(app)
        .put(path() + "/" + organizerFunction.id)
        .set(auth())
        .send({ name: "Não pode rebaixar", role: "SECRETARY" })
        .expect(409);
      expect(
        await db.organizationFunction.findUniqueOrThrow({
          where: { id: before.id },
        }),
      ).toEqual(before);
      const value = await create("Organização auxiliar", "ORGANIZER");
      const invitation = await invite(value.id, "second");
      await request(app)
        .post("/api/v1/invitations/" + invitation.token + "/accept")
        .set(auth("second"))
        .expect(200);
      await request(app)
        .post(path())
        .set(auth("second"))
        .send({ name: "Gestão concedida", role: "SECRETARY" })
        .expect(201);
      await request(app)
        .put(path() + "/" + value.id)
        .set(auth())
        .send({ name: value.name, role: "SECRETARY" })
        .expect(200);
      await request(app)
        .post(path())
        .set(auth("second"))
        .send({ name: "Gestão revogada", role: "ORGANIZER" })
        .expect(403);
    });
    it("alterações concorrentes não removem todos os organizadores", async () => {
      const value = await create("Segundo organizador", "ORGANIZER");
      const invitation = await invite(value.id, "second");
      await request(app)
        .post("/api/v1/invitations/" + invitation.token + "/accept")
        .set(auth("second"))
        .expect(200);
      const requests = await Promise.all([
        request(app)
          .put(path() + "/" + defaultFunction("ORGANIZER").id)
          .set(auth())
          .send({ name: "Primeiro perfil", role: "SECRETARY" }),
        request(app)
          .put(path() + "/" + value.id)
          .set(auth("second"))
          .send({ name: "Segundo perfil", role: "SECRETARY" }),
      ]);
      expect(requests.map((result) => result.status).sort()).toEqual([
        200, 409,
      ]);
      expect(
        await db.membership.count({
          where: { organizationId: org, active: true, role: "ORGANIZER" },
        }),
      ).toBe(1);
    });
  },
);
