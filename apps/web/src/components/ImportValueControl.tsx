import type {
  EventImportTarget,
  EventImportValue,
} from "../lib/participant-imports";
import { formatBrazilianPhone } from "../lib/phone";
import { CityAutocomplete } from "./CityAutocomplete";
import { ParishAutocomplete } from "./ParishAutocomplete";

function text(value: EventImportValue) {
  return value == null
    ? ""
    : Array.isArray(value)
      ? value.join("; ")
      : String(value);
}

function phonePresentation(value: string) {
  const digits = value.replace(/\D/g, "");
  // Preserve malformed originals in full until the organizer explicitly edits them.
  if (
    /[^\d+\s().-]/.test(value) ||
    (digits.length > 11 &&
      !(digits.startsWith("55") && [12, 13].includes(digits.length)))
  )
    return value;
  return formatBrazilianPhone(value);
}

/** Same catalogs and masks used by the public form, without changing imported originals. */
export function ImportValueControl({
  target,
  value,
  onChange,
  disabled = false,
}: {
  target: EventImportTarget;
  value: EventImportValue;
  onChange: (value: EventImportValue) => void;
  disabled?: boolean;
}) {
  if (target.type === "text" && target.id === "question:cidade")
    return (
      <CityAutocomplete
        label={target.label}
        name={target.id}
        value={text(value)}
        onChange={onChange}
        disabled={disabled}
      />
    );
  if (target.type === "text" && target.id === "question:paroquia")
    return (
      <ParishAutocomplete
        label={target.label}
        name={target.id}
        value={text(value)}
        onChange={onChange}
        disabled={disabled}
      />
    );
  if (target.id === "phone")
    return (
      <input
        aria-label={target.label}
        name={target.id}
        type="tel"
        inputMode="tel"
        placeholder="(00) 00000-0000"
        value={phonePresentation(text(value))}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
      />
    );
  if (target.type === "boolean")
    return (
      <select
        aria-label={target.label}
        name={target.id}
        value={value === true ? "true" : value === false ? "false" : ""}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? null : event.target.value === "true",
          )
        }
      >
        <option value="">Não informado</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  if (target.type === "multiple") {
    const options = target.options ?? [];
    const selected = (Array.isArray(value) ? value : []).map(
      (item) =>
        options.find((option) => option.value === item || option.label === item)
          ?.value ?? item,
    );
    return (
      <fieldset
        className="import-choice-options"
        aria-label={target.label}
        disabled={disabled}
      >
        <legend className="sr-only">{target.label}</legend>
        <div className="check-options">
          {options.map((option) => (
            <label className="checkbox" key={option.value}>
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={(event) => {
                  if (!event.target.checked)
                    onChange(selected.filter((item) => item !== option.value));
                  else if (option.value === target.exclusiveOption)
                    onChange([option.value]);
                  else
                    onChange([
                      ...selected.filter(
                        (item) => item !== target.exclusiveOption,
                      ),
                      option.value,
                    ]);
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (target.type === "single") {
    const options = target.options ?? [];
    const current =
      options.find((option) => option.value === value || option.label === value)
        ?.value ?? text(value);
    return (
      <select
        aria-label={target.label}
        name={target.id}
        value={current}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">Não informado</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      aria-label={target.label}
      name={target.id}
      type={
        target.type === "date"
          ? "date"
          : target.type === "number"
            ? "number"
            : "text"
      }
      step={target.type === "number" ? "any" : undefined}
      value={text(value)}
      disabled={disabled}
      onChange={(event) =>
        onChange(
          target.type === "number"
            ? event.target.value === ""
              ? null
              : Number(event.target.value)
            : event.target.value,
        )
      }
    />
  );
}
