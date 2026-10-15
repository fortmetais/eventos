import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Check, CheckCircle2, ShieldCheck } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useRemote } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import type {
  Draft,
  DraftCredential,
  Health,
  Payload,
  PublicCampaign,
} from "../lib/types";
import { date } from "../lib/types";
import { formatBrazilianPhone } from "../lib/phone";
import { BackLink, Field, Loading, Notice } from "../components/ui";
import { PhotoPicker } from "../components/PhotoPicker";
import { SignedPhoto } from "../components/SignedPhoto";
import { ShirtSizeGuide } from "../components/ShirtSizeGuide";
import { RegistrationBanner } from "../components/RegistrationBanner";
import { EmergencyRelationshipSelect } from "../components/EmergencyRelationshipSelect";
import { GuardianRelationshipSelect } from "../components/GuardianRelationshipSelect";
import { Questions } from "../components/Questions";
import type { GuardianSummary } from "../lib/guardian";
import {
  orderedFields,
  fieldVisible,
  sanitizeHidden,
  stepIds,
} from "@fac/form-layout";
import { RegistrationFields } from "../components/RegistrationFields";
import {
  prefillIdentity,
  prefillIdentityKey,
  mergePrefill,
} from "../lib/registration-prefill";
const steps = [
  "Identificação",
  "Sua foto",
  "Sobre você",
  "Saúde e emergência",
  "Revisão e envio",
];
const healthQuestions = [
  ["hasAllergies", "allergies", "Possui alguma alergia?"],
  ["hasMedication", "medication", "Usa medicamentos regularmente?"],
  ["hasDiet", "diet", "Possui restrição alimentar?"],
  [
    "hasCondition",
    "condition",
    "Há uma condição de saúde que precisamos conhecer?",
  ],
  ["hasNeeds", "needs", "Precisa de algum apoio ou adaptação?"],
] as const;
export function Registration() {
  const { campaignId } = useParams();
  const campaign = useRemote<PublicCampaign>(`/public/campaigns/${campaignId}`);
  const auth = useAuth();
  const [credential, setCredential] = useState<DraftCredential | null>(null);
  const [payload, setPayload] = useState<Payload>({});
  const [health, setHealth] = useState<Health>({});
  const [form, setForm] = useState<PublicCampaign["form"] | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");
  const [result, setResult] = useState<Draft["registration"]>();
  const [guardian, setGuardian] = useState<GuardianSummary | null>(null);
  const [showIntroduction, setShowIntroduction] = useState(true);
  const [resuming, setResuming] = useState(true);
  const [prefilled, setPrefilled] = useState(false);
  const lookupIdentity = prefillIdentityKey(payload);
  const current = useRef({ payload, health });
  current.current = { payload, health };
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const sending = useRef(false);
  const storageKey = `fac:draft:${campaignId}`;
  useEffect(() => {
    let active = true;
    setResuming(true);
    setShowIntroduction(true);
    setCredential(null);
    setForm(null);
    setPayload({});
    setHealth({});
    setResult(undefined);
    setGuardian(null);
    setStep(0);
    setError("");
    setErrors({});
    setSaved("");
    setPrefilled(false);
    async function resume() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const stored = JSON.parse(raw) as DraftCredential;
        if (!stored.id || !stored.token) return;
        const draft = await api<Draft>(`/public/drafts/${stored.id}`, {
          draftToken: stored.token,
        });
        if (!active) return;
        setCredential(stored);
        setForm(draft.form);
        if (draft.submitted) {
          setResult(draft.registration);
          setGuardian(draft.guardian ?? null);
          setPayload({ email: draft.email });
          return;
        }
        const clean = sanitizeHidden(
          draft.form.config,
          campaign.data?.kind ?? draft.form.config.layout?.kind ?? "VOLUNTEER",
          draft.payload ?? {},
          draft.health ?? {},
        );
        setPayload(clean.payload);
        setHealth(clean.health);
        setSaved("Rascunho retomado");
      } catch {
        if (active) {
          localStorage.removeItem(storageKey);
          setError(
            "O rascunho anterior não pôde ser retomado. Você pode iniciar uma nova inscrição.",
          );
        }
      } finally {
        if (active) setResuming(false);
      }
    }
    void resume();
    return () => {
      active = false;
    };
  }, [storageKey]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const created = await api<DraftCredential>(
        `/public/campaigns/${campaignId}/drafts`,
        { method: "POST" },
      );
      localStorage.setItem(storageKey, JSON.stringify(created));
      const draft = await api<Draft>(`/public/drafts/${created.id}`, {
        draftToken: created.token,
      });
      setCredential(created);
      setForm(draft.form);
      setPayload(draft.payload ?? {});
      setHealth(draft.health ?? {});
      setShowIntroduction(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function persist() {
    if (!credential || result) return Promise.resolve();
    const snapshot = config
      ? sanitizeHidden(
          config,
          data?.kind ?? "VOLUNTEER",
          current.current.payload,
          current.current.health,
        )
      : current.current;
    const pending = queue.current
      .catch(() => {})
      .then(async () => {
        await api(`/public/drafts/${credential.id}`, {
          method: "PUT",
          draftToken: credential.token,
          body: snapshot,
        });
        setSaved("Rascunho salvo");
      });
    queue.current = pending;
    return pending;
  }
  useEffect(() => {
    if (!credential || result || showIntroduction || sending.current) return;
    setSaved("Salvando…");
    const timer = setTimeout(() => {
      if (!sending.current)
        void persist().catch(() =>
          setSaved("Sem conexão. Tente salvar novamente."),
        );
    }, 800);
    return () => clearTimeout(timer);
  }, [payload, health, credential, result, showIntroduction]);
  useEffect(() => {
    if (
      !auth.registrationPrefillEnabled ||
      !credential ||
      !form ||
      !campaign.data ||
      resuming ||
      showIntroduction ||
      result
    )
      return;
    const identity = prefillIdentity(current.current.payload);
    if (!identity) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api<{ payload: Payload }>(
        `/public/drafts/${credential.id}/prefill`,
        {
          method: "POST",
          draftToken: credential.token,
          body: identity,
          signal: controller.signal,
        },
      )
        .then((response) => {
          if (
            controller.signal.aborted ||
            prefillIdentityKey(current.current.payload) !== lookupIdentity
          )
            return;
          const merged = mergePrefill(
            current.current.payload,
            response.payload,
            form.config,
            campaign.data!.kind,
          );
          if (merged.changed) {
            setPayload(merged.payload);
            setPrefilled(true);
          }
        })
        .catch(() => {
          /* Suggestions never block filling or submitting the form. */
        });
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    lookupIdentity,
    credential,
    form,
    campaign.data,
    auth.registrationPrefillEnabled,
    resuming,
    showIntroduction,
    result,
  ]);
  function update<K extends keyof Payload>(key: K, value: Payload[K]) {
    setPayload((p) => ({ ...p, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }
  const data = campaign.data;
  const config = form?.config;
  const visible = (key: string) =>
    !config || fieldVisible(config, data?.kind ?? "VOLUNTEER", key);
  const questionOrder = config?.layout
    ? stepIds.flatMap((stage) =>
        orderedFields(config, data?.kind ?? config.layout!.kind, stage).map(
          (field) => field.key,
        ),
      )
    : [];
  const reviewQuestions =
    config?.questions
      .filter((q) => visible(`question:${q.id}`))
      .sort((a, b) =>
        config.layout
          ? questionOrder.indexOf(`question:${a.id}`) -
            questionOrder.indexOf(`question:${b.id}`)
          : 0,
      ) ?? [];
  const reviewHealth = [...healthQuestions]
    .filter(([flag]) => visible(`health:${flag}`))
    .sort(([a], [b]) =>
      config?.layout
        ? questionOrder.indexOf(`health:${a}`) -
          questionOrder.indexOf(`health:${b}`)
        : 0,
    );
  const identityQuestions = config?.volunteer
    ? config.questions.filter(
        (q) => ["sexo", "cidade"].includes(q.id) && visible(`question:${q.id}`),
      )
    : [];
  const agreementQuestions = config?.volunteer
    ? config.questions.filter(
        (q) =>
          ["aceite_formacao", "aceite_regras"].includes(q.id) &&
          visible(`question:${q.id}`),
      )
    : [];
  const otherQuestions =
    config?.questions.filter(
      (q) =>
        visible(`question:${q.id}`) &&
        ![...identityQuestions, ...agreementQuestions].some(
          (item) => item.id === q.id,
        ),
    ) ?? [];
  const age =
    payload.birthDate && data
      ? (() => {
          const birth = new Date(payload.birthDate!),
            at = new Date(data.event.startsAt);
          let value = at.getUTCFullYear() - birth.getUTCFullYear();
          if (
            at.getUTCMonth() < birth.getUTCMonth() ||
            (at.getUTCMonth() === birth.getUTCMonth() &&
              at.getUTCDate() < birth.getUTCDate())
          )
            value--;
          return Number.isFinite(value) ? value : null;
        })()
      : null;
  const minor =
    payload.birthDate && data
      ? (() => {
          const birth = new Date(payload.birthDate!);
          const today = new Date(
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Sao_Paulo",
            }).format(new Date()),
          );
          const event = new Date(data.event.startsAt);
          const at = event < today ? event : today;
          let age = at.getUTCFullYear() - birth.getUTCFullYear();
          if (
            at.getUTCMonth() < birth.getUTCMonth() ||
            (at.getUTCMonth() === birth.getUTCMonth() &&
              at.getUTCDate() < birth.getUTCDate())
          )
            age--;
          return age < 18;
        })()
      : false;
  const activeSteps = config?.layout
    ? stepIds
        .map((_id, index) => index)
        .filter(
          (index) =>
            orderedFields(
              config,
              data?.kind ?? "VOLUNTEER",
              stepIds[index],
              minor,
            ).length > 0,
        )
    : [0, 1, 2, 3, 4];
  function validateStep() {
    const next: Record<string, string> = {};
    const need = (key: keyof Payload, label: string) => {
      if (!String(payload[key] ?? "").trim()) next[key] = `Informe ${label}.`;
    };
    if (step === 0) {
      need("name", "seu nome");
      need("birthDate", "a data de nascimento");
      if ((payload.name?.trim().length ?? 0) < 2)
        next.name = "Informe seu nome completo.";
      if ((payload.phone?.replace(/\D/g, "").length ?? 0) < 10)
        next.phone = "Informe telefone com DDD.";
      if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))
        next.email = "Confira seu e-mail.";
    }
    if (step === 1 && visible("base:photoAssetId") && !payload.photoAssetId)
      next.photoAssetId = "Adicione uma foto e clique em “Usar esta foto”.";
    if (
      step === 2 &&
      data?.kind === "VOLUNTEER" &&
      visible("base:availability")
    )
      need("availability", "sua disponibilidade");
    if (
      step === 2 &&
      (config?.volunteer || config?.camper) &&
      visible("base:shirt")
    )
      need("shirt", "o tamanho da camiseta");
    if (config)
      for (const q of config.layout
        ? orderedFields(
            config,
            data?.kind ?? config.layout.kind,
            stepIds[step],
            minor,
          )
            .filter((field) => field.key.startsWith("question:"))
            .map((field) =>
              config.questions.find((q) => `question:${q.id}` === field.key)!,
            )
        : step === 0
          ? identityQuestions
          : step === 2
            ? otherQuestions
            : step === 4
              ? agreementQuestions
              : []) {
        const a = payload.answers?.[q.id];
        if (
          q.required &&
          (a === undefined ||
            a === "" ||
            (typeof a === "string" && !a.trim()) ||
            (Array.isArray(a) && !a.length))
        )
          next[q.id] = `Responda: ${q.label}`;
        if (q.mustBeTrue && a !== true)
          next[q.id] = "Confirme este aceite para enviar sua candidatura.";
        if (Array.isArray(a) && q.maxSelections && a.length > q.maxSelections)
          next[q.id] = `Selecione até ${q.maxSelections} opções.`;
        if (
          Array.isArray(a) &&
          q.exclusiveOption &&
          a.includes(q.exclusiveOption) &&
          a.length > 1
        )
          next[q.id] =
            "A opção de nenhum sacramento não pode ser combinada com outras.";
      }
    if (step === 3) {
      if (visible("base:emergencyName"))
        need("emergencyName", "o contato de emergência");
      if (visible("base:emergencyRelationship"))
        need("emergencyRelationship", "o parentesco");
      if (
        visible("base:emergencyPhone") &&
        (payload.emergencyPhone?.replace(/\D/g, "").length ?? 0) < 10
      )
        next.emergencyPhone = "Informe telefone com DDD.";
      if (
        visible("base:emergencyAlternativePhone") &&
        payload.emergencyAlternativePhone &&
        !/^\d{10,13}$/.test(
          payload.emergencyAlternativePhone.replace(/\D/g, ""),
        )
      )
        next.emergencyAlternativePhone = "Informe telefone com DDD.";
      for (const [flag, detail] of healthQuestions) {
        if (!visible(`health:${flag}`)) continue;
        if (typeof health[flag] !== "boolean")
          next[flag] = "Selecione Sim ou Não.";
        if (health[flag] && !health[detail]?.trim())
          next[detail] = "Descreva essa informação.";
      }
      if (minor) {
        need("guardianName", "o nome do responsável");
        need("guardianPhone", "o telefone do responsável");
        need("guardianRelationship", "o parentesco do responsável");
        if ((payload.guardianPhone?.replace(/\D/g, "").length ?? 0) < 10)
          next.guardianPhone = "Informe telefone com DDD.";
        if (
          payload.guardianEmail &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.guardianEmail)
        )
          next.guardianEmail = "Confira o e-mail do responsável.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }
  async function next(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!validateStep()) return;
    setBusy(true);
    try {
      await persist();
      setStep((s) => activeSteps.find((index) => index > s) ?? 4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!validateStep()) return;
    if (!payload.termsAccepted) {
      setErrors({ termsAccepted: "Aceite os termos para enviar." });
      return;
    }
    setBusy(true);
    setError("");
    sending.current = true;
    try {
      await persist();
      const sent = await api<
        NonNullable<Draft["registration"]> & {
          guardian?: GuardianSummary | null;
        }
      >(`/public/drafts/${credential!.id}/submit`, {
        method: "POST",
        draftToken: credential!.token,
      });
      setResult(sent);
      setGuardian(sent.guardian ?? null);
      setSaved("");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.fields?.fieldErrors)
        setErrors(
          Object.fromEntries(
            Object.entries(e.fields.fieldErrors).map(([k, v]) => [
              k,
              v[0] ?? "",
            ]),
          ),
        );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function claim() {
    setBusy(true);
    setError("");
    try {
      await api(`/me/drafts/${credential!.id}/claim`, {
        method: "POST",
        draftToken: credential!.token,
      });
      setSaved("Inscrição vinculada ao seu perfil.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (campaign.loading || resuming) return <Loading />;
  if (campaign.error)
    return (
      <div className="narrow-shell">
        <BackLink to="/eventos">Eventos</BackLink>
        <Notice>{campaign.error}</Notice>
      </div>
    );
  if (!data) return null;
  if (result)
    return (
      <div className="auth-shell">
        <div className="success-icon">
          <CheckCircle2 size={42} />
        </div>
        <span className="eyebrow">PRIMEIRO PASSO CONCLUÍDO</span>
        <h1>Recebemos sua inscrição!</h1>
        <p>{data.event.name}</p>
        <section className="panel">
          <span className="muted">Seu protocolo</span>
          <strong className="protocol">{result.protocol}</strong>
          <p>
            A organização irá analisar sua{" "}
            {data.kind === "VOLUNTEER"
              ? "candidatura para servir"
              : "inscrição"}
            . O envio ainda não confirma sua participação.
          </p>
          {error && <Notice>{error}</Notice>}
          {saved && <Notice kind="success">{saved}</Notice>}
          {guardian && (
            <div className="guardian-notice">
              <h3>
                {guardian.signedAt
                  ? "Responsável já autorizou"
                  : "Falta a assinatura do responsável"}
              </h3>
              <p>
                {guardian.signedAt
                  ? "O termo foi recebido pela organização."
                  : "A participação depende do responsável conferir os dados e assinar o termo pelo link pessoal."}
              </p>
              {!guardian.signedAt && (
                <>
                  <p>
                    {guardian.emailStatus === "ENVIADA"
                      ? "Link enviado ao e-mail do responsável."
                      : guardian.email
                        ? "O e-mail ainda não foi enviado. Compartilhe pelo WhatsApp ou procure a organização."
                        : "Compartilhe o link com o responsável pelo WhatsApp."}
                  </p>
                  {guardian.whatsappLink && (
                    <a
                      className="button primary"
                      href={guardian.whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Enviar ao responsável pelo WhatsApp
                    </a>
                  )}
                  {guardian.link && (
                    <button
                      type="button"
                      className="button outline"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(guardian.link!)
                          .then(() =>
                            setSaved(
                              "Link copiado para enviar ao responsável.",
                            ),
                          )
                          .catch(() =>
                            setError(
                              "Não foi possível copiar. Use o botão do WhatsApp.",
                            ),
                          )
                      }
                    >
                      Copiar link do responsável
                    </button>
                  )}
                  {guardian.expired && (
                    <Notice>
                      O link expirou. Procure a organização para renovar.
                    </Notice>
                  )}
                </>
              )}
            </div>
          )}
          {payload.email ? (
            <>
              <h3>Acompanhe sua caminhada</h3>
              <p>Crie seu acesso opcional para consultar esta inscrição.</p>
              {auth.session ? (
                <button
                  className="button primary full"
                  disabled={busy}
                  onClick={() => void claim()}
                >
                  Vincular ao meu perfil
                </button>
              ) : (
                <Link
                  className="button primary full"
                  to={`/entrar?email=${encodeURIComponent(payload.email)}&next=${encodeURIComponent(`/inscricao/${campaignId}`)}`}
                >
                  Criar meu perfil ou entrar <ArrowRight size={17} />
                </Link>
              )}
            </>
          ) : (
            <p>
              Você pode concluir sem criar perfil. Para vincular posteriormente
              uma inscrição sem e-mail, procure a organização.
            </p>
          )}
          <Link className="button outline full" to="/meu-perfil">
            Minha área
          </Link>
          <Link className="text-button" to="/eventos">
            Agora não · Voltar aos eventos
          </Link>
        </section>
      </div>
    );
  if (!credential || showIntroduction) {
    const introConfig = credential && form ? form.config : data.form.config;
    return (
      <div
        className={`auth-shell registration-introduction ${introConfig.banner ? "has-banner" : ""}`}
      >
        <BackLink to={`/eventos/${data.event.id}`}>Sobre o evento</BackLink>
        <RegistrationBanner
          banner={introConfig.banner}
          eventName={data.event.name}
        />
        <span className="eyebrow">
          {data.kind === "CAMPER"
            ? "INSCRIÇÃO DE CAMPISTA"
            : "CANDIDATURA PARA SERVIR"}
        </span>
        <h1>{data.event.name}</h1>
        <p>
          {data.event.organization.name} · {date(data.event.startsAt)}
        </p>
        <section className="panel">
          <h2>Queremos conhecer você.</h2>
          <p>Leia as orientações antes de preencher a ficha.</p>
          <p className="safe-note">
            <ShieldCheck size={17} /> Você não precisa criar uma conta.
          </p>
          {credential && form && (
            <Notice kind="info">
              Você tem uma inscrição em andamento na versão {form.version}.
              Continuar mantém seus dados e as regras dessa versão.
              {form.version < data.form.version && (
                <>
                  {" "}
                  A versão atual é a {data.form.version}; campos ocultados ou
                  reorganizados nessa publicação valem para inscrições iniciadas
                  nela.
                </>
              )}
            </Notice>
          )}
          {introConfig.volunteer && (
            <>
              <Notice kind="info">
                Esta é uma ficha de intenção. O envio não garante vaga nem
                aprovação para servir.
              </Notice>
              {introConfig.volunteer.description?.trim() && (
                <>
                  <h3>Descrição</h3>
                  <p className="description">
                    {introConfig.volunteer.description}
                  </p>
                </>
              )}
              <h3>Regras para servir</h3>
              <p className="description">
                {introConfig.volunteer.requirements}
              </p>
              <h3>Preparação da equipe</h3>
              <p className="description">{introConfig.volunteer.training}</p>
            </>
          )}
          {introConfig.camper && (
            <>
              <Notice kind="info">
                O envio da inscrição não garante uma vaga. Aguarde a análise e a
                confirmação da organização.
              </Notice>
              {introConfig.camper.description?.trim() && (
                <>
                  <h3>Descrição</h3>
                  <p className="description">
                    {introConfig.camper.description}
                  </p>
                </>
              )}
              <h3>Regras para participar</h3>
              <p className="description">{introConfig.camper.requirements}</p>
              <h3>Orientações de chegada e participação</h3>
              <p className="description">
                {introConfig.camper.arrivalInstructions}
              </p>
            </>
          )}
          {error && <Notice>{error}</Notice>}
          {credential ? (
            <button
              className="button primary full"
              disabled={busy || !form}
              onClick={() => {
                setError("");
                setShowIntroduction(false);
              }}
            >
              Continuar inscrição <ArrowRight size={17} />
            </button>
          ) : data.open ? (
            <button
              className="button primary full"
              disabled={busy}
              onClick={() => void start()}
            >
              {busy ? "Preparando…" : "Começar inscrição"}
              <ArrowRight size={17} />
            </button>
          ) : (
            <Notice kind="info">
              As inscrições desta campanha não estão abertas.
            </Notice>
          )}
        </section>
      </div>
    );
  }
  if (!config) return <Loading />;
  const input = (
    key: keyof Payload,
    label: string,
    type = "text",
    required = false,
  ) => {
    const maskedPhone =
      key === "phone" || key === "emergencyPhone" || key === "guardianPhone";
    return (
      <Field label={label} required={required} error={errors[key]}>
        <input
          type={type}
          required={required}
          value={
            maskedPhone
              ? formatBrazilianPhone(String(payload[key] ?? ""))
              : String(payload[key] ?? "")
          }
          maxLength={maskedPhone ? undefined : type === "email" ? 254 : 500}
          placeholder={maskedPhone ? "(00) 00000-0000" : undefined}
          autoComplete={maskedPhone ? "tel-national" : undefined}
          onChange={(e) =>
            update(
              key,
              maskedPhone
                ? formatBrazilianPhone(e.target.value)
                : e.target.value,
            )
          }
          {...(type === "tel"
            ? { inputMode: "tel" as const }
            : type === "date"
              ? { max: new Date().toISOString().slice(0, 10) }
              : {})}
        />
      </Field>
    );
  };
  return (
    <div className="wizard-shell">
      <RegistrationBanner banner={config.banner} eventName={data.event.name} />
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={() => {
          void persist()
            .then(() => setShowIntroduction(true))
            .catch((error) => setError((error as Error).message));
        }}
      >
        {config.camper ? "Ver regras e orientações" : "Ver regras e preparação"}
      </button>
      <p className="muted">Ficha — versão {form?.version}</p>
      <BackLink to={`/eventos/${data.event.id}`}>Sobre o evento</BackLink>
      <div className="wizard-event">
        <span className="eyebrow">
          {data.kind === "CAMPER" ? "QUERO PARTICIPAR" : "QUERO SERVIR"}
        </span>
        <h1>{data.event.name}</h1>
        <p>{data.event.organization.name}</p>
      </div>
      <ol className="steps">
        {activeSteps.map((i, position) => (
          <li
            className={i === step ? "current" : i < step ? "done" : ""}
            key={steps[i]}
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i < step ? <Check size={15} /> : position + 1}</span>
            <small>{steps[i]}</small>
          </li>
        ))}
      </ol>
      <form
        className="panel wizard-panel"
        onSubmit={step === 4 ? send : next}
        noValidate
      >
        <div className="wizard-heading">
          <span className="eyebrow">
            ETAPA {activeSteps.indexOf(step) + 1} DE {activeSteps.length}
          </span>
          <h2>
            {
              [
                "Vamos começar pelo básico",
                "Uma foto para reconhecer você",
                "Queremos conhecer você",
                "Cuidar de você faz parte",
                "Está tudo certo?",
              ][step]
            }
          </h2>
        </div>
        {error && <Notice>{error}</Notice>}
        {prefilled && (
          <Notice kind="info">
            Dados anteriores preenchidos. Confira antes de continuar.
          </Notice>
        )}
        {config.layout && step !== 4 && (
          <>
            <RegistrationFields
              form={config}
              kind={data.kind}
              step={stepIds[step]}
              minor={minor}
              payload={payload}
              health={health}
              errors={errors}
              teams={data.event.teams}
              onPayload={(patch) => {
                setPayload((current) => ({ ...current, ...patch }));
                setErrors((current) => ({
                  ...current,
                  ...Object.fromEntries(
                    Object.keys(patch).map((key) => [key, ""]),
                  ),
                }));
              }}
              onHealth={(patch) =>
                setHealth((current) => ({ ...current, ...patch }))
              }
              photo={{
                endpoint: `/public/drafts/${credential.id}/photo`,
                draftToken: credential.token,
                photoEndpoint: payload.photoAssetId
                  ? `/public/drafts/${credential.id}/photos/${payload.photoAssetId}`
                  : undefined,
                onUploaded: (id) => {
                  update("photoAssetId", id);
                },
              }}
            />
            {step === 0 && (config.volunteer || config.camper) && (
              <Field label="Idade no início do evento">
                <input
                  readOnly
                  value={age !== null && age >= 0 ? `${age} anos` : ""}
                />
              </Field>
            )}
            {step === 3 && (
              <p className="muted">
                As informações de saúde são acessadas somente pela equipe
                autorizada para cuidar de você.
              </p>
            )}
          </>
        )}
        {step === 0 && !config.layout && (
          <>
            <div className="form-grid">
              {input("name", "Nome completo", "text", true)}
              {input("phone", "Telefone / WhatsApp com DDD", "tel", true)}
              {input("birthDate", "Data de nascimento", "date", true)}
              {input("email", "E-mail (opcional)", "email")}
              {config.volunteer && (
                <Field label="Idade no início do evento">
                  <input
                    readOnly
                    value={age !== null && age >= 0 ? `${age} anos` : ""}
                  />
                </Field>
              )}
            </div>
            <Questions
              questions={identityQuestions}
              cityAutocomplete
              answers={payload.answers ?? {}}
              errors={errors}
              onChange={(id, answer) =>
                setPayload((p) => ({
                  ...p,
                  answers: { ...p.answers, [id]: answer },
                }))
              }
            />
            <p className="muted">
              O e-mail permite criar seu perfil depois. Ele não é necessário
              para se inscrever.
            </p>
          </>
        )}
        {step === 1 && !config.layout && (
          <>
            {errors.photoAssetId && <Notice>{errors.photoAssetId}</Notice>}
            <PhotoPicker
              endpoint={`/public/drafts/${credential.id}/photo`}
              draftToken={credential.token}
              photoEndpoint={
                payload.photoAssetId
                  ? `/public/drafts/${credential.id}/photos/${payload.photoAssetId}`
                  : undefined
              }
              onUploaded={(id) => {
                update("photoAssetId", id);
              }}
            />
          </>
        )}
        {step === 2 && !config.layout && (
          <>
            {config.askCpf && input("cpf", "CPF (opcional)")}
            {config.askAddress && input("address", "Endereço (opcional)")}
            {config.askShirt && (
              <>
                <Field
                  label="Tamanho da camiseta"
                  required={Boolean(config.volunteer)}
                  error={errors.shirt}
                >
                  <select
                    value={payload.shirt ?? ""}
                    onChange={(e) => update("shirt", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {["PP", "P", "M", "G", "GG", "XG", "XGG", "ESP"].map(
                      (s) => (
                        <option key={s}>{s}</option>
                      ),
                    )}
                  </select>
                </Field>
                <ShirtSizeGuide />
              </>
            )}
            {data.kind === "VOLUNTEER" && (
              <>
                <Field
                  label="Sua disponibilidade"
                  required
                  error={errors.availability}
                >
                  <textarea
                    value={payload.availability ?? ""}
                    onChange={(e) => update("availability", e.target.value)}
                    placeholder="Quando você pode chegar e até quando poderá ficar?"
                    maxLength={1000}
                  />
                </Field>
                {!config.volunteer && (
                  <Field
                    label="Equipe de preferência (opcional)"
                    hint="A organização definirá a alocação final."
                  >
                    <select
                      value={payload.preferredTeamId ?? ""}
                      onChange={(e) =>
                        update("preferredTeamId", e.target.value)
                      }
                    >
                      <option value="">Sem preferência</option>
                      {data.event.teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </>
            )}
            <Questions
              questions={otherQuestions}
              cityAutocomplete
              answers={payload.answers ?? {}}
              errors={errors}
              onChange={(id, answer) =>
                setPayload((p) => ({
                  ...p,
                  answers: { ...p.answers, [id]: answer },
                }))
              }
            />
            {Object.entries(errors)
              .filter(([k]) => config.questions.some((q) => q.id === k))
              .map(([k, msg]) => (
                <Notice key={k}>{msg}</Notice>
              ))}
            {!config.askCpf &&
              !config.askAddress &&
              !config.askShirt &&
              !config.questions.length &&
              data.kind === "CAMPER" && (
                <p>
                  Nesta campanha, podemos seguir para os cuidados de saúde e
                  emergência.
                </p>
              )}
          </>
        )}
        {step === 3 && !config.layout && (
          <>
            <h3>Contato de emergência</h3>
            <div className="form-grid">
              {input("emergencyName", "Nome do contato", "text", true)}
              {input("emergencyPhone", "Telefone com DDD", "tel", true)}
              <EmergencyRelationshipSelect
                value={payload.emergencyRelationship}
                error={errors.emergencyRelationship}
                onChange={(value) => update("emergencyRelationship", value)}
              />
            </div>
            <hr />
            <h3>Informações de saúde</h3>
            <p className="muted">
              Estas respostas são acessadas somente pela equipe autorizada para
              cuidar de você.
            </p>
            {healthQuestions.map(([flag, detail, label]) => (
              <div className="health-question" key={flag}>
                <Field label={label} required error={errors[flag]}>
                  <select
                    value={
                      health[flag] === undefined ? "" : String(health[flag])
                    }
                    onChange={(e) =>
                      setHealth((h) => ({
                        ...h,
                        [flag]:
                          e.target.value === ""
                            ? undefined
                            : e.target.value === "true",
                        [detail]: e.target.value === "false" ? "" : h[detail],
                      }))
                    }
                  >
                    <option value="">Selecione</option>
                    <option value="false">Não</option>
                    <option value="true">Sim</option>
                  </select>
                </Field>
                {health[flag] && (
                  <Field label="Descreva" required error={errors[detail]}>
                    <textarea
                      maxLength={2000}
                      value={health[detail] ?? ""}
                      onChange={(e) =>
                        setHealth((h) => ({ ...h, [detail]: e.target.value }))
                      }
                    />
                  </Field>
                )}
              </div>
            ))}
            {minor && (
              <>
                <hr />
                <h3>Responsável legal</h3>
                <p className="muted">
                  Precisamos que o responsável legal preencha e assine o termo.
                  Após enviar a ficha, um link pessoal será criado para ele.
                </p>
                {input("guardianName", "Nome do responsável", "text", true)}
                {input("guardianPhone", "Telefone do responsável", "tel", true)}
                {input(
                  "guardianEmail",
                  "E-mail do responsável (opcional)",
                  "email",
                )}
                <GuardianRelationshipSelect
                  value={payload.guardianRelationship}
                  error={errors.guardianRelationship}
                  onChange={(value) => update("guardianRelationship", value)}
                />
                <p className="safe-note">
                  Informe o contato do responsável. A autorização será
                  registrada quando ele assinar pelo link.
                </p>
              </>
            )}
          </>
        )}
        {step === 4 && (
          <>
            <div className="review-summary">
              {visible("base:photoAssetId") && payload.photoAssetId && (
                <SignedPhoto
                  endpoint={`/public/drafts/${credential.id}/photos/${payload.photoAssetId}`}
                  draftToken={credential.token}
                  alt="Sua foto"
                />
              )}
              <div>
                <h3>{payload.name}</h3>
                <p>
                  {payload.phone} ·{" "}
                  {payload.birthDate && date(payload.birthDate)}
                </p>
                {visible("base:email") && (
                  <p>{payload.email || "E-mail não informado"}</p>
                )}
              </div>
            </div>
            <dl className="review-list">
              <dt>Evento</dt>
              <dd>{data.event.name}</dd>
              <dt>Participação</dt>
              <dd>
                {data.kind === "CAMPER"
                  ? "Campista"
                  : "Candidatura para servir"}
              </dd>
              {(visible("base:emergencyName") ||
                visible("base:emergencyPhone")) && (
                <>
                  <dt>Emergência</dt>
                  <dd>
                    {payload.emergencyName}{" "}
                    {payload.emergencyPhone && `· ${payload.emergencyPhone}`}
                  </dd>
                </>
              )}
              {payload.availability && (
                <>
                  <dt>Disponibilidade</dt>
                  <dd>{payload.availability}</dd>
                </>
              )}
              {(
                [
                  ["address", "Endereço"],
                  ["shirt", "Camiseta"],
                  [
                    "emergencyAlternativePhone",
                    "Telefone alternativo de emergência",
                  ],
                ] as const
              ).map(([key, label]) =>
                payload[key] && visible(`base:${key}`) ? (
                  <Fragment key={key}>
                    <dt>{label}</dt>
                    <dd>{payload[key]}</dd>
                  </Fragment>
                ) : null,
              )}
            </dl>
            {reviewHealth.length > 0 && (
              <details>
                <summary>Conferir respostas de saúde</summary>
                {reviewHealth.map(([flag, detail, label]) => (
                  <p key={flag}>
                    <strong>{label}</strong>
                    <br />
                    {health[flag] === undefined
                      ? "Não perguntado"
                      : health[flag]
                        ? health[detail]
                        : "Não"}
                  </p>
                ))}
              </details>
            )}
            {reviewQuestions.length > 0 && (
              <details>
                <summary>Conferir perguntas do evento</summary>
                {reviewQuestions.map((q) => (
                  <p key={q.id}>
                    <strong>{q.label}</strong>
                    <br />
                    {Array.isArray(payload.answers?.[q.id])
                      ? (payload.answers![q.id] as string[]).join(", ")
                      : typeof payload.answers?.[q.id] === "boolean"
                        ? payload.answers[q.id]
                          ? "Sim"
                          : "Não"
                        : String(payload.answers?.[q.id] ?? "Não informado")}
                  </p>
                ))}
              </details>
            )}
            {config.volunteer && (
              <>
                {config.volunteer.description?.trim() && (
                  <>
                    <h3>Descrição</h3>
                    <p className="description">
                      {config.volunteer.description}
                    </p>
                  </>
                )}
                <h3>Regras para servir</h3>
                <p className="description">{config.volunteer.requirements}</p>
                <h3>Preparação da equipe</h3>
                <p className="description">{config.volunteer.training}</p>
                {!config.layout && (
                  <Questions
                    questions={agreementQuestions}
                    answers={payload.answers ?? {}}
                    errors={errors}
                    onChange={(id, answer) =>
                      setPayload((p) => ({
                        ...p,
                        answers: { ...p.answers, [id]: answer },
                      }))
                    }
                  />
                )}
                <p>
                  Preferência de equipe não representa alocação definitiva.
                  Aguarde a avaliação da organização.
                </p>
              </>
            )}
            <div className="terms-text">{config.terms}</div>
            {config.camper && (
              <>
                <h3>Regras para participar</h3>
                <p className="description">{config.camper.requirements}</p>
                <h3>Orientações de chegada e participação</h3>
                <p className="description">
                  {config.camper.arrivalInstructions}
                </p>
              </>
            )}
            {config.layout && (
              <RegistrationFields
                form={config}
                kind={data.kind}
                step="review"
                minor={minor}
                payload={payload}
                health={health}
                errors={errors}
                onPayload={(patch) =>
                  setPayload((current) => ({ ...current, ...patch }))
                }
                onHealth={(patch) =>
                  setHealth((current) => ({ ...current, ...patch }))
                }
              />
            )}
            {!config.layout && (
              <>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={payload.termsAccepted ?? false}
                    onChange={(e) => update("termsAccepted", e.target.checked)}
                  />
                  Li e aceito os termos desta inscrição e declaro que as
                  informações são verdadeiras.
                </label>
                {errors.termsAccepted && (
                  <Notice>{errors.termsAccepted}</Notice>
                )}
                {!minor && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={payload.imageAuthorized ?? false}
                      onChange={(e) =>
                        update("imageAuthorized", e.target.checked)
                      }
                    />
                    Autorizo o uso de minha imagem conforme os termos
                    (opcional).
                  </label>
                )}
              </>
            )}
            <p className="safe-note">
              <ShieldCheck size={16} /> Enviar esta ficha não garante uma vaga.
              Aguarde a análise da organização.
            </p>
          </>
        )}
        <div className="wizard-footer">
          <button
            type="button"
            className="button outline"
            disabled={busy || step === 0}
            onClick={() =>
              setStep(
                (s) =>
                  [...activeSteps].reverse().find((index) => index < s) ?? 0,
              )
            }
          >
            Voltar
          </button>
          <span className="autosave" aria-live="polite">
            {saved}
          </span>
          <button className="button primary" disabled={busy}>
            {busy ? "Aguarde…" : step === 4 ? "Enviar inscrição" : "Continuar"}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
      <p className="wizard-footnote">
        Você pode voltar a este link no mesmo navegador para continuar seu
        rascunho.
      </p>
    </div>
  );
}
