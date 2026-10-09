import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { DepartmentCapacity } from "../components/DepartmentCapacity";
import { ClipboardList, Plus } from "lucide-react";
import { useOrganization } from "./Organization";
import { useAuth } from "../lib/auth";
import { useRemote } from "../lib/hooks";
import { api } from "../lib/api";
import { DecisionNotice } from "../components/DecisionNotice";
import type {
  EventEdition,
  Page,
  Registration,
  RegistrationStatus,
} from "../lib/types";
import { date, dateTime, statusLabels } from "../lib/types";
import {
  Badge,
  Empty,
  Field,
  Loading,
  Notice,
  PageHeading,
} from "../components/ui";
const statusOptions: Record<RegistrationStatus, RegistrationStatus[]> = {
  RECEIVED: ["REVIEW", "REJECTED", "CANCELLED"],
  REVIEW: ["APPROVED", "WAITLIST", "REJECTED", "CANCELLED"],
  APPROVED: ["CONFIRMED", "WAITLIST", "REJECTED", "CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  WAITLIST: ["REVIEW", "APPROVED", "CANCELLED", "REJECTED"],
  REJECTED: [],
  CANCELLED: [],
};
export function ReviewRegistrations() {
  const auth = useAuth();
  const { organizationId, membership } = useOrganization();
  const events = useRemote<EventEdition[]>(
    `/organizations/${organizationId}/events`,
  );
  const [search] = useSearchParams();
  const [eventId, setEventId] = useState(search.get("evento") ?? "");
  const [campaignId, setCampaignId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamCapacity, setTeamCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams({
    page: String(page),
    ...(eventId ? { eventId } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(status ? { status } : {}),
  });
  const list = useRemote<Page<Registration>>(
    `/organizations/${organizationId}/registrations?${params}`,
  );
  const detail = useRemote<Registration>(
    selected
      ? `/organizations/${organizationId}/registrations/${selected}`
      : null,
  );
  const [photo, setPhoto] = useState("");
  const [reason, setReason] = useState("");
  const [nextStatus, setNextStatus] = useState<RegistrationStatus | " ">(" ");
  const [teamId, setTeamId] = useState("");
  const [linkEmail, setLinkEmail] = useState("");
  const [linkReason, setLinkReason] = useState("");
  const [info, setInfo] = useState("");
  const canDecide = auth.eventsEnabled || membership.role === "ORGANIZER";
  async function choose(id: string) {
    setLinkEmail("");
    setLinkReason("");
    setInfo("");
    setError("");
    setSelected(id);
    setReason("");
    setNextStatus(" ");
    setPhoto("");
    setTeamId("");
    try {
      const result = await api<{ url: string }>(
        `/organizations/${organizationId}/registrations/${id}/photo`,
      );
      setPhoto(result.url);
    } catch {}
  }
  async function change(e: FormEvent) {
    e.preventDefault();
    if (!selected || nextStatus === " ") return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const changed = await api<Registration>(
        `/organizations/${organizationId}/registrations/${selected}/status`,
        { method: "PATCH", body: { status: nextStatus, reason } },
      );
      list.refresh();
      detail.refresh();
      events.refresh();
      if (changed.noticeWarning) setInfo(changed.noticeWarning);
      setNextStatus(" ");
      setReason("");
      if (nextStatus === "CONFIRMED" && changed.status === "WAITLIST")
        setError(
          "A capacidade foi atingida. A inscrição foi encaminhada para a lista de espera.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createTeam(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/organizations/${organizationId}/events/${eventId}/teams`, {
        method: "POST",
        body: { name: teamName, capacity: Number(teamCapacity) },
      });
      setTeamName("");
      setTeamCapacity("");
      events.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function assign() {
    if (!selected || !teamId) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/organizations/${organizationId}/registrations/${selected}/team`,
        { method: "PUT", body: { teamId } },
      );
      detail.refresh();
      list.refresh();
      events.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const registration = detail.data;
  async function manualLink(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/organizations/${organizationId}/registrations/${selected}/link`,
        { method: "POST", body: { email: linkEmail, reason: linkReason } },
      );
      setInfo("Inscrição vinculada à conta após a comprovação registrada.");
      detail.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const edition = events.data?.find(
    (e) => e.id === registration?.campaign.event.id,
  );
  return (
    <>
      <PageHeading
        title={
          auth.eventsEnabled
            ? "Inscrições e departamentos"
            : "Candidaturas de servos"
        }
      >
        Receber uma ficha é o início. Analise, aprove e confirme cada
        participação.
      </PageHeading>
      {error && <Notice>{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      <div className="filter-bar admin-filters">
        <Field label="Evento">
          <select
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setCampaignId("");
              setPage(1);
            }}
          >
            <option value="">Todos os eventos</option>
            {events.data?.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Campanha">
          <select
            value={campaignId}
            onChange={(e) => {
              setCampaignId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {events.data
              ?.filter((e) => !eventId || e.id === eventId)
              .flatMap((e) =>
                e.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {e.name} · {c.kind === "CAMPER" ? "Campistas" : "Servos"}
                  </option>
                )),
              )}
          </select>
        </Field>
        <Field label="Estado">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {membership.role === "ORGANIZER" && eventId && (
        <form className="panel inline-form" onSubmit={createTeam}>
          <Field label="Novo departamento desta edição">
            <input
              required
              minLength={2}
              maxLength={100}
              placeholder="Ex.: MANUTENÇÃO, ANJO, LÍDER"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </Field>
          <Field label="Vagas do novo departamento" required>
            <input
              type="number"
              required
              min={0}
              max={100000}
              step={1}
              value={teamCapacity}
              onChange={(event) => setTeamCapacity(event.target.value)}
            />
          </Field>
          <button className="button outline" disabled={busy}>
            <Plus size={17} />
            Criar departamento
          </button>
          <p className="muted">
            Após criar um departamento, publique uma nova versão da ficha para
            incluí-lo nas preferências de novas candidaturas.
          </p>
        </form>
      )}
      {eventId && (
        <section className="panel">
          <h2>Departamentos e vagas</h2>
          <p>
            Servos aprovados e alocados ocupam vagas. Cancelar ou recusar a
            participação libera a vaga.
          </p>
          {events.data
            ?.find((event) => event.id === eventId)
            ?.teams.map((team) => (
              <DepartmentCapacity
                key={`${team.id}:${team.capacity}:${team.occupied}`}
                team={team}
                organizationId={organizationId}
                editable={
                  membership.role === "ORGANIZER" &&
                  events.data?.find((event) => event.id === eventId)
                    ?.departmentsReady === true
                }
                refresh={events.refresh}
              />
            ))}
          {events.data?.find((event) => event.id === eventId)
            ?.departmentsReady === false && (
            <Notice kind="info">
              Definir as vagas aguarda a atualização do banco pelo SQL 08.
            </Notice>
          )}
        </section>
      )}
      <div className={`review-layout ${selected ? "with-detail" : ""}`}>
        <section className="panel">
          {list.loading ? (
            <Loading />
          ) : list.error ? (
            <Notice>{list.error}</Notice>
          ) : list.data?.items.length ? (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Participante</th>
                      <th>Campanha</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.person.name}</strong>
                          <small>{r.protocol}</small>
                        </td>
                        <td>
                          {r.campaign.kind === "CAMPER" ? "Campista" : "Servo"}
                          <small>{r.campaign.event.name}</small>
                        </td>
                        <td>
                          <Badge status={r.status} />
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => void choose(r.id)}
                          >
                            Abrir ficha
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <span>
                  {list.data.total} inscrições · Página {page}
                </span>
                <button
                  disabled={page * 20 >= list.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            </>
          ) : (
            <Empty title="Nenhuma inscrição neste filtro">
              <ClipboardList size={20} /> As fichas recebidas aparecerão aqui.
            </Empty>
          )}
        </section>
        {selected && (
          <aside className="panel registration-detail">
            <button className="text-button" onClick={() => setSelected(null)}>
              Fechar ficha ×
            </button>
            {detail.loading ? (
              <Loading />
            ) : detail.error ? (
              <Notice>{detail.error}</Notice>
            ) : (
              registration && (
                <>
                  <div className="review-summary">
                    {photo && (
                      <img
                        src={photo}
                        alt={`Foto de ${registration.person.name}`}
                      />
                    )}
                    <div>
                      <h2>{registration.person.name}</h2>
                      <Badge status={registration.status} />
                    </div>
                  </div>
                  <p className="protocol-small">{registration.protocol}</p>
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
                    {registration.form?.config.volunteer &&
                      registration.snapshot.birthDate && (
                        <>
                          <dt>Idade no início do evento</dt>
                          <dd>
                            {(() => {
                              const birth = new Date(
                                  registration.snapshot.birthDate!,
                                ),
                                at = new Date(
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
                        </>
                      )}
                    <dt>Emergência</dt>
                    <dd>
                      {registration.snapshot.emergencyName} ·{" "}
                      {registration.snapshot.emergencyPhone}
                    </dd>
                    {registration.snapshot.cpf && (
                      <>
                        <dt>CPF</dt>
                        <dd>{registration.snapshot.cpf}</dd>
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
                  {Object.entries(registration.snapshot.answers ?? {}).length >
                    0 && (
                    <details>
                      <summary>
                        {registration.form?.config.volunteer
                          ? "Respostas da ficha de intenção"
                          : "Respostas adicionais"}
                      </summary>
                      {Object.entries(registration.snapshot.answers ?? {}).map(
                        ([key, value]) => (
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
                        ),
                      )}
                    </details>
                  )}
                  {membership.role === "ORGANIZER" &&
                    registration.campaign.kind === "VOLUNTEER" &&
                    ["APPROVED", "CONFIRMED"].includes(registration.status) && (
                      <div className="team-assignment">
                        <Field label="Alocar em departamento">
                          <select
                            value={teamId}
                            onChange={(e) => setTeamId(e.target.value)}
                          >
                            <option value="">Selecione</option>
                            {edition?.teams.map((t) => (
                              <option
                                key={t.id}
                                value={t.id}
                                disabled={
                                  t.capacity == null ||
                                  (t.available === 0 &&
                                    registration.team?.id !== t.id)
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
                          disabled={!teamId || busy}
                          onClick={() => void assign()}
                        >
                          Salvar departamento
                        </button>
                      </div>
                    )}
                  {membership.role === "ORGANIZER" &&
                    registration.campaign.kind === "VOLUNTEER" &&
                    ["APPROVED", "REJECTED", "CONFIRMED"].includes(
                      registration.status,
                    ) && (
                      <DecisionNotice
                        key={`${registration.id}:${registration.status}`}
                        organizationId={organizationId}
                        registrationId={registration.id}
                      />
                    )}
                  {canDecide &&
                    statusOptions[registration.status].length > 0 && (
                      <form onSubmit={change}>
                        <hr />
                        <Field label="Decisão sobre a candidatura">
                          <select
                            required
                            value={nextStatus}
                            onChange={(e) =>
                              setNextStatus(
                                e.target.value as RegistrationStatus,
                              )
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
                                <option key={s} value={s}>
                                  {s === "APPROVED"
                                    ? "Aceitar candidatura"
                                    : s === "REJECTED"
                                      ? "Recusar candidatura"
                                      : statusLabels[s]}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="Motivo" required>
                          <textarea
                            required
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
                  {membership.role === "ORGANIZER" &&
                    !registration.accountId && (
                      <details>
                        <summary>Vincular ao perfil após comprovação</summary>
                        <p>
                          Confira a identidade da pessoa e peça que entre na
                          plataforma com seu e-mail verificado antes de realizar
                          o vínculo.
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
                    Informações médicas ficam na área de cuidados, com
                    autorização específica.
                  </p>
                </>
              )
            )}
          </aside>
        )}
      </div>
    </>
  );
}
