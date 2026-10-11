import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Organization } from "../lib/types";
import { Field, Notice } from "./ui";

function formatCnpj(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 14)
    .replace(/^(.{2})(.)/, "$1.$2")
    .replace(/^(.{2})\.(.{3})(.)/, "$1.$2.$3")
    .replace(/^(.{2})\.(.{3})\.(.{3})(.)/, "$1.$2.$3/$4")
    .replace(/^(.{2})\.(.{3})\.(.{3})\/(.{4})(.)/, "$1.$2.$3/$4-$5");
}

function formatPostalCode(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");
}

const optionalFields = [
  "cnpj",
  "legalName",
  "tradeName",
  "postalCode",
  "street",
  "number",
  "complement",
  "neighborhood",
] as const;
export function OrganizationForm({
  organization,
  onSaved,
  onClose,
  onBusyChange,
  scope = "platform",
}: {
  organization: Organization | null;
  onSaved: () => void;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  scope?: "platform" | "organization";
}) {
  const [values, setValues] = useState(() => ({
    name: organization?.name ?? "",
    kind: organization?.kind ?? "PARISH",
    city: organization?.city ?? "",
    state: organization?.state ?? "PR",
    contact: organization?.contact ?? "",
    cnpj: formatCnpj(organization?.cnpj ?? ""),
    legalName: organization?.legalName ?? "",
    tradeName: organization?.tradeName ?? "",
    postalCode: formatPostalCode(organization?.postalCode ?? ""),
    street: organization?.street ?? "",
    number: organization?.number ?? "",
    complement: organization?.complement ?? "",
    neighborhood: organization?.neighborhood ?? "",
  }));
  const [active, setActive] = useState(organization?.active ?? true);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [logoError, setLogoError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!logo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(logo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);
  function change(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }
  function discardLogo() {
    setLogo(null);
    setLogoError("");
    if (input.current) input.current.value = "";
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current || logoError) return;
    saving.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    const data = {
      ...values,
      ...Object.fromEntries(
        optionalFields.map((key) => [key, values[key].trim() || null]),
      ),
      ...(organization && scope === "platform" ? { active } : {}),
    };
    try {
      let body: unknown = data;
      if (logo) {
        const form = new FormData();
        form.append("data", JSON.stringify(data));
        form.append("logo", logo);
        body = form;
      }
      await api(
        `${scope === "platform" ? "/admin/organizations" : "/organizations"}${organization ? `/${organization.id}` : ""}`,
        {
          method: organization ? "PUT" : "POST",
          body,
        },
      );
      onSaved();
    } catch (error) {
      const fields =
        error instanceof ApiError ? error.fields?.fieldErrors : undefined;
      setError(
        fields
          ? Object.values(fields).flat().join(" ") || (error as Error).message
          : (error as Error).message,
      );
    } finally {
      saving.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  const textField = (
    key: keyof typeof values,
    label: string,
    maxLength: number,
    required = false,
    autoComplete?: string,
  ) => (
    <Field label={label} required={required}>
      <input
        id={`organization-${key}`}
        name={key}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        value={values[key]}
        onChange={(e) => change(key, e.target.value)}
      />
    </Field>
  );
  return (
    <form className="panel organization-form" onSubmit={save}>
      <h2>{organization ? "Editar organização" : "Nova organização"}</h2>
      {error && <Notice>{error}</Notice>}
      <fieldset disabled={busy}>
        <div className="form-grid">
          {textField("name", "Nome", 150, true)}
          <Field label="Tipo">
            <select
              id="organization-kind"
              name="kind"
              value={values.kind}
              onChange={(e) => change("kind", e.target.value)}
            >
              <option value="PARISH">Paróquia</option>
              <option value="COMMUNITY">Comunidade</option>
              <option value="ORGANIZATION">Organização</option>
            </select>
          </Field>
          {textField("contact", "Contato", 200, true)}
        </div>
        <h3>Informações complementares</h3>
        <p className="muted">
          Preencha os dados disponíveis para completar a ficha da organização.
        </p>
        <div className="form-grid">
          <Field label="CNPJ">
            <input
              id="organization-cnpj"
              name="cnpj"
              maxLength={18}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="00.000.000/0000-00"
              value={values.cnpj}
              onChange={(e) => change("cnpj", formatCnpj(e.target.value))}
            />
          </Field>
          {textField("legalName", "Razão social", 200, false, "organization")}
          {textField("tradeName", "Nome fantasia", 150)}
        </div>
        <h3>Endereço</h3>
        <div className="form-grid">
          <Field label="CEP">
            <input
              id="organization-postalCode"
              name="postalCode"
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={9}
              placeholder="00000-000"
              value={values.postalCode}
              onChange={(e) =>
                change("postalCode", formatPostalCode(e.target.value))
              }
            />
          </Field>
          {textField("street", "Rua / avenida", 200, false, "address-line1")}
          {textField("number", "Número", 30)}
          {textField("complement", "Complemento", 150, false, "address-line2")}
          {textField("neighborhood", "Bairro", 100)}
          {textField("city", "Cidade", 100, true, "address-level2")}
          <Field label="UF" required>
            <input
              id="organization-state"
              name="state"
              autoComplete="address-level1"
              required
              maxLength={2}
              pattern="[A-Z]{2}"
              value={values.state}
              onChange={(e) => change("state", e.target.value.toUpperCase())}
            />
          </Field>
        </div>
        <h3>Logotipo</h3>
        <div className="organization-logo">
          {(preview || organization?.logoUrl) && (
            <img
              src={preview || organization?.logoUrl || ""}
              alt="Prévia do logotipo"
              onError={() => {
                if (logo)
                  setLogoError(
                    "Não foi possível abrir o logotipo. Escolha outra imagem.",
                  );
              }}
            />
          )}
          <Field label="Arquivo do logotipo (opcional)">
            <input
              ref={input}
              id="organization-logo"
              name="logo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-describedby="organization-logo-help"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setLogo(null);
                setLogoError("");
                if (!file) return;
                if (
                  !["image/jpeg", "image/png", "image/webp"].includes(file.type)
                ) {
                  setLogoError("Escolha um logotipo JPEG, PNG ou WebP.");
                  return;
                }
                if (file.size > 10 * 1024 * 1024) {
                  setLogoError("Escolha um logotipo com até 10 MB.");
                  return;
                }
                setLogo(file);
              }}
            />
            <small id="organization-logo-help">
              JPEG, PNG ou WebP · Até 10 MB · A imagem será mantida inteira.
            </small>
          </Field>
          {(logo || logoError) && (
            <button type="button" className="text-button" onClick={discardLogo}>
              Descartar arquivo selecionado
            </button>
          )}
          {organization?.logoUrl && !logo && (
            <small>
              O logotipo atual será mantido se você não escolher outro arquivo.
            </small>
          )}
        </div>
        {logoError && <Notice>{logoError}</Notice>}
        {organization && scope === "platform" && (
          <label className="checkbox">
            <input
              name="active"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Organização ativa
          </label>
        )}
        <div className="button-row">
          <button disabled={Boolean(logoError)} className="button primary">
            {busy
              ? "Salvando…"
              : organization
                ? "Salvar organização"
                : "Cadastrar organização"}
          </button>
          <button type="button" className="button outline" onClick={onClose}>
            Fechar
          </button>
        </div>
      </fieldset>
    </form>
  );
}
