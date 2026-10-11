import { Router, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { account, organizationAccess } from "../../core/auth.js";
import { param } from "../../core/security.js";
import { OrganizationFunctionsService } from "./organization-functions.service.js";

export function organizationFunctionsRoutes(
  db: PrismaClient,
  auth: RequestHandler,
  limit: RequestHandler,
) {
  const router = Router();
  const service = new OrganizationFunctionsService(db);
  const access = organizationAccess(db, ["ORGANIZER"], true);
  const path = "/organizations/:organizationId/functions";
  router.get(path, auth, access, async (req, res) =>
    res.json(await service.list(param(req, "organizationId"))),
  );
  router.post(path, auth, access, limit, async (req, res) =>
    res
      .status(201)
      .json(
        await service.create(
          param(req, "organizationId"),
          account(req).id,
          req.body,
        ),
      ),
  );
  router.put(path + "/:functionId", auth, access, limit, async (req, res) =>
    res.json(
      await service.update(
        param(req, "organizationId"),
        param(req, "functionId"),
        account(req).id,
        req.body,
      ),
    ),
  );
  router.delete(path + "/:functionId", auth, access, limit, async (req, res) =>
    res.json(
      await service.deactivate(
        param(req, "organizationId"),
        param(req, "functionId"),
        account(req).id,
      ),
    ),
  );
  return router;
}
