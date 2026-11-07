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

export type EventImportValue = string | string[] | boolean | number | null;
export type EventImportTarget = {
  id: string;
  label: string;
  type: "text" | "date" | "boolean" | "single" | "multiple" | "number";
  options?: { value: string; label: string }[];
  historical?: boolean;
  hidden?: boolean;
  exclusiveOption?: string;
};
export type EventImportMapping = {
  column: number;
  target: string;
  confirmed: boolean;
};
export type EventImportRule = {
  target: string;
  from: string;
  to: EventImportValue;
};
export type EventImportDestination = {
  campaignId: string;
  eventId: string;
  eventName: string;
  eventStatus: string;
  forms: { id: string; version: number; publishedAt?: string | null }[];
};
export type EventImportRow = {
  id: string;
  rowNumber: number;
  revision: number;
  executionState: "PENDING" | "IMPORTED" | "DISCARDED";
  decision: "KEEP" | "DISCARD" | "REPLACE" | "PENDING";
  reviewed: boolean;
  ready?: boolean;
  needsReview?: boolean;
  overrides: Record<string, EventImportValue>;
  original: OriginalAnswers;
  payload: Record<string, unknown> & {
    name?: string;
    birthDate?: string;
    phone?: string;
    answers?: Record<string, EventImportValue>;
  };
  historical: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  pending: string[];
  duplicateRows: number[];
  relatedRows?: {
    id: string;
    rowNumber: number;
    payload: EventImportRow["payload"];
    executionState: EventImportRow["executionState"];
    registrationId?: string | null;
    distinctReason?: string | null;
  }[];
  candidates: {
    id: string;
    protocol?: string;
    name: string;
    birthDate: string;
    phone: string;
    status: string;
    origin: string;
    same: boolean;
    sources?: {
      batchId: string;
      rowId: string;
      rowNumber: number;
      fileName: string;
      sheet: string;
    }[];
  }[];
  replaceId: string | null;
  registrationId?: string | null;
  distinctReason?: string;
};
export type EventImportBatch = {
  id: string;
  mode: "EVENT";
  state:
    "MAPPING" | "REVIEW" | "PARTIALLY_CONFIRMED" | "CONFIRMED" | "CANCELLED";
  step: number;
  revision: number;
  fileName: string;
  sheet: string;
  campaign: {
    id: string;
    event: { id: string; name: string; startsAt: string };
  };
  formVersionId: string;
  headers: string[];
  columns?: {
    column: number;
    samples: string[];
    values: { value: string; count: number }[];
    distinctCount?: number;
    truncated?: boolean;
  }[];
  catalog: EventImportTarget[];
  mapping: EventImportMapping[];
  rules: EventImportRule[];
  summary: {
    total: number;
    selected: number;
    discarded: number;
    pending: number;
    imported: number;
  };
  rows: EventImportRow[];
  page: number;
  pageSize: number;
  view?: "all" | "duplicates";
  filteredTotal?: number;
  duplicateCount?: number;
};
export type ImportMetadata = {
  ready: boolean;
  eventReady?: boolean;
  prefillEnabled: boolean;
  destinations?: EventImportDestination[];
  batches: {
    id: string;
    fileName: string;
    sheet: string;
    state: string;
    mode?: string;
    campaignId?: string | null;
    step?: number;
    revision?: number;
    _count: { rows: number };
  }[];
};
