import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { asJsonObject } from "../src/core/json-object.js";
import { eventArtworkFile } from "../src/modules/events/event-artwork-upload.js";
import { correctedPersonIdentity } from "../src/modules/registrations/registration-corrections.identity.js";
import {
  asCorrectionObject,
  validateRegistrationCorrections,
} from "../src/modules/registrations/registration-corrections.validation.js";
import { volunteerTemplate } from "../src/modules/events/volunteer-template.js";

describe("Opaque JSON compatibility", () => {
  it("keeps existing objects and prototypes instead of imposing a new schema", () => {
    class HistoricalRecord {
      name = "Histórico";
    }
    for (const value of [
      { name: "Registro" },
      new Date("2026-01-01"),
      new HistoricalRecord(),
    ]) {
      expect(asJsonObject(value)).toBe(value);
      expect(asCorrectionObject(value)).toBe(value);
    }
  });

  it.each([undefined, null, false, 0, "texto", []])(
    "retains the existing empty-object fallback for %j",
    (value) => {
      expect(asJsonObject(value)).toEqual({});
    },
  );

  it.each([
    undefined,
    null,
    false,
    "histórico",
    ["resposta"],
    { legado: true },
  ])(
    "does not rewrite untouched historical answers %j during a base correction",
    (answers) => {
      const result = validateRegistrationCorrections(
        { name: "Nome corrigido" },
        {
          current: {
            name: "Nome anterior",
            birthDate: "1990-01-01",
            phone: "44999999999",
            answers,
          },
          form: volunteerTemplate("FAC"),
          kind: "VOLUNTEER",
          origin: "IMPORT",
          eventStartsAt: new Date("2027-02-05T12:00:00Z"),
          teams: [],
        },
      );
      expect(Object.hasOwn(result.snapshot, "answers")).toBe(true);
      expect(result.snapshot.answers).toBe(answers);
      expect(result.snapshot.name).toBe("Nome corrigido");
    },
  );
});

describe("Validated identity correction mapping", () => {
  const birthDate = new Date("1990-01-01T00:00:00Z");
  const person = {
    name: "Nome original",
    birthDate,
    phone: "44999999999",
    cpf: "12345678901",
  };

  it("ignores unrelated or unvalidated snapshot identity fields", () => {
    const result = correctedPersonIdentity(
      person,
      { name: false, birthDate: "inválida", phone: [], cpf: {} },
      [],
    );
    expect(result).toEqual(person);
    expect(result.birthDate).toBe(birthDate);
  });

  it("uses the validated changed values and preserves CPF removal", () => {
    const result = correctedPersonIdentity(
      person,
      {
        name: "Nome corrigido",
        birthDate: "1991-02-03",
        phone: "44988888888",
      },
      ["name", "birthDate", "phone", "cpf"],
    );
    expect(result).toEqual({
      name: "Nome corrigido",
      birthDate: new Date("1991-02-03"),
      phone: "44988888888",
      cpf: null,
    });
  });
});

describe("Event artwork request selection", () => {
  it("keeps desktop and mobile files separate and selects the first entry", () => {
    const desktop = { originalname: "desktop.webp" } as Express.Multer.File;
    const mobile = { originalname: "mobile.webp" } as Express.Multer.File;
    const request: Pick<Request, "files"> = {
      files: { artwork: [desktop], mobileArtwork: [mobile] },
    };
    expect(eventArtworkFile(request, "artwork")).toBe(desktop);
    expect(eventArtworkFile(request, "mobileArtwork")).toBe(mobile);
  });

  it("keeps uploads optional for JSON requests or absent artwork fields", () => {
    expect(eventArtworkFile({}, "artwork")).toBeUndefined();
    expect(eventArtworkFile({ files: {} }, "mobileArtwork")).toBeUndefined();
  });
});
