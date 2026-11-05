import { TextDecoder } from "node:util";
import { fieldVisible, healthFields, shirtSizes } from "@fac/form-layout";
import { assert } from "../../core/errors.js";
import type { FormConfig } from "../events/events.validation.js";
import { ageAt } from "../registrations/registrations.validation.js";
import {
  normalizeName,
  normalizePhone,
  normalizeShirt,
  normalized,
  readWorkbook,
} from "./workbook.js";

export type ImportValue = string | number | boolean | string[] | null;
export type EventImportMapping = {
  column: number;
  target: string;
  confirmed: boolean;
}[];
export type EventImportRule = { target: string; from: string; to: ImportValue };
export type ImportDepartment = { id: string; name: string; active?: boolean };
export type EventImportTarget = {
  id: string;
  label: string;
  type: "text" | "date" | "boolean" | "single" | "multiple" | "number";
  options?: { value: string; label: string }[];
  historical?: boolean;
  hidden?: boolean;
};
export type ImportSheet = {
  name: string;
  headers: string[];
  rows: { rowNumber: number; cells: string[] }[];
};
export type OriginalImportRow = { headers: string[]; cells: string[] };
export type EventImportPayload = {
  name: string;
  birthDate: string;
  phone: string;
  shirt?: string;
  email?: string;
  cpf?: string;
  address?: string;
  availability?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelationship?: string;
  answers: Record<string, Exclude<ImportValue, null>>;
};
export type EventImportNormalizedRow = {
  payload: EventImportPayload;
  historical: Record<string, { label: string; value: ImportValue }>;
  metadata: {
    submittedAt: string | null;
    reportedAge: number | null;
    ageAtSubmission: number | null;
    ageAtEvent: number | null;
    instagram: string | null;
  };
  errors: string[];
  warnings: string[];
  pending: string[];
  identity: string;
  nameBirth: string;
  normalizedName: string;
  departmentIds: string[];
  preferences: string[];
  submittedAt: string | null;
  reportedAge: number | null;
};

const MAX_FILE = 10 * 1024 * 1024;
const MAX_CELL = 20_000;
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
const safeKey = (key: string) => !forbidden.has(key);
const canonical = (value: string) =>
  normalizeName(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const text = (value: ImportValue | undefined) =>
  value == null ? "" : Array.isArray(value) ? value.join(";") : String(value);
const distinct = <T>(values: T[]) => [...new Set(values)];

// CSV values remain literal text. No formula evaluation, link fetching or date guessing.
function csvRows(source: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const pushCell = () => {
    assert(
      cell.length <= MAX_CELL,
      413,
      "Há uma resposta muito longa na planilha.",
    );
    row.push(cell);
    assert(row.length <= 100, 413, "Use planilhas com até 100 colunas.");
    cell = "";
    closed = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value.trim())) rows.push(row);
    assert(
      rows.length <= 5001,
      413,
      "A planilha deve conter até 5.000 registros no total.",
    );
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === delimiter) pushCell();
    else if (char === "\n" || char === "\r") {
      pushRow();
      if (char === "\r" && source[i + 1] === "\n") i++;
    } else if (char === '"') {
      assert(
        !cell && !closed,
        400,
        "Confira as aspas e o separador do arquivo CSV.",
      );
      quoted = true;
    } else {
      assert(
        !closed || /[ \t]/.test(char),
        400,
        "Confira as aspas e o separador do arquivo CSV.",
      );
      if (!closed) cell += char;
    }
    assert(
      cell.length <= MAX_CELL,
      413,
      "Há uma resposta muito longa na planilha.",
    );
  }
  assert(
    !quoted,
    400,
    "Há uma resposta com aspas não fechadas no arquivo CSV.",
  );
  if (cell || row.length || closed) pushRow();
  return rows;
}

