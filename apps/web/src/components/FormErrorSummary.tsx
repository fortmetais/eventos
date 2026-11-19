import { useEffect, useRef, useState } from "react";
type InvalidControl = { id: string; label: string };
export function FormErrorSummary({ errors, attempt = 0 }: { errors: Record<string, string>; attempt?: number }) {
  const hasErrors = Object.values(errors).some(Boolean);
  const summary = useRef<HTMLDivElement>(null);
  const [controls, setControls] = useState<InvalidControl[]>([]);
  useEffect(() => {
    const element = summary.current;
    if (!element || !hasErrors) return;
    const form = element.closest("form");
    const nodes = form?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input[aria-invalid="true"],select[aria-invalid="true"],textarea[aria-invalid="true"]',
    );
    setControls(Array.from(nodes ?? []).filter((node) => node.id).map((node) => ({
      id: node.id,
      label: (node.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ") ||
        node.getAttribute("aria-label") || node.labels?.[0]?.textContent || "Conferir campo").replace(/\*/g, "").trim(),
    })));
  }, [errors, hasErrors]);
  useEffect(() => {
    if (hasErrors) summary.current?.focus({ preventScroll: true });
  }, [attempt, hasErrors]);
  if (!hasErrors) return null;
  return <div className="form-error-summary" ref={summary} tabIndex={-1} role="alert">
    <strong>Confira os campos indicados antes de continuar.</strong>
    {controls.length > 0 ? <ul>{controls.map((control) => <li key={control.id}>
      <a href={`#${control.id}`} onClick={(event) => {
        event.preventDefault();
        const target = document.getElementById(control.id);
        target?.focus();
        target?.scrollIntoView?.({ block: "center", behavior: "auto" });
      }}>{control.label}</a>
    </li>)}</ul> : <p>As orientações para correção aparecem junto aos campos.</p>}
  </div>;
}
