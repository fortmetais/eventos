import { Router, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { organizationAccess } from "../../core/auth.js";
import { param } from "../../core/security.js";
import type { GuardianService } from "./guardian.service.js";
const credential = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const viewBody = z.object({ token: credential }).strict();
const signBody = z.object({ token: credential, data: z.unknown() }).strict();
export function guardianRoutes(
  service: GuardianService,
  db: PrismaClient,
  auth: RequestHandler,
  limit: RequestHandler,
) {
  const r = Router();
  const access = organizationAccess(db, ["ORGANIZER", "SECRETARY"]);
  const base =
    "/organizations/:organizationId/registrations/:registrationId/guardian";
  r.get(base, auth, access, async (req, res) =>
    res.json(
      await service.state(
        param(req, "organizationId"),
        param(req, "registrationId"),
      ),
    ),
  );
  r.post(`${base}/email`, auth, access, limit, async (req, res) => {
    await service.state(
      param(req, "organizationId"),
      param(req, "registrationId"),
    );
    await service.requireReady();
    await service.deliver(param(req, "registrationId"));
    res.json(
      await service.state(
        param(req, "organizationId"),
        param(req, "registrationId"),
      ),
    );
  });
  r.post(`${base}/renew`, auth, access, limit, async (req, res) =>
    res.json(
      await service.renew(
        param(req, "organizationId"),
        param(req, "registrationId"),
      ),
    ),
  );
  r.post(
    "/public/guardian-authorizations/:authorizationId/view",
    limit,
    async (req, res) =>
      res.json(
        await service.view(
          param(req, "authorizationId"),
          viewBody.parse(req.body).token,
        ),
      ),
  );
  r.post(
    "/public/guardian-authorizations/:authorizationId/sign",
    limit,
    async (req, res) =>
      res.json(
        await service.sign(
          param(req, "authorizationId"),
          signBody.parse(req.body).token,
          signBody.parse(req.body).data,
          { ip: req.ip ?? "", userAgent: req.get("user-agent") ?? "" },
        ),
      ),
  );
  return r;
}
