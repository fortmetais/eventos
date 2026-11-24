import { randomUUID } from "node:crypto";
import { PrismaClient, type RegistrationStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { camperTemplate } from "../src/modules/events/camper-template.js";

const url = process.env.TEST_DEPARTMENT_DATABASE_URL;
(url ? describe : describe.skip)(
  "Equipes de campistas isoladas por campanha",
  () => {
    if (
      url &&
      (new URL(url).pathname !== "/fac_department_tests" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
    )
      throw new Error("Use apenas fac_department_tests local e descartável.");
    const db = new PrismaClient({
      datasourceUrl:
        url ?? "postgresql://test@127.0.0.1:1/fac_department_tests",
    });
    const users = Object.fromEntries(
      ["organizer", "secretary", "other"].map((name) => [
        name,
        { id: randomUUID(), email: `${name}@camper-teams.test` },
      ]),
    );
    const app = createApp({
      db,
      eventsEnabled: false,
      camperRegistrationsEnabled: true,
      rateLimits: false,
      decisionNotificationsEnabled: false,
      resolveIdentity: async (token) => users[token] ?? null,
    });
    const auth = (name = "organizer") => ({ Authorization: `Bearer ${name}` });
    let organizationId: string,
      otherOrganizationId: string,
      eventId: string,
      volunteerCampaign: string,
      camperCampaign: string,
      secondCamperCampaign: string,
      camperForm: string,
      volunteerForm: string,
      legacyTeam: string,
      blueTeam: string;
    const teamPath = (campaignId = camperCampaign, teamId?: string) =>
      `/api/v1/organizations/${organizationId}/campaigns/${campaignId}/teams${teamId ? `/${teamId}` : ""}`;
    const registrationPath = (id: string) =>
      `/api/v1/organizations/${organizationId}/registrations/${id}`;
    const assign = (id: string, teamId: string | null) =>
      request(app)
        .put(`${registrationPath(id)}/team`)
        .set(auth())
        .send({ teamId });
    const decide = (id: string, status: RegistrationStatus) =>
      request(app)
        .patch(`${registrationPath(id)}/status`)
        .set(auth())
        .send({ status, reason: "Decisão na gestão da campanha." });
    async function candidate(
      kind: "CAMPER" | "VOLUNTEER" = "CAMPER",
      status: RegistrationStatus = "RECEIVED",
    ) {
      const campaignId = kind === "CAMPER" ? camperCampaign : volunteerCampaign;
      const formVersionId = kind === "CAMPER" ? camperForm : volunteerForm;
      const person = await db.person.create({
        data: {
          organizationId,
          name: `Participante ${randomUUID()}`,
          birthDate: new Date("1990-01-01"),
          phone: "44999999999",
        },
      });
      const draft = await db.draft.create({
        data: {
          campaignId,
          formVersionId,
          tokenHash: randomUUID().replaceAll("-", "").repeat(2),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      return db.registration.create({
        data: {
          campaignId,
          formVersionId,
          draftId: draft.id,
          personId: person.id,
          accountId: users.organizer.id,
          status,
          protocol: `CAMPTEAMS-${randomUUID()}`,
          snapshot: { name: person.name },
        },
      });
    }
    beforeAll(async () => {
      await db.account.createMany({ data: Object.values(users) });
      const org = await db.organization.create({
        data: {
          name: "Organização Equipes Campistas",
          city: "Toledo",
          state: "PR",
          contact: "Secretaria",
        },
      });
      organizationId = org.id;
      otherOrganizationId = (
        await db.organization.create({
          data: {
            name: "Outra organização Equipes Campistas",
            city: "Toledo",
            state: "PR",
            contact: "Secretaria",
          },
        })
      ).id;
      await db.membership.createMany({
        data: Object.entries(users).map(([name, user]) => ({
          accountId: user.id,
          organizationId:
            name === "other" ? otherOrganizationId : organizationId,
          role:
            name === "secretary"
              ? ("SECRETARY" as const)
              : ("ORGANIZER" as const),
        })),
      });
      const type = await db.eventType.create({
        data: { organizationId, name: "FAC Equipes Campistas" },
      });
      const event = await db.event.create({
        data: {
          organizationId,
          typeId: type.id,
          name: "FAC Equipes Campistas",
          description: "Evento fictício",
          location: "Chácara",
          city: "Toledo",
          startsAt: new Date("2027-06-01"),
          endsAt: new Date("2027-06-03"),
          status: "PUBLISHED",
        },
      });
      eventId = event.id;
      for (const kind of ["VOLUNTEER", "CAMPER"] as const) {
        const campaign = await db.campaign.create({
          data: {
            eventId,
            kind,
            opensAt: new Date(Date.now() - 3600000),
            closesAt: new Date(Date.now() + 86400000),
            capacity: 30,
            allowWaitlist: true,
            paused: kind === "CAMPER",
          },
        });
        const form = await db.formVersion.create({
          data: {
            campaignId: campaign.id,
            version: 1,
            publishedAt: new Date(),
            config: camperTemplate("FAC"),
          },
        });
        if (kind === "CAMPER") {
          camperCampaign = campaign.id;
          camperForm = form.id;
        } else {
          volunteerCampaign = campaign.id;
          volunteerForm = form.id;
        }
      }
      const secondEvent = await db.event.create({
        data: {
          organizationId,
          typeId: type.id,
          name: "Outra edição Equipes Campistas",
          description: "Evento fictício",
          location: "Chácara",
          city: "Toledo",
          startsAt: new Date("2027-07-01"),
          endsAt: new Date("2027-07-03"),
          status: "PUBLISHED",
        },
      });
      secondCamperCampaign = (
        await db.campaign.create({
          data: {
            eventId: secondEvent.id,
            kind: "CAMPER",
            opensAt: new Date(Date.now() - 3600000),
            closesAt: new Date(Date.now() + 86400000),
            capacity: 10,
          },
        })
      ).id;
      legacyTeam = (
        await db.team.create({ data: { eventId, name: "AZUL", capacity: 1 } })
      ).id;
    });
    afterAll(async () => {
      await db.$disconnect();
    });

    it("mantém o mesmo nome em públicos diferentes e permite preparar equipes com a campanha pausada", async () => {
      const created = await request(app)
        .post(teamPath())
        .set(auth())
        .send({ name: " azul ", capacity: 1 })
        .expect(201);
      blueTeam = created.body.id;
      expect(created.body).toMatchObject({
        name: "AZUL",
        campaignId: camperCampaign,
        kind: "CAMPER",
        eventId,
        occupied: 0,
        available: 1,
      });
      const campers = (
        await request(app).get(teamPath()).set(auth()).expect(200)
      ).body;
      const volunteers = (
        await request(app)
          .get(teamPath(volunteerCampaign))
          .set(auth())
          .expect(200)
      ).body;
      expect(campers).toHaveLength(1);
      expect(campers[0].id).toBe(blueTeam);
      expect(volunteers.map((team: { id: string }) => team.id)).toEqual([
        legacyTeam,
      ]);
      await request(app)
        .post(teamPath())
        .set(auth())
        .send({ name: "Azul", capacity: 3 })
        .expect(409);
      expect(await db.team.count({ where: { eventId } })).toBe(1);
    });

    it("preserva permissões e rejeita equipes de outro público ou campanha", async () => {
      await request(app)
        .post(teamPath())
        .set(auth("secretary"))
        .send({ name: "Secretaria", capacity: 1 })
        .expect(403);
      await request(app).get(teamPath()).set(auth("other")).expect(403);
      const camper = await candidate(),
        volunteer = await candidate("VOLUNTEER");
      await assign(camper.id, legacyTeam).expect(422);
      await assign(volunteer.id, blueTeam).expect(422);
      const foreign = await db.camperTeam.create({
        data: { campaignId: secondCamperCampaign, name: "AZUL", capacity: 10 },
      });
      await assign(camper.id, foreign.id).expect(422);
      await request(app)
        .put(teamPath(camperCampaign, foreign.id))
        .set(auth())
        .send({ capacity: 20 })
        .expect(422);
      expect(
        (await db.camperTeam.findUniqueOrThrow({ where: { id: foreign.id } }))
          .capacity,
      ).toBe(10);
    });

    it("indica sem reserva e valida capacidade ao aceitar, mantendo o estado em caso de lotação", async () => {
      const first = await candidate(),
        second = await candidate();
      await assign(first.id, blueTeam).expect(200);
      await assign(second.id, blueTeam).expect(200);
      expect(
        (await request(app).get(teamPath()).set(auth()).expect(200)).body[0]
          .occupied,
      ).toBe(0);
      await decide(first.id, "APPROVED").expect(200);
      expect(
        (await decide(second.id, "APPROVED").expect(409)).body.error.code,
      ).toBe("CAMPER_TEAM_FULL");
      expect(
        (await db.registration.findUniqueOrThrow({ where: { id: second.id } }))
          .status,
      ).toBe("RECEIVED");
      await decide(first.id, "REVIEW").expect(200);
      await decide(second.id, "APPROVED").expect(200);
      await decide(second.id, "REJECTED").expect(200);
      const rejected = await db.registration.findUniqueOrThrow({
        where: { id: second.id },
      });
      expect(rejected.camperTeamId).toBeNull();
      expect(rejected.teamId).toBeNull();
      await decide(first.id, "WAITLIST").expect(200);
      expect(
        (await db.registration.findUniqueOrThrow({ where: { id: first.id } }))
          .camperTeamId,
      ).toBe(blueTeam);
      await assign(first.id, null).expect(200);
    });

    it("serializa a última vaga, preserva idempotência e bloqueia redução ou exclusão de grupo ocupado", async () => {
      const first = await candidate("CAMPER", "APPROVED"),
        second = await candidate("CAMPER", "APPROVED");
      const outcomes = await Promise.all([
        assign(first.id, blueTeam),
        assign(second.id, blueTeam),
      ]);
      expect(outcomes.map((result) => result.status).sort()).toEqual([
        200, 409,
      ]);
      const winner = outcomes[0].status === 200 ? first.id : second.id;
      await assign(winner, blueTeam).expect(200);
      expect(
        await db.registration.count({
          where: {
            camperTeamId: blueTeam,
            status: { in: ["APPROVED", "CONFIRMED"] },
          },
        }),
      ).toBe(1);
      await request(app)
        .put(teamPath(camperCampaign, blueTeam))
        .set(auth())
        .send({ capacity: 0 })
        .expect(409);
      const changed = await request(app)
        .put(teamPath(camperCampaign, blueTeam))
        .set(auth())
        .send({ capacity: 2 })
        .expect(200);
      expect(changed.body).toMatchObject({
        capacity: 2,
        occupied: 1,
        available: 1,
      });
      await request(app)
        .delete(teamPath(camperCampaign, blueTeam))
        .set(auth())
        .expect(409);
      await decide(winner, "CANCELLED").expect(200);
      expect(
        (await db.registration.findUniqueOrThrow({ where: { id: winner } }))
          .camperTeamId,
      ).toBeNull();
    });

    it("confirma sem equipe e permite retirar a equipe de um campista confirmado", async () => {
      const camper = await candidate();
      await decide(camper.id, "APPROVED").expect(200);
      await decide(camper.id, "CONFIRMED").expect(200);
      await assign(camper.id, blueTeam).expect(200);
      const result = await assign(camper.id, null).expect(200);
      expect(result.body).toMatchObject({ teamId: null, status: "CONFIRMED" });
      expect(result.body).not.toHaveProperty("camperTeamId");
      await assign(camper.id, blueTeam).expect(200);
      const detail = (
        await request(app)
          .get(registrationPath(camper.id))
          .set(auth())
          .expect(200)
      ).body;
      expect(detail.teamId).toBe(blueTeam);
      expect(detail.team).toMatchObject({
        id: blueTeam,
        name: "AZUL",
        campaignId: camperCampaign,
      });
      expect(detail).not.toHaveProperty("camperTeam");
      const listing = (
        await request(app)
          .get(
            `/api/v1/organizations/${organizationId}/registrations?campaignId=${camperCampaign}&teamId=${blueTeam}`,
          )
          .set(auth())
          .expect(200)
      ).body;
      expect(
        listing.items.some((row: { id: string }) => row.id === camper.id),
      ).toBe(true);
      expect(
        listing.items.every(
          (row: { campaignId: string; teamId: string }) =>
            row.campaignId === camperCampaign && row.teamId === blueTeam,
        ),
      ).toBe(true);
      const unassigned = (
        await request(app)
          .get(
            `/api/v1/organizations/${organizationId}/registrations?campaignId=${camperCampaign}&teamId=NONE`,
          )
          .set(auth())
          .expect(200)
      ).body;
      expect(
        unassigned.items.every(
          (row: { teamId: string | null }) => row.teamId === null,
        ),
      ).toBe(true);
      const own = (
        await request(app)
          .get("/api/v1/me/registrations")
          .set(auth())
          .expect(200)
      ).body;
      expect(
        own.find((row: { id: string }) => row.id === camper.id).team,
      ).toEqual({ name: "AZUL" });
      await assign(camper.id, null).expect(200);
    });

    it("impede inconsistências no banco e remove somente grupos sem participantes vinculados", async () => {
      await expect(
        db.camperTeam.create({
          data: {
            campaignId: volunteerCampaign,
            name: "INVÁLIDA",
            capacity: 1,
          },
        }),
      ).rejects.toThrow();
      const camper = await candidate(),
        volunteer = await candidate("VOLUNTEER");
      const foreign = await db.camperTeam.findFirstOrThrow({
        where: { campaignId: secondCamperCampaign },
      });
      await expect(
        db.registration.update({
          where: { id: camper.id },
          data: { camperTeamId: foreign.id },
        }),
      ).rejects.toThrow();
      await expect(
        db.registration.update({
          where: { id: volunteer.id },
          data: { camperTeamId: blueTeam },
        }),
      ).rejects.toThrow();
      await expect(
        db.registration.update({
          where: { id: camper.id },
          data: { camperTeamId: blueTeam, teamId: legacyTeam },
        }),
      ).rejects.toThrow();
      const empty = (
        await request(app)
          .post(teamPath())
          .set(auth())
          .send({ name: "VAZIA", capacity: 0 })
          .expect(201)
      ).body;
      await request(app)
        .delete(teamPath(camperCampaign, empty.id))
        .set(auth())
        .expect(200);
      expect(
        await db.camperTeam.findUnique({ where: { id: empty.id } }),
      ).toBeNull();
      expect(
        await db.team.findUnique({ where: { id: legacyTeam } }),
      ).not.toBeNull();
    });
  },
);
