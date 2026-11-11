import type { Registration } from "./types";

export function registrationPendingInformation(registration: Registration) {
  if (registration.origin !== "IMPORT") return [];
  const values =
    registration.pendingInformation ?? registration.importData?.pending ?? [];
  return [
    ...new Set(
      values.filter((value) => typeof value === "string" && value.trim()),
    ),
  ];
}
