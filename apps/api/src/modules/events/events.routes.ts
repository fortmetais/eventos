import { Router, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { organizationAccess } from "../../core/auth.js";
import type { EventsController } from "./events.controller.js";
import multer from "multer";
import { AppError } from "../../core/errors.js";
export function eventsRoutes(
  c: EventsController,
  db: PrismaClient,
  auth: RequestHandler,
  volunteersOnly = false,
  limit: RequestHandler = (_req, _res, next) => next(),
) {
  const r = Router();
  r.get("/public/events", c.publicList);
  r.get("/public/events/:eventId", c.publicEvent);
  r.get("/public/campaigns/:campaignId", c.publicCampaign);
  const read = organizationAccess(db, ["ORGANIZER", "SECRETARY", "HEALTH"]);
  const write = organizationAccess(db, ["ORGANIZER"]);
  const fileUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 1,
      fieldSize: 150_000,
    },
  }).single("banner");
  const upload: RequestHandler = (req, res, next) =>
    fileUpload(req, res, (error) => {
      if (error && error.code !== "LIMIT_FILE_SIZE")
        return next(
          new AppError(400, "Envie os dados da ficha e somente um banner."),
        );
      next(error);
    });
  r.get("/organizations/:organizationId/events", auth, read, c.list);
  r.get(
    "/organizations/:organizationId/events/:eventId/volunteer-form",
    auth,
    write,
    c.volunteerForm,
  );
  r.post(
    "/organizations/:organizationId/events/:eventId/volunteer-form",
    auth,
    write,
    limit,
    upload,
    c.publishVolunteerForm,
  );
  if (volunteersOnly) {
    r.put(
      "/organizations/:organizationId/events/:eventId/campaigns",
      auth,
      write,
      c.campaign,
    );
    return r;
  }
  r.post("/organizations/:organizationId/events", auth, write, c.create);
  r.put(
    "/organizations/:organizationId/events/:eventId",
    auth,
    write,
    c.update,
  );
  r.patch(
    "/organizations/:organizationId/events/:eventId/status",
    auth,
    write,
    c.status,
  );
  r.put(
    "/organizations/:organizationId/events/:eventId/campaigns",
    auth,
    write,
    c.campaign,
  );
  r.post(
    "/organizations/:organizationId/campaigns/:campaignId/forms",
    auth,
    write,
    limit,
    upload,
    c.form,
  );
  r.post(
    "/organizations/:organizationId/campaigns/:campaignId/forms/:formId/publish",
    auth,
    write,
    c.publishForm,
  );
  return r;
}
