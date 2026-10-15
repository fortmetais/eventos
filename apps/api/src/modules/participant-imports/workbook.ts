import ExcelJS from "exceljs";
import { z } from "zod";
import { assert, AppError } from "../../core/errors.js";

export const fields = [
  "name",
  "birthDate",
  "phone",
  "city",
  "sex",
  "shirt",
] as const;
export type ImportField = (typeof fields)[number];
export type Values = Record<ImportField, string>;
export const mappingSchema = z
  .object({
    name: z.number().int().min(0).max(99),
    birthDate: z.number().int().min(0).max(99),
    phone: z.number().int().min(0).max(99),
    city: z.number().int().min(0).max(99).nullable(),
    sex: z.number().int().min(0).max(99).nullable(),
    shirt: z.number().int().min(0).max(99).nullable(),
  })
  .strict()
  .refine((m) => {
    const selected = Object.values(m).filter((v) => v !== null);
    return new Set(selected).size === selected.length;
  }, "Uma coluna não pode representar dois campos.");
export type Mapping = z.infer<typeof mappingSchema>;
export const valuesSchema = z
  .object(
    Object.fromEntries(fields.map((f) => [f, z.string().max(20000)])) as Record<
      ImportField,
      z.ZodString
    >,
  )
  .strict();

export function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && [12, 13].includes(digits.length))
    digits = digits.slice(2);
  return digits;
}
export function normalizeBirth(value: string) {
  let text = value.trim();
  const br = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(text);
  if (br) text = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(text + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text ||
    text < "1900-01-01" ||
    text > new Date().toISOString().slice(0, 10)
  )
    return "";
  return text;
}
export function normalizeShirt(value: string) {
  const shirt = value
    .toUpperCase()
    .trim()
    .replace(/^TAMANHO\s*/, "")
    .replace(/[()]/g, "")
    .trim();
  return ["PP", "P", "M", "G", "GG", "XG", "XGG", "ESP"].includes(shirt)
    ? shirt
    : "";
}
export function normalized(values: Values) {
  const name = values.name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeName(name);
  const phone = normalizePhone(values.phone);
  const birth = normalizeBirth(values.birthDate);
  const errors: string[] = [];
  if (
    name.length < 3 ||
    name.length > 150 ||
    name.split(" ").length < 2 ||
    !/^[\p{L}\p{M}\s.'’\-]+$/u.test(name)
  )
    errors.push("Confira o nome completo.");
  if (!birth) errors.push("Confira a data de nascimento.");
  if (!/^[1-9]\d{9,10}$/.test(phone)) errors.push("Confira o celular com DDD.");
  if (values.city.trim().length > 100)
    errors.push("Confira a cidade (até 100 caracteres).");
  const shirt = normalizeShirt(values.shirt);
  const warnings: string[] = [];
  if (values.shirt.trim() && !shirt)
    warnings.push(
      "Camiseta preservada, mas não sugerida: opção fora do formulário.",
    );
  const sex =
    ["Masculino", "Feminino"].find(
      (s) => normalizeName(s) === normalizeName(values.sex),
    ) ?? "";
  if (values.sex.trim() && !sex)
    warnings.push("Sexo preservado, mas não sugerido: opção desconhecida.");
  return {
    name,
    normalizedName,
    phone,
    birth,
    city: values.city.trim(),
    sex,
    shirt,
    errors,
    warnings,
    identity: `${normalizedName}|${birth}|${phone}`,
    nameBirth: `${normalizedName}|${birth}`,
  };
}

// Bound ZIP expansion before handing the archive to the XLSX parser.
function checkArchive(bytes: Buffer) {
  assert(
    bytes.length <= 10 * 1024 * 1024,
    413,
    "Escolha uma planilha com até 10 MB.",
  );
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  assert(end >= 0, 400, "Envie uma planilha XLSX válida.");
  const count = bytes.readUInt16LE(end + 10);
  let position = bytes.readUInt32LE(end + 16),
    total = 0;
  assert(
    count < 65535 && count < 5000,
    413,
    "A estrutura da planilha excede o limite de importação.",
  );
  for (let i = 0; i < count; i++) {
    assert(
      position + 46 <= bytes.length &&
        bytes.readUInt32LE(position) === 0x02014b50,
      400,
      "Arquivo XLSX inválido.",
    );
    total += bytes.readUInt32LE(position + 24);
    const nameLength = bytes.readUInt16LE(position + 28);
    assert(
      total <= 50 * 1024 * 1024,
      413,
      "A planilha descompactada excede 50 MB.",
    );
    const name = bytes
      .subarray(position + 46, position + 46 + nameLength)
      .toString();
    assert(
      !/vbaProject\.bin$/i.test(name),
      400,
      "Não são aceitas planilhas com macros.",
    );
    position +=
      46 +
      nameLength +
      bytes.readUInt16LE(position + 30) +
      bytes.readUInt16LE(position + 32);
  }
}
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value)
      return cellText(value.result ?? null);
    if ("richText" in value)
      return value.richText.map((part) => part.text).join("");
    if ("hyperlink" in value)
      return value.text && value.text !== value.hyperlink
        ? `${value.text} (${value.hyperlink})`
        : value.hyperlink;
    return "";
  }
  return String(value);
}
export async function readWorkbook(bytes: Buffer) {
  checkArchive(bytes);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } catch {
    throw new AppError(400, "Não foi possível ler a planilha XLSX.");
  }
  let total = 0;
  const sheets = workbook.worksheets.map((sheet) => {
    assert(sheet.columnCount <= 100, 413, "Use planilhas com até 100 colunas.");
    const headers = Array.from({ length: sheet.columnCount }, (_, i) =>
      cellText(sheet.getRow(1).getCell(i + 1).value).trim(),
    );
    const rows: { rowNumber: number; cells: string[] }[] = [];
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      const cells = headers.map((_, i) => cellText(row.getCell(i + 1).value));
      assert(
        cells.every((c) => c.length <= 20000),
        413,
        "Há uma resposta muito longa na planilha.",
      );
      if (cells.some((c) => c.trim())) {
        total++;
        assert(
          total <= 5000,
          413,
          "A planilha deve conter até 5.000 registros no total.",
        );
        rows.push({ rowNumber: number, cells });
      }
    });
    return { name: sheet.name, headers, rows };
  });
  assert(
    sheets.length > 0 && total > 0,
    422,
    "A planilha não contém respostas.",
  );
  return sheets;
}
export function suggestedMapping(headers: string[]): Mapping {
  const match = (pattern: RegExp) => {
    const index = headers.findIndex((h) => pattern.test(normalizeName(h)));
    return index < 0 ? null : index;
  };
  return {
    name: match(/^nome( completo)?\s*:?$/) ?? -1,
    birthDate: match(/(nascimento|birth)/) ?? -1,
    phone: match(/(celular|telefone|whatsapp)/) ?? -1,
    city: match(/cidade/),
    sex: match(/^sexo/),
    shirt: match(/camiseta/),
  };
}
export function mappedValues(cells: string[], mapping: Mapping): Values {
  const values = Object.fromEntries(
    fields.map((f) => [
      f,
      mapping[f] === null ? "" : (cells[mapping[f]!] ?? ""),
    ]),
  ) as Values;
  // Preserve raw values separately; mapped date is editable in an ISO date input.
  values.birthDate = normalizeBirth(values.birthDate) || values.birthDate;
  return values;
}
