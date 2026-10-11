import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { date, dateTime } from "../lib/types";
import type { GuardianForm, GuardianRecord } from "../lib/guardian";
import { BackLink, Field, Loading, Notice } from "../components/ui";
import {
  SignaturePad,
  SignatureImage,
  type Signature,
} from "../components/SignaturePad";
export function GuardianAuthorization() {
  const { authorizationId } = useParams();
  return <GuardianFormPage key={authorizationId} id={authorizationId!} />;
}
function GuardianFormPage({ id }: { id: string }) {
  const [record, setRecord] = useState<GuardianRecord | null>(null);
  const [form, setForm] = useState<GuardianForm | null>(null);
  const [signature, setSignature] = useState<Signature>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [token] = useState(() => {
    const key = `fac:guardian:${id}`;
    const value = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (value && /^[A-Za-z0-9_-]{43}$/.test(value)) {
      sessionStorage.setItem(key, value);
      history.replaceState(history.state, "", window.location.pathname);
      return value;
    }
    return sessionStorage.getItem(key) ?? "";
  });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token))
          throw new Error(
            "Abra o link completo recebido por e-mail ou WhatsApp.",
          );
        const data = await api<GuardianRecord>(
          `/public/guardian-authorizations/${id}/view`,
          { method: "POST", body: { token }, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setRecord(data);
        setForm(
          data.signedData ?? {
            name: data.snapshot.guardianName,
            cpf: "",
            relationship: data.snapshot.guardianRelationship,
            phone: data.snapshot.guardianPhone,
            email: data.snapshot.guardianEmail,
            city: "",
            participantCity: data.snapshot.participantCity,
            participantCpf: data.snapshot.participantCpf,
            familyName: data.snapshot.familyName,
            familyPhone: data.snapshot.familyPhone,
            medication: "",
            allergies: "",
            ...data.health,
            participationAccepted: false,
            responsibilityAccepted: false,
            privacyAccepted: false,
            imageAuthorized: false,
          },
        );
        setSignature(data.signature ?? []);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [id, token]);
  function update<K extends keyof GuardianForm>(
    key: K,
    value: GuardianForm[K],
  ) {
    setForm((f) => f && { ...f, [key]: value });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!signature.length) {
      setError("Desenhe sua assinatura antes de enviar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setRecord(
        await api<GuardianRecord>(
          `/public/guardian-authorizations/${id}/sign`,
          { method: "POST", body: { token, data: { ...form, signature } } },
        ),
      );
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const input = (
    key: keyof GuardianForm,
    label: string,
    type = "text",
    required = true,
  ) => (
    <Field label={label} required={required}>
      <input
        type={type}
        required={required}
        maxLength={key.includes("cpf") || key === "cpf" ? 20 : 254}
        value={String(form?.[key] ?? "")}
        onChange={(e) => update(key, e.target.value as never)}
      />
    </Field>
  );
  if (loading) return <Loading />;
  return (
    <div className="narrow-shell guardian-page">
      <BackLink to="/eventos">Eventos</BackLink>
      {error && <Notice>{error}</Notice>}
      {record && form && (
        <section className="panel">
          <span className="eyebrow">{record.snapshot.event.organization}</span>
          <h1>Autorização do responsável</h1>
          <h2>{record.snapshot.event.name}</h2>
          <p>
            {date(record.snapshot.event.startsAt)} até{" "}
            {date(record.snapshot.event.endsAt)} ·{" "}
            {record.snapshot.event.location}, {record.snapshot.event.city}
          </p>
          <p>
            Protocolo: <strong>{record.protocol}</strong>
          </p>
          <h3>Identificação do participante</h3>
          <dl className="guardian-identity">
            <dt>Nome completo</dt>
            <dd>{record.snapshot.participantName}</dd>
            <dt>Nascimento</dt>
            <dd>{date(record.snapshot.birthDate)}</dd>
            <dt>Celular</dt>
            <dd>{record.snapshot.participantPhone}</dd>
            <dt>Equipe / participação</dt>
            <dd>{record.snapshot.team}</dd>
          </dl>
          {record.signedAt ? (
            <>
              <Notice kind="success">
                Termo assinado em {dateTime(record.signedAt)}. A organização
                recebeu sua autorização.
              </Notice>
              <dl className="guardian-identity">
                {Object.entries({
                  Responsável: record.signedData?.name,
                  CPF: record.signedData?.cpf,
                  Parentesco: record.signedData?.relationship,
                  Telefone: record.signedData?.phone,
                  "E-mail": record.signedData?.email,
                  "Cidade da assinatura": record.signedData?.city,
                  "Cidade do participante": record.signedData?.participantCity,
                  "CPF do participante":
                    record.signedData?.participantCpf || "Não informado",
                  "Contato familiar": record.signedData?.familyName,
                  "Celular do contato": record.signedData?.familyPhone,
                  Medicamentos:
                    record.health.hasMedication === undefined
                      ? "Não perguntado"
                      : record.health.hasMedication
                        ? record.health.medication
                        : "Não",
                  Alergias:
                    record.health.hasAllergies === undefined
                      ? "Não perguntado"
                      : record.health.hasAllergies
                        ? record.health.allergies
                        : "Não",
                  "Imagem e voz": record.signedData?.imageAuthorized
                    ? "Autorizadas"
                    : "Não autorizadas",
                }).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="terms-text">{record.termsText}</div>
              <SignatureImage value={record.signature ?? []} />
              <p className="receipt-hash">Comprovante: {record.receiptHash}</p>
              <button
                className="button outline no-print"
                onClick={() => window.print()}
              >
                Imprimir / salvar comprovante em PDF
              </button>
            </>
          ) : (
            <form onSubmit={submit}>
              <p>
                Confira os dados do menor e preencha como pai, mãe ou
                responsável legal. Você não precisa criar uma conta.
              </p>
              <div className="form-grid">
                {input("participantCity", "Cidade do participante")}
                {input(
                  "participantCpf",
                  "CPF do participante (opcional)",
                  "text",
                  false,
                )}
                {input("familyName", "Contato familiar / emergência")}
                {input("familyPhone", "Celular do contato com DDD", "tel")}
              </div>
              <h3>Saúde do participante</h3>
              {(
                [
                  ["hasMedication", "medication", "Usa medicamento contínuo?"],
                  [
                    "hasAllergies",
                    "allergies",
                    "Possui alergia a medicamentos, insetos ou alimentos?",
                  ],
                ] as const
              ).map(([flag, detail, label]) => (
                <div key={flag}>
                  <Field label={label} required>
                    <select
                      value={
                        form[flag] === undefined
                          ? ""
                          : form[flag]
                            ? "sim"
                            : "nao"
                      }
                      onChange={(e) =>
                        update(
                          flag,
                          e.target.value === ""
                            ? undefined
                            : e.target.value === "sim",
                        )
                      }
                    >
                      <option value="">Selecione</option>
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </Field>
                  {form[flag] && (
                    <Field label="Qual?" required>
                      <textarea
                        required
                        minLength={2}
                        maxLength={2000}
                        value={form[detail]}
                        onChange={(e) => update(detail, e.target.value)}
                      />
                    </Field>
                  )}
                </div>
              ))}
              <h3>Identificação do responsável legal</h3>
              <div className="form-grid">
                {input("name", "Nome completo do responsável")}
                {input("cpf", "CPF do responsável")}
                {input("relationship", "Parentesco / vínculo legal")}
                {input("phone", "Celular do responsável com DDD", "tel")}
                {input(
                  "email",
                  "E-mail do responsável (opcional)",
                  "email",
                  false,
                )}
                {input("city", "Cidade da assinatura")}
              </div>
              <h3>Termo de responsabilidade e autorização</h3>
              <div className="terms-text">{record.termsText}</div>
              {(
                [
                  [
                    "participationAccepted",
                    "Declaro ser responsável legal e autorizo a participação e permanência do menor no evento.",
                  ],
                  [
                    "responsibilityAccepted",
                    "Li o termo de responsabilidade e confirmei as informações de saúde do participante.",
                  ],
                  [
                    "privacyAccepted",
                    "Concordo com o tratamento dos dados para as finalidades descritas no termo.",
                  ],
                  [
                    "imageAuthorized",
                    "Autorizo o uso de imagem e voz do menor conforme o termo (opcional).",
                  ],
                ] as const
              ).map(([key, label]) => (
                <label className="checkbox" key={key}>
                  <input
                    type="checkbox"
                    required={key !== "imageAuthorized"}
                    checked={form[key]}
                    onChange={(e) => update(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
              <h3>Assinatura do responsável</h3>
              <SignaturePad value={signature} onChange={setSignature} />
              <p className="muted">
                Ao assinar, serão registrados data, horário e dados do acesso
                junto ao termo. Link válido até {dateTime(record.expiresAt)}.
              </p>
              <button className="button primary full" disabled={busy}>
                {busy
                  ? "Registrando assinatura…"
                  : "Assinar e enviar autorização"}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
