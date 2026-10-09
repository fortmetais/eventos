import type { Request, Response } from "express";
import { account } from "../../core/auth.js";
import { pageQuery, param } from "../../core/security.js";
import { publicFilters } from "./events.validation.js";
import type { EventsService } from "./events.service.js";
export class EventsController {
  constructor(private service: EventsService) {}
  list = async (req: Request, res: Response) => {
    res.json(
      await this.service.administrative(
        param(req, "organizationId"),
        req.membership?.role === "HEALTH"
          ? req.membership.healthEventIds
          : undefined,
      ),
    );
  };
  create = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await this.service.create(
          param(req, "organizationId"),
          account(req).id,
          req.body,
        ),
      );
  };
  update = async (req: Request, res: Response) => {
    res.json(
      await this.service.update(
        param(req, "organizationId"),
        param(req, "eventId"),
        req.body,
      ),
    );
  };
  status = async (req: Request, res: Response) => {
    res.json(
      await this.service.status(
        param(req, "organizationId"),
        param(req, "eventId"),
        account(req).id,
        req.body,
      ),
    );
  };
  campaign = async (req: Request, res: Response) => {
    res.json(
      await this.service.saveCampaign(
        param(req, "organizationId"),
        param(req, "eventId"),
        req.body,
      ),
    );
  };
  form = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await this.service.form(
          param(req, "organizationId"),
          param(req, "campaignId"),
          req.body,
        ),
      );
  };
  publishForm = async (req: Request, res: Response) => {
    res.json(
      await this.service.publishForm(
        param(req, "organizationId"),
        param(req, "campaignId"),
        param(req, "formId"),
      ),
    );
  };
  publicList = async (req: Request, res: Response) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    res.json(
      await this.service.publicList(
        publicFilters.parse(req.query),
        page,
        pageSize,
      ),
    );
  };
  publicEvent = async (req: Request, res: Response) => {
    res.json(await this.service.publicEvent(param(req, "eventId")));
  };
  publicCampaign = async (req: Request, res: Response) => {
    res.json(await this.service.publicCampaign(param(req, "campaignId")));
  };
  volunteerForm = async (req: Request, res: Response) => {
    res.json(
      await this.service.volunteerForm(
        param(req, "organizationId"),
        param(req, "eventId"),
      ),
    );
  };
  publishVolunteerForm = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await this.service.publishVolunteerForm(
          param(req, "organizationId"),
          param(req, "eventId"),
          account(req).id,
          req.body,
        ),
      );
  };
}
