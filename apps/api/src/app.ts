import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import type { PrismaClient } from "@prisma/client";
import { config } from "./config.js";
import { database } from "./core/database.js";
import { authentication, type IdentityResolver } from "./core/auth.js";
import { errorHandler } from "./core/errors.js";
import {
  privateStorage,
  resolveSupabaseIdentity,
  type PrivateStorage,
} from "./core/supabase.js";
import { mailer, type InvitationMailer } from "./core/mail.js";
import { OrganizationsRepository } from "./modules/organizations/organizations.repository.js";
import { OrganizationsService } from "./modules/organizations/organizations.service.js";
import { OrganizationsController } from "./modules/organizations/organizations.controller.js";
import { organizationsRoutes } from "./modules/organizations/organizations.routes.js";
import { organizationFunctionsRoutes } from "./modules/organizations/organization-functions.routes.js";
import { EventsRepository } from "./modules/events/events.repository.js";
import { EventsService } from "./modules/events/events.service.js";
import { EventsController } from "./modules/events/events.controller.js";
import { eventsRoutes } from "./modules/events/events.routes.js";
import { RegistrationsRepository } from "./modules/registrations/registrations.repository.js";
import { RegistrationsService } from "./modules/registrations/registrations.service.js";
import { RegistrationsController } from "./modules/registrations/registrations.controller.js";
import { registrationsRoutes } from "./modules/registrations/registrations.routes.js";
import { MediaRepository } from "./modules/media/media.repository.js";
import { MediaService } from "./modules/media/media.service.js";
import { MediaController } from "./modules/media/media.controller.js";
import { mediaRoutes } from "./modules/media/media.routes.js";
import { ProfilesRepository } from "./modules/profiles/profiles.repository.js";
import { ProfilesService } from "./modules/profiles/profiles.service.js";
import { ProfilesController } from "./modules/profiles/profiles.controller.js";
import { profilesRoutes } from "./modules/profiles/profiles.routes.js";
import { openapi } from "./openapi.js";
import { artworkStorage, type ArtworkStorage } from "./core/artwork-storage.js";
import { EventSetupsRepository } from "./modules/events/event-setups.repository.js";
import { EventSetupsService } from "./modules/events/event-setups.service.js";
import { EventSetupsController } from "./modules/events/event-setups.controller.js";
import { eventSetupsRoutes } from "./modules/events/event-setups.routes.js";
import { RegistrationStage } from "./core/registration-stage.js";
import { DepartmentsRepository } from "./modules/events/departments.repository.js";
import {
  decisionEmailSender,
  type DecisionEmailSender,
} from "./core/decision-mail.js";
import { DecisionNoticesService } from "./modules/registrations/decision-notices.service.js";
import { decisionNoticesRoutes } from "./modules/registrations/decision-notices.routes.js";
import { GuardianService } from "./modules/registrations/guardian.service.js";
import { guardianRoutes } from "./modules/registrations/guardian.routes.js";

