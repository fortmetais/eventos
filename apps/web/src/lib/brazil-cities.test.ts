import { describe, expect, it } from "vitest";
import data from "../data/brazil-cities.json";
import { loadBrazilianCities } from "./brazil-cities";

describe("Catálogo brasileiro de municípios", () => {
  it("inclui as 27 UFs, sem duplicações, e municípios com a nova divisão regional", async () => {
    expect(data.cities.length).toBeGreaterThan(5000);
    expect(new Set(data.cities).size).toBe(data.cities.length);
    expect(new Set(data.cities.map((city) => city.slice(-2))).size).toBe(27);
    expect(data.cities).toContain("Loanda - PR");
    expect(data.cities).toContain("Boa Esperança do Norte - MT");
    expect(data.cities.every((city) => /^.+ - [A-Z]{2}$/.test(city))).toBe(
      true,
    );
    const first = loadBrazilianCities();
    expect(loadBrazilianCities()).toBe(first);
    expect(
      (await first).find((city) => city.label === "São Paulo - SP")?.search,
    ).toBe("sao paulo sp");
  });
});
