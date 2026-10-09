import type { Request, Response } from "express";
import { account } from "../../core/auth.js";
import { draftToken, param } from "../../core/security.js";
import type { MediaService } from "./media.service.js";
export class MediaController {
  constructor(private service: MediaService) {}
  uploadDraft = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await this.service.uploadDraft(
          param(req, "draftId"),
          draftToken(req),
          req.file,
          req.body.crop,
        ),
      );
  };
  draftPhoto = async (req: Request, res: Response) => {
    res.json(
      await this.service.draftPhoto(
        param(req, "draftId"),
        draftToken(req),
        param(req, "assetId"),
      ),
    );
  };
  uploadProfile = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await this.service.uploadProfile(
          account(req).id,
          req.file,
          req.body.crop,
        ),
      );
  };
  registrationPhoto = async (req: Request, res: Response) => {
    res.json(
      await this.service.registrationPhoto(param(req, "registrationId"), {
        organizationId: param(req, "organizationId"),
      }),
    );
  };
  ownRegistrationPhoto = async (req: Request, res: Response) => {
    res.json(
      await this.service.registrationPhoto(param(req, "registrationId"), {
        accountId: account(req).id,
      }),
    );
  };
  profilePhoto = async (req: Request, res: Response) => {
    res.json(
      await this.service.profilePhoto(account(req).id, param(req, "assetId")),
    );
  };
}
