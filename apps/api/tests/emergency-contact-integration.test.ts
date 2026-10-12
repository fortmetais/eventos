import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { defaultLayout } from "@fac/form-layout";
import { createApp } from "../src/app.js";

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "Padronização do contato de emergência",
  () => {
    if (url && new URL(url).pathname !== "/fac_tests")
      throw new Error("Use fac_tests isolado.");
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_tests",
    });
    const app = createApp({ db, eventsEnabled: true, rateLimits: false });
    const config = {
      askCpf: false,
      askAddress: false,
      askShirt: false,
      questions: [],
      terms: "Termos gerais da inscrição para testes.",
    };
    let campaignId: string;
    const createDraft = () =>
      request(app)
        .post(`/api/v1/public/campaigns/${campaignId}/drafts`)
        .expect(201);
    beforeAll(async () => {
      const org = await db.organization.create({
        data: {
          name: `Paróquia ${randomUUID()}`,
          city: "Loanda",
          state: "PR",
          contact: "Contato de teste",
        },
      });
      const type = await db.eventType.create({
        data: { name: "FAC", organizationId: org.id },
      });
      const event = await db.event.create({
        data: {
          organizationId: org.id,
          typeId: type.id,
          name: "Evento do contato",
          description: "Teste da ficha",
          city: "Loanda",
          location: "Chácara",
          status: "PUBLISHED",
          startsAt: new Date("2027-06-01"),
          endsAt: new Date("2027-06-03"),
        },
      });
      const campaign = await db.campaign.create({
        data: {
          eventId: event.id,
          kind: "VOLUNTEER",
          opensAt: new Date(Date.now() - 3600000),
          closesAt: new Date(Date.now() + 3600000),
        },
      });
      campaignId = campaign.id;
      await db.formVersion.create({
        data: { campaignId, version: 1, config, publishedAt: new Date() },
      });
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    it("grava opções padronizadas e impede texto arbitrário em valores novos", async () => {
      const draft = (await createDraft()).body;
      const path = `/api/v1/public/drafts/${draft.id}`;
      const body = {
        payload: {
          emergencyPhone: "(44) 98888-8888",
          emergencyRelationship: "Irmão",
        },
        health: {},
      };
      await request(app)
        .put(path)
        .set("X-Draft-Token", draft.token)
        .send(body)
        .expect(200);
      expect(
        (await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).payload,
      ).toEqual(body.payload);
      await request(app)
        .put(path)
        .set("X-Draft-Token", draft.token)
        .send({
          ...body,
          payload: {
            ...body.payload,
            emergencyRelationship: "Texto sem padronização",
          },
        })
        .expect(422);
      expect(
        (await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).payload,
      ).toEqual(body.payload);
    });
    it("preserva texto legado já salvo e permite substituí-lo por uma opção padrão", async () => {
      const draft = (await createDraft()).body;
      const path = `/api/v1/public/drafts/${draft.id}`;
      await db.draft.update({
        where: { id: draft.id },
        data: { payload: { emergencyRelationship: "Colega da comunidade" } },
      });
      await request(app)
        .put(path)
        .set("X-Draft-Token", draft.token)
        .send({
          payload: { emergencyRelationship: "Colega da comunidade" },
          health: {},
        })
        .expect(200);
      await request(app)
        .put(path)
        .set("X-Draft-Token", draft.token)
        .send({
          payload: { emergencyRelationship: "Outro texto novo" },
          health: {},
        })
        .expect(422);
      await request(app)
        .put(path)
        .set("X-Draft-Token", draft.token)
        .send({ payload: { emergencyRelationship: "Outro" }, health: {} })
        .expect(200);
      expect(
        (await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).payload,
      ).toEqual({ emergencyRelationship: "Outro" });
    });
    it("descarta a relação quando o organizador oculta esse campo", async () => {
      const layout = defaultLayout(config, "VOLUNTEER");
      layout.steps
        .flatMap((step) => step.fields)
        .find((field) => field.key === "base:emergencyRelationship")!.hidden =
        true;
      await db.formVersion.create({
        data: {
          campaignId,
          version: 2,
          config: { ...config, layout },
          publishedAt: new Date(),
        },
      });
      const draft = (await createDraft()).body;
      await request(app)
        .put(`/api/v1/public/drafts/${draft.id}`)
        .set("X-Draft-Token", draft.token)
        .send({
          payload: { emergencyRelationship: "Campo oculto" },
          health: {},
        })
        .expect(200);
      expect(
        (await db.draft.findUniqueOrThrow({ where: { id: draft.id } })).payload,
      ).toEqual({});
    });
  },
);
