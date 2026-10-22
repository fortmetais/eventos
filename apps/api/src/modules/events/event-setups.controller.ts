import type { Request, Response } from "express";
import { account } from "../../core/auth.js";
import { param } from "../../core/security.js";
import { AppError } from "../../core/errors.js";
import type { EventSetupsService } from "./event-setups.service.js";

function input(req: Request) {
  if (!req.is("multipart/form-data")) return req.body;
  try {
    return JSON.parse(req.body.data);
  } catch {
    throw new AppError(400, "Os dados do evento não puderam ser lidos.");
  }
}
function file(req: Request, name: string) {
  return (req.files as Record<string, Express.Multer.File[]> | undefined)?.[
    name
  ]?.[0];
}
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
          file(req, "artwork"),
          undefined,
          file(req, "mobileArtwork"),
        ),
      );
  };
  update = async (req: Request, res: Response) => {
    res.json(
      await this.service.save(
        param(req, "organizationId"),
        account(req).id,
        input(req),
        file(req, "artwork"),
        param(req, "eventId"),
        file(req, "mobileArtwork"),
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
        file(req, "artwork"),
        file(req, "mobileArtwork"),
      ),
    );
  };
}
