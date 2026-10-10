import { describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";

describe("configuração do login", () => {
  it("mantém o acesso disponível quando a consulta de disponibilidade do banco falha", async () => {
    const db = {
      $queryRaw: () => Promise.reject(new Error("database unavailable")),
    } as unknown as PrismaClient;
    const app = createApp({ db, rateLimits: false, volunteerRegistrationsEnabled: true });
    const response = await request(app).get("/api/v1/config").expect(200);
    expect(response.body.volunteerRegistrationsEnabled).toBe(true);
    expect(response.body.volunteerRegistrationsReady).toBe(false);
    expect(Object.keys(response.body).sort()).toEqual([
      "supabaseUrl", "supabaseAnonKey", "timeZone", "eventsEnabled",
      "eventManagementEnabled", "volunteerRegistrationsEnabled", "volunteerRegistrationsReady",
    ].sort());
  });
});
