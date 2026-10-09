import type { Request, Response } from "express";
import { account } from "../../core/auth.js";
import { invitationToken, pageQuery, param } from "../../core/security.js";
import type { OrganizationsService } from "./organizations.service.js";
export class OrganizationsController {
  constructor(private service: OrganizationsService) {}
  list = async (req: Request, res: Response) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    res.json(await this.service.list(page, pageSize));
  };
  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.create(req.body));
  };
  updateOrganization = async (req: Request, res: Response) => {
    res.json(
      await this.service.updateOrganization(
        param(req, "organizationId"),
        req.body,
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
      ),
    );
  };
}
