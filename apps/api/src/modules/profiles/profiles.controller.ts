import type { Request, Response } from "express";
import { account } from "../../core/auth.js";
import { draftToken, param } from "../../core/security.js";
import type { ProfilesService } from "./profiles.service.js";
export class ProfilesController {
  constructor(private service: ProfilesService) {}
  get = async (req: Request, res: Response) => {
    res.json(await this.service.get(account(req).id));
  };
  update = async (req: Request, res: Response) => {
    res.json(await this.service.update(account(req).id, req.body));
  };
  registrations = async (req: Request, res: Response) => {
    res.json(await this.service.registrations(account(req).id));
  };
  claim = async (req: Request, res: Response) => {
    res.json(
      await this.service.claim(
        param(req, "draftId"),
        draftToken(req),
        account(req),
      ),
    );
  };
}
