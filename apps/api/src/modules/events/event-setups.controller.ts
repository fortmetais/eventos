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
          req.file,
        ),
      );
  };
  update = async (req: Request, res: Response) => {
    res.json(
      await this.service.save(
        param(req, "organizationId"),
        account(req).id,
        input(req),
        req.file,
        param(req, "eventId"),
      ),
    );
  };
}
