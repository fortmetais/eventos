import { readFile, writeFile, mkdir } from "node:fs/promises";

const source =
  "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome";
const states = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(
    " ",
  ),
);
const inputIndex = process.argv.indexOf("--input");
let municipalities;
if (inputIndex >= 0) {
  municipalities = JSON.parse(
    (await readFile(process.argv[inputIndex + 1], "utf8")).replace(
      /^\uFEFF/,
      "",
    ),
  );
} else {
  const response = await fetch(source, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`IBGE respondeu ${response.status}`);
  municipalities = await response.json();
}
if (!Array.isArray(municipalities) || municipalities.length < 5000)
  throw new Error("Lista incompleta de municípios; catálogo atual preservado.");
const ids = new Set();
const labels = new Set();
const foundStates = new Set();
for (const municipality of municipalities) {
  // Municípios novos podem não pertencer à antiga divisão de microrregiões.
  const state =
    municipality["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ??
    municipality.microrregiao?.mesorregiao?.UF?.sigla;
  if (
    !Number.isInteger(municipality.id) ||
    ids.has(municipality.id) ||
    typeof municipality.nome !== "string" ||
    !municipality.nome.trim() ||
    !states.has(state)
  )
    throw new Error("Município inválido; catálogo atual preservado.");
  const label = `${municipality.nome.trim()} - ${state}`;
  if (labels.has(label)) throw new Error(`Município duplicado: ${label}`);
  ids.add(municipality.id);
  labels.add(label);
  foundStates.add(state);
}
if (foundStates.size !== states.size)
  throw new Error("Faltam unidades da federação.");
const directory = new URL("../apps/web/src/data/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL("brazil-cities.json", directory),
  JSON.stringify({
    source,
    retrievedAt: new Date().toISOString(),
    cities: [...labels].sort((a, b) => a.localeCompare(b, "pt-BR")),
  }) + "\n",
);
console.log(
  `Catálogo atualizado: ${labels.size} municípios, ${foundStates.size} unidades da federação.`,
);
