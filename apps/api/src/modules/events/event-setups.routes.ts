import { Router, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { organizationAccess } from "../../core/auth.js";
import type { EventSetupsController } from "./event-setups.controller.js";
import { eventArtworkUpload } from "./event-artwork-upload.js";

export function eventSetupsRoutes(
  c: EventSetupsController,
  db: PrismaClient,
  auth: RequestHandler,
  limit: RequestHandler,
) {
  const r = Router();
  const read = organizationAccess(db, ["ORGANIZER", "SECRETARY"]);
  const write = organizationAccess(db, ["ORGANIZER"]);
  const upload = eventArtworkUpload();
  r.get("/organizations/:organizationId/event-setups", auth, read, c.list);
  r.post(
    "/organizations/:organizationId/event-setups",
    auth,
    write,
    limit,
    upload,
    c.create,
  );
  r.put(
    "/organizations/:organizationId/event-setups/:eventId/details",
    auth,
    write,
    limit,
    upload,
    c.updateDetails,
  );
  r.put(
    "/organizations/:organizationId/event-setups/:eventId",
    auth,
    write,
    limit,
    upload,
    c.update,
  );
  return r;
}
