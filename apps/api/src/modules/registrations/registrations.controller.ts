import type { Request, Response } from "express";
import { z } from "zod";
import { account } from "../../core/auth.js";
import { draftToken, id, pageQuery, param } from "../../core/security.js";
import type { RegistrationsService } from "./registrations.service.js";
const filters = z.object({
  eventId: id.optional(),
  campaignId: id.optional(),
  status: z
    .enum([
      "RECEIVED",
      "REVIEW",
      "APPROVED",
      "CONFIRMED",
      "WAITLIST",
      "REJECTED",
      "CANCELLED",
    ])
    .optional(),
});
export class RegistrationsController {
  constructor(private service: RegistrationsService) {}
  create = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(await this.service.createDraft(param(req, "campaignId")));
  };
  draft = async (req: Request, res: Response) => {
    res.json(
      await this.service.getDraft(param(req, "draftId"), draftToken(req)),
    );
  };
  save = async (req: Request, res: Response) => {
    res.json(
      await this.service.saveDraft(
        param(req, "draftId"),
        draftToken(req),
        req.body,
      ),
    );
  };
  submit = async (req: Request, res: Response) => {
    res.json(await this.service.submit(param(req, "draftId"), draftToken(req)));
  };
  list = async (req: Request, res: Response) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    res.json(
      await this.service.list(
        param(req, "organizationId"),
        filters.parse(req.query),
        page,
        pageSize,
      ),
    );
  };
  detail = async (req: Request, res: Response) => {
    res.json(
      await this.service.detail(
        param(req, "organizationId"),
        param(req, "registrationId"),
      ),
    );
  };
  status = async (req: Request, res: Response) => {
    res.json(
      await this.service.transition(
        param(req, "organizationId"),
        param(req, "registrationId"),
        account(req).id,
        req.body,
      ),
    );
  };
  team = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await this.service.createTeam(
          param(req, "organizationId"),
          param(req, "eventId"),
          req.body,
          account(req).id,
        ),
      );
  };
  departmentCapacity = async (req: Request, res: Response) => {
    res.json(
      await this.service.departmentCapacity(
        param(req, "organizationId"),
        param(req, "eventId"),
        param(req, "teamId"),
        account(req).id,
        req.body,
      ),
    );
  };
  assign = async (req: Request, res: Response) => {
    res.json(
      await this.service.assign(
        param(req, "organizationId"),
        param(req, "registrationId"),
        req.body,
        account(req).id,
      ),
    );
  };
  health = async (req: Request, res: Response) => {
    res.json(
      await this.service.health(
        param(req, "organizationId"),
        param(req, "registrationId"),
        req.membership!,
        account(req).id,
      ),
    );
  };
  healthList = async (req: Request, res: Response) => {
    res.json(
      await this.service.healthList(
        param(req, "organizationId"),
        param(req, "eventId"),
        req.membership!,
      ),
    );
  };
  manualLink = async (req: Request, res: Response) => {
    res.json(
      await this.service.manualLink(
        param(req, "organizationId"),
        param(req, "registrationId"),
        account(req).id,
        req.body,
      ),
    );
  };
}
