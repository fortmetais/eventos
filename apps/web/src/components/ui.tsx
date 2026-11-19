import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useId,
  type AriaAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Church,
  Info,
  LoaderCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Organization, RegistrationStatus } from "../lib/types";
import { statusLabels } from "../lib/types";
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} aria-hidden="true" />
      Carregando…
    </div>
  );
}
export function Notice({
  children,
  kind = "error",
}: {
  children: ReactNode;
  kind?: "error" | "success" | "info";
}) {
  const Icon =
    kind === "success" ? CheckCircle2 : kind === "info" ? Info : AlertCircle;
  return (
    <div
      className={`notice ${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon size={18} aria-hidden="true" focusable="false" />
      <div>{children}</div>
    </div>
  );
}

type FieldChildProps = AriaAttributes & {
  id?: string;
  type?: string;
  children?: ReactNode;
};
function fieldControl(node: ReactElement<FieldChildProps>) {
  return (
    typeof node.type === "string" &&
    ["input", "select", "textarea"].includes(node.type) &&
    !(node.type === "input" && node.props.type === "hidden")
  );
}
// Inspect only HTML and fragments; composite controls keep their own ARIA contract.
function fieldControls(children: ReactNode): ReactElement<FieldChildProps>[] {
  const controls: ReactElement<FieldChildProps>[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<FieldChildProps>(child)) return;
    if (fieldControl(child)) controls.push(child);
    else if (child.type === Fragment || typeof child.type === "string")
      controls.push(...fieldControls(child.props.children));
  });
  return controls;
}
function describeField(
  existing: string | undefined,
  ...ids: (string | undefined)[]
) {
  return (
    [
      ...new Set([
        ...(existing?.split(/\s+/).filter(Boolean) ?? []),
        ...ids.filter(Boolean),
      ]),
    ].join(" ") || undefined
  );
}
function associateField(
  children: ReactNode,
  control: ReactElement<FieldChildProps>,
  attributes: FieldChildProps,
): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<FieldChildProps>(child)) return child;
    if (child === control) return cloneElement(child, attributes);
    if (child.type === Fragment || typeof child.type === "string") {
      return cloneElement(child, {
        children: associateField(child.props.children, control, attributes),
      });
    }
    return child;
  });
}
export function Field({
  label,
  children,
  error,
  required,
  hint,
  group = false,
  id,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  required?: boolean;
  hint?: string;
  group?: boolean;
  id?: string;
}) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  const hintId = hint ? `${generatedId}-hint` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const controls = group ? [] : fieldControls(children);
  const control = controls.length === 1 ? controls[0] : undefined;
  const controlId = control
    ? control.props.id || id || `${generatedId}-control`
    : undefined;
  const describedChildren = control
    ? associateField(children, control, {
        id: controlId,
        "aria-labelledby":
          control.props["aria-labelledby"] ||
          (control.props["aria-label"] ? undefined : labelId),
        "aria-describedby": describeField(
          control.props["aria-describedby"],
          hintId,
          errorId,
        ),
        "aria-invalid": error ? true : control.props["aria-invalid"],
      })
    : children;
  const Container = group ? "div" : "label";
  return (
    <Container
      className={`field ${error ? "invalid" : ""}`}
      id={group ? id : undefined}
      htmlFor={group ? undefined : controlId}
      role={group ? "group" : undefined}
      aria-label={group ? label : undefined}
      aria-describedby={
        group ? describeField(undefined, hintId, errorId) : undefined
      }
      aria-invalid={group && error ? true : undefined}
    >
      <span id={labelId}>
        {label}
        {required && <b aria-label="obrigatório"> *</b>}
      </span>
      {describedChildren}
      {hint && (
        <small className="field-hint" id={hintId}>
          {hint}
        </small>
      )}
      {error && (
        <small className="field-error" id={errorId}>
          {error}
        </small>
      )}
    </Container>
  );
}
export function Badge({ status }: { status: RegistrationStatus }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      {statusLabels[status]}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Church size={34} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function OrganizationAvatar({
  organization,
}: {
  organization: Pick<Organization, "name" | "logoUrl" | "logoThumbnailUrl">;
}) {
  return (
    <div className="org-avatar">
      {organization.logoUrl ? (
        <img
          src={organization.logoThumbnailUrl || organization.logoUrl}
          alt=""
          decoding="async"
          loading="lazy"
        />
      ) : (
        <Church size={25} />
      )}
    </div>
  );
}
export function BackLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="back-link" to={to}>
      <ArrowRight size={15} style={{ transform: "rotate(180deg)" }} />
      {children}
    </Link>
  );
}
