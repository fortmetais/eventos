type PersonIdentity = {
  name: string;
  birthDate: Date;
  phone: string;
  cpf: string | null;
};

/** Read identity fields only after correction validation marks them as changed. */
export function correctedPersonIdentity(
  person: PersonIdentity,
  snapshot: Record<string, unknown>,
  changed: readonly string[],
): PersonIdentity {
  return {
    name: changed.includes("name") ? (snapshot.name as string) : person.name,
    birthDate: changed.includes("birthDate")
      ? new Date(snapshot.birthDate as string)
      : person.birthDate,
    phone: changed.includes("phone")
      ? (snapshot.phone as string)
      : person.phone,
    cpf: changed.includes("cpf")
      ? ((snapshot.cpf as string | null | undefined) ?? null)
      : person.cpf,
  };
}
