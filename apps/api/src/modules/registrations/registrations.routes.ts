import { Router, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { organizationAccess } from "../../core/auth.js";
import type { RegistrationsController } from "./registrations.controller.js";
export function registrationsRoutes(
  c: RegistrationsController,
  db: PrismaClient,
  auth: RequestHandler,
  limit: RequestHandler,
  volunteersOnly = false,
) {
  const r = Router();
  r.post("/public/campaigns/:campaignId/drafts", limit, c.create);
  r.get("/public/drafts/:draftId", c.draft);
  r.put("/public/drafts/:draftId", limit, c.save);
  r.post("/public/drafts/:draftId/submit", limit, c.submit);
  const read = organizationAccess(db, ["ORGANIZER", "SECRETARY"]);
  const write = organizationAccess(
    db,
    volunteersOnly ? ["ORGANIZER"] : ["ORGANIZER", "SECRETARY"],
  );
  const organizer = organizationAccess(db, ["ORGANIZER"]);
  r.get("/organizations/:organizationId/registrations", auth, read, c.list);
  r.get(
    "/organizations/:organizationId/registrations/:registrationId",
    auth,
    read,
    c.detail,
  );
  r.patch(
    "/organizations/:organizationId/registrations/:registrationId/status",
    auth,
    write,
    c.status,
  );
  r.post(
    "/organizations/:organizationId/events/:eventId/teams",
    auth,
    organizer,
    c.team,
  );
  r.put(
    "/organizations/:organizationId/events/:eventId/teams/:teamId",
    auth,
    organizer,
    c.departmentCapacity,
  );
  r.put(
    "/organizations/:organizationId/registrations/:registrationId/team",
    auth,
    organizer,
    c.assign,
  );
  r.post(
    "/organizations/:organizationId/registrations/:registrationId/link",
    auth,
    organizer,
    c.manualLink,
  );
  r.get(
    "/organizations/:organizationId/events/:eventId/health",
    auth,
    organizationAccess(db, ["HEALTH", "ORGANIZER", "SECRETARY"]),
    c.healthList,
  );
  r.get(
    "/organizations/:organizationId/registrations/:registrationId/health",
    auth,
    organizationAccess(db, ["HEALTH", "ORGANIZER", "SECRETARY"]),
    c.health,
  );
  return r;
}
