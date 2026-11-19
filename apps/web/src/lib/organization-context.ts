import { useOutletContext } from "react-router-dom";
import type { Membership, Organization } from "./types";
export type OrgContext = {
  organizationId: string;
  membership: Membership;
  organization: Organization;
};
export function useOrganization() {
  return useOutletContext<OrgContext>();
}
