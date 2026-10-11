export type FormKind = "VOLUNTEER" | "CAMPER";
export type StepId = "identification" | "photo" | "about" | "care" | "review";
export interface FormLayout {
  version: 1;
  kind: FormKind;
  steps: { step: StepId; fields: { key: string; hidden: boolean }[] }[];
}
export interface LayoutForm {
  askCpf: boolean;
  askAddress: boolean;
  askShirt: boolean;
  questions: { id: string; label: string; required: boolean }[];
  volunteer?: unknown;
  layout?: FormLayout;
}
export interface FormField {
  key: string;
  label: string;
  step: StepId;
  required: boolean;
  protectedReason?: string;
  detail?: string;
}
export const stepIds: StepId[];
export const stepLabels: string[];
export const healthFields: readonly (readonly [
  "hasAllergies" | "hasMedication" | "hasDiet" | "hasCondition" | "hasNeeds",
  "allergies" | "medication" | "diet" | "condition" | "needs",
  string,
])[];
export function fieldCatalog(form: LayoutForm, kind: FormKind): FormField[];
export function defaultLayout(form: LayoutForm, kind: FormKind): FormLayout;
export function editableLayout(form: LayoutForm, kind: FormKind): FormLayout;
export function validateLayout(form: LayoutForm): string[];
export function syncLegacyFlags<T extends LayoutForm>(form: T): T;
export function orderedFields(
  form: LayoutForm,
  kind: FormKind,
  step: StepId,
  minor?: boolean,
): FormField[];
export function fieldVisible(
  form: LayoutForm,
  kind: FormKind,
  key: string,
): boolean;
export function sanitizeHidden<P extends object, H extends object>(
  form: LayoutForm,
  kind: FormKind,
  payload: P,
  health: H,
): { payload: P; health: H };
