import { emergencyRelationships } from "@fac/form-layout";
import { Field } from "./ui";

export function EmergencyRelationshipSelect({
  value = "",
  onChange,
  label = "Parentesco / relação",
  required = true,
  error,
}: {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  error?: string;
}) {
  const legacy = value && !emergencyRelationships.includes(value);
  return (
    <Field label={label} required={required} error={error}>
      <select
        name="emergencyRelationship"
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione</option>
        {legacy && <option value={value}>{value} (resposta anterior)</option>}
        {emergencyRelationships.map((relationship) => (
          <option key={relationship} value={relationship}>
            {relationship}
          </option>
        ))}
      </select>
    </Field>
  );
}
