import { fieldVisible } from "@fac/form-layout";
import type { Payload, PublicCampaign } from "./types";

export function prefillIdentity(payload: Payload) {
  const name = payload.name?.trim() ?? "",
    birthDate = payload.birthDate ?? "",
    phone = payload.phone ?? "";
  if (
    name.split(/\s+/).length < 2 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
    !/^\d{10,13}$/.test(phone.replace(/\D/g, ""))
  )
    return null;
  return { name, birthDate, phone };
}
export function prefillIdentityKey(payload: Payload) {
  return JSON.stringify([
    payload.name ?? "",
    payload.birthDate ?? "",
    payload.phone ?? "",
  ]);
}
export function mergePrefill(
  payload: Payload,
  suggested: Payload,
  config: PublicCampaign["form"]["config"],
  kind: PublicCampaign["kind"],
) {
  const next: Payload = { ...payload, answers: { ...payload.answers } };
  let changed = false;
  if (
    !payload.shirt &&
    typeof suggested.shirt === "string" &&
    ["PP", "P", "M", "G", "GG", "XG", "XGG", "ESP"].includes(suggested.shirt) &&
    fieldVisible(config, kind, "base:shirt")
  ) {
    next.shirt = suggested.shirt;
    changed = true;
  }
  for (const key of ["cidade", "sexo"]) {
    const current = payload.answers?.[key];
    const value = suggested.answers?.[key];
    const question = config.questions.find((q) => q.id === key);
    if (
      (current === undefined || current === "") &&
      typeof value === "string" &&
      value &&
      question &&
      fieldVisible(config, kind, `question:${key}`) &&
      (question.type === "text" ||
        (question.type === "single" && question.options.includes(value)))
    ) {
      next.answers![key] = value;
      changed = true;
    }
  }
  return { payload: changed ? next : payload, changed };
}
