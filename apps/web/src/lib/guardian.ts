import type { Signature } from "../components/SignaturePad";
export interface GuardianSummary {
  id: string;
  signedAt: string | null;
  expiresAt: string;
  emailStatus: string;
  expired?: boolean;
  active?: boolean;
  link?: string;
  whatsappLink?: string | null;
  email?: string | null;
}
export interface GuardianRecord {
  id: string;
  protocol: string;
  snapshot: {
    participantName: string;
    birthDate: string;
    participantPhone: string;
    participantCpf: string;
    participantCity: string;
    team: string;
    familyName: string;
    familyPhone: string;
    guardianName: string;
    guardianPhone: string;
    guardianRelationship: string;
    guardianEmail: string;
    event: {
      name: string;
      location: string;
      city: string;
      startsAt: string;
      endsAt: string;
      organization: string;
    };
  };
  termsText: string;
  signedAt: string | null;
  expiresAt: string;
  signedData: GuardianForm | null;
  signature: Signature | null;
  receiptHash: string | null;
  health: {
    hasMedication?: boolean;
    medication?: string;
    hasAllergies?: boolean;
    allergies?: string;
  };
}
export interface GuardianForm {
  name: string;
  cpf: string;
  relationship: string;
  phone: string;
  email: string;
  city: string;
  participantCity: string;
  participantCpf: string;
  familyName: string;
  familyPhone: string;
  hasMedication?: boolean;
  medication: string;
  hasAllergies?: boolean;
  allergies: string;
  participationAccepted: boolean;
  responsibilityAccepted: boolean;
  privacyAccepted: boolean;
  imageAuthorized: boolean;
}
