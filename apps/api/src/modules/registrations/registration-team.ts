/** Select the camper relationship without loading another campaign's data. */
export const basicCamperTeam = {
  id: true,
  campaignId: true,
  name: true,
} as const;

type RegistrationTeamRecord = {
  teamId?: string | null;
  team?: unknown;
  camperTeamId?: string | null;
  camperTeam?: { id?: string; name: string; campaignId?: string } | null;
  campaign?: {
    kind?: string;
    eventId?: string;
    event?: { id?: string };
  };
};

/** Keep the public team/teamId contract while the two audiences use separate FKs. */
export function normalizeRegistrationTeam<T extends RegistrationTeamRecord>(
  registration: T,
) {
  const { camperTeamId, camperTeam, ...result } = registration;
  const camper =
    registration.campaign?.kind === "CAMPER" ||
    (registration.campaign?.kind === undefined && camperTeamId != null);
  if (!camper) return result;
  const eventId =
    registration.campaign?.eventId ?? registration.campaign?.event?.id;
  return {
    ...result,
    ...("teamId" in registration || "camperTeamId" in registration
      ? { teamId: camperTeamId ?? null }
      : {}),
    ...("team" in registration || "camperTeam" in registration
      ? {
          team: camperTeam
            ? {
                ...camperTeam,
                ...(camperTeam.id && eventId ? { eventId } : {}),
              }
            : null,
        }
      : {}),
  };
}