export function createApp(
  dependencies: {
    db?: PrismaClient;
    resolveIdentity?: IdentityResolver;
    storage?: PrivateStorage;
    mail?: InvitationMailer;
    rateLimits?: boolean;
    eventsEnabled?: boolean;
    eventManagementEnabled?: boolean;
    artworkStorage?: ArtworkStorage;
    volunteerRegistrationsEnabled?: boolean;
    camperRegistrationsEnabled?: boolean;
    decisionEmail?: DecisionEmailSender;
    decisionLinkSecret?: string;
    decisionNotificationsEnabled?: boolean;
  } = {},
) {
  const db = dependencies.db ?? database;
  const eventsEnabled = dependencies.eventsEnabled ?? config.EVENTS_ENABLED;
  const eventManagementEnabled =
    dependencies.eventManagementEnabled ?? config.EVENT_MANAGEMENT_ENABLED;
  const setupsRepo = new EventSetupsRepository(db);
  const volunteerRegistrationsEnabled =
    dependencies.volunteerRegistrationsEnabled ??
    config.VOLUNTEER_REGISTRATIONS_ENABLED;
  const registrationStage = new RegistrationStage(db);
  const camperRegistrationsEnabled =
    dependencies.camperRegistrationsEnabled ??
    config.CAMPER_REGISTRATIONS_ENABLED;
  const volunteersOnly = !eventsEnabled && !camperRegistrationsEnabled;
  const notices = new DecisionNoticesService(
    db,
    dependencies.decisionEmail ?? decisionEmailSender,
    (dependencies.decisionNotificationsEnabled ?? config.NODE_ENV !== "test")
      ? (dependencies.decisionLinkSecret ?? config.REGISTRATION_LINK_SECRET)
      : undefined,
    config.WEB_URL,
  );
  const app = express();
  const guardians = new GuardianService(
    db,
    dependencies.decisionEmail ?? decisionEmailSender,
    dependencies.decisionLinkSecret ?? config.REGISTRATION_LINK_SECRET,
    config.WEB_URL,
  );
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);
  app.use(helmet());
  app.use(
    cors({
      origin: config.WEB_URL,
      allowedHeaders: ["Authorization", "Content-Type", "X-Draft-Token"],
    }),
  );
  app.use(express.json({ limit: "150kb" }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const auth = authentication(
    db,
    dependencies.resolveIdentity ?? resolveSupabaseIdentity,
  );
  const limit =
    dependencies.rateLimits === false
      ? (
          _req: express.Request,
          _res: express.Response,
          next: express.NextFunction,
        ) => next()
      : rateLimit({
          windowMs: 60000,
          limit: 120,
          standardHeaders: "draft-8",
          legacyHeaders: false,
          message: {
            error: {
              code: "RATE_LIMIT",
              message: "Aguarde um minuto e tente novamente.",
            },
          },
        });
  const anonymousLimit =
    dependencies.rateLimits === false
      ? limit
      : rateLimit({
          windowMs: 3600000,
          limit: 15,
          standardHeaders: "draft-8",
          legacyHeaders: false,
          message: {
            error: {
              code: "RATE_LIMIT",
              message:
                "Muitas inscrições iniciadas. Aguarde antes de tentar novamente.",
            },
          },
        });
  app.get("/api/v1/health", (_req, res) =>
    res.json({ status: "ok", service: "fac-api" }),
  );
  app.get("/api/v1/openapi", (_req, res) => res.json(openapi));
  app.use("/api/v1", organizationFunctionsRoutes(db, auth, limit));
  app.get("/api/v1/readiness", async (_req, res) => {
    try {
      await Promise.all([
        db.account.count(),
        db.organization.count(),
        db.membership.count(),
        db.invitation.count(),
        db.auditLog.count(),
        db.person.count(),
      ]);
      res.json({
        status: "ready",
        eventsEnabled,
        eventManagementEnabled,
        eventManagementReady: eventManagementEnabled
          ? await setupsRepo.ready()
          : false,
        volunteerRegistrationsReady: volunteerRegistrationsEnabled
          ? await registrationStage.ready()
          : false,
        camperRegistrationsReady: camperRegistrationsEnabled
          ? await registrationStage.ready()
          : false,
        decisionNoticesReady: await notices.ready(),
        guardianAuthorizationsReady: await guardians.ready(),
        departmentsReady: await new DepartmentsRepository(db).ready(),
        authConfigured: Boolean(
          config.SUPABASE_URL &&
          config.SUPABASE_ANON_KEY &&
          config.SUPABASE_SERVICE_ROLE_KEY,
        ),
      });
    } catch {
      res.status(503).json({ status: "database_unavailable" });
    }
  });
  app.get("/api/v1/config", async (_req, res) =>
    res.json({
      supabaseUrl: config.SUPABASE_URL ?? null,
      supabaseAnonKey: config.SUPABASE_ANON_KEY ?? null,
      timeZone: "America/Sao_Paulo",
      eventsEnabled,
      eventManagementEnabled,
      volunteerRegistrationsEnabled,
      camperRegistrationsEnabled,
      camperRegistrationsReady: camperRegistrationsEnabled
        ? await registrationStage.ready().catch(() => false)
        : false,
      volunteerRegistrationsReady: volunteerRegistrationsEnabled
        ? await registrationStage.ready().catch(() => false)
        : false,
    }),
  );
  app.use(
    "/api/v1",
    organizationsRoutes(
      new OrganizationsController(
        new OrganizationsService(
          new OrganizationsRepository(
            db,
            async () =>
              eventsEnabled ||
              (eventManagementEnabled && (await setupsRepo.ready())),
          ),
          dependencies.mail ?? mailer,
          dependencies.artworkStorage ?? artworkStorage,
        ),
      ),
      db,
      auth,
      limit,
    ),
  );
  if (eventManagementEnabled) {
    app.use(
      "/api/v1",
      eventSetupsRoutes(
        new EventSetupsController(
          new EventSetupsService(
            setupsRepo,
            dependencies.artworkStorage ?? artworkStorage,
          ),
        ),
        db,
        auth,
        limit,
      ),
    );
  }
  if (
    eventsEnabled ||
    volunteerRegistrationsEnabled ||
    camperRegistrationsEnabled
  ) {
    const registrations = express.Router();
    registrations.use((req, _res, next) => {
      const managed =
        /^\/public\/(events|campaigns|drafts)(\/|$)/.test(req.path) ||
        /^\/public\/decision-responses(\/|$)/.test(req.path) ||
        /^\/public\/guardian-authorizations(\/|$)/.test(req.path) ||
        /^\/organizations\/[^/]+\/(events|campaigns|registrations)(\/|$)/.test(
          req.path,
        ) ||
        /^\/me\/(photo|photos)(\/|$)/.test(req.path) ||
        /^\/me\/registrations\/[^/]+\/photo$/.test(req.path);
      next(managed ? undefined : "router");
    });
    if (!eventsEnabled)
      registrations.use(async (req, _res, next) => {
        if (!(await registrationStage.ready())) {
          if (req.path.startsWith("/public/")) {
            next("router");
            return;
          }
          await registrationStage.requireReady();
        }
        next();
      });
    registrations.use(decisionNoticesRoutes(notices, db, auth, limit));
    registrations.use(guardianRoutes(guardians, db, auth, limit));
    registrations.use(
      eventsRoutes(
        new EventsController(
          new EventsService(
            new EventsRepository(db, volunteersOnly),
            volunteersOnly,
            dependencies.artworkStorage ?? artworkStorage,
          ),
        ),
        db,
        auth,
        !eventsEnabled,
        limit,
        eventsEnabled || camperRegistrationsEnabled,
      ),
    );
    registrations.post(
      "/public/campaigns/:campaignId/drafts",
      anonymousLimit,
      (_req, _res, next) => next(),
    );
    registrations.use(
      registrationsRoutes(
        new RegistrationsController(
          new RegistrationsService(
            new RegistrationsRepository(db),
            volunteersOnly,
            notices,
            guardians,
          ),
        ),
        db,
        auth,
        limit,
        !eventsEnabled,
      ),
    );
    registrations.use(
      mediaRoutes(
        new MediaController(
          new MediaService(
            new MediaRepository(db),
            dependencies.storage ?? privateStorage,
          ),
        ),
        db,
        auth,
        limit,
      ),
    );
    app.use("/api/v1", registrations);
  }
  app.use(
    "/api/v1",
    profilesRoutes(
      new ProfilesController(
        new ProfilesService(
          new ProfilesRepository(db),
          async () =>
            eventsEnabled ||
            ((volunteerRegistrationsEnabled || camperRegistrationsEnabled) &&
              (await registrationStage.ready())),
        ),
      ),
      auth,
      limit,
    ),
  );
  app.use((_req, res) =>
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Recurso não encontrado." },
    }),
  );
  app.use(errorHandler);
  return app;
}
