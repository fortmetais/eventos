import { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { account, platformAdmin } from "../../core/auth.js";
import { param } from "../../core/security.js";
import type { TemporaryAccessService } from "./temporary-access.service.js";

export function temporaryAccessRoutes(
  service: TemporaryAccessService,
  auth: RequestHandler,
  rateLimits = true,
) {
  const router = Router();
  const limit: RequestHandler = rateLimits
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        keyGenerator: (req) => account(req).id,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
          error: {
            code: "RATE_LIMIT",
            message:
              "Muitos acessos temporários solicitados. Aguarde antes de tentar novamente.",
          },
        },
      })
    : (_req, _res, next) => next();
  router.post(
    "/admin/organizations/:organizationId/invitations/:invitationId/temporary-access",
    auth,
    platformAdmin,
    limit,
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.json(
        await service.grant(
          param(req, "organizationId"),
          param(req, "invitationId"),
          account(req),
          req.body,
        ),
      );
    },
  );
  return router;
}
