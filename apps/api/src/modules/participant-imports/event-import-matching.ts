import { isDeepStrictEqual } from "node:util";
import { asJsonObject } from "../../core/json-object.js";
import { normalizeName } from "./workbook.js";

type CandidateIdentity = {
  person: { name: string; birthDate: Date };
  origin: string;
  importData: unknown;
};

export function identityOf(candidate: CandidateIdentity) {
  return `${normalizeName(candidate.person.name)}|${candidate.person.birthDate.toISOString().slice(0, 10)}`;
}

export function candidateMatches(
  candidate: CandidateIdentity,
  nameBirth: string,
) {
  if (identityOf(candidate) === nameBirth) return true;
  if (candidate.origin !== "IMPORT") return false;
  const data = asJsonObject(candidate.importData),
    baseline = asJsonObject(data.baseline);
  const baselineIdentity =
    typeof baseline.name === "string" && typeof baseline.birthDate === "string"
      ? `${normalizeName(baseline.name)}|${baseline.birthDate}`
      : "";
  return (
    baselineIdentity === nameBirth ||
    (Array.isArray(data.identityAliases) &&
      data.identityAliases.includes(nameBirth))
  );
}

export function incomingMatches(current: unknown, incoming: unknown): boolean {
  const a = asJsonObject(current),
    b = asJsonObject(incoming);
  return Object.keys(b).every((key) =>
    key === "answers"
      ? Object.entries(asJsonObject(b.answers)).every(([k, v]) =>
          isDeepStrictEqual(asJsonObject(a.answers)[k], v),
        )
      : isDeepStrictEqual(a[key], b[key]),
  );
}

/** Keep later edits: an import update only replaces an unchanged imported baseline. */
export function protectedMerge(
  current: unknown,
  baseline: unknown,
  incoming: unknown,
) {
  const result = { ...asJsonObject(current) };
  const old = asJsonObject(baseline);
  const nextBaseline = { ...old };
  const mayReplace = (
    present: Record<string, unknown>,
    previous: Record<string, unknown>,
    key: string,
  ) =>
    Object.hasOwn(previous, key)
      ? isDeepStrictEqual(present[key], previous[key])
      : !Object.hasOwn(present, key);
  for (const [key, next] of Object.entries(asJsonObject(incoming))) {
    if (key === "answers") {
      const answers = { ...asJsonObject(result.answers) },
        previous = asJsonObject(old.answers),
        baselineAnswers = { ...previous };
      for (const [answer, val] of Object.entries(asJsonObject(next))) {
        if (mayReplace(answers, previous, answer)) {
          answers[answer] = val;
          baselineAnswers[answer] = val;
        }
      }
      result.answers = answers;
      nextBaseline.answers = baselineAnswers;
    } else if (mayReplace(result, old, key)) {
      result[key] = next;
      nextBaseline[key] = next;
    }
  }
  return { snapshot: result, baseline: nextBaseline };
}
