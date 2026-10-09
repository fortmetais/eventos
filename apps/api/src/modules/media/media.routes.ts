import { Router, type RequestHandler } from "express";
import multer from "multer";
import type { PrismaClient } from "@prisma/client";
import { organizationAccess } from "../../core/auth.js";
import type { MediaController } from "./media.controller.js";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, fieldSize: 1000 },
});
export function mediaRoutes(
  c: MediaController,
  db: PrismaClient,
  auth: RequestHandler,
  limit: RequestHandler,
) {
  const r = Router();
  r.post(
    "/public/drafts/:draftId/photo",
    limit,
    upload.single("photo"),
    c.uploadDraft,
  );
  r.get("/public/drafts/:draftId/photos/:assetId", c.draftPhoto);
  r.post("/me/photo", auth, limit, upload.single("photo"), c.uploadProfile);
  r.get("/me/photos/:assetId", auth, c.profilePhoto);
  r.get(
    "/me/registrations/:registrationId/photo",
    auth,
    c.ownRegistrationPhoto,
  );
  r.get(
    "/organizations/:organizationId/registrations/:registrationId/photo",
    auth,
    organizationAccess(db, ["ORGANIZER", "SECRETARY"]),
    c.registrationPhoto,
  );
  return r;
}
