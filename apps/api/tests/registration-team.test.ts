import { describe, expect, it } from "vitest";
import { normalizeRegistrationTeam } from "../src/modules/registrations/registration-team.js";

describe("Contrato comum de equipes com armazenamento separado", () => {
  it("preserva o departamento legado e não expõe os campos internos de campistas", () => {
    const registration = {
      id: "r",
      teamId: "vol",
      team: { id: "vol", name: "COZINHA" },
      camperTeamId: null,
      camperTeam: null,
      campaign: { kind: "VOLUNTEER" },
    };
    expect(normalizeRegistrationTeam(registration)).toEqual({
      id: "r",
      teamId: "vol",
      team: { id: "vol", name: "COZINHA" },
      campaign: { kind: "VOLUNTEER" },
    });
    expect(registration).toHaveProperty("camperTeamId", null);
  });
  it("expõe apenas a equipe da campanha de campistas e conserva a origem", () => {
    const registration = Object.freeze({
      id: "r",
      teamId: null,
      team: null,
      camperTeamId: "camp",
      camperTeam: { id: "camp", campaignId: "c", name: "AZUL" },
      campaign: { kind: "CAMPER", eventId: "e" },
    });
    expect(normalizeRegistrationTeam(registration)).toEqual({
      id: "r",
      teamId: "camp",
      team: { id: "camp", campaignId: "c", name: "AZUL", eventId: "e" },
      campaign: { kind: "CAMPER", eventId: "e" },
    });
  });
  it("mantém o formato mínimo da área pessoal sem inventar identificadores", () => {
    expect(
      normalizeRegistrationTeam({
        team: null,
        camperTeam: { name: "AZUL" },
        campaign: { kind: "CAMPER", event: { id: "e" } },
      }),
    ).toEqual({
      team: { name: "AZUL" },
      campaign: { kind: "CAMPER", event: { id: "e" } },
    });
  });
  it("remove uma equipe de campista também em respostas de ação sem relações carregadas", () => {
    expect(
      normalizeRegistrationTeam({
        id: "r",
        teamId: null,
        camperTeamId: "camp",
      }),
    ).toEqual({ id: "r", teamId: "camp" });
    expect(
      normalizeRegistrationTeam({ id: "r", teamId: null, camperTeamId: null }),
    ).toEqual({ id: "r", teamId: null });
  });
});
