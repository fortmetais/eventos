import { Router, type RequestHandler } from "express";
import multer from "multer";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { account, organizationAccess } from "../../core/auth.js";
import { AppError, assert } from "../../core/errors.js";
import { draftToken, pageQuery, param } from "../../core/security.js";
import { suggestedMapping } from "./workbook.js";
import type { ParticipantImportsService } from "./participant-imports.service.js";
import { EventImportsService } from "./event-imports.service.js";
import { readImportFile } from "./event-import-domain.js";

export function participantImportsRoutes(
  service: ParticipantImportsService,
  db: PrismaClient,
  auth: RequestHandler,
  limit: RequestHandler,
  prefillLimit: RequestHandler,
) {
  const r = Router();
  const events = new EventImportsService(db);
  const organizer = organizationAccess(db, ["ORGANIZER"]);
  const base = "/organizations/:organizationId/participant-imports";
  r.patch(
    "/organizations/:organizationId/registrations/:registrationId/imported-data",
    auth,
    organizer,
    limit,
    async (req, res) =>
      res.json(
        await events.updateRegistration(
          param(req, "organizationId"),
          param(req, "registrationId"),
          account(req).id,
          req.body,
        ),
      ),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 5,
      fieldSize: 150000,
    },
  }).single("file");
  const excel: RequestHandler = (req, res, next) =>
    upload(req, res, (err) => {
      if (err)
        return next(
          new AppError(
            err.code === "LIMIT_FILE_SIZE" ? 413 : 400,
            err.code === "LIMIT_FILE_SIZE"
              ? "Escolha uma planilha com até 10 MB."
              : "Envie somente uma planilha CSV ou XLSX e os dados do destino.",
          ),
        );
      try {
        assert(
          req.file && /\.(xlsx|csv)$/i.test(req.file.originalname),
          400,
          "Escolha uma planilha CSV ou XLSX.",
        );
        next();
      } catch (error) {
        next(error);
      }
    });
  r.get(base, auth, organizer, async (req, res) => {
    const organizationId = param(req, "organizationId");
    res.json({
      ...(await service.metadata(organizationId)),
      ...(await events.metadata(organizationId)),
    });
  });
  r.post(`${base}/inspect`, auth, organizer, limit, excel, async (req, res) => {
    await service.requireReady();
    const sheets = await readImportFile(
      req.file!.buffer,
      req.file!.originalname,
    );
    res.json({
      sheets: sheets.map((s) => ({
        name: s.name,
        headers: s.headers,
        rowCount: s.rows.length,
        mapping: suggestedMapping(s.headers),
      })),
    });
  });
  r.post(`${base}/event`, auth, organizer, limit, excel, async (req, res) => {
    res.json(
      await events.create(
        param(req, "organizationId"),
        account(req).id,
        req.file!,
        {
          campaignId: req.body.campaignId,
          formVersionId: req.body.formVersionId,
          ...(req.body.sheet ? { sheet: req.body.sheet } : {}),
        },
      ),
    );
  });
  r.post(`${base}/preview`, auth, organizer, limit, excel, async (req, res) => {
    let mapping: unknown;
    try {
      mapping = JSON.parse(req.body.mapping);
    } catch {
      throw new AppError(400, "Confira o mapeamento das colunas.");
    }
    res.json(
      await service.preview(
        param(req, "organizationId"),
        account(req).id,
        req.file!,
        z.string().min(1).max(100).parse(req.body.sheet),
        mapping,
      ),
    );
  });
  r.get(`${base}/:importId`, auth, organizer, async (req, res) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    if (
      (await events.mode(
        param(req, "organizationId"),
        param(req, "importId"),
      )) === "EVENT"
    ) {
      res.json(
        await events.batch(
          param(req, "organizationId"),
          param(req, "importId"),
          page,
          pageSize,
          z.enum(["all", "duplicates"]).parse(req.query.view ?? "all"),
          req.query.rowId === undefined
            ? undefined
            : z.uuid().parse(req.query.rowId),
        ),
      );
      return;
    }
    res.json(
      await service.batch(
        param(req, "organizationId"),
        param(req, "importId"),
        page,
        pageSize,
      ),
    );
  });
  r.put(
    `${base}/:importId/settings`,
    auth,
    organizer,
    limit,
    async (req, res) =>
      res.json(
        await events.settings(
          param(req, "organizationId"),
          param(req, "importId"),
          account(req).id,
          req.body,
        ),
      ),
  );
  r.post(`${base}/:importId/cancel`, auth, organizer, limit, async (req, res) =>
    res.json(
      await events.cancel(
        param(req, "organizationId"),
        param(req, "importId"),
        account(req).id,
        req.body,
      ),
    ),
  );
  r.post(`${base}/:importId/review`, auth, organizer, limit, async (req, res) =>
    res.json(
      await events.review(
        param(req, "organizationId"),
        param(req, "importId"),
        account(req).id,
        req.body,
      ),
    ),
  );
  r.put(
    `${base}/:importId/rows/:rowId`,
    auth,
    organizer,
    limit,
    async (req, res) => {
      if (
        (await events.mode(
          param(req, "organizationId"),
          param(req, "importId"),
        )) === "EVENT"
      ) {
        res.json(
          await events.revise(
            param(req, "organizationId"),
            param(req, "importId"),
            param(req, "rowId"),
            account(req).id,
            req.body,
          ),
        );
        return;
      }
      res.json(
        await service.revise(
          param(req, "organizationId"),
          param(req, "importId"),
          param(req, "rowId"),
          account(req).id,
          req.body,
        ),
      );
    },
  );
  r.post(
    `${base}/:importId/confirm`,
    auth,
    organizer,
    limit,
    async (req, res) => {
      if (
        (await events.mode(
          param(req, "organizationId"),
          param(req, "importId"),
        )) === "EVENT"
      ) {
        res.json(
          await events.confirm(
            param(req, "organizationId"),
            param(req, "importId"),
            account(req).id,
            req.body,
          ),
        );
        return;
      }
      res.json(
        await service.confirm(
          param(req, "organizationId"),
          param(req, "importId"),
          account(req).id,
        ),
      );
    },
  );
  const profiles = "/organizations/:organizationId/previous-participants";
  r.get(profiles, auth, organizer, async (req, res) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    res.json(
      await service.profiles(
        param(req, "organizationId"),
        z
          .string()
          .max(150)
          .parse(req.query.search ?? ""),
        page,
        pageSize,
      ),
    );
  });
  r.get(`${profiles}/:profileId`, auth, organizer, async (req, res) =>
    res.json(
      await service.profile(
        param(req, "organizationId"),
        param(req, "profileId"),
      ),
    ),
  );
  r.post("/public/drafts/:draftId/prefill", prefillLimit, async (req, res) =>
    res.json(
      await service.prefill(param(req, "draftId"), draftToken(req), req.body),
    ),
  );
  return r;
}
