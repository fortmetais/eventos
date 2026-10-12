import { guardianRelationships } from "@fac/form-layout";
import { Field } from "./ui";

export function GuardianRelationshipSelect({
  value = "",
  onChange,
  error,
  label = "Parentesco do responsável",
  name = "guardianRelationship",
}: {
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  label?: string;
  name?: string;
}) {
  const legacy = value && !guardianRelationships.includes(value);
  return (
    <Field
      label={label}
      required
      error={error}
      hint="Selecione o vínculo do responsável legal que assinará a autorização."
    >
      <select
        name={name}
        value={value}
        required
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione</option>
        {legacy && <option value={value}>{value} (resposta anterior)</option>}
        {guardianRelationships.map((relationship) => (
          <option key={relationship} value={relationship}>
            {relationship}
          </option>
        ))}
      </select>
    </Field>
  );
}
