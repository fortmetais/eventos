import type { Request, Response } from "express";
import { account } from "../../core/auth.js";
import { invitationToken, pageQuery, param } from "../../core/security.js";
import type { OrganizationsService } from "./organizations.service.js";
import { AppError } from "../../core/errors.js";
function input(req: Request) {
  if (!req.is("multipart/form-data")) return req.body;
  try {
    return JSON.parse(req.body.data);
  } catch {
    throw new AppError(400, "Os dados da organização não puderam ser lidos.");
  }
}
export class OrganizationsController {
  constructor(private service: OrganizationsService) {}
  publicParishes = async (_req: Request, res: Response) => {
    res.json(await this.service.publicParishes());
  };
  list = async (req: Request, res: Response) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    res.json(await this.service.list(page, pageSize));
  };
  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.create(input(req), req.file));
  };
  updateOrganization = async (req: Request, res: Response) => {
    res.json(
      await this.service.updateOrganization(
        param(req, "organizationId"),
        account(req),
        input(req),
        req.file,
        true,
      ),
    );
  };
  updateManagedOrganization = async (req: Request, res: Response) => {
    res.json(
      await this.service.updateOrganization(
        param(req, "organizationId"),
        account(req),
        input(req),
        req.file,
      ),
    );
  };
  mine = async (req: Request, res: Response) => {
    res.json({
      account: account(req),
      organizations: await this.service.mine(account(req).id),
    });
  };
  members = async (req: Request, res: Response) => {
    res.json(await this.service.members(param(req, "organizationId")));
  };
  invite = async (req: Request, res: Response) => {
    res
      .status(201)
      .json(
        await this.service.invite(
          param(req, "organizationId"),
          account(req).id,
          req.body,
        ),
      );
  };
  accept = async (req: Request, res: Response) => {
    res.json(await this.service.accept(invitationToken(req), account(req)));
  };
  updateMember = async (req: Request, res: Response) => {
    res.json(
      await this.service.updateMember(
        param(req, "organizationId"),
        param(req, "memberId"),
        account(req).id,
        req.body,
      ),
    );
  };
  revoke = async (req: Request, res: Response) => {
    res.json(
      await this.service.revoke(
        param(req, "organizationId"),
        param(req, "invitationId"),
        account(req).id,
      ),
    );
  };
}
