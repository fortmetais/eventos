import { Router, type RequestHandler } from "express";
import multer from "multer";
import type { PrismaClient } from "@prisma/client";
import { organizationAccess } from "../../core/auth.js";
import type { EventSetupsController } from "./event-setups.controller.js";

export function eventSetupsRoutes(
  c: EventSetupsController,
  db: PrismaClient,
  auth: RequestHandler,
  limit: RequestHandler,
) {
  const r = Router();
  const read = organizationAccess(db, ["ORGANIZER", "SECRETARY"]);
  const write = organizationAccess(db, ["ORGANIZER"]);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 1,
      fieldSize: 150_000,
    },
  }).single("artwork");
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
    "/organizations/:organizationId/event-setups/:eventId",
    auth,
    write,
    limit,
    upload,
    c.update,
  );
  return r;
}
