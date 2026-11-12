import { useId, useState, type ReactNode, type Ref } from "react";
import { ChevronDown } from "lucide-react";

export function DetailSection({
  title,
  summary,
  open,
  onOpenChange,
  buttonRef,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buttonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  return (
    <section className="registration-detail-section">
      <h3>
        <button
          ref={buttonRef}
          type="button"
          className="registration-detail-section-trigger"
          id={`${id}-heading`}
          aria-label={title}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => onOpenChange(!open)}
        >
          <span className="registration-detail-section-label">
            <span>{title}</span>
            {summary && <small aria-hidden="true">{summary}</small>}
          </span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </h3>
      <div
        className="registration-detail-section-panel"
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-heading`}
        hidden={!open}
        onInvalidCapture={(event) => {
          if (open) return;
          event.preventDefault();
          setInvalid(true);
          onOpenChange(true);
          const field = event.target;
          requestAnimationFrame(() => {
            if (field instanceof HTMLElement && field.isConnected)
              field.focus();
          });
        }}
        onInputCapture={() => setInvalid(false)}
        onChangeCapture={() => setInvalid(false)}
      >
        {invalid && (
          <p className="field-error" role="alert">
            Confira os campos desta seção.
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
