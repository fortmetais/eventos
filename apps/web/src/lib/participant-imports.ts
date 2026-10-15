export const importFields = [
  "name",
  "birthDate",
  "phone",
  "city",
  "sex",
  "shirt",
] as const;
export type ImportField = (typeof importFields)[number];
export type ImportValues = Record<ImportField, string>;
export type ImportMapping = Record<ImportField, number | null>;
export const importLabels: Record<ImportField, string> = {
  name: "Nome completo",
  birthDate: "Data de nascimento",
  phone: "Celular",
  city: "Cidade",
  sex: "Sexo",
  shirt: "Camiseta",
};
export type OriginalAnswers = { headers: string[]; cells: string[] };
export type ImportRow = {
  id: string;
  rowNumber: number;
  values: ImportValues;
  original: OriginalAnswers;
  decision: "KEEP" | "DISCARD" | "REPLACE" | "PENDING";
  replaceId: string | null;
  reviewed: boolean;
  pending: boolean;
  errors: string[];
  warnings: string[];
  duplicateRows: number[];
  candidates: { id: string; name: string; birthDate: string; phone: string }[];
};
export type ImportBatch = {
  id: string;
  fileName: string;
  sheet: string;
  state: "PREVIEW" | "CONFIRMED";
  page: number;
  pageSize: number;
  summary: {
    total: number;
    selected: number;
    discarded: number;
    pending: number;
  };
  rows: ImportRow[];
};
export type PreviousParticipant = {
  id: string;
  name: string;
  birthDate: string;
  phone: string;
  city: string | null;
  sex: string | null;
  shirt: string | null;
  responses?: OriginalAnswers;
  sourceRows?: {
    rowNumber: number;
    original: OriginalAnswers;
    values: ImportValues;
    batch: { id: string; fileName: string; sheet: string; createdAt: string };
  }[];
};