function detectDelimiter(source: string) {
  const counts = new Map([
    [",", 0],
    [";", 0],
    ["\t", 0],
  ]);
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === "\r" || char === "\n") break;
      if (counts.has(char)) counts.set(char, counts.get(char)! + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

export async function readImportFile(
  bytes: Buffer,
  fileName: string,
): Promise<ImportSheet[]> {
  assert(bytes.length <= MAX_FILE, 413, "Escolha uma planilha com até 10 MB.");
  if (/\.xlsx$/i.test(fileName)) return readWorkbook(bytes);
  assert(/\.csv$/i.test(fileName), 400, "Escolha uma planilha CSV ou XLSX.");
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    source = new TextDecoder("windows-1252").decode(bytes);
  }
  source = source.replace(/^\uFEFF/, "");
  assert(!source.includes("\0"), 400, "Envie um arquivo CSV de texto válido.");
  const explicit = /^sep=([,;\t])\r?\n/i.exec(source);
  if (explicit) source = source.slice(explicit[0].length);
  source = source.replace(/^(?:[ \t]*\r?\n)+/, "");
  const rows = csvRows(source, explicit?.[1] ?? detectDelimiter(source));
  assert(rows.length > 1, 422, "A planilha não contém respostas.");
  const headers = rows[0].map((header) => header.trim());
  assert(headers.length > 0, 422, "Confira o cabeçalho do arquivo CSV.");
  assert(
    rows.slice(1).every((row) => row.length === headers.length),
    422,
    "Há linhas com quantidade de colunas diferente do cabeçalho. Confira o separador e as aspas.",
  );
  return [
    {
      name: "CSV",
      headers,
      rows: rows
        .slice(1)
        .map((cells, index) => ({ rowNumber: index + 2, cells })),
    },
  ];
}

export function eventImportCatalog(
  form: FormConfig,
  departments: ImportDepartment[],
): EventImportTarget[] {
  const base: EventImportTarget[] = [
    { id: "name", label: "Nome completo", type: "text" },
    { id: "birthDate", label: "Data de nascimento", type: "date" },
    { id: "phone", label: "Telefone / WhatsApp", type: "text" },
    {
      id: "shirt",
      label: "Tamanho da camiseta",
      type: "single",
      options: shirtSizes.map((value) => ({
        value,
        label: value,
      })),
      hidden: !fieldVisible(form, "VOLUNTEER", "base:shirt"),
    },
    {
      id: "metadata:submittedAt",
      label: "Data original do envio",
      type: "text",
      historical: true,
    },
    {
      id: "metadata:age",
      label: "Idade informada (conferência)",
      type: "number",
      historical: true,
    },
    {
      id: "metadata:instagram",
      label: "Instagram (informação complementar)",
      type: "text",
      historical: true,
    },
    {
      id: "historical:training",
      label: "Concordância histórica com a formação",
      type: "text",
      historical: true,
    },
    {
      id: "historical:confirmation",
      label: "Confirmação histórica da inscrição",
      type: "text",
      historical: true,
    },
    {
      id: "historical",
      label: "Preservar somente no histórico",
      type: "text",
      historical: true,
    },
  ];
  for (const question of form.questions) {
    if (!safeKey(question.id)) continue;
    base.push({
      id: `question:${question.id}`,
      label: question.label,
      type: question.type,
      options:
        question.id === "equipes_preferencia"
          ? departments
              .filter((dept) => dept.active !== false)
              .map((dept) => ({ value: dept.id, label: dept.name }))
          : question.options.map((value) => ({ value, label: value })),
      historical: Boolean(question.mustBeTrue),
      hidden: !fieldVisible(form, "VOLUNTEER", `question:${question.id}`),
    });
  }
  return base;
}
export const buildImportCatalog = eventImportCatalog;

export function suggestEventMapping(
  headers: string[],
  catalog: EventImportTarget[],
): EventImportMapping {
  const ids = new Set(catalog.map((target) => target.id));
  const used = new Set<string>();
  return headers.map((header, column) => {
    const name = canonical(header);
    let target = "historical";
    const suggestions: [RegExp, string][] = [
      [/^(nome completo|nome)$/, "name"],
      [/nascimento|birth/, "birthDate"],
      [/^(celular|telefone|whatsapp)/, "phone"],
      [/^sexo/, "question:sexo"],
      [/^cidade/, "question:cidade"],
      [/camiseta/, "shirt"],
      [/carimbo|data hora|timestamp/, "metadata:submittedAt"],
      [/^idade/, "metadata:age"],
      [/instagram/, "metadata:instagram"],
      [/formacao.*equipe|equipe.*formacao/, "historical:training"],
      [/confirmacao.*inscricao/, "historical:confirmation"],
      [/sacramentos/, "question:sacramentos"],
      [/paroquia/, "question:paroquia"],
      [/conjuge/, "question:conjuge"],
      [/formacao.*saude/, "question:formacao_saude"],
      [/qual.*equipe|departamentos.*servir/, "question:equipes_preferencia"],
      [/edicao.*acampamento|campista.*edicao/, "question:acampamento_edicao"],
      [/fez ou serviu|participou ou serviu/, "question:experiencia_evento"],
    ];
    const match = suggestions.find(
      ([pattern, id]) => pattern.test(name) && ids.has(id),
    );
    if (match) target = match[1];
    else
      target =
        catalog.find((item) => canonical(item.label) === name)?.id ?? target;
    if (target !== "historical" && used.has(target)) target = "historical";
    used.add(target);
    return { column, target, confirmed: false };
  });
}
export const suggestedEventMapping = suggestEventMapping;

