import { describe, expect, it } from "vitest";
import { organizationSchema } from "../src/modules/organizations/organizations.validation.js";

const base = {
  name: "Comunidade teste",
  kind: "COMMUNITY",
  city: "Loanda",
  state: "PR",
  contact: "Contato teste",
};
describe("Ficha complementar da organização", () => {
  it("mantém o cadastro anterior e normaliza dados opcionais", () => {
    expect(organizationSchema.parse(base)).toEqual(base);
    expect(
      organizationSchema.parse({
        ...base,
        cnpj: " 12.345.678/0001-95",
        postalCode: "87900-000",
        legalName: "  Entidade teste  ",
        tradeName: " ",
      }),
    ).toMatchObject({
      cnpj: "12345678000195",
      postalCode: "87900000",
      legalName: "Entidade teste",
      tradeName: null,
    });
  });
  it("aceita o CNPJ alfanumérico oficial e valida os dígitos", () => {
    expect(
      organizationSchema.parse({ ...base, cnpj: "00.000.000/e08g-12" }).cnpj,
    ).toBe("00000000E08G12");
    for (const cnpj of [
      "00.000.000/E08G-13",
      "00000000000000",
      "11111111111111",
      "12345678000196",
      "12.345.678/0001-9X",
      "12345678000195!",
      "///",
      "12 345678000195",
    ])
      expect(organizationSchema.safeParse({ ...base, cnpj }).success).toBe(
        false,
      );
  });
  it("valida CEP e impede dados internos de armazenamento enviados pelo cliente", () => {
    expect(
      organizationSchema.safeParse({ ...base, postalCode: "8790" }).success,
    ).toBe(false);
    expect(
      organizationSchema.safeParse({ ...base, postalCode: "---" }).success,
    ).toBe(false);
    expect(
      organizationSchema.safeParse({
        ...base,
        logoBucket: "identificacao",
        logoKey: "foto-privada",
      }).success,
    ).toBe(false);
  });
});
