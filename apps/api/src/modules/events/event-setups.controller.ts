import type { Request, Response } from "express";
import { account } from "../../core/auth.js";
import { param } from "../../core/security.js";
import { parseMultipartBody } from "../../core/http-input.js";
import type { EventSetupsService } from "./event-setups.service.js";
import { eventArtworkFile } from "./event-artwork-upload.js";

const input = (req: Request) =>
  parseMultipartBody(req, "Os dados do evento não puderam ser lidos.");
export class EventSetupsController {
  constructor(private service: EventSetupsService) {}
  list = async (req: Request, res: Response) => {
    res.json(await this.service.list(param(req, "organizationId")));
  };
  create = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await this.service.save(
          param(req, "organizationId"),
          account(req).id,
          input(req),
          eventArtworkFile(req, "artwork"),
          undefined,
          eventArtworkFile(req, "mobileArtwork"),
        ),
      );
  };
  update = async (req: Request, res: Response) => {
    res.json(
      await this.service.save(
        param(req, "organizationId"),
        account(req).id,
        input(req),
        eventArtworkFile(req, "artwork"),
        param(req, "eventId"),
        eventArtworkFile(req, "mobileArtwork"),
      ),
    );
  };
  updateDetails = async (req: Request, res: Response) => {
    res.json(
      await this.service.updateDetails(
        param(req, "organizationId"),
        account(req).id,
        param(req, "eventId"),
        input(req),
        eventArtworkFile(req, "artwork"),
        eventArtworkFile(req, "mobileArtwork"),
      ),
    );
  };
}