export function validateEventMapping(
  mapping: EventImportMapping,
  headers: string[],
  catalog: EventImportTarget[],
) {
  assert(
    Array.isArray(mapping) && mapping.length === headers.length,
    422,
    "Associe todas as colunas antes de continuar.",
  );
  const columns = new Set<number>(),
    targets = new Set<string>();
  const allowed = new Set(catalog.map((item) => item.id));
  for (const item of mapping) {
    assert(
      item &&
        Number.isInteger(item.column) &&
        item.column >= 0 &&
        item.column < headers.length &&
        !columns.has(item.column),
      422,
      "Confira os índices das colunas associadas.",
    );
    assert(
      item.confirmed === true,
      422,
      "Confira a associação de todas as colunas.",
    );
    const historical =
      item.target === "historical" ||
      item.target === `historical:${item.column}`;
    assert(
      allowed.has(item.target) || historical,
      422,
      "Há uma pergunta desconhecida na associação.",
    );
    assert(
      historical || !targets.has(item.target),
      422,
      "Duas colunas não podem preencher o mesmo campo.",
    );
    columns.add(item.column);
    targets.add(item.target);
  }
  for (const field of ["name", "birthDate", "phone"])
    assert(
      targets.has(field),
      422,
      "Associe nome completo, nascimento e telefone.",
    );
  return mapping;
}

function submittedDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const google =
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)\s+GMT([+-])(\d{1,2})(?::(\d{2}))?$/i.exec(
      raw,
    );
  if (google) {
    const [
      ,
      year,
      month,
      day,
      hours,
      minutes,
      seconds,
      period,
      sign,
      offsetHours,
      offsetMinutes,
    ] = google;
    const y = Number(year),
      m = Number(month),
      d = Number(day),
      h = Number(hours),
      min = Number(minutes),
      sec = Number(seconds);
    if (
      y < 1900 ||
      h < 1 ||
      h > 12 ||
      min > 59 ||
      sec > 59 ||
      Number(offsetHours) > 14 ||
      Number(offsetMinutes ?? 0) > 59
    )
      return null;
    const check = new Date(Date.UTC(y, m - 1, d));
    if (
      check.getUTCFullYear() !== y ||
      check.getUTCMonth() !== m - 1 ||
      check.getUTCDate() !== d
    )
      return null;
    const hour = (h % 12) + (period.toUpperCase() === "PM" ? 12 : 0);
    const offset =
      (Number(offsetHours) * 60 + Number(offsetMinutes ?? 0)) *
      (sign === "+" ? 1 : -1);
    return new Date(
      Date.UTC(y, m - 1, d, hour, min, sec) - offset * 60_000,
    ).toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) return null;
  if (!questionDate(raw.slice(0, 10))) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function asBoolean(value: ImportValue): boolean | undefined {
  if (typeof value === "boolean") return value;
  const key = canonical(text(value));
  if (["sim", "true", "yes"].includes(key)) return true;
  if (["nao", "false", "no"].includes(key)) return false;
  return undefined;
}

