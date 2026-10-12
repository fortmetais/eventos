import { Router, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { organizationAccess, platformAdmin } from "../../core/auth.js";
import type { OrganizationsController } from "./organizations.controller.js";
import multer from "multer";
import { AppError } from "../../core/errors.js";
export function organizationsRoutes(
  controller: OrganizationsController,
  db: PrismaClient,
  auth: RequestHandler,
  limit: RequestHandler,
) {
  const router = Router();
  router.get("/public/parishes", limit, controller.publicParishes);
  const uploadLogo = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 1,
      fieldSize: 150_000,
    },
  }).single("logo");
  const upload: RequestHandler = (req, res, next) =>
    uploadLogo(req, res, (error) => {
      if (error && error.code !== "LIMIT_FILE_SIZE")
        return next(
          new AppError(
            400,
            "Envie os dados da organização e somente um logotipo.",
          ),
        );
      next(error);
    });
  router.get("/me/access", auth, controller.mine);
  router.get("/admin/organizations", auth, platformAdmin, controller.list);
  router.post(
    "/admin/organizations",
    auth,
    platformAdmin,
    limit,
    upload,
    controller.create,
  );
  router.put(
    "/admin/organizations/:organizationId",
    auth,
    platformAdmin,
    limit,
    upload,
    controller.updateOrganization,
  );
  const members = organizationAccess(db, ["ORGANIZER"], true);
  router.put(
    "/organizations/:organizationId",
    auth,
    members,
    limit,
    upload,
    controller.updateManagedOrganization,
  );
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
