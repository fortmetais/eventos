import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CircleAlert } from "lucide-react";
import { orderedFields, stepIds } from "@fac/form-layout";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { useRemote } from "../lib/hooks";
import { useOrganization } from "../pages/Organization";
import type {
  EventEdition,
  Registration,
  RegistrationStatus,
} from "../lib/types";
import { date, dateTime, statusLabels } from "../lib/types";
import { registrationPendingInformation } from "../lib/registration-pending";
import { Badge, Field, Loading, Notice } from "./ui";
import { GuardianNotice, type GuardianNoticeState } from "./GuardianNotice";
import { DecisionNotice, type DecisionNoticeState } from "./DecisionNotice";
import { ImportedRegistrationCorrection } from "./ImportedRegistrationCorrection";
import { DetailSection } from "./DetailSection";
import "./RegistrationDetail.css";
type SectionId =
  | "personal"
  | "participation"
  | "emergency"
  | "guardian"
  | "management"
  | "invitation"
  | "imports"
  | "history";
const statusOptions: Record<RegistrationStatus, RegistrationStatus[]> = {
  RECEIVED: ["REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
  REVIEW: ["RECEIVED", "APPROVED", "WAITLIST", "REJECTED", "CANCELLED"],
  APPROVED: [
    "RECEIVED",
    "REVIEW",
    "CONFIRMED",
    "WAITLIST",
    "REJECTED",
    "CANCELLED",
  ],
  CONFIRMED: ["RECEIVED", "REVIEW", "CANCELLED"],
  WAITLIST: ["RECEIVED", "REVIEW", "APPROVED", "CANCELLED", "REJECTED"],
  REJECTED: ["RECEIVED", "REVIEW"],
  CANCELLED: ["RECEIVED", "REVIEW"],
};
export function RegistrationDetail({
  organizationId,
  registrationId,
  onChanged,
  onDirtyChange,
}: {
  organizationId: string;
  registrationId: string;
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const auth = useAuth();
  const { membership } = useOrganization();
  const selected = registrationId;
  const detail = useRemote<Registration>(
    `/organizations/${organizationId}/registrations/${registrationId}`,
  );
  const events = useRemote<EventEdition[]>(
    `/organizations/${organizationId}/events`,
  );
  const registration = detail.data?.id === registrationId ? detail.data : null;
  const pendingInformation = registration
    ? registrationPendingInformation(registration)
    : [];
  const edition = events.data?.find(
    (event) => event.id === registration?.campaign.event.id,
  );
  const canDecide = auth.eventsEnabled || membership.role === "ORGANIZER";
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [nextStatus, setNextStatus] = useState<RegistrationStatus | " ">(" ");
  const [teamDraft, setTeamId] = useState<string | undefined>();
  const teamId = teamDraft ?? registration?.team?.id ?? "";
  const [linkEmail, setLinkEmail] = useState("");
  const [linkReason, setLinkReason] = useState("");
  const [correctionDirty, setCorrectionDirty] = useState(false);
  const [guardianBusy, setGuardianBusy] = useState(false);
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [guardianState, setGuardianState] =
    useState<GuardianNoticeState | null>(null);
  const [guardianFailed, setGuardianFailed] = useState(false);
  const [noticeState, setNoticeState] = useState<{
    context: string;
    state: DecisionNoticeState;
  } | null>(null);
  const noticeContext = `${registration?.id ?? registrationId}:${registration?.status ?? ""}:${registration?.team?.id ?? ""}`;
  const onNoticeState = useCallback(
    (state: DecisionNoticeState) =>
      setNoticeState({ context: noticeContext, state }),
    [noticeContext],
  );
  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    () => new Set(),
  );
  const [showOriginal, setShowOriginal] = useState(false);
  const [errorSection, setErrorSection] = useState<SectionId | null>(null);
  const sectionButtons = useRef<
    Partial<Record<SectionId, HTMLButtonElement | null>>
  >({});
  const correctionBase = useRef<Registration | null>(null);
  const previousRegistrationId = useRef(registrationId);
  const actionBusy = busy || guardianBusy || noticeBusy;
  useEffect(() => {
    if (registration && !correctionDirty) correctionBase.current = registration;
  }, [registration, correctionDirty]);
  useEffect(() => {
    if (previousRegistrationId.current === registrationId) return;
    previousRegistrationId.current = registrationId;
    setOpenSections(new Set());
    setShowOriginal(false);
    setGuardianState(null);
    setGuardianFailed(false);
    setNoticeState(null);
  }, [registrationId]);
  const openSection = useCallback((section: SectionId, focus = false) => {
    setOpenSections((previous) => new Set(previous).add(section));
    if (focus)
      requestAnimationFrame(() => {
        const button = sectionButtons.current[section];
        if (!button?.isConnected) return;
        button.focus();
        button.scrollIntoView?.({ block: "nearest" });
      });
  }, []);
  const onGuardianError = useCallback(() => {
    setGuardianFailed(true);
    openSection("guardian", true);
  }, [openSection]);
  const onNoticeError = useCallback(
    () => openSection("invitation", true),
    [openSection],
  );
  const onCorrectionError = useCallback(
    () => openSection("imports", true),
    [openSection],
  );
  function sectionProps(id: SectionId) {
    return {
      open: openSections.has(id),
      onOpenChange: (open: boolean) =>
        setOpenSections((previous) => {
          const next = new Set(previous);
          if (open) next.add(id);
          else next.delete(id);
          return next;
        }),
      buttonRef: (button: HTMLButtonElement | null) => {
        sectionButtons.current[id] = button;
      },
    };
  }
  function showError(message: string, section: SectionId) {
    setError(message);
    setErrorSection(section);
    openSection(section, true);
  }
  useEffect(() => {
    setTeamId(undefined);
  }, [registrationId]);
  // The containing dialog must receive edits before the next native Escape or
  // navigation event. A passive effect can leave its close handler briefly clean.
  useLayoutEffect(() => {
    onDirtyChange?.(
      actionBusy ||
        correctionDirty ||
        Boolean(
          reason ||
          linkEmail ||
          linkReason ||
          nextStatus !== " " ||
          (registration && teamId !== (registration.team?.id ?? "")),
        ),
    );
  }, [
    onDirtyChange,
    actionBusy,
    correctionDirty,
    reason,
    linkEmail,
    linkReason,
    nextStatus,
    teamId,
    registration,
  ]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    setPhoto("");
    if (detail.data?.id !== selected || !detail.data.snapshot.photoAssetId)
      return;
    const controller = new AbortController();
    void api<{ url: string }>(
      `/organizations/${organizationId}/registrations/${selected}/photo`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setPhoto(result.url);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [
    organizationId,
    selected,
    detail.data?.id,
    detail.data?.snapshot.photoAssetId,
  ]);
  const answerOrder = registration?.form?.config.layout
    ? stepIds.flatMap((step) =>
        orderedFields(
          registration.form!.config,
          registration.campaign.kind,
          step,
        ).map((field) => field.key),
      )
    : null;
  async function change(e: FormEvent) {
    e.preventDefault();
    if (nextStatus === " ") return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const changed = await api<Registration>(
        `/organizations/${organizationId}/registrations/${selected}/status`,
        {
          method: "PATCH",
          body: {
            status: nextStatus,
            reason:
              reason.trim() ||
              `Situação alterada para ${statusLabels[nextStatus]} pela organização na ficha de inscrição.`,
          },
        },
      );
      detail.refreshInBackground();
      events.refreshInBackground();
      onChanged();
      setNextStatus(" ");
      setReason("");
      if (["REJECTED", "CANCELLED"].includes(changed.status))
        setTeamId(undefined);
      if (changed.noticeWarning) setInfo(changed.noticeWarning);
      if (nextStatus === "CONFIRMED" && changed.status === "WAITLIST")
        showError(
          "A capacidade foi atingida. A inscrição foi encaminhada para a lista de espera.",
          "management",
        );
    } catch (e) {
      showError((e as Error).message, "management");
      detail.refreshInBackground();
    } finally {
      setBusy(false);
    }
  }
  async function assign() {
    setBusy(true);
    setError("");
    try {
      await api(
        `/organizations/${organizationId}/registrations/${selected}/team`,
        { method: "PUT", body: { teamId: teamId || null } },
      );
      setTeamId(undefined);
      detail.refreshInBackground();
      events.refreshInBackground();
      onChanged();
    } catch (e) {
      showError((e as Error).message, "management");
      setTeamId(registration?.team?.id ?? "");
      detail.refreshInBackground();
    } finally {
      setBusy(false);
    }
  }
  async function manualLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/organizations/${organizationId}/registrations/${selected}/link`,
        { method: "POST", body: { email: linkEmail, reason: linkReason } },
      );
      setLinkEmail("");
      setLinkReason("");
      setInfo("Inscrição vinculada à conta após a comprovação registrada.");
      detail.refreshInBackground();
      onChanged();
    } catch (e) {
      showError((e as Error).message, "history");
    } finally {
      setBusy(false);
    }
  }
  const currentNotice =
    noticeState?.context === noticeContext
      ? noticeState.state.notice
      : registration?.decisionSummary?.notice;
  const notice = currentNotice?.kind === "ACEITE" ? currentNotice : null;
  const campResponse = notice?.declinedAt
    ? "Não irei"
    : notice?.confirmedAt
      ? "Vou participar"
      : "Não respondeu";
  const campRespondedAt = notice?.declinedAt ?? notice?.confirmedAt;
  const spiritualityAt =
    registration?.campaign.kind === "VOLUNTEER"
      ? (notice?.spirituality?.startsAt ??
        registration.campaign.event.spiritualityStartsAt ??
        registration.spiritualityAt)
      : null;
  // A response to an earlier meeting must not answer the current question.
  const sameSpirituality = Boolean(
    spiritualityAt &&
    registration?.spiritualityAt &&
    new Date(spiritualityAt).getTime() ===
      new Date(registration.spiritualityAt).getTime(),
  );
  const spiritualityResponse = notice?.spirituality
    ? notice.spirituality.answer
    : sameSpirituality
      ? registration?.spiritualityResponse
      : null;
  const spiritualityRespondedAt = notice?.spirituality
    ? notice.spirituality.respondedAt
    : sameSpirituality
      ? registration?.spiritualityRespondedAt
      : null;
  const presence = !["APPROVED", "CONFIRMED"].includes(
    registration?.status ?? "",
  )
    ? "Não solicitada"
    : notice?.declinedAt
      ? "Não irei — revisar vaga"
      : notice?.confirmedAt
        ? "Confirmada pelo candidato"
        : notice?.expired
          ? "Convite expirado"
          : notice?.emailSentAt || notice?.whatsappSentAt
            ? "Aguardando resposta"
            : notice?.active
              ? "Convite não enviado"
              : "Não informada";
  const guardianRelevant = Boolean(
    guardianFailed ||
    guardianState?.needsAuthorization ||
    guardianState?.authorization ||
    registration?.snapshot.guardianName ||
    registration?.snapshot.guardianPhone,
  );
  const guardianLabel = guardianState?.authorization?.signedAt
    ? "Assinada"
    : guardianState?.needsAuthorization || guardianState?.authorization
      ? "Pendente"
      : "Dados informados";
  const correctionRegistration =
    correctionDirty && correctionBase.current?.id === registration?.id
      ? correctionBase.current
      : registration;
  const answers = Object.entries(registration?.snapshot.answers ?? {})
    .filter(([key]) => !answerOrder || answerOrder.includes(`question:${key}`))
    .sort(([a], [b]) =>
      answerOrder
        ? answerOrder.indexOf(`question:${a}`) -
          answerOrder.indexOf(`question:${b}`)
        : 0,
    );
  return (
    <div className="registration-detail registration-detail-dialog">
      {info && <Notice kind="success">{info}</Notice>}
      {detail.loading && !registration ? (
        <Loading />
      ) : detail.error && !registration ? (
        <Notice>{detail.error}</Notice>
      ) : (
        registration && (
          <>
            {detail.error && <Notice>{detail.error}</Notice>}
            <section
              className="registration-detail-overview"
              aria-label="Resumo da inscrição"
            >
              <div className="registration-detail-identity">
                {photo && (
                  <img
                    className="registration-detail-photo"
                    src={photo}
                    alt={`Foto de ${registration.person.name}`}
                  />
                )}
                <div className="registration-detail-name">
                  <h2>{registration.person.name}</h2>
                  <p className="protocol-small">{registration.protocol}</p>
                  <Badge status={registration.status} />
                </div>
              </div>
              <dl className="registration-detail-operational">
                <div>
                  <dt>Evento</dt>
                  <dd>{registration.campaign.event.name}</dd>
                </div>
                <div>
                  <dt>Participação</dt>
                  <dd>
                    {registration.campaign.kind === "VOLUNTEER"
                      ? "Servo"
                      : "Campista"}
                  </dd>
                </div>
                <div>
                  <dt>Departamento</dt>
                  <dd>{registration.team?.name ?? "Sem departamento"}</dd>
                </div>
                <div>
                  <dt>Presença</dt>
                  <dd>{presence}</dd>
                </div>
              </dl>
              {registration.origin === "IMPORT" &&
                (pendingInformation.length > 0 ? (
                  <button
                    type="button"
                    className="registration-detail-pending"
                    aria-label="Ver informações pendentes"
                    onClick={() => openSection("imports", true)}
                  >
                    <CircleAlert size={16} aria-hidden="true" />
                    {pendingInformation.length}{" "}
                    {pendingInformation.length === 1
                      ? "pendência de complementação"
                      : "pendências de complementação"}
                  </button>
                ) : (
                  <p className="registration-detail-complete">
                    Sem pendências de complementação.
                  </p>
                ))}
            </section>

            <div className="registration-detail-sections">
              <DetailSection
                title="Dados pessoais e contato"
                {...sectionProps("personal")}
              >
                <dl className="registration-detail-facts">
                  <div>
                    <dt>Telefone</dt>
                    <dd>{registration.snapshot.phone || "Não informado"}</dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{registration.snapshot.email || "Não informado"}</dd>
                  </div>
                  <div>
                    <dt>Nascimento</dt>
                    <dd>
                      {registration.snapshot.birthDate
                        ? date(registration.snapshot.birthDate)
                        : "Não informado"}
                    </dd>
                  </div>
                  {(registration.form?.config.volunteer ||
                    registration.form?.config.camper) &&
                    registration.snapshot.birthDate && (
                      <div>
                        <dt>Idade no início do evento</dt>
                        <dd>
                          {(() => {
                            const birth = new Date(
                              registration.snapshot.birthDate!,
                            );
                            const at = new Date(
                              registration.campaign.event.startsAt,
                            );
                            let age =
                              at.getUTCFullYear() - birth.getUTCFullYear();
                            if (
                              at.getUTCMonth() < birth.getUTCMonth() ||
                              (at.getUTCMonth() === birth.getUTCMonth() &&
                                at.getUTCDate() < birth.getUTCDate())
                            )
                              age--;
                            return age;
                          })()}{" "}
                          anos
                        </dd>
                      </div>
                    )}
                  {registration.snapshot.cpf && (
                    <div>
                      <dt>CPF</dt>
                      <dd>{registration.snapshot.cpf}</dd>
                    </div>
                  )}
                  {registration.snapshot.address && (
                    <div>
                      <dt>Endereço</dt>
                      <dd>{registration.snapshot.address}</dd>
                    </div>
                  )}
                </dl>
              </DetailSection>

              <DetailSection
                title="Participação e respostas"
                summary={
                  spiritualityAt
                    ? "Acampamento e espiritualidade"
                    : "Resposta ao convite"
                }
                {...sectionProps("participation")}
              >
                <div className="registration-detail-invitation-answers">
                  <h4>Respostas ao convite</h4>
                  <dl className="registration-detail-facts">
                    <div>
                      <dt>Participação no acampamento</dt>
                      <dd>
                        <strong>{campResponse}</strong>
                        {campRespondedAt && (
                          <small>
                            Respondido em {dateTime(campRespondedAt)}
                          </small>
                        )}
                        {campRespondedAt && !notice?.active && (
                          <small>Convite inativo; resposta preservada.</small>
                        )}
                      </dd>
                    </div>
                    {spiritualityAt && (
                      <div>
                        <dt>Participação na espiritualidade</dt>
                        <dd>
                          <strong>
                            {spiritualityResponse == null
                              ? "Não respondeu"
                              : spiritualityResponse
                                ? "Sim"
                                : "Não"}
                          </strong>
                          <small>{dateTime(spiritualityAt)}</small>
                          {spiritualityRespondedAt && (
                            <small>
                              Respondido em {dateTime(spiritualityRespondedAt)}
                            </small>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
                <dl className="registration-detail-facts">
                  {registration.snapshot.shirt && (
                    <div>
                      <dt>Camiseta</dt>
                      <dd>{registration.snapshot.shirt}</dd>
                    </div>
                  )}
                  {registration.snapshot.availability && (
                    <div>
                      <dt>Disponibilidade</dt>
                      <dd>{registration.snapshot.availability}</dd>
                    </div>
                  )}
                </dl>
                {answers.length > 0 ? (
                  <dl className="registration-detail-answers">
                    {answers.map(([key, value]) => (
                      <div key={key}>
                        <dt>
                          {registration.form?.config.questions.find(
                            (question) => question.id === key,
                          )?.label ?? key}
                        </dt>
                        <dd>
                          {Array.isArray(value)
                            ? value.join(", ")
                            : typeof value === "boolean"
                              ? value
                                ? "Sim"
                                : "Não"
                              : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="muted">
                    Não há respostas adicionais nesta ficha.
                  </p>
                )}
              </DetailSection>

              <DetailSection
                title="Contato de emergência"
                {...sectionProps("emergency")}
              >
                {registration.snapshot.emergencyName ||
                registration.snapshot.emergencyPhone ||
                registration.snapshot.emergencyRelationship ||
                registration.snapshot.emergencyAlternativePhone ? (
                  <dl className="registration-detail-facts">
                    <div>
                      <dt>Nome do contato</dt>
                      <dd>
                        {registration.snapshot.emergencyName || "Não informado"}
                      </dd>
                    </div>
                    <div>
                      <dt>Telefone do contato</dt>
                      <dd>
                        {registration.snapshot.emergencyPhone ||
                          "Não informado"}
                      </dd>
                    </div>
                    <div>
                      <dt>Parentesco / relação</dt>
                      <dd>
                        {registration.snapshot.emergencyRelationship ||
                          "Não informado"}
                      </dd>
                    </div>
                    {registration.snapshot.emergencyAlternativePhone && (
                      <div>
                        <dt>Telefone alternativo</dt>
                        <dd>
                          {registration.snapshot.emergencyAlternativePhone}
                        </dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="muted">Contato de emergência não informado.</p>
                )}
              </DetailSection>

              <div
                hidden={!guardianRelevant}
                className="registration-detail-guardian-container"
              >
                <DetailSection
                  title="Responsável e autorização"
                  summary={guardianLabel}
                  {...sectionProps("guardian")}
                >
                  {(registration.snapshot.guardianName ||
                    registration.snapshot.guardianPhone) && (
                    <dl className="registration-detail-facts">
                      <div>
                        <dt>Responsável informado</dt>
                        <dd>
                          {registration.snapshot.guardianName ||
                            "Não informado"}
                        </dd>
                      </div>
                      <div>
                        <dt>Telefone informado</dt>
                        <dd>
                          {registration.snapshot.guardianPhone ||
                            "Não informado"}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <GuardianNotice
                    key={registration.id}
                    organizationId={organizationId}
                    registrationId={registration.id}
                    allowPendingConfirmation={registration.origin === "IMPORT"}
                    embedded
                    onStateChange={setGuardianState}
                    onBusyChange={setGuardianBusy}
                    onError={onGuardianError}
                    onChanged={() => {
                      detail.refreshInBackground();
                      onChanged();
                    }}
                  />
                </DetailSection>
              </div>

              {(canDecide || membership.role === "ORGANIZER") && (
                <DetailSection
                  title="Departamento e decisão"
                  {...sectionProps("management")}
                >
                  {error && errorSection === "management" && (
                    <Notice>{error}</Notice>
                  )}
                  {teamDraft !== undefined &&
                    teamDraft !== (registration.team?.id ?? "") && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={actionBusy}
                        onClick={() => setTeamId(undefined)}
                      >
                        Desfazer alteração de departamento
                      </button>
                    )}
                  {membership.role === "ORGANIZER" &&
                    registration.campaign.kind === "VOLUNTEER" &&
                    !["REJECTED", "CANCELLED"].includes(
                      registration.status,
                    ) && (
                      <div className="registration-detail-assignment">
                        <Field label="Alocar em departamento">
                          <select
                            disabled={actionBusy}
                            value={teamId}
                            onChange={(event) => setTeamId(event.target.value)}
                          >
                            <option
                              value=""
                              disabled={registration.status === "CONFIRMED"}
                            >
                              Sem departamento
                            </option>
                            {edition?.teams.map((team) => (
                              <option
                                key={team.id}
                                value={team.id}
                                disabled={
                                  ["APPROVED", "CONFIRMED"].includes(
                                    registration.status,
                                  ) &&
                                  (team.capacity == null ||
                                    (team.available === 0 &&
                                      registration.team?.id !== team.id))
                                }
                              >
                                {team.name} —{" "}
                                {team.available == null
                                  ? "vagas a definir"
                                  : `${team.available} vagas disponíveis`}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <button
                          type="button"
                          className="button outline"
                          disabled={
                            actionBusy ||
                            teamId === (registration.team?.id ?? "")
                          }
                          onClick={() => void assign()}
                        >
                          Salvar departamento
                        </button>
                        {registration.team &&
                          !["APPROVED", "CONFIRMED"].includes(
                            registration.status,
                          ) && (
                            <p className="muted">
                              Indicado — sem reserva. A capacidade será
                              conferida ao aceitar a candidatura.
                            </p>
                          )}
                      </div>
                    )}
                  {canDecide &&
                    statusOptions[registration.status].length > 0 && (
                      <form
                        onSubmit={change}
                        className="registration-detail-decision"
                      >
                        <Field
                          label={
                            registration.campaign.kind === "CAMPER"
                              ? "Decisão sobre a inscrição"
                              : "Decisão sobre a candidatura"
                          }
                        >
                          <select
                            required
                            disabled={actionBusy}
                            value={nextStatus}
                            onChange={(event) =>
                              setNextStatus(
                                event.target.value as RegistrationStatus,
                              )
                            }
                          >
                            <option value=" ">Selecione</option>
                            {statusOptions[registration.status]
                              .filter(
                                (status) =>
                                  status !== "WAITLIST" ||
                                  registration.campaign.allowWaitlist,
                              )
                              .map((status) => (
                                <option
                                  key={status}
                                  value={status}
                                  disabled={
                                    ["CANCELLED", "COMPLETED"].includes(
                                      edition?.status ?? "",
                                    ) && status !== "CANCELLED"
                                  }
                                >
                                  {status === "APPROVED"
                                    ? registration.campaign.kind === "CAMPER"
                                      ? "Aprovar inscrição"
                                      : "Aceitar candidatura"
                                    : status === "REJECTED"
                                      ? registration.campaign.kind === "CAMPER"
                                        ? "Recusar inscrição"
                                        : "Recusar candidatura"
                                      : statusLabels[status]}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="Motivo adicional (opcional)">
                          <textarea
                            disabled={actionBusy}
                            minLength={3}
                            maxLength={500}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                          />
                        </Field>
                        <button
                          className="button primary"
                          disabled={actionBusy || nextStatus === " "}
                        >
                          Salvar decisão
                        </button>
                      </form>
                    )}
                </DetailSection>
              )}

              {membership.role === "ORGANIZER" &&
                ["APPROVED", "REJECTED", "CONFIRMED"].includes(
                  registration.status,
                ) && (
                  <DetailSection
                    title="Convite e presença"
                    summary={presence}
                    {...sectionProps("invitation")}
                  >
                    <DecisionNotice
                      key={`${registration.id}:${registration.status}:${registration.team?.id ?? ""}:${registration.team?.name ?? ""}`}
                      organizationId={organizationId}
                      registrationId={registration.id}
                      embedded
                      onStateChange={onNoticeState}
                      onBusyChange={setNoticeBusy}
                      onError={onNoticeError}
                      onChanged={onChanged}
                    />
                  </DetailSection>
                )}

              {registration.origin === "IMPORT" && (
                <DetailSection
                  title="Importação e pendências"
                  summary={`${pendingInformation.length} ${pendingInformation.length === 1 ? "pendência" : "pendências"}`}
                  {...sectionProps("imports")}
                >
                  <Notice kind="info">
                    {registration.status === "CONFIRMED"
                      ? "Vaga confirmada. "
                      : "Candidatura importada. É possível avaliar, aprovar, alocar departamento e confirmar a vaga. "}
                    {pendingInformation.length > 0 &&
                      "As informações pendentes serão coletadas posteriormente. "}
                    A confirmação da vaga não registra aceites ou autorizações.
                    Quando exigida, a autorização do responsável deve ser obtida
                    antes do evento.
                  </Notice>
                  {registration.importData?.source?.fileName && (
                    <p>
                      Arquivo de origem:{" "}
                      {registration.importData.source.fileName}
                    </p>
                  )}
                  {pendingInformation.length > 0 ? (
                    <div>
                      <h4>Informações pendentes</h4>
                      <ul className="registration-detail-pending-list">
                        {pendingInformation.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p>Sem pendências de complementação.</p>
                  )}
                  {registration.importData?.original && (
                    <div className="registration-detail-original">
                      <button
                        type="button"
                        className="button outline"
                        aria-expanded={showOriginal}
                        onClick={() => setShowOriginal((value) => !value)}
                      >
                        {showOriginal
                          ? "Ocultar respostas originais"
                          : "Ver respostas originais"}
                      </button>
                      {showOriginal && (
                        <dl className="registration-detail-answers">
                          {registration.importData.original.headers.map(
                            (header, index) => (
                              <div key={index}>
                                <dt>{header}</dt>
                                <dd>
                                  {registration.importData!.original!.cells[
                                    index
                                  ] || "Não informado na origem"}
                                </dd>
                              </div>
                            ),
                          )}
                        </dl>
                      )}
                    </div>
                  )}
                  {membership.role === "ORGANIZER" &&
                    correctionRegistration && (
                      <ImportedRegistrationCorrection
                        key={registration.id}
                        organizationId={organizationId}
                        registration={correctionRegistration}
                        onDirtyChange={setCorrectionDirty}
                        onError={onCorrectionError}
                        onSaved={() => {
                          detail.refreshInBackground();
                          onChanged();
                        }}
                      />
                    )}
                </DetailSection>
              )}

              <DetailSection
                title="Histórico e vínculo"
                summary={`${registration.history.length} ${registration.history.length === 1 ? "registro" : "registros"}`}
                {...sectionProps("history")}
              >
                {registration.history.length ? (
                  <ol className="registration-detail-history">
                    {registration.history.map((item) => (
                      <li key={item.id}>
                        <strong>{statusLabels[item.toStatus]}</strong> ·{" "}
                        {dateTime(item.createdAt)}
                        <p>{item.reason}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>Aguardando a primeira análise.</p>
                )}
                {membership.role === "ORGANIZER" && !registration.accountId && (
                  <form
                    onSubmit={manualLink}
                    className="registration-detail-link"
                  >
                    <h4>Vincular ao perfil após comprovação</h4>
                    <p>
                      Confira a identidade da pessoa e peça que entre na
                      plataforma com seu e-mail verificado antes de realizar o
                      vínculo.
                    </p>
                    {error && errorSection === "history" && (
                      <Notice>{error}</Notice>
                    )}
                    <Field label="E-mail verificado da conta" required>
                      <input
                        type="email"
                        required
                        disabled={actionBusy}
                        value={linkEmail}
                        onChange={(event) => setLinkEmail(event.target.value)}
                      />
                    </Field>
                    <Field label="Comprovação conferida" required>
                      <textarea
                        required
                        minLength={10}
                        maxLength={500}
                        disabled={actionBusy}
                        value={linkReason}
                        onChange={(event) => setLinkReason(event.target.value)}
                        placeholder="Registre como a identidade e a participação foram conferidas."
                      />
                    </Field>
                    <button className="button outline" disabled={actionBusy}>
                      Vincular esta inscrição
                    </button>
                  </form>
                )}
              </DetailSection>
            </div>
            <p className="registration-detail-health-note muted">
              Informações médicas ficam na área de cuidados, com autorização
              específica.
            </p>
          </>
        )
      )}
    </div>
  );
}
