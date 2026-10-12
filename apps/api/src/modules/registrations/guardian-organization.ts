import type { Organization } from "@prisma/client";
import { normalizeCnpj } from "../organizations/cnpj.js";

export type GuardianOrganization = Pick<
  Organization,
  "name" | "contact" | "city" | "state"
> &
  Partial<
    Pick<
      Organization,
      | "cnpj"
      | "legalName"
      | "tradeName"
      | "postalCode"
      | "street"
      | "number"
      | "complement"
      | "neighborhood"
    >
  >;

const text = (value: string | null | undefined) =>
  value?.trim().replace(/\s+/g, " ") ?? "";

function formatCnpj(value: string) {
  const normalized = normalizeCnpj(value);
  return /^[A-Z0-9]{12}\d{2}$/.test(normalized)
    ? `${normalized.slice(0, 2)}.${normalized.slice(2, 5)}.${normalized.slice(5, 8)}/${normalized.slice(8, 12)}-${normalized.slice(12)}`
    : value;
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 8
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : value;
}

export function guardianOrganizationInfo(source: GuardianOrganization) {
  // Capture only identifying/contact information. Administrative metadata and
  // storage keys do not belong to the document.
  const snapshot = {
    name: text(source.name),
    contact: text(source.contact),
    city: text(source.city),
    state: text(source.state),
    cnpj: text(source.cnpj) || null,
    legalName: text(source.legalName) || null,
    tradeName: text(source.tradeName) || null,
    postalCode: text(source.postalCode) || null,
    street: text(source.street) || null,
    number: text(source.number) || null,
    complement: text(source.complement) || null,
    neighborhood: text(source.neighborhood) || null,
  };
  const city = [snapshot.city, snapshot.state].filter(Boolean).join(" - ");
  const address = [
    snapshot.street,
    snapshot.number,
    snapshot.complement,
    snapshot.neighborhood,
  ].filter(Boolean);
  const lines = [
    "ORGANIZAÇÃO RESPONSÁVEL",
    `Nome: ${snapshot.name}`,
    snapshot.legalName && `Razão social: ${snapshot.legalName}`,
    snapshot.tradeName && `Nome fantasia: ${snapshot.tradeName}`,
    snapshot.cnpj && `CNPJ: ${formatCnpj(snapshot.cnpj)}`,
    address.length
      ? `Endereço: ${[...address, city].filter(Boolean).join(", ")}`
      : city && `Cidade / UF: ${city}`,
    snapshot.postalCode && `CEP: ${formatPostalCode(snapshot.postalCode)}`,
    snapshot.contact && `Contato: ${snapshot.contact}`,
  ];
  return { snapshot, text: lines.filter(Boolean).join("\n") };
}