function questionDate(value: string) {
  let normalized = value.trim();
  const brazilian = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(normalized);
  if (brazilian)
    normalized = `${brazilian[3]}-${brazilian[2].padStart(2, "0")}-${brazilian[1].padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  const parsed = new Date(normalized + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : "";
}

export function normalizeEventRow(
  original: OriginalImportRow,
  mapping: EventImportMapping,
  rules: EventImportRule[],
  form: FormConfig,
  departments: ImportDepartment[],
  eventStartsAt: Date | string,
  overrides: Record<string, ImportValue> = {},
): EventImportNormalizedRow {
  const catalog = eventImportCatalog(form, departments);
  validateEventMapping(mapping, original.headers, catalog);
  const errors: string[] = [],
    warnings: string[] = [],
    pending: string[] = [];
  const values: Record<string, ImportValue> = Object.create(null);
  const translatedTargets = new Set<string>();
  const historical: EventImportNormalizedRow["historical"] = {};
  const definitions = new Map(catalog.map((target) => [target.id, target]));
  for (const association of mapping) {
    const raw = original.cells[association.column] ?? "";
    let value: ImportValue = raw.trim();
    const rule = rules.find(
      (entry) =>
        entry.target === association.target && entry.from === raw.trim(),
    );
    if (rule) {
      value = rule.to;
      translatedTargets.add(association.target);
    }
    if (Object.hasOwn(overrides, association.target)) {
      value = overrides[association.target];
      translatedTargets.add(association.target);
    }
    const definition = definitions.get(association.target);
    if (
      association.target.startsWith("historical") ||
      association.target.startsWith("metadata:") ||
      definition?.historical ||
      definition?.hidden
    ) {
      historical[String(association.column)] = {
        label: original.headers[association.column],
        value,
      };
    }
    if (safeKey(association.target)) values[association.target] = value;
  }
  // An organizer may correct a known field even when the source did not have
  // its column. Attestations stay historical and hidden fields stay outside payload.
  const mappedTargets = new Set(
    mapping.map((association) => association.target),
  );
  for (const [target, value] of Object.entries(overrides)) {
    if (mappedTargets.has(target) || !safeKey(target)) continue;
    const definition = definitions.get(target);
    if (!definition) continue;
    values[target] = value;
    translatedTargets.add(target);
    if (definition.historical || definition.hidden) {
      historical[`override:${target}`] = { label: definition.label, value };
    }
  }
  const identity = normalized({
    name: text(values.name),
    birthDate: text(values.birthDate),
    phone: text(values.phone),
    city: "",
    sex: "",
    shirt: "",
  });
  errors.push(...identity.errors);
  const payload: EventImportPayload = {
    name: identity.name,
    birthDate: identity.birth,
    phone: identity.phone,
    answers: {},
  };
  const date = new Date(eventStartsAt);
  const eventAge =
    identity.birth && Number.isFinite(date.getTime())
      ? ageAt(identity.birth, date)
      : null;
  if (eventAge !== null && (eventAge < 0 || eventAge > 120))
    errors.push("Confira a data de nascimento para a data do evento.");
  const submittedAt = submittedDate(text(values["metadata:submittedAt"]));
  // Age belongs to the source's calendar date, before converting its timestamp to UTC.
  const sourceDateMatch = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(
    text(values["metadata:submittedAt"]).trim(),
  );
  const sourceSubmissionDate =
    submittedAt && sourceDateMatch
      ? `${sourceDateMatch[1]}-${sourceDateMatch[2].padStart(2, "0")}-${sourceDateMatch[3].padStart(2, "0")}`
      : null;
  if (text(values["metadata:submittedAt"]) && !submittedAt)
    warnings.push(
      "Data de envio preservada: confira o formato e o fuso horário.",
    );
  const ageMatch = /^(\d{1,3})(?:\s*anos?)?$/i.exec(
    text(values["metadata:age"]).trim(),
  );
  const reportedAge = ageMatch ? Number(ageMatch[1]) : null;
  const ageAtSubmission =
    identity.birth && sourceSubmissionDate
      ? ageAt(identity.birth, new Date(sourceSubmissionDate + "T00:00:00Z"))
      : null;
  if (
    reportedAge !== null &&
    ageAtSubmission !== null &&
    reportedAge !== ageAtSubmission
  )
    warnings.push(
      "A idade informada difere da idade calculada na data do envio.",
    );
  if (
    identity.birth &&
    sourceSubmissionDate &&
    identity.birth > sourceSubmissionDate
  )
    errors.push("Nascimento posterior ao envio original: confira a data.");

  if (fieldVisible(form, "VOLUNTEER", "base:shirt")) {
    const shirt = normalizeShirt(text(values.shirt));
    if (shirt) payload.shirt = shirt;
    else if (text(values.shirt))
      pending.push(
        "Camiseta: opção não reconhecida; resposta preservada na origem.",
      );
    else if (form.askShirt) pending.push("Informar o tamanho da camiseta.");
  }
  const departmentIds: string[] = [],
    preferences: string[] = [];
  for (const question of form.questions) {
    const target = `question:${question.id}`;
    if (!safeKey(question.id) || !fieldVisible(form, "VOLUNTEER", target))
      continue;
    if (question.mustBeTrue) {
      pending.push(`Confirmar: ${question.label}`);
      continue;
    }
    const value = values[target];
    if (value === undefined || value === null || text(value).trim() === "") {
      if (question.required) pending.push(`Responder: ${question.label}`);
      continue;
    }
    const raw = text(value).trim();
    if (question.type === "boolean") {
      const boolean = asBoolean(value);
      if (boolean === undefined)
        pending.push(`Conferir resposta: ${question.label}`);
      else payload.answers[question.id] = boolean;
    } else if (question.type === "multiple" || question.type === "single") {
      const parts = Array.isArray(value)
        ? value
        : question.type === "multiple"
          ? raw
              .split(";")
              .map((part) => part.trim())
              .filter(Boolean)
          : [raw];
      const options = definitions.get(target)?.options ?? [];
      const normalizedParts: string[] = [];
      for (const part of parts) {
        const partRule = !translatedTargets.has(target)
          ? rules.find(
              (entry) => entry.target === target && entry.from === part.trim(),
            )
          : undefined;
        const translated = partRule ? partRule.to : part;
        if (translated == null) continue;
        const translatedParts = Array.isArray(translated)
          ? translated
          : [String(translated)];
        for (const entry of translatedParts) {
          const key = canonical(
            entry.replace(/\s*\(SOMENTE CASAIS CASADOS\)\s*$/i, ""),
          );
          const option = options.find(
            (option) =>
              option.value === entry || canonical(option.label) === key,
          );
          if (!option) {
            pending.push(
              `Opção não reconhecida em ${question.label}: ${entry}`,
            );
            continue;
          }
          normalizedParts.push(option.label);
          if (question.id === "equipes_preferencia") {
            departmentIds.push(option.value);
            preferences.push(option.label);
          }
        }
      }
      const selected = distinct(normalizedParts);
      if (question.type === "single" && selected.length > 1) {
        pending.push(`Selecione uma única opção: ${question.label}`);
        continue;
      }
      if (
        question.exclusiveOption &&
        selected.includes(question.exclusiveOption) &&
        selected.length > 1
      ) {
        pending.push(
          `Opção exclusiva junto de outras respostas: ${question.label}`,
        );
        continue;
      }
      if (
        question.maxSelections &&
        selected.length > question.maxSelections &&
        question.id !== "equipes_preferencia"
      ) {
        pending.push(`Quantidade de opções excedida: ${question.label}`);
        continue;
      }
      if (
        question.id === "equipes_preferencia" &&
        question.maxSelections &&
        selected.length > question.maxSelections
      )
        warnings.push(
          "Preferências históricas acima de três preservadas integralmente.",
        );
      if (selected.length)
        payload.answers[question.id] =
          question.type === "multiple" ? selected : selected[0];
      else if (question.required) pending.push(`Responder: ${question.label}`);
    } else if (question.type === "number") {
      const parsed = Number(raw.replace(",", "."));
      if (!Number.isFinite(parsed))
        pending.push(`Conferir número: ${question.label}`);
      else payload.answers[question.id] = parsed;
    } else if (question.type === "date") {
      const parsed = questionDate(raw);
      if (!parsed) pending.push(`Conferir data: ${question.label}`);
      else payload.answers[question.id] = parsed;
    } else if (
      question.id === "cidade" &&
      (/^\d+$/.test(raw) || /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(raw))
    ) {
      pending.push(
        "Conferir a cidade: resposta numérica ou data preservada na origem.",
      );
    } else if (raw.length > 2000)
      pending.push(`Resposta longa: ${question.label}`);
    else payload.answers[question.id] = raw;
  }
  if (fieldVisible(form, "VOLUNTEER", "base:photoAssetId"))
    pending.push("Adicionar foto do participante.");
  for (const [key, label] of [
    ["emergencyName", "Nome do contato de emergência"],
    ["emergencyPhone", "Telefone do contato de emergência"],
    ["emergencyRelationship", "Parentesco do contato de emergência"],
    ["availability", "Disponibilidade"],
  ] as const) {
    if (fieldVisible(form, "VOLUNTEER", `base:${key}`))
      pending.push(`Informar: ${label}`);
  }
  for (const [key, , label] of healthFields) {
    if (fieldVisible(form, "VOLUNTEER", `health:${key}`))
      pending.push(`Responder saúde: ${label}`);
  }
  pending.push("Aceitar os termos atuais da inscrição.");
  if (eventAge !== null && eventAge < 18 && eventAge >= 0)
    pending.push(
      "Informar responsável e obter autorização para menor de idade.",
    );
  return {
    payload,
    historical,
    metadata: {
      submittedAt,
      reportedAge,
      ageAtSubmission,
      ageAtEvent: eventAge,
      instagram: text(values["metadata:instagram"]) || null,
    },
    errors: distinct(errors),
    warnings: distinct(warnings),
    pending: distinct(pending),
    identity: identity.identity,
    nameBirth: identity.nameBirth,
    normalizedName: identity.normalizedName,
    departmentIds: distinct(departmentIds),
    preferences: distinct(preferences),
    submittedAt,
    reportedAge,
  };
}
