import { Router, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { account, organizationAccess } from "../../core/auth.js";
import { param } from "../../core/security.js";
import { CampaignTeamsService } from "./campaign-teams.service.js";

export function campaignTeamsRoutes(
  db: PrismaClient,
  auth: RequestHandler,
  limit: RequestHandler,
  volunteersOnly: boolean,
) {
  const router = Router();
  const service = new CampaignTeamsService(db, volunteersOnly);
  const read = organizationAccess(db, ["ORGANIZER", "SECRETARY"]);
  const write = organizationAccess(db, ["ORGANIZER"]);
  const base = "/organizations/:organizationId/campaigns/:campaignId/teams";
  router.get(base, auth, read, async (req, res) =>
    res.json(
      await service.list(
        param(req, "organizationId"),
        param(req, "campaignId"),
      ),
    ),
  );
  router.post(base, auth, write, limit, async (req, res) =>
    res
      .status(201)
      .json(
        await service.create(
          param(req, "organizationId"),
          param(req, "campaignId"),
          account(req).id,
          req.body,
        ),
      ),
  );
  router.put(`${base}/:teamId`, auth, write, limit, async (req, res) =>
    res.json(
      await service.capacity(
        param(req, "organizationId"),
        param(req, "campaignId"),
        param(req, "teamId"),
        account(req).id,
        req.body,
      ),
    ),
  );
  router.delete(`${base}/:teamId`, auth, write, limit, async (req, res) =>
    res.json(
      await service.remove(
        param(req, "organizationId"),
        param(req, "campaignId"),
        param(req, "teamId"),
        account(req).id,
      ),
    ),
  );
  return router;
}
