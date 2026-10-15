import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";
import { volunteerTemplate } from "../src/modules/events/volunteer-template.js";
import { camperTemplate } from "../src/modules/events/camper-template.js";
import { defaultLayout } from "@fac/form-layout";
import type { FormConfig } from "../src/modules/events/events.validation.js";
const url = process.env.TEST_IMPORT_DATABASE_URL;
(url ? describe : describe.skip)(
  "Importação e sugestões com PostgreSQL isolado",
  () => {
    if (url && new URL(url).pathname !== "/fac_import_tests")
      throw new Error("Use a base isolada fac_import_tests.");
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://test@127.0.0.1:1/fac_import_tests",
    });
    const users = Object.fromEntries(
      ["organizer", "secretary", "health", "other"].map((k) => [
        k,
        { id: randomUUID(), email: `${k}@imports.test` },
      ]),
    );
    const app = createApp({
      db,
      eventsEnabled: false,
      registrationPrefillEnabled: true,
      rateLimits: false,
      resolveIdentity: async (token) => users[token] ?? null,
    });
    const disabled = createApp({
      db,
      registrationPrefillEnabled: false,
      rateLimits: false,
    });
    const headers = {
      name: 0,
      birthDate: 1,
      phone: 2,
      city: 3,
      sex: 4,
      shirt: 5,
    };
    const values = {
      name: "José da Silva",
      birthDate: "1990-02-03",
      phone: "44999999999",
      city: "Loanda",
      sex: "Masculino",
      shirt: "G",
    };
    let org: string,
      other: string,
      base: string,
      batchId: string,
      rowId: string,
      profileId: string;
    const campaigns: Record<string, string> = {};
    const auth = (user = "organizer") => ({ Authorization: `Bearer ${user}` });
    async function workbook(
      name = "José da Silva",
      phone = "44999999999",
      city = "Loanda",
      duplicates = false,
    ) {
      const book = new ExcelJS.Workbook(),
        sheet = book.addWorksheet("Respostas");
      sheet.addRow([
        "Nome",
        "Nascimento",
        "Celular",
        "Cidade",
        "Sexo",
        "Camiseta",
        "Sacramentos",
        "Foto",
      ]);
      sheet.addRow([
        name,
        new Date("1990-02-03"),
        phone,
        city,
        "Masculino",
        "Tamanho (g)",
        "Resposta religiosa privada",
        "https://drive.test/foto",
      ]);
      if (duplicates) {
        sheet.addRow([
          name,
          "03/02/1990",
          phone,
          city,
          "Masculino",
          "G",
          "Outra resposta",
        ]);
        sheet.addRow([
          "Ana Teste",
          "2000-02-29",
          "123",
          city,
          "Feminino",
          "G1",
        ]);
      }
      return Buffer.from(await book.xlsx.writeBuffer());
    }
    function preview(buffer: Buffer, target = base, user = "organizer") {
      return request(app)
        .post(target + "/preview")
        .set(auth(user))
        .field("sheet", "Respostas")
        .field("mapping", JSON.stringify(headers))
        .attach("file", buffer, "antigos.xlsx");
    }
    async function draft(kind = "VOLUNTEER") {
      const response = await request(app)
        .post(`/api/v1/public/campaigns/${campaigns[kind]}/drafts`)
        .expect(201);
      return response.body as { id: string; token: string };
    }
    const prefill = (
      appToUse: typeof app,
      d: { id: string; token: string },
      identity: unknown = values,
    ) =>
      request(appToUse)
        .post(`/api/v1/public/drafts/${d.id}/prefill`)
        .set("X-Draft-Token", d.token)
        .send(identity);
    const identity = {
      name: values.name,
      birthDate: values.birthDate,
      phone: values.phone,
    };
    beforeAll(async () => {
      await db.account.createMany({ data: Object.values(users) });
      org = (
        await db.organization.create({
          data: {
            name: "Organização Importação",
            city: "Loanda",
            state: "PR",
            contact: "Teste",
          },
        })
      ).id;
      other = (
        await db.organization.create({
          data: {
            name: "Outra Organização",
            city: "Loanda",
            state: "PR",
            contact: "Teste",
          },
        })
      ).id;
      base = `/api/v1/organizations/${org}/participant-imports`;
      for (const [user, organizationId, role] of [
        ["organizer", org, "ORGANIZER"],
        ["secretary", org, "SECRETARY"],
        ["health", org, "HEALTH"],
        ["other", other, "ORGANIZER"],
      ] as const)
        await db.membership.create({
          data: { organizationId, accountId: users[user].id, role },
        });
      const type = await db.eventType.create({
        data: { organizationId: org, name: "FAC" },
      });
      const event = await db.event.create({
        data: {
          organizationId: org,
          typeId: type.id,
          name: "FAC Teste",
          description: "Teste",
          location: "Chácara",
          city: "Loanda",
          startsAt: new Date("2027-06-01"),
          endsAt: new Date("2027-06-03"),
          status: "PUBLISHED",
        },
      });
      for (const kind of ["VOLUNTEER", "CAMPER"] as const) {
        const campaign = await db.campaign.create({
          data: {
            eventId: event.id,
            kind,
            opensAt: new Date("2020-01-01"),
            closesAt: new Date("2090-01-01"),
          },
        });
        campaigns[kind] = campaign.id;
        const config =
          kind === "VOLUNTEER"
            ? volunteerTemplate("FAC")
            : camperTemplate("FAC");
        config.layout = defaultLayout(config, kind);
        await db.formVersion.create({
          data: {
            campaignId: campaign.id,
            version: 1,
            config: JSON.parse(JSON.stringify(config)),
            publishedAt: new Date(),
          },
        });
      }
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    it("restringe importação e respostas completas ao organizador da organização", async () => {
      await request(app).get(base).expect(401);
      for (const user of ["secretary", "health", "other"])
        await request(app).get(base).set(auth(user)).expect(403);
      await request(app).get(base).set(auth()).expect(200);
    });
    it("seleciona abas, preserva os originais e bloqueia duplicidades e números inválidos", async () => {
      const buffer = await workbook(undefined, undefined, undefined, true);
      const inspect = await request(app)
        .post(base + "/inspect")
        .set(auth())
        .attach("file", buffer, "antigos.xlsx")
        .expect(200);
      expect(inspect.body.sheets[0]).toMatchObject({
        name: "Respostas",
        rowCount: 3,
      });
      const result = await preview(buffer).expect(200);
      batchId = result.body.id;
      rowId = result.body.rows[0].id;
      expect(result.body.summary).toMatchObject({ total: 3, pending: 3 });
      expect(result.body.rows[0].original.cells).toContain(
        "Resposta religiosa privada",
      );
      await request(app)
        .post(`${base}/${batchId}/confirm`)
        .set(auth())
        .expect(422);
      for (const row of result.body.rows)
        await request(app)
          .put(`${base}/${batchId}/rows/${row.id}`)
          .set(auth())
          .send({
            values:
              row.rowNumber === 4
                ? { ...row.values, phone: "44888888888" }
                : row.values,
            decision: row.rowNumber === 3 ? "DISCARD" : "KEEP",
            replaceId: null,
          })
          .expect(200);
      const revised = await request(app)
        .get(`${base}/${batchId}`)
        .set(auth())
        .expect(200);
      expect(revised.body.summary).toMatchObject({
        pending: 0,
        discarded: 1,
        selected: 2,
      });
    });
    it("confirma em transação, conserva UUIDs e não cria inscrições ou aceites", async () => {
      const before = await db.registration.count();
      const results = await Promise.all(
        [1, 2].map(() =>
          request(app).post(`${base}/${batchId}/confirm`).set(auth()),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const confirmed = await request(app)
        .get(`${base}/${batchId}`)
        .set(auth())
        .expect(200);
      expect(confirmed.body.summary).toMatchObject({
        pending: 0,
        selected: 2,
        discarded: 1,
      });
      expect(
        await db.previousParticipant.count({ where: { organizationId: org } }),
      ).toBe(2);
      expect(await db.registration.count()).toBe(before);
      profileId = (
        await db.previousParticipant.findFirstOrThrow({
          where: { organizationId: org, normalizedName: "jose da silva" },
        })
      ).id;
      await request(app)
        .put(`${base}/${batchId}/rows/${rowId}`)
        .set(auth())
        .send({ values, decision: "KEEP" })
        .expect(409);
      const sameFile = await preview(
        await workbook(undefined, undefined, undefined, true),
      ).expect(200);
      // XLSX archives can have a changing creation timestamp: re-import exact bytes is checked below.
      if (sameFile.body.id !== batchId)
        expect(sameFile.body.summary.pending).toBeGreaterThan(0);
    });
    it("não duplica o mesmo arquivo e exige escolha explícita para atualizar um cadastro existente", async () => {
      const bytes = await workbook(
        "José da Silva",
        "44999999999",
        "Cidade Nova",
      );
      const first = await preview(bytes).expect(200);
      const second = await preview(bytes).expect(200);
      expect(second.body.id).toBe(first.body.id);
      expect(first.body.rows[0].pending).toBe(true);
      const b = first.body.id,
        row = first.body.rows[0];
      await request(app)
        .put(`${base}/${b}/rows/${row.id}`)
        .set(auth())
        .send({ values: row.values, decision: "REPLACE", replaceId: profileId })
        .expect(200);
      await request(app).post(`${base}/${b}/confirm`).set(auth()).expect(200);
      expect(
        (
          await db.previousParticipant.findUniqueOrThrow({
            where: { id: profileId },
          })
        ).city,
      ).toBe("Cidade Nova");
      expect(
        (
          await db.previousParticipant.findUniqueOrThrow({
            where: { id: profileId },
          })
        ).birthDate
          .toISOString()
          .slice(0, 10),
      ).toBe(values.birthDate);
      expect(
        await db.previousParticipant.count({ where: { organizationId: org } }),
      ).toBe(2);
    });
    it("não permite consultar lotes ou selecionar cadastros de outra organização", async () => {
      const otherBase = `/api/v1/organizations/${other}/participant-imports`;
      await request(app)
        .get(`${otherBase}/${batchId}`)
        .set(auth("other"))
        .expect(404);
      const result = await preview(
        await workbook("José da Silva", "44999999999", "Outra"),
        otherBase,
        "other",
      ).expect(200);
      const row = result.body.rows[0];
      await request(app)
        .put(`${otherBase}/${result.body.id}/rows/${row.id}`)
        .set(auth("other"))
        .send({ values: row.values, decision: "REPLACE", replaceId: profileId })
        .expect(422);
      await request(app)
        .get(
          `/api/v1/organizations/${other}/previous-participants/${profileId}`,
        )
        .set(auth("other"))
        .expect(404);
      const detail = await request(app)
        .get(`/api/v1/organizations/${org}/previous-participants/${profileId}`)
        .set(auth())
        .expect(200);
      expect(detail.body.sourceRows.length).toBe(2);
    });
    it("retorna somente os campos básicos e exige nascimento e celular coincidentes", async () => {
      const d = await draft();
      const result = await prefill(app, d, {
        ...identity,
        name: "  JOSE  DA SILVA ",
        phone: "+55 (44) 99999-9999",
      }).expect(200);
      expect(result.body).toEqual({
        payload: {
          shirt: "G",
          answers: { cidade: "Cidade Nova", sexo: "Masculino" },
        },
      });
      for (const body of [
        { ...identity, name: "José Silva" },
        { ...identity, phone: "44888888888" },
        { ...identity, birthDate: "1990-02-04" },
      ])
        expect((await prefill(app, d, body).expect(200)).body).toEqual({
          payload: {},
        });
      await prefill(app, { ...d, token: "x".repeat(43) }, identity).expect(401);
      await request(app)
        .post(`/api/v1/public/drafts/${d.id}/prefill`)
        .send(identity)
        .expect(401);
      expect((await prefill(disabled, d, identity).expect(200)).body).toEqual({
        payload: {},
      });
      expect(
        (await prefill(app, await draft("CAMPER"), identity).expect(200)).body,
      ).toEqual({
        payload: { shirt: "G", answers: { cidade: "Cidade Nova" } },
      });
    });
    it("usa a versão do rascunho, omite campos ocultos e recusa credenciais expiradas", async () => {
      const d = await draft();
      const current = await db.draft.findUniqueOrThrow({
        where: { id: d.id },
        include: { form: true },
      });
      const form = current.form.config as unknown as FormConfig;
      for (const section of form.layout!.steps)
        for (const field of section.fields)
          if (["base:shirt", "question:sexo"].includes(field.key))
            field.hidden = true;
      await db.formVersion.create({
        data: {
          campaignId: campaigns.VOLUNTEER,
          version: 2,
          config: JSON.parse(JSON.stringify(form)),
          publishedAt: new Date(),
        },
      });
      expect(
        (await prefill(app, await draft(), identity).expect(200)).body,
      ).toEqual({ payload: { answers: { cidade: "Cidade Nova" } } });
      expect((await prefill(app, d, identity).expect(200)).body).toEqual({
        payload: {
          shirt: "G",
          answers: { cidade: "Cidade Nova", sexo: "Masculino" },
        },
      });
      await db.campaign.update({
        where: { id: campaigns.VOLUNTEER },
        data: { paused: true },
      });
      await prefill(app, d, identity).expect(409);
      await db.campaign.update({
        where: { id: campaigns.VOLUNTEER },
        data: { paused: false },
      });
      await db.draft.update({
        where: { id: d.id },
        data: { expiresAt: new Date("2020-01-01") },
      });
      await prefill(app, d, identity).expect(401);
    });
  },
);
