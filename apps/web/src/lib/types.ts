export type Role = "ORGANIZER" | "SECRETARY" | "HEALTH";
export type RegistrationStatus =
  | "RECEIVED"
  | "REVIEW"
  | "APPROVED"
  | "CONFIRMED"
  | "WAITLIST"
  | "REJECTED"
  | "CANCELLED";
export interface Organization {
  id: string;
  name: string;
  kind: string;
  city: string;
  state: string;
  contact?: string;
  logoUrl?: string | null;
  active: boolean;
  _count?: { events: number; memberships: number };
}
export interface Membership {
  id: string;
  organizationId: string;
  accountId: string;
  role: Role;
  active: boolean;
  healthEventIds: string[];
  organization?: Organization;
  account?: { id: string; email: string };
}
export interface Account {
  id: string;
  email: string;
  platformAdmin: boolean;
  profile: Profile;
}
export interface Access {
  account: Account;
  organizations: (Membership & { organization: Organization })[];
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Question {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "single" | "multiple";
  required: boolean;
  options: string[];
  hint?: string;
  maxSelections?: number;
  exclusiveOption?: string;
  mustBeTrue?: boolean;
}
export interface FormConfig {
  askCpf: boolean;
  askAddress: boolean;
  askShirt: boolean;
  questions: Question[];
  terms: string;
  volunteer?: {
    template: "VOLUNTEER_INTENTION_V1";
    requirements: string;
    training: string;
  };
}
export interface FormVersion {
  id: string;
  version: number;
  config: FormConfig;
  publishedAt: string | null;
}
export interface Campaign {
  id: string;
  kind: "CAMPER" | "VOLUNTEER";
  opensAt: string;
  closesAt: string;
  paused: boolean;
  capacity: number | null;
  allowWaitlist: boolean;
  open?: boolean;
  forms?: FormVersion[];
  _count?: { registrations: number };
}
export interface Team {
  id: string;
  name: string;
  eventId: string;
  capacity?: number | null;
  occupied?: number;
  available?: number | null;
}
export interface EventEdition {
  departmentsReady?: boolean;
  id: string;
  organizationId: string;
  name: string;
  description: string;
  imageUrl?: string | null;
  location: string;
  city: string;
  startsAt: string;
  endsAt: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED";
  organization?: Organization;
  type: { name: string };
  campaigns: Campaign[];
  teams: Team[];
}
export interface PublicCampaign extends Campaign {
  event: EventEdition & { organization: Organization };
  form: FormVersion;
  open: boolean;
}
export type Answer = string | number | boolean | string[];
export interface Payload {
  name?: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  cpf?: string;
  address?: string;
  shirt?: string;
  photoAssetId?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelationship?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianRelationship?: string;
  guardianAuthorization?: boolean;
  availability?: string;
  preferredTeamId?: string;
  termsAccepted?: boolean;
  imageAuthorized?: boolean;
  answers?: Record<string, Answer>;
}
export interface Health {
  hasAllergies?: boolean;
  allergies?: string;
  hasMedication?: boolean;
  medication?: string;
  hasDiet?: boolean;
  diet?: string;
  hasCondition?: boolean;
  condition?: string;
  hasNeeds?: boolean;
  needs?: string;
}
export interface DraftCredential {
  id: string;
  token: string;
  expiresAt: string;
}
export interface Draft {
  id: string;
  campaignId: string;
  payload?: Payload;
  health?: Health;
  form: FormVersion;
  submitted: boolean;
  registration?: {
    id: string;
    protocol: string;
    status: RegistrationStatus;
    accountId?: string | null;
  };
  email?: string;
}
export interface Registration {
  noticeWarning?: string;
  accountId?: string | null;
  form?: FormVersion;
  id: string;
  protocol: string;
  status: RegistrationStatus;
  snapshot: Payload;
  createdAt: string;
  person: { name: string; email: string | null; phone: string };
  team: Team | null;
  campaign: Campaign & { event: EventEdition };
  history: {
    id: string;
    fromStatus: RegistrationStatus;
    toStatus: RegistrationStatus;
    reason: string;
    createdAt: string;
  }[];
}
export interface OwnRegistration {
  id: string;
  protocol: string;
  status: RegistrationStatus;
  snapshot: Payload;
  createdAt: string;
  team: { name: string } | null;
  campaign: {
    kind: "CAMPER" | "VOLUNTEER";
    event: {
      id: string;
      name: string;
      startsAt: string;
      endsAt: string;
      organization: { name: string };
    };
  };
}
export interface Profile {
  name?: string;
  phone?: string;
  birthDate?: string;
  city?: string;
  photoAssetId?: string;
}
export const statusLabels: Record<RegistrationStatus, string> = {
  RECEIVED: "Recebida",
  REVIEW: "Em análise",
  APPROVED: "Aprovada",
  CONFIRMED: "Confirmada",
  WAITLIST: "Lista de espera",
  REJECTED: "Recusada",
  CANCELLED: "Cancelada",
};
export const roleLabels: Record<Role, string> = {
  ORGANIZER: "Organizador",
  SECRETARY: "Secretaria",
  HEALTH: "Saúde",
};
export function date(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(value),
  );
}
export function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
