import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, Church, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { Organization, RegistrationStatus } from "../lib/types";
import { statusLabels } from "../lib/types";
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
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
  return (
    <div
      className={`notice ${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Field({
  label,
  children,
  error,
  required,
  hint,
  group = false,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  required?: boolean;
  hint?: string;
  group?: boolean;
}) {
  const Container = group ? "div" : "label";
  return (
    <Container
      className={`field ${error ? "invalid" : ""}`}
      role={group ? "group" : undefined}
      aria-label={group ? label : undefined}
    >
      <span>
        {label}
        {required && <b aria-label="obrigatório"> *</b>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
      {error && <small className="field-error">{error}</small>}
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
  organization: Pick<Organization, "name" | "logoUrl">;
}) {
  return (
    <div className="org-avatar">
      {organization.logoUrl ? (
        <img src={organization.logoUrl} alt="" />
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
