export type BrazilianCity = { label: string; search: string };

export function normalizeCitySearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let catalog: Promise<BrazilianCity[]> | undefined;

export function loadBrazilianCities(): Promise<BrazilianCity[]> {
  // Um único arquivo da aplicação, carregado ao focar o campo, sem depender
  // do IBGE durante a inscrição e sem consultar o banco a cada digitação.
  catalog ??= import("../data/brazil-cities.json")
    .then(({ default: data }) =>
      data.cities.map((label) => ({
        label,
        search: normalizeCitySearch(label),
      })),
    )
    .catch((error) => {
      catalog = undefined;
      throw error;
    });
  return catalog;
}

export function findBrazilianCities(cities: BrazilianCity[], query: string) {
  const normalized = normalizeCitySearch(query);
  if (normalized.length < 2) return { matches: [], hasMore: false };
  const tokens = normalized.split(" ");
  const matches = cities.filter((city) =>
    tokens.every((token) => city.search.includes(token)),
  );
  // Coloca nomes que começam pelo texto buscado antes de ocorrências no meio.
  const starts = matches.filter((city) => city.search.startsWith(normalized));
  const others = matches.filter((city) => !city.search.startsWith(normalized));
  return {
    matches: [...starts, ...others].slice(0, 20),
    hasMore: matches.length > 20,
  };
}
