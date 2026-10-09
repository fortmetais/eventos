import { Router, type RequestHandler } from "express";
import type { ProfilesController } from "./profiles.controller.js";
export function profilesRoutes(
  c: ProfilesController,
  auth: RequestHandler,
  limit: RequestHandler,
) {
  const r = Router();
  r.get("/me/profile", auth, c.get);
  r.put("/me/profile", auth, c.update);
  r.get("/me/registrations", auth, c.registrations);
  r.post("/me/drafts/:draftId/claim", auth, limit, c.claim);
  return r;
}
