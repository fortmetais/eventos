import { describe, expect, it } from "vitest";
import {
  candidateMatches,
  identityOf,
  incomingMatches,
  protectedMerge,
} from "../src/modules/participant-imports/event-import-matching.js";

const candidate = (origin = "IMPORT", importData: unknown = null) => ({
  person: { name: "  João da Silva  ", birthDate: new Date("1990-01-02") },
  origin,
  importData,
});

describe("Imported candidacy matching", () => {
  it("recognizes the current normalized identity for every origin", () => {
    for (const origin of ["IMPORT", "NATIVE"]) {
      const value = candidate(origin);
      expect(identityOf(value)).toBe("joao da silva|1990-01-02");
      expect(candidateMatches(value, "joao da silva|1990-01-02")).toBe(true);
    }
  });

  it("recognizes earlier imported identities without treating native records as imports", () => {
    const history = {
      baseline: { name: "Nome anterior", birthDate: "1990-01-03" },
      identityAliases: ["outra identidade|1990-01-04"],
    };
    for (const identity of [
      "nome anterior|1990-01-03",
      "outra identidade|1990-01-04",
    ]) {
      expect(candidateMatches(candidate("IMPORT", history), identity)).toBe(
        true,
      );
      expect(candidateMatches(candidate("NATIVE", history), identity)).toBe(
        false,
      );
    }
    expect(
      candidateMatches(candidate("IMPORT", history), "diferente|1990-01-02"),
    ).toBe(false);
  });

  it("tolerates missing historical baseline and aliases", () => {
    for (const history of [
      null,
      [],
      { baseline: { name: 42 }, identityAliases: "text" },
    ]) {
      expect(
        candidateMatches(candidate("IMPORT", history), "outro|1990-01-02"),
      ).toBe(false);
    }
  });

  it("compares only incoming fields and answers, retaining strict values and array order", () => {
    const current = {
      name: "Nome",
      organizerNote: "preservada",
      answers: { existing: true, repeated: { a: 1, b: 2 }, teams: ["a", "b"] },
    };
    expect(
      incomingMatches(current, {
        name: "Nome",
        answers: { repeated: { b: 2, a: 1 } },
      }),
    ).toBe(true);
    expect(incomingMatches(current, { answers: { teams: ["b", "a"] } })).toBe(
      false,
    );
    expect(incomingMatches(current, { answers: { absent: false } })).toBe(
      false,
    );
    expect(incomingMatches(current, { name: "Novo nome" })).toBe(false);
    expect(incomingMatches(current, null)).toBe(true);
  });
});

describe("Protection of organizer corrections during repeated imports", () => {
  it("updates unchanged imported fields and preserves later corrections and explicit clearing", () => {
    const baseline = {
      name: "Original",
      city: "Antiga",
      phone: "111",
      answers: { parish: "Antiga", spouse: "Antigo" },
    };
    const current = {
      ...baseline,
      city: "Corrigida",
      phone: null,
      answers: { ...baseline.answers, spouse: "Corrigido" },
    };
    const incoming = {
      name: "Atualizado",
      city: "Importada",
      phone: "222",
      shirtSize: "G1",
      answers: { parish: "Nova", spouse: "Importado", newQuestion: false },
    };
    const originalCurrent = structuredClone(current),
      originalBaseline = structuredClone(baseline),
      originalIncoming = structuredClone(incoming);

    const result = protectedMerge(current, baseline, incoming);

    expect(result.snapshot).toEqual({
      name: "Atualizado",
      city: "Corrigida",
      phone: null,
      shirtSize: "G1",
      answers: { parish: "Nova", spouse: "Corrigido", newQuestion: false },
    });
    expect(result.baseline).toEqual({
      name: "Atualizado",
      city: "Antiga",
      phone: "111",
      shirtSize: "G1",
      answers: { parish: "Nova", spouse: "Antigo", newQuestion: false },
    });
    expect(current).toEqual(originalCurrent);
    expect(baseline).toEqual(originalBaseline);
    expect(incoming).toEqual(originalIncoming);
  });

  it("retains fields added by an organizer that were never in the import baseline", () => {
    expect(
      protectedMerge(
        { email: "manual@example.test", answers: { extra: false } },
        {},
        {
          email: "import@example.test",
          answers: { extra: true, new: "value" },
        },
      ),
    ).toEqual({
      snapshot: {
        email: "manual@example.test",
        answers: { extra: false, new: "value" },
      },
      baseline: { answers: { new: "value" } },
    });
  });

  it("keeps absent and explicitly undefined values distinct while retaining malformed-history fallback", () => {
    expect(
      protectedMerge({ phone: undefined }, {}, { phone: "222" }).snapshot,
    ).toEqual({ phone: undefined });
    expect(
      protectedMerge({}, { phone: undefined }, { phone: "222" }).snapshot,
    ).toEqual({ phone: "222" });
    expect(
      protectedMerge(null, [], { name: "Novo", answers: { known: true } }),
    ).toEqual({
      snapshot: { name: "Novo", answers: { known: true } },
      baseline: { name: "Novo", answers: { known: true } },
    });
  });
});
