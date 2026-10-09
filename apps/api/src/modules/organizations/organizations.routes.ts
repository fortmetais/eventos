import { Router, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { organizationAccess, platformAdmin } from "../../core/auth.js";
import type { OrganizationsController } from "./organizations.controller.js";
export function organizationsRoutes(
  controller: OrganizationsController,
  db: PrismaClient,
  auth: RequestHandler,
) {
  const router = Router();
  router.get("/me/access", auth, controller.mine);
  router.get("/admin/organizations", auth, platformAdmin, controller.list);
  router.post("/admin/organizations", auth, platformAdmin, controller.create);
  router.put(
    "/admin/organizations/:organizationId",
    auth,
    platformAdmin,
    controller.updateOrganization,
  );
  const members = organizationAccess(db, ["ORGANIZER"], true);
  router.get(
    "/organizations/:organizationId/members",
    auth,
    members,
    controller.members,
  );
  router.post(
    "/organizations/:organizationId/invitations",
    auth,
    members,
    controller.invite,
  );
  router.delete(
    "/organizations/:organizationId/invitations/:invitationId",
    auth,
    members,
    controller.revoke,
  );
  router.patch(
    "/organizations/:organizationId/members/:memberId",
    auth,
    members,
    controller.updateMember,
  );
  router.post("/invitations/:token/accept", auth, controller.accept);
  return router;
}
