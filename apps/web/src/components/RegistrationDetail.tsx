import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
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
import { Badge, Field, Loading, Notice } from "./ui";
import { GuardianNotice } from "./GuardianNotice";
import { DecisionNotice } from "./DecisionNotice";
import { ImportedRegistrationCorrection } from "./ImportedRegistrationCorrection";
const statusOptions: Record<RegistrationStatus, RegistrationStatus[]> = {
  RECEIVED: ["REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
  REVIEW: ["APPROVED", "WAITLIST", "REJECTED", "CANCELLED"],
  APPROVED: ["CONFIRMED", "WAITLIST", "REJECTED", "CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  WAITLIST: ["REVIEW", "APPROVED", "CANCELLED", "REJECTED"],
  REJECTED: [],
  CANCELLED: [],
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
  const registration = detail.data;
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
  useEffect(() => {
    setTeamId(undefined);
  }, [registration?.team?.id, registrationId]);
  // The containing dialog must receive edits before the next native Escape or
  // navigation event. A passive effect can leave its close handler briefly clean.
  useLayoutEffect(() => {
    onDirtyChange?.(
      busy ||
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
    busy,
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
      detail.refresh();
      events.refresh();
      onChanged();
      setNextStatus(" ");
      setReason("");
      if (changed.noticeWarning) setInfo(changed.noticeWarning);
      if (nextStatus === "CONFIRMED" && changed.status === "WAITLIST")
        setError(
          "A capacidade foi atingida. A inscrição foi encaminhada para a lista de espera.",
        );
    } catch (e) {
      setError((e as Error).message);
      detail.refresh();
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
      detail.refresh();
      events.refresh();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
      setTeamId(registration?.team?.id ?? "");
      detail.refresh();
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
      detail.refresh();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="registration-detail">
      {error && <Notice>{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      {registration && (
        <GuardianNotice
          key={registration.id}
          organizationId={organizationId}
          registrationId={registration.id}
        />
      )}
      {detail.loading ? (
        <Loading />
      ) : detail.error ? (
        <Notice>{detail.error}</Notice>
      ) : (
        registration && (
          <>
            <div className="review-summary">
              {photo && (
                <img src={photo} alt={`Foto de ${registration.person.name}`} />
              )}
              <div>
                <h2>{registration.person.name}</h2>
                <Badge status={registration.status} />
              </div>
            </div>
            <p className="protocol-small">{registration.protocol}</p>
            {registration.origin === "IMPORT" && (
              <section aria-label="Origem e pendências da importação">
                <Notice kind="info">
                  Candidatura importada. É possível avaliar, aprovar e reservar
                  departamento. A confirmação final exige a complementação pelo
                  participante, disponível na próxima entrega.
                </Notice>
                {registration.importData?.source?.fileName && (
                  <p>
                    Arquivo de origem: {registration.importData.source.fileName}
                  </p>
                )}
                {!!registration.importData?.pending?.length && (
                  <details open>
                    <summary>Pendências para confirmação</summary>
                    <ul>
                      {registration.importData.pending.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {registration.importData?.original && (
                  <details>
                    <summary>Respostas originais importadas</summary>
                    <dl className="review-list">
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
                  </details>
                )}
              </section>
            )}
            {membership.role === "ORGANIZER" &&
              registration.origin === "IMPORT" && (
                <ImportedRegistrationCorrection
                  key={`${registration.id}:${registration.updatedAt}`}
                  organizationId={organizationId!}
                  registration={registration}
                  onDirtyChange={setCorrectionDirty}
                  onSaved={() => {
                    detail.refresh();
                    onChanged();
                  }}
                />
              )}
            <dl className="review-list">
              <dt>Evento</dt>
              <dd>{registration.campaign.event.name}</dd>
              <dt>Telefone</dt>
              <dd>{registration.snapshot.phone}</dd>
              <dt>E-mail</dt>
              <dd>{registration.snapshot.email || "Não informado"}</dd>
              <dt>Nascimento</dt>
              <dd>
                {registration.snapshot.birthDate &&
                  date(registration.snapshot.birthDate)}
              </dd>
              {(registration.form?.config.volunteer ||
                registration.form?.config.camper) &&
                registration.snapshot.birthDate && (
                  <>
                    <dt>Idade no início do evento</dt>
                    <dd>
                      {(() => {
                        const birth = new Date(
                            registration.snapshot.birthDate!,
                          ),
                          at = new Date(registration.campaign.event.startsAt);
                        let age = at.getUTCFullYear() - birth.getUTCFullYear();
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
                  </>
                )}
              {(registration.snapshot.emergencyName ||
                registration.snapshot.emergencyPhone ||
                registration.snapshot.emergencyRelationship) && (
                <>
                  <dt>Emergência</dt>
                  <dd>
                    {registration.snapshot.emergencyName}{" "}
                    {registration.snapshot.emergencyPhone &&
                      `· ${registration.snapshot.emergencyPhone}`}{" "}
                    {registration.snapshot.emergencyRelationship}
                  </dd>
                </>
              )}
              {registration.snapshot.cpf && (
                <>
                  <dt>CPF</dt>
                  <dd>{registration.snapshot.cpf}</dd>
                </>
              )}
              {registration.snapshot.emergencyAlternativePhone && (
                <>
                  <dt>Telefone alternativo de emergência</dt>
                  <dd>{registration.snapshot.emergencyAlternativePhone}</dd>
                </>
              )}
              {registration.snapshot.address && (
                <>
                  <dt>Endereço</dt>
                  <dd>{registration.snapshot.address}</dd>
                </>
              )}
              {registration.snapshot.shirt && (
                <>
                  <dt>Camiseta</dt>
                  <dd>{registration.snapshot.shirt}</dd>
                </>
              )}
              {registration.snapshot.guardianName && (
                <>
                  <dt>Responsável</dt>
                  <dd>
                    {registration.snapshot.guardianName} ·{" "}
                    {registration.snapshot.guardianPhone}
                  </dd>
                </>
              )}
              {registration.snapshot.availability && (
                <>
                  <dt>Disponibilidade</dt>
                  <dd>{registration.snapshot.availability}</dd>
                </>
              )}
            </dl>
            {registration.team && (
              <p>
                Departamento: <strong>{registration.team.name}</strong>
              </p>
            )}
            {Object.entries(registration.snapshot.answers ?? {}).length > 0 && (
              <details>
                <summary>
                  {registration.form?.config.volunteer
                    ? "Respostas da ficha de intenção"
                    : "Respostas adicionais"}
                </summary>
                {Object.entries(registration.snapshot.answers ?? {})
                  .filter(
                    ([key]) =>
                      !answerOrder || answerOrder.includes(`question:${key}`),
                  )
                  .sort(([a], [b]) =>
                    answerOrder
                      ? answerOrder.indexOf(`question:${a}`) -
                        answerOrder.indexOf(`question:${b}`)
                      : 0,
                  )
                  .map(([key, value]) => (
                    <p key={key}>
                      <strong>
                        {registration.form?.config.questions.find(
                          (q) => q.id === key,
                        )?.label ?? key}
                      </strong>
                      <br />
                      {Array.isArray(value)
                        ? value.join(", ")
                        : typeof value === "boolean"
                          ? value
                            ? "Sim"
                            : "Não"
                          : String(value)}
                    </p>
                  ))}
              </details>
            )}
            {membership.role === "ORGANIZER" &&
              registration.campaign.kind === "VOLUNTEER" &&
              !["REJECTED", "CANCELLED"].includes(registration.status) && (
                <div className="team-assignment">
                  <Field label="Alocar em departamento">
                    <select
                      value={teamId}
                      onChange={(e) => setTeamId(e.target.value)}
                    >
                      <option
                        value=""
                        disabled={registration.status === "CONFIRMED"}
                      >
                        Sem departamento
                      </option>
                      {edition?.teams.map((t) => (
                        <option
                          key={t.id}
                          value={t.id}
                          disabled={
                            ["APPROVED", "CONFIRMED"].includes(
                              registration.status,
                            ) &&
                            (t.capacity == null ||
                              (t.available === 0 &&
                                registration.team?.id !== t.id))
                          }
                        >
                          {t.name} —{" "}
                          {t.available == null
                            ? "vagas a definir"
                            : `${t.available} vagas disponíveis`}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    className="button outline"
                    disabled={busy || teamId === (registration.team?.id ?? "")}
                    onClick={() => void assign()}
                  >
                    Salvar departamento
                  </button>
                  {registration.team &&
                    !["APPROVED", "CONFIRMED"].includes(
                      registration.status,
                    ) && (
                      <p className="muted">
                        Indicado — sem reserva. A capacidade será conferida ao
                        aceitar a candidatura.
                      </p>
                    )}
                </div>
              )}
            {membership.role === "ORGANIZER" &&
              ["APPROVED", "REJECTED", "CONFIRMED"].includes(
                registration.status,
              ) && (
                <DecisionNotice
                  key={`${registration.id}:${registration.status}:${registration.team?.id ?? ""}:${registration.team?.name ?? ""}`}
                  organizationId={organizationId}
                  registrationId={registration.id}
                  onChanged={onChanged}
                />
              )}
            {canDecide && statusOptions[registration.status].length > 0 && (
              <form onSubmit={change}>
                <hr />
                <Field
                  label={
                    registration.campaign.kind === "CAMPER"
                      ? "Decisão sobre a inscrição"
                      : "Decisão sobre a candidatura"
                  }
                >
                  <select
                    required
                    value={nextStatus}
                    onChange={(e) =>
                      setNextStatus(e.target.value as RegistrationStatus)
                    }
                  >
                    <option value=" ">Selecione</option>
                    {statusOptions[registration.status]
                      .filter(
                        (s) =>
                          s !== "WAITLIST" ||
                          registration.campaign.allowWaitlist,
                      )
                      .map((s) => (
                        <option
                          key={s}
                          value={s}
                          disabled={
                            s === "CONFIRMED" &&
                            registration.origin === "IMPORT"
                          }
                        >
                          {s === "APPROVED"
                            ? registration.campaign.kind === "CAMPER"
                              ? "Aprovar inscrição"
                              : "Aceitar candidatura"
                            : s === "REJECTED"
                              ? registration.campaign.kind === "CAMPER"
                                ? "Recusar inscrição"
                                : "Recusar candidatura"
                              : statusLabels[s]}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Motivo adicional (opcional)">
                  <textarea
                    minLength={3}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <button
                  className="button primary"
                  disabled={busy || nextStatus === " "}
                >
                  Salvar decisão
                </button>
              </form>
            )}
            <details>
              <summary>Histórico de análise</summary>
              {registration.history.length ? (
                registration.history.map((h) => (
                  <p key={h.id}>
                    <strong>{statusLabels[h.toStatus]}</strong> ·{" "}
                    {dateTime(h.createdAt)}
                    <br />
                    {h.reason}
                  </p>
                ))
              ) : (
                <p>Aguardando a primeira análise.</p>
              )}
            </details>
            {membership.role === "ORGANIZER" && !registration.accountId && (
              <details>
                <summary>Vincular ao perfil após comprovação</summary>
                <p>
                  Confira a identidade da pessoa e peça que entre na plataforma
                  com seu e-mail verificado antes de realizar o vínculo.
                </p>
                <form onSubmit={manualLink}>
                  <Field label="E-mail verificado da conta" required>
                    <input
                      type="email"
                      required
                      value={linkEmail}
                      onChange={(e) => setLinkEmail(e.target.value)}
                    />
                  </Field>
                  <Field label="Comprovação conferida" required>
                    <textarea
                      required
                      minLength={10}
                      maxLength={500}
                      value={linkReason}
                      onChange={(e) => setLinkReason(e.target.value)}
                      placeholder="Registre como a identidade e a participação foram conferidas."
                    />
                  </Field>
                  <button className="button outline" disabled={busy}>
                    Vincular esta inscrição
                  </button>
                </form>
              </details>
            )}
            <p className="muted">
              Informações médicas ficam na área de cuidados, com autorização
              específica.
            </p>
          </>
        )
      )}
    </div>
  );
}
