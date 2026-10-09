import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DEPARTMENT_DATABASE_URL;
(url ? describe : describe.skip)(
  "Departamentos por evento e controle de vagas",
  () => {
    if (url && new URL(url).pathname !== "/fac_department_tests")
      throw new Error("Use apenas fac_department_tests isolado.");
    const db = new PrismaClient({
      datasourceUrl:
        url ?? "postgresql://test@127.0.0.1:1/fac_department_tests",
    });
    const users = Object.fromEntries(
      ["organizer", "organizer2", "other", "secretary"].map((name) => [
        name,
        { id: randomUUID(), email: `${name}@departments.test` },
      ]),
    );
    const app = createApp({
      db,
      eventsEnabled: false,
      rateLimits: false,
      resolveIdentity: async (token) => users[token] ?? null,
      decisionNotificationsEnabled: false,
    });
    const auth = (name = "organizer") => ({ Authorization: `Bearer ${name}` });
    let org: string,
      otherOrg: string,
      eventId: string,
      campaignId: string,
      formId: string,
      teamId: string,
      angelId: string;
    let candidates: string[];
    const setup = () => `/api/v1/organizations/${org}/event-setups`;
    const teamPath = (id = teamId) =>
      `/api/v1/organizations/${org}/events/${eventId}/teams/${id}`;
    const registrationPath = (id: string) =>
      `/api/v1/organizations/${org}/registrations/${id}`;
    const input = () => ({
      event: {
        typeName: "FAC",
        name: "FAC Departamentos",
        description: "Evento fictício para validação dos departamentos.",
        location: "Chácara FAC",
        city: "Toledo",
        startsAt: "2027-07-10",
        endsAt: "2027-07-12",
      },
      campaigns: ["VOLUNTEER", "CAMPER"].map((kind) => ({
        kind,
        opensAt: new Date(Date.now() - 3600000).toISOString(),
        closesAt: new Date(Date.now() + 86400000).toISOString(),
      })),
      departments: [
        { name: " manutenção ", capacity: 1 },
        { name: "Anjo", capacity: 1 },
        { name: "Líder", capacity: 2 },
      ],
    });
    async function candidate() {
      const draft = await db.draft.create({
        data: {
          campaignId,
          formVersionId: formId,
          tokenHash: randomUUID().replaceAll("-", "").repeat(2),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const person = await db.person.create({
        data: {
          organizationId: org,
          name: `Servo ${randomUUID()}`,
          birthDate: new Date("1990-01-01"),
          phone: "44999999999",
        },
      });
      return (
        await db.registration.create({
          data: {
            draftId: draft.id,
            campaignId,
            formVersionId: formId,
            personId: person.id,
            protocol: `DEP-${randomUUID()}`,
            status: "APPROVED",
            snapshot: {
              name: person.name,
              answers: { equipes_preferencia: ["MANUTENÇÃO"] },
            },
          },
        })
      ).id;
    }
    beforeAll(async () => {
      await db.account.createMany({ data: Object.values(users) });
      org = (
        await db.organization.create({
          data: {
            name: "Paróquia Departamentos A",
            city: "Toledo",
            state: "PR",
            contact: "Teste",
          },
        })
      ).id;
      otherOrg = (
        await db.organization.create({
          data: {
            name: "Paróquia Departamentos B",
            city: "Toledo",
            state: "PR",
            contact: "Teste",
          },
        })
      ).id;
      await db.membership.createMany({
        data: Object.entries(users).map(([name, user]) => ({
          accountId: user.id,
          organizationId: name === "other" ? otherOrg : org,
          role:
            name === "secretary"
              ? ("SECRETARY" as const)
              : ("ORGANIZER" as const),
        })),
      });
      const result = await request(app)
        .post(setup())
        .set(auth())
        .send(input())
        .expect(201);
      eventId = result.body.id;
      campaignId = result.body.campaigns.find(
        (campaign: { kind: string }) => campaign.kind === "VOLUNTEER",
      ).id;
      teamId = result.body.teams.find(
        (team: { name: string }) => team.name === "MANUTENÇÃO",
      ).id;
      angelId = result.body.teams.find(
        (team: { name: string }) => team.name === "ANJO",
      ).id;
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    it("salva departamentos na mesma transação do evento, preserva IDs na edição e normaliza nomes", async () => {
      const events = (await request(app).get(setup()).set(auth()).expect(200))
        .body;
      expect(events[0].departmentsReady).toBe(true);
      expect(
        events[0].teams.map((team: { name: string }) => team.name),
      ).toEqual(["ANJO", "LÍDER", "MANUTENÇÃO"]);
      const data = {
        ...input(),
        departments: events[0].teams.map(
          (team: { id: string; name: string; capacity: number }) => ({
            id: team.id,
            name: team.name,
            capacity: team.capacity,
          }),
        ),
      };
      const result = await request(app)
        .put(`${setup()}/${eventId}`)
        .set(auth())
        .send(data)
        .expect(200);
      expect(
        result.body.teams.map((team: { id: string }) => team.id).sort(),
      ).toEqual(events[0].teams.map((team: { id: string }) => team.id).sort());
      expect(await db.team.count({ where: { eventId } })).toBe(3);
    });
    it("rejeita nomes repetidos, vagas inválidas e departamentos vazios sem salvar partes do evento", async () => {
      const count = await db.event.count();
      for (const departments of [
        [],
        [
          { name: "ANJO", capacity: 1 },
          { name: " anjo ", capacity: 2 },
        ],
        [{ name: "ANJO", capacity: -1 }],
        [{ name: "ANJO", capacity: 1.5 }],
      ])
        await request(app)
          .post(setup())
          .set(auth())
          .send({ ...input(), departments })
          .expect(422);
      await request(app)
        .post(setup())
        .set(auth())
        .send({ event: input().event, campaigns: input().campaigns })
        .expect(422);
      expect(await db.event.count()).toBe(count);
    });
    it("ficha usa somente os departamentos reais; também publica evento com um único departamento", async () => {
      const path = `/api/v1/organizations/${org}/events/${eventId}/volunteer-form`;
      const data = (await request(app).get(path).set(auth()).expect(200)).body;
      expect(
        data.template.questions.find(
          (question: { id: string }) => question.id === "equipes_preferencia",
        ).options,
      ).toEqual(["ANJO", "LÍDER", "MANUTENÇÃO"]);
      const tampered = structuredClone(data.template);
      tampered.questions
        .find(
          (question: { id: string }) => question.id === "equipes_preferencia",
        )
        .options.push("DEPARTAMENTO INEXISTENTE");
      await request(app).post(path).set(auth()).send(tampered).expect(409);
      formId = (
        await request(app)
          .post(path)
          .set(auth())
          .send(data.template)
          .expect(201)
      ).body.form.id;
      const single = (
        await request(app)
          .post(setup())
          .set(auth())
          .send({ ...input(), departments: [{ name: "Líder", capacity: 1 }] })
          .expect(201)
      ).body;
      const singlePath = `/api/v1/organizations/${org}/events/${single.id}/volunteer-form`;
      const singleTemplate = (
        await request(app).get(singlePath).set(auth()).expect(200)
      ).body.template;
      await request(app)
        .post(singlePath)
        .set(auth())
        .send(singleTemplate)
        .expect(201);
      expect(
        singleTemplate.questions.find(
          (question: { id: string }) => question.id === "equipes_preferencia",
        ).options,
      ).toEqual(["LÍDER"]);
      candidates = await Promise.all([candidate(), candidate()]);
    });
    it("isola organização e função em alocação, criação e alteração de vagas", async () => {
      for (const name of ["other", "secretary"])
        await request(app)
          .put(teamPath())
          .set(auth(name))
          .send({ capacity: 2 })
          .expect(403);
      await request(app)
        .post(`/api/v1/organizations/${org}/events/${eventId}/teams`)
        .set(auth("secretary"))
        .send({ name: "EXTERNA", capacity: 2 })
        .expect(403);
      const type = await db.eventType.create({
        data: { organizationId: otherOrg, name: "FAC" },
      });
      const otherEvent = await db.event.create({
        data: {
          organizationId: otherOrg,
          typeId: type.id,
          name: "Outro evento",
          description: "Evento de outra organização",
          location: "Chácara",
          city: "Toledo",
          startsAt: new Date("2027-08-01"),
          endsAt: new Date("2027-08-01"),
        },
      });
      const otherTeam = await db.team.create({
        data: { eventId: otherEvent.id, name: "EXTERNA", capacity: 1 },
      });
      await request(app)
        .put(teamPath(otherTeam.id))
        .set(auth())
        .send({ capacity: 2 })
        .expect(404);
      await request(app)
        .put(`${registrationPath(candidates[0])}/team`)
        .set(auth())
        .send({ teamId: otherTeam.id })
        .expect(422);
      await request(app)
        .post(`/api/v1/organizations/${org}/events/${eventId}/teams`)
        .set(auth())
        .send({ name: " manutenção ", capacity: 2 })
        .expect(409);
    });
    it("duas alocações concorrentes não ultrapassam a última vaga; repetir a vencedora não ocupa outra vaga", async () => {
      const results = await Promise.all(
        candidates.map((id, index) =>
          request(app)
            .put(`${registrationPath(id)}/team`)
            .set(auth(index ? "organizer2" : "organizer"))
            .send({ teamId }),
        ),
      );
      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      const winner = results.findIndex((result) => result.status === 200);
      candidates = [candidates[winner], candidates[1 - winner]];
      await request(app)
        .put(`${registrationPath(candidates[0])}/team`)
        .set(auth())
        .send({ teamId })
        .expect(200);
      const event = (
        await request(app)
          .get(`/api/v1/organizations/${org}/events`)
          .set(auth())
          .expect(200)
      ).body.find((event: { id: string }) => event.id === eventId);
      expect(
        event.teams.find((team: { id: string }) => team.id === teamId),
      ).toMatchObject({ occupied: 1, available: 0, capacity: 1 });
      expect(
        await db.registration.count({
          where: { teamId, status: { in: ["APPROVED", "CONFIRMED"] } },
        }),
      ).toBe(1);
    });
    it("bloqueia redução abaixo dos alocados, troca de departamento libera a vaga e cancelamento libera presença confirmada", async () => {
      await request(app)
        .put(teamPath())
        .set(auth())
        .send({ capacity: 0 })
        .expect(409);
      await request(app)
        .put(teamPath())
        .set(auth())
        .send({ capacity: 2 })
        .expect(200);
      await request(app)
        .put(`${registrationPath(candidates[1])}/team`)
        .set(auth())
        .send({ teamId })
        .expect(200);
      await request(app)
        .put(`${registrationPath(candidates[0])}/team`)
        .set(auth())
        .send({ teamId: angelId })
        .expect(200);
      await request(app)
        .patch(`${registrationPath(candidates[0])}/status`)
        .set(auth())
        .send({ status: "CONFIRMED", reason: "Presença confirmada" })
        .expect(200);
      await request(app)
        .patch(`${registrationPath(candidates[0])}/status`)
        .set(auth())
        .send({ status: "CANCELLED", reason: "Participação cancelada" })
        .expect(200);
      expect(
        (
          await db.registration.findUniqueOrThrow({
            where: { id: candidates[0] },
          })
        ).teamId,
      ).toBeNull();
      const next = await candidate();
      await request(app)
        .put(`${registrationPath(next)}/team`)
        .set(auth())
        .send({ teamId: angelId })
        .expect(200);
      const form = await db.formVersion.findUniqueOrThrow({
        where: { id: formId },
      });
      expect(JSON.stringify(form.config)).not.toContain(
        "DEPARTAMENTO INEXISTENTE",
      );
      const before = (
        await db.registration.findUniqueOrThrow({
          where: { id: candidates[0] },
        })
      ).snapshot;
      expect(before).toMatchObject({
        answers: { equipes_preferencia: ["MANUTENÇÃO"] },
      });
    });
  },
);
