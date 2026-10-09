import { Router, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { account, organizationAccess } from "../../core/auth.js";
import { param } from "../../core/security.js";
import type { DecisionNoticesService } from "./decision-notices.service.js";

const credential = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export function decisionNoticesRoutes(
  service: DecisionNoticesService,
  db: PrismaClient,
  auth: RequestHandler,
  limit: RequestHandler,
) {
  const routes = Router(),
    organizer = organizationAccess(db, ["ORGANIZER"]);
  const base =
    "/organizations/:organizationId/registrations/:registrationId/decision-notice";
  routes.get(base, auth, organizer, async (req, res) =>
    res.json(
      await service.state(
        param(req, "organizationId"),
        param(req, "registrationId"),
      ),
    ),
  );
  routes.post(`${base}/email`, auth, organizer, limit, async (req, res) =>
    res.json(
      await service.sendEmail(
        param(req, "organizationId"),
        param(req, "registrationId"),
      ),
    ),
  );
  routes.post(
    `${base}/whatsapp-sent`,
    auth,
    organizer,
    limit,
    async (req, res) =>
      res.json(
        await service.whatsappSent(
          param(req, "organizationId"),
          param(req, "registrationId"),
          account(req).id,
        ),
      ),
  );
  routes.post(`${base}/renew`, auth, organizer, limit, async (req, res) =>
    res.json(
      await service.renew(
        param(req, "organizationId"),
        param(req, "registrationId"),
        account(req).id,
      ),
    ),
  );
  routes.post(
    "/public/decision-responses/:noticeId/view",
    limit,
    async (req, res) =>
      res.json(
        await service.view(
          param(req, "noticeId"),
          credential.parse(req.body).token,
        ),
      ),
  );
  routes.post("/public/decision-responses/:noticeId", limit, async (req, res) =>
    res.json(
      await service.confirm(
        param(req, "noticeId"),
        credential.parse(req.body).token,
      ),
    ),
  );
  return routes;
}
