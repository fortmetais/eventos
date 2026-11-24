import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpDown,
  CalendarDays,
  CircleAlert,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { DepartmentCapacity } from "../components/DepartmentCapacity";
import { Modal } from "../components/Modal";
import { RegistrationDetail } from "../components/RegistrationDetail";
import { RegistrationInvite } from "../components/RegistrationInvite";
import { RegistrationShareActions } from "../components/RegistrationShareActions";
import { useOrganization } from "./Organization";
import { useAuth } from "../lib/auth";
import { useRemote } from "../lib/hooks";
import { useUnsavedChanges } from "../lib/unsaved-changes";
import { api } from "../lib/api";
import type {
  EventEdition,
  Page,
  Registration,
  RegistrationStatus,
  Team,
} from "../lib/types";
import { date, dateTime, statusLabels } from "../lib/types";
import { registrationPendingInformation } from "../lib/registration-pending";
import { Empty, Field, Loading, Notice, PageHeading } from "../components/ui";
import "../components/RegistrationCards.css";

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
const eventLabels = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
};
const sorts = {
  NAME_ASC: "A–Z",
  NAME_DESC: "Z–A",
  RECEIVED_ASC: "Ordem de inscrição",
  ACCEPTED_FIRST: "Aceitos primeiro",
};
type Sort = keyof typeof sorts;
type RowFeedback = { busy?: boolean; error?: string; info?: string };
function useReviewMedia(media: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia?.(media).matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.(media);
    if (!query) return;
    const update = () => setMatches(query.matches);
    update();
    if (query.addEventListener) {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, [media]);
  return matches;
}
const pendingStates = ["RECEIVED", "REVIEW", "WAITLIST"];
const allocatedStates = ["APPROVED", "CONFIRMED"];
const defaultReasons: Record<RegistrationStatus, string> = {
  RECEIVED:
    "Candidatura devolvida a Recebida pela organização para correção da decisão.",
  REVIEW: "Análise iniciada pela organização na lista de inscrições.",
  APPROVED: "Candidatura aceita pela organização na lista de inscrições.",
  CONFIRMED: "Participação confirmada pela organização na lista de inscrições.",
  WAITLIST:
    "Candidatura encaminhada à lista de espera pela organização na lista de inscrições.",
  REJECTED: "Candidatura recusada pela organização na lista de inscrições.",
  CANCELLED: "Participação cancelada pela organização na lista de inscrições.",
};

export function ReviewRegistrations() {
  const auth = useAuth();
  const { organizationId, membership } = useOrganization();
  const [search, setSearch] = useSearchParams();
  const selectedQuery = search.get("inscricao");
  const [selected, setSelected] = useState(selectedQuery);
  const [navigationPending, setNavigationPending] = useState(false);
  const previousDetailSearch = useRef(search.toString());
  const explicitEvent = search.get("evento") ?? "";
  const explicitCampaign = search.get("campaign") ?? "";
  const openedRegistrationContext = useRef<{
    organizationId: string;
    registrationId: string;
    eventId: string;
    campaignId: string;
  } | null>(null);
  const openedContext =
    openedRegistrationContext.current?.registrationId === selectedQuery &&
    openedRegistrationContext.current.organizationId === organizationId
      ? openedRegistrationContext.current
      : null;
  const direct = useRemote<Registration>(
    selectedQuery
      ? `/organizations/${organizationId}/registrations/${selectedQuery}`
      : null,
  );
  const directRegistration =
    direct.data?.id === selectedQuery ? direct.data : null;
  const eventId =
    directRegistration?.campaign.event.id ||
    openedContext?.eventId ||
    explicitEvent;
  const tab =
    search.get("aba") === "departamentos" ? "departamentos" : "inscricoes";
  const campaignId = selectedQuery
    ? (directRegistration?.campaign.id ?? openedContext?.campaignId ?? "")
    : explicitCampaign;
  const teamId = search.get("team") ?? "";
  const status = search.get("status") ?? "";
  const origin = search.get("origin") ?? "";
  const completeness = search.get("completeness") ?? "";
  const presence = search.get("presence") ?? "";
  const spirituality = search.get("spirituality") ?? "";
  const includeClosed = search.get("includeClosed") === "true";
  const sort = Object.hasOwn(sorts, search.get("sort") ?? "")
    ? (search.get("sort") as Sort)
    : "NAME_ASC";
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(search.get("page") ?? "1", 10) || 1),
  );
  const searchQ = search.get("q") ?? "";
  const [query, setQuery] = useState(searchQ);
  const [showFilters, setShowFilters] = useState(
    Boolean(
      teamId || status || origin || completeness || presence || spirituality,
    ),
  );
  const isMobile = useReviewMedia("(max-width: 800px)");
  const canChooseView = useReviewMedia(
    "(min-width: 1280px) and (orientation: landscape)",
  );
  const view = search.get("exibicao") === "cards" ? "cards" : "lista";
  const desktopCards = canChooseView && view === "cards";
  const cardLayout = isMobile || desktopCards;
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterCount = [
    teamId,
    status,
    origin,
    completeness,
    presence,
    spirituality,
    includeClosed,
  ].filter(Boolean).length;
  useEffect(() => {
    setMobileFiltersOpen(false);
  }, [isMobile, eventId, campaignId, tab, selectedQuery]);
  const [rows, setRows] = useState<Record<string, RowFeedback>>({});
  const inFlight = useRef(new Set<string>());
  const [invite, setInvite] = useState<{
    id: string;
  } | null>(null);
  const [pendingRegistration, setPendingRegistration] =
    useState<Registration | null>(null);
  useEffect(() => {
    setPendingRegistration(null);
  }, [selectedQuery, eventId, campaignId, tab]);
  const [dirty, setDirty] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamCapacity, setTeamCapacity] = useState("");
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState("");
  const creatingTeam = useRef<string | null>(null);
  const teamEdits = useUnsavedChanges(Boolean(teamName || teamCapacity), {
    busy: teamBusy,
  });
  const events = useRemote<EventEdition[]>(
    `/organizations/${organizationId}/events`,
  );
  const edition = events.data?.find((event) => event.id === eventId);
  const campaign = edition?.campaigns.find((item) => item.id === campaignId);
  const camper = campaign?.kind === "CAMPER";
  const teamLabel = camper ? "Equipe" : "Departamento";
  const teamsLabel = camper ? "Equipes" : "Departamentos";
  const workspace = Boolean(edition && campaign);
  const cardEvents = eventId
    ? events.data?.filter((event) => event.id === eventId)
    : events.data;
  const teams = useRemote<Team[]>(
    workspace
      ? `/organizations/${organizationId}/campaigns/${campaignId}/teams`
      : null,
  );
  const context = `${organizationId}:${eventId}:${campaignId}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  const editable = membership.role === "ORGANIZER";
  const canDecide = auth.eventsEnabled || editable;
  const eventClosed =
    edition?.status === "CANCELLED" || edition?.status === "COMPLETED";
  const changeSearch = useCallback(
    (values: Record<string, string | null>, replace = false) => {
      setSearch(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(values)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace },
      );
    },
    [setSearch],
  );
  useEffect(() => {
    if (selectedQuery === selected) {
      if (selected) previousDetailSearch.current = search.toString();
      return;
    }
    if (selected && dirty) setNavigationPending(true);
    else {
      setSelected(selectedQuery);
      setDirty(false);
    }
  }, [selectedQuery, selected, dirty, search]);
  useEffect(() => {
    setQuery(searchQ);
  }, [searchQ]);
  useEffect(() => {
    if (query === searchQ) return;
    const timer = window.setTimeout(
      () => changeSearch({ q: query.trim(), page: null }, true),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [query, searchQ, changeSearch]);
  useEffect(() => {
    if (
      selectedQuery &&
      directRegistration &&
      (explicitEvent !== directRegistration.campaign.event.id ||
        explicitCampaign !== directRegistration.campaign.id)
    )
      changeSearch(
        {
          evento: directRegistration.campaign.event.id,
          campaign: directRegistration.campaign.id,
          ...(explicitCampaign &&
          explicitCampaign !== directRegistration.campaign.id
            ? { team: null, spirituality: null, page: null }
            : {}),
        },
        true,
      );
  }, [
    explicitEvent,
    explicitCampaign,
    selectedQuery,
    directRegistration,
    changeSearch,
  ]);
  useEffect(() => {
    if (camper && spirituality)
      changeSearch({ spirituality: null, page: null }, true);
  }, [camper, spirituality, changeSearch]);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "20",
    eventId,
    sort,
    includeClosed: String(includeClosed),
    ...(searchQ ? { q: searchQ } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(teamId ? { teamId } : {}),
    ...(status ? { status } : {}),
    ...(origin ? { origin } : {}),
    ...(completeness ? { completeness } : {}),
    ...(presence ? { presence } : {}),
    ...(!camper && spirituality ? { spirituality } : {}),
  });
  const list = useRemote<Page<Registration>>(
    workspace && tab === "inscricoes"
      ? `/organizations/${organizationId}/registrations?${params}`
      : null,
  );
  useEffect(() => {
    if (!pendingRegistration || list.loading || !list.data) return;
    const current = list.data.items.find(
      (item) => item.id === pendingRegistration.id,
    );
    if (!current || registrationPendingInformation(current).length === 0)
      setPendingRegistration(null);
    else if (current !== pendingRegistration) setPendingRegistration(current);
  }, [pendingRegistration, list.data, list.loading]);
  const refresh = () => {
    list.refreshInBackground();
    events.refreshInBackground();
    teams.refreshInBackground();
    if (selectedQuery) direct.refreshInBackground();
  };
  useEffect(() => {
    if (!workspace || tab !== "inscricoes") return;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") list.refreshInBackground();
    };
    const timer = window.setInterval(refreshVisible, 30000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [workspace, context, tab, list.refreshInBackground]);
  useEffect(() => {
    if (
      list.data &&
      !list.loading &&
      page > 1 &&
      (page - 1) * 20 >= list.data.total
    ) {
      changeSearch(
        { page: String(Math.max(1, Math.ceil(list.data.total / 20))) },
        true,
      );
    }
  }, [list.data, list.loading, page, changeSearch]);
  useEffect(() => {
    setRows({});
    setTeamError("");
    setTeamName("");
    setTeamCapacity("");
    setTeamBusy(false);
    creatingTeam.current = null;
    setInvite(null);
    setMobileFiltersOpen(false);
  }, [context]);

  async function mutateRow(
    registration: Registration,
    operation: "team" | "status",
    value: string,
  ) {
    if (inFlight.current.has(registration.id)) return;
    const operationContext = context;
    inFlight.current.add(registration.id);
    setRows((previous) => ({ ...previous, [registration.id]: { busy: true } }));
    try {
      const changed = await api<Registration>(
        `/organizations/${organizationId}/registrations/${registration.id}/${operation}`,
        {
          method: operation === "team" ? "PUT" : "PATCH",
          body:
            operation === "team"
              ? { teamId: value || null }
              : {
                  status: value,
                  reason: defaultReasons[value as RegistrationStatus],
                },
        },
      );
      const waiting =
        operation === "status" &&
        value === "CONFIRMED" &&
        changed.status === "WAITLIST";
      if (currentContext.current !== operationContext) return;
      setRows((previous) => ({
        ...previous,
        [registration.id]: waiting
          ? {
              error:
                "Capacidade atingida. A inscrição foi encaminhada para a lista de espera.",
            }
          : {
              info:
                operation === "status" &&
                value === "CONFIRMED" &&
                changed.status === "CONFIRMED" &&
                registration.origin === "IMPORT"
                  ? "Vaga confirmada."
                  : changed.noticeWarning ||
                    (operation === "team"
                      ? `${teamLabel} ${camper ? "salva" : "salvo"}.`
                      : "Decisão salva."),
            },
      }));
    } catch (error) {
      if (currentContext.current !== operationContext) return;
      setRows((previous) => ({
        ...previous,
        [registration.id]: { error: (error as Error).message },
      }));
    } finally {
      inFlight.current.delete(registration.id);
      if (currentContext.current === operationContext) refresh();
    }
  }
  async function createTeam(event: FormEvent) {
    event.preventDefault();
    if (creatingTeam.current === context) return;
    const operationContext = context;
    creatingTeam.current = operationContext;
    setTeamBusy(true);
    setTeamError("");
    try {
      await api(
        `/organizations/${organizationId}/campaigns/${campaignId}/teams`,
        {
          method: "POST",
          body: { name: teamName, capacity: Number(teamCapacity) },
        },
      );
      if (currentContext.current !== operationContext) return;
      teamEdits.markSaved();
      setTeamName("");
      setTeamCapacity("");
      teams.refreshInBackground();
    } catch (error) {
      if (currentContext.current === operationContext)
        setTeamError((error as Error).message);
    } finally {
      if (creatingTeam.current === operationContext)
        creatingTeam.current = null;
      if (currentContext.current === operationContext) setTeamBusy(false);
    }
  }
  function openCampaign(id: string, selectedCampaign: string) {
    setInvite(null);
    setPendingRegistration(null);
    setSearch({
      evento: id,
      campaign: selectedCampaign,
      aba: "inscricoes",
      ...(search.has("exibicao") ? { exibicao: view } : {}),
    });
  }
  function openDetail(registration: Registration) {
    openedRegistrationContext.current = {
      organizationId,
      registrationId: registration.id,
      eventId: registration.campaign.event.id,
      campaignId: registration.campaign.id,
    };
    setPendingRegistration(null);
    setDirty(false);
    changeSearch({ inscricao: registration.id });
  }
  function filter(key: string, value: string) {
    changeSearch({
      [key]: value,
      page: null,
      ...(key === "status" && ["REJECTED", "CANCELLED"].includes(value)
        ? { includeClosed: "true" }
        : {}),
    });
  }
  function decisionLabel(
    value: RegistrationStatus,
    registration: Registration,
  ) {
    if (value === "APPROVED")
      return registration.campaign.kind === "VOLUNTEER" ? "Aceita" : "Aprovada";
    return statusLabels[value];
  }
  function invitation(registration: Registration) {
    if (!allocatedStates.includes(registration.status))
      return <span className="muted">—</span>;
    const summary = registration.decisionSummary;
    const notice = summary?.notice;
    let label = "Convite indisponível",
      color = "unavailable";
    if (summary?.ready && notice?.active) {
      if (notice.declinedAt) {
        label = "Não irei — revisar vaga";
        color = "declined";
      } else if (notice.confirmedAt) {
        label = "Vou participar";
        color = "confirmed";
      } else if (notice.expired) {
        label = "Link expirado";
        color = "pending";
      } else if (notice.emailSentAt || notice.whatsappSentAt) {
        label = "Aguardando resposta";
        color = "waiting";
      } else {
        label =
          notice.emailStatus === "FALHA"
            ? "Falha no envio"
            : "Convite não enviado";
        color = "pending";
      }
    }
    return (
      <button
        type="button"
        className={`review-invite ${color}`}
        disabled={!editable}
        onClick={() => setInvite({ id: registration.id })}
        aria-label={`${label}: ${registration.person.name}`}
      >
        {label}
      </button>
    );
  }
  function row(registration: Registration) {
    const cellRole = cardLayout ? "presentation" : undefined;
    const feedback = rows[registration.id];
    const pending = pendingStates.includes(registration.status);
    const teamAllowed =
      editable &&
      !teams.loading &&
      !teams.error &&
      !eventClosed &&
      (pending || allocatedStates.includes(registration.status));
    const notice = registration.decisionSummary?.notice;
    const pendingInformation = registrationPendingInformation(registration);
    const canShare = Boolean(
      editable &&
      allocatedStates.includes(registration.status) &&
      registration.decisionSummary?.ready &&
      notice?.active,
    );
    const canWhatsApp =
      canShare &&
      /^\d{10,13}$/.test(registration.person.phone?.replace(/\D/g, "") ?? "");
    const whatsappBlockedMessage =
      editable && !allocatedStates.includes(registration.status)
        ? "Disponível após o aceite"
        : undefined;
    const choices = statusOptions[registration.status].filter(
      (choice) => choice !== "WAITLIST" || registration.campaign.allowWaitlist,
    );
    return (
      <tr
        key={registration.id}
        role={cardLayout ? "listitem" : undefined}
        aria-busy={feedback?.busy || undefined}
      >
        <td role={cellRole} className="review-person" data-label="Participante">
          <div className="review-person-heading">
            <strong>{registration.person.name}</strong>
            {pendingInformation.length > 0 && (
              <button
                type="button"
                className="review-pending-trigger"
                aria-label={`Ver pendências de ${registration.person.name}`}
                title="Complementação pendente"
                onClick={() => setPendingRegistration(registration)}
              >
                <CircleAlert size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <small className="review-person-protocol">
            {registration.protocol}
          </small>
          <small className="review-person-campaign">
            {registration.campaign.kind === "VOLUNTEER" ? "Servo" : "Campista"}
            {registration.origin === "IMPORT" ? " · Importada" : ""}
          </small>
          {feedback?.busy && <small role="status">Salvando…</small>}
          {feedback?.error && (
            <small className="field-error" role="alert">
              {feedback.error}
            </small>
          )}
          {feedback?.info && (
            <small className="review-row-success" role="status">
              {feedback.info}
            </small>
          )}
        </td>
        <td
          role={cellRole}
          className="review-cell-department"
          data-label={teamLabel}
        >
          {
            <>
              <select
                aria-label={`${teamLabel} de ${registration.person.name}`}
                value={registration.team?.id ?? ""}
                disabled={!teamAllowed || feedback?.busy}
                onChange={(event) =>
                  void mutateRow(registration, "team", event.target.value)
                }
              >
                <option
                  value=""
                  disabled={!camper && registration.status === "CONFIRMED"}
                >
                  {camper ? "Sem equipe" : "Sem departamento"}
                </option>
                {teams.data?.map((team) => (
                  <option
                    key={team.id}
                    value={team.id}
                    disabled={
                      !pending &&
                      team.id !== registration.team?.id &&
                      (team.capacity == null || team.available === 0)
                    }
                  >
                    {team.name}
                    {team.available == null
                      ? " · vagas a definir"
                      : ` · ${team.available} vagas`}
                  </option>
                ))}
                {registration.team &&
                  !teams.data?.some(
                    (team) => team.id === registration.team!.id,
                  ) && (
                    <option value={registration.team.id}>
                      {registration.team.name}
                    </option>
                  )}
              </select>
              {registration.team && (
                <small className="review-current-department">
                  {registration.team.name}
                </small>
              )}
              {pending && registration.team && (
                <small className="muted">Indicado — sem reserva</small>
              )}
            </>
          }
        </td>
        <td role={cellRole} className="review-cell-detail" data-label="Ficha">
          <button
            type="button"
            className="review-icon-button"
            aria-label={`Abrir ficha de ${registration.person.name}`}
            title="Abrir ficha completa"
            onClick={() => openDetail(registration)}
          >
            <UserRound size={19} />
            <span className="review-action-label">Ver ficha</span>
          </button>
        </td>
        <td
          role={cellRole}
          className="review-cell-decision"
          data-label="Decisão"
        >
          <div className="review-decision-control">
            <select
              aria-label={`Decisão de ${registration.person.name}`}
              value={registration.status}
              disabled={!canDecide || !choices.length || feedback?.busy}
              onChange={(event) =>
                void mutateRow(registration, "status", event.target.value)
              }
            >
              <option value={registration.status}>
                {decisionLabel(registration.status, registration)}
              </option>
              {choices.map((choice) => (
                <option
                  key={choice}
                  value={choice}
                  disabled={eventClosed && choice !== "CANCELLED"}
                >
                  {decisionLabel(choice, registration)}
                </option>
              ))}
            </select>
            <span className="review-decision-value" aria-hidden="true">
              <span>{decisionLabel(registration.status, registration)}</span>
              <ChevronDown size={12} />
            </span>
          </div>
        </td>
        <td
          role={cellRole}
          className="review-cell-invite"
          data-label="Convite / presença"
        >
          {invitation(registration)}
        </td>
        <td
          role={cellRole}
          className="review-cell-whatsapp"
          data-label="Compartilhar"
        >
          <RegistrationShareActions
            organizationId={organizationId}
            registration={registration}
            disabled={Boolean(feedback?.busy)}
            canWhatsApp={canWhatsApp}
            canCopy={canShare}
            whatsappBlockedMessage={whatsappBlockedMessage}
            onChanged={refresh}
          />
          {!canWhatsApp && !whatsappBlockedMessage && (
            <small className="review-whatsapp-hint">
              {!editable
                ? "Sem permissão de envio"
                : !allocatedStates.includes(registration.status)
                  ? "Disponível após o aceite"
                  : canShare
                    ? "Telefone inválido. Use Copiar link."
                    : notice?.expired
                      ? "Renove o link do convite"
                      : "Convite indisponível"}
            </small>
          )}
        </td>
      </tr>
    );
  }

  const filterOptions = (
    <>
      <Field label="Ordenar">
        <div className="review-sort">
          <ArrowUpDown size={17} />
          <select
            value={sort}
            onChange={(event) => filter("sort", event.target.value)}
          >
            {Object.entries(sorts).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </Field>
      <button
        type="button"
        className={`button outline review-closed-toggle ${includeClosed ? "is-active" : ""}`}
        aria-pressed={includeClosed}
        aria-label={
          includeClosed
            ? "Recusadas e canceladas visíveis"
            : "Recusadas e canceladas ocultas"
        }
        title={
          includeClosed
            ? "Ocultar recusadas e canceladas"
            : "Mostrar recusadas e canceladas"
        }
        onClick={() =>
          changeSearch({
            includeClosed: String(!includeClosed),
            page: null,
            ...(!includeClosed
              ? {}
              : ["REJECTED", "CANCELLED"].includes(status)
                ? { status: null }
                : {}),
          })
        }
      >
        {includeClosed ? (
          <Eye size={18} aria-hidden="true" />
        ) : (
          <EyeOff size={18} aria-hidden="true" />
        )}
        <span>
          {includeClosed
            ? "Ocultar recusadas/canceladas"
            : "Mostrar recusadas/canceladas"}
        </span>
      </button>
      <button
        type="button"
        className="review-icon-button"
        aria-label="Atualizar inscrições"
        title="Atualizar inscrições"
        onClick={refresh}
      >
        <RefreshCw size={18} />
        <span className="review-action-label">Atualizar lista</span>
      </button>
    </>
  );
  const moreFiltersToggle = (
    <button
      type="button"
      className="button outline review-more-filters-toggle"
      aria-expanded={showFilters}
      aria-controls="review-more-filters"
      onClick={() => setShowFilters((value) => !value)}
    >
      <SlidersHorizontal size={17} />
      Filtros
    </button>
  );
  const advancedOptions = (
    <div id="review-more-filters" className="review-more-filters">
      <Field label={camper ? "Equipe" : "Equipe/departamento"}>
        <select
          value={teamId}
          onChange={(event) => filter("team", event.target.value)}
        >
          <option value="">Todos</option>
          <option value="NONE">
            {camper ? "Sem equipe" : "Sem departamento"}
          </option>
          {teams.data?.map((team) => (
            <option value={team.id} key={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Estado">
        <select
          value={status}
          onChange={(event) => filter("status", event.target.value)}
        >
          <option value="">Todos</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Origem">
        <select
          value={origin}
          onChange={(event) => filter("origin", event.target.value)}
        >
          <option value="">Todas</option>
          <option value="PUBLIC_FORM">Ficha da aplicação</option>
          <option value="IMPORT">Importada</option>
        </select>
      </Field>
      <Field label="Complementação">
        <select
          value={completeness}
          onChange={(event) => filter("completeness", event.target.value)}
        >
          <option value="">Todas</option>
          <option value="PENDING">Com pendências</option>
          <option value="COMPLETE">Completa</option>
        </select>
      </Field>
      <Field label="Participação no acampamento">
        <select
          value={presence}
          onChange={(event) => filter("presence", event.target.value)}
        >
          <option value="">Todos</option>
          <option value="SEM_RESPOSTA">Não respondeu</option>
          <option value="VOU">Sim</option>
          <option value="NAO_IREI">Não</option>
        </select>
      </Field>
      {!camper && (
        <Field label="Espiritualidade">
          <select
            value={spirituality}
            onChange={(event) => filter("spirituality", event.target.value)}
          >
            <option value="">Todos</option>
            <option value="SEM_RESPOSTA">Não respondeu</option>
            <option value="SIM">Sim</option>
            <option value="NAO">Não</option>
          </select>
        </Field>
      )}
    </div>
  );

  return (
    <div
      className={`registrations-workspace${desktopCards && eventId && tab === "inscricoes" ? " is-card-view" : ""}`}
    >
      {!workspace ? (
        <>
          {eventId && !selectedQuery && (
            <button
              className="text-button review-back"
              type="button"
              onClick={() =>
                setSearch(search.has("exibicao") ? { exibicao: view } : {})
              }
            >
              <ArrowLeft size={17} /> Voltar aos eventos
            </button>
          )}
          <PageHeading title="Inscrições por campanha">
            Escolha Servos ou Campistas para organizar as equipes, analisar
            inscrições e acompanhar as confirmações.
          </PageHeading>
          {!direct.loading &&
            !selectedQuery &&
            explicitCampaign &&
            edition &&
            !campaign && (
              <Notice>
                Campanha indisponível neste evento. Selecione uma das campanhas
                abaixo.
              </Notice>
            )}
          {selected && direct.loading ? (
            <Loading />
          ) : selected && direct.error ? (
            <Notice>{direct.error}</Notice>
          ) : events.loading ? (
            <Loading />
          ) : events.error ? (
            <Notice>{events.error}</Notice>
          ) : cardEvents?.length ? (
            <div className="review-event-grid">
              {cardEvents.flatMap((event) =>
                (["VOLUNTEER", "CAMPER"] as const).map((kind) => {
                  const item = event.campaigns.find(
                    (value) => value.kind === kind,
                  );
                  const audience = kind === "CAMPER" ? "Campistas" : "Servos";
                  const enabled =
                    auth.eventsEnabled ||
                    (kind === "CAMPER"
                      ? auth.camperRegistrationsEnabled !== false
                      : auth.volunteerRegistrationsEnabled !== false);
                  const now = Date.now();
                  const state = !enabled
                    ? "Indisponível"
                    : event.status === "CANCELLED" ||
                        event.status === "COMPLETED"
                      ? eventLabels[event.status]
                      : !item ||
                          event.status === "DRAFT" ||
                          (item.forms &&
                            !item.forms.some((form) => form.publishedAt))
                        ? "Em preparação"
                        : item.paused
                          ? "Pausada"
                          : new Date(item.opensAt).getTime() > now
                            ? "Não iniciada"
                            : new Date(item.closesAt).getTime() < now
                              ? "Encerrada"
                              : "Inscrições abertas";
                  const body = (
                    <>
                      <div className="review-event-art">
                        {event.imageThumbnailUrl || event.imageUrl ? (
                          <img
                            src={event.imageThumbnailUrl || event.imageUrl!}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <CalendarDays size={38} />
                        )}
                        <span
                          className={`review-event-status event-${event.status.toLowerCase()}`}
                        >
                          {state}
                        </span>
                      </div>
                      <div className="review-event-card-body">
                        <small>
                          {event.type?.name} · <strong>{audience}</strong>
                        </small>
                        <h2>{event.name}</h2>
                        <p>
                          <CalendarDays size={15} />
                          {date(event.startsAt)}
                          {event.endsAt !== event.startsAt
                            ? ` a ${date(event.endsAt)}`
                            : ""}
                        </p>
                        <p>{event.city}</p>
                        {item?.opensAt && item.closesAt && (
                          <p>
                            Inscrições: {dateTime(item.opensAt)} até{" "}
                            {dateTime(item.closesAt)}
                          </p>
                        )}
                        <div className="review-event-card-footer">
                          <span>
                            <ClipboardList size={16} />{" "}
                            {item?._count?.registrations ?? 0} inscrições
                            {!item && editable && " · Preparar campanha"}
                          </span>
                          <ChevronRight size={19} />
                        </div>
                      </div>
                    </>
                  );
                  return item || !editable || !enabled ? (
                    <button
                      type="button"
                      className="review-event-card"
                      key={`${event.id}:${kind}`}
                      disabled={!item || !enabled}
                      aria-label={`${audience} — ${event.name} — ${item?._count?.registrations ?? 0} inscrições`}
                      onClick={() => item && openCampaign(event.id, item.id)}
                    >
                      {body}
                    </button>
                  ) : (
                    <Link
                      key={`${event.id}:${kind}`}
                      className="review-event-card"
                      to={`/organizacao/${organizationId}/eventos/${event.id}/ficha-${kind === "CAMPER" ? "campistas" : "servos"}`}
                      aria-label={`Preparar ${audience.toLowerCase()} — ${event.name}`}
                    >
                      {body}
                    </Link>
                  );
                }),
              )}
            </div>
          ) : (
            <Empty title="Nenhum evento disponível">
              Os eventos desta organização aparecerão aqui.
            </Empty>
          )}
        </>
      ) : (
        <>
          <header className="review-event-header">
            <button
              type="button"
              className="text-button review-back"
              onClick={() =>
                void teamEdits.run(() => {
                  setSearch(search.has("exibicao") ? { exibicao: view } : {});
                  setInvite(null);
                })
              }
            >
              <ArrowLeft size={17} />
              Voltar aos eventos
            </button>
            <div className="review-event-heading">
              <h1>
                {edition?.name ??
                  direct.data?.campaign.event.name ??
                  "Inscrições do evento"}
              </h1>
              <p>
                {edition
                  ? `${camper ? "Campistas" : "Servos"} · ${date(edition.startsAt)} · ${edition.city} · ${eventLabels[edition.status]}`
                  : "Organize as candidaturas e acompanhe cada participação."}
              </p>
            </div>
          </header>
          {events.error && <Notice>{events.error}</Notice>}
          {!events.loading && events.data && !edition && (
            <Notice>
              Evento indisponível ou sem acesso nesta organização.
            </Notice>
          )}
          <div className="review-section-navigation">
            <div
              className="review-tabs"
              role="tablist"
              aria-label="Gestão do evento"
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "inscricoes"
                    : event.key === "End"
                      ? "departamentos"
                      : tab === "inscricoes"
                        ? "departamentos"
                        : "inscricoes";
                void teamEdits.run(() => {
                  changeSearch({ aba: next, inscricao: null });
                  document
                    .getElementById(
                      next === "inscricoes"
                        ? "review-registrations-tab"
                        : "review-departments-tab",
                    )
                    ?.focus();
                });
              }}
            >
              <button
                id="review-registrations-tab"
                type="button"
                role="tab"
                aria-controls="review-registrations-panel"
                aria-selected={tab === "inscricoes"}
                tabIndex={tab === "inscricoes" ? 0 : -1}
                onClick={() =>
                  void teamEdits.run(() =>
                    changeSearch({ aba: "inscricoes", inscricao: null }),
                  )
                }
              >
                Inscrições
              </button>
              <button
                id="review-departments-tab"
                type="button"
                role="tab"
                aria-controls="review-departments-panel"
                aria-selected={tab === "departamentos"}
                tabIndex={tab === "departamentos" ? 0 : -1}
                onClick={() =>
                  void teamEdits.run(() =>
                    changeSearch({ aba: "departamentos", inscricao: null }),
                  )
                }
              >
                {teamsLabel} e vagas
              </button>
            </div>
            {canChooseView && tab === "inscricoes" && (
              <div
                role="group"
                aria-label="Modo de exibição"
                className="review-view-switch"
              >
                <button
                  type="button"
                  aria-pressed={view === "lista"}
                  onClick={() => changeSearch({ exibicao: "lista" })}
                >
                  <List size={17} aria-hidden="true" /> Lista
                </button>
                <button
                  type="button"
                  aria-pressed={view === "cards"}
                  onClick={() => changeSearch({ exibicao: "cards" })}
                >
                  <LayoutGrid size={17} aria-hidden="true" /> Cards
                </button>
              </div>
            )}
          </div>
          {tab === "departamentos" ? (
            <section
              id="review-departments-panel"
              role="tabpanel"
              aria-labelledby="review-departments-tab"
            >
              <div className="panel">
                <h2>{teamsLabel} e vagas</h2>
                <p>
                  {camper
                    ? "Organize os campistas em equipes próprias desta campanha. A equipe é opcional para confirmar a vaga. Indicar antes da aprovação não reserva vaga; aprovados ou confirmados alocados ocupam as vagas da equipe."
                    : "Indicar um departamento antes do aceite não reserva vaga. Servos aceitos e alocados ocupam vagas; recusar ou cancelar libera a vaga."}
                </p>
                {teamError && <Notice>{teamError}</Notice>}
                {editable && !eventClosed && (
                  <form className="review-create-team" onSubmit={createTeam}>
                    <Field
                      label={camper ? "Nova equipe" : "Novo departamento"}
                      required
                    >
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        value={teamName}
                        onChange={(event) => setTeamName(event.target.value)}
                        placeholder={
                          camper ? "Ex.: EQUIPE AZUL" : "Ex.: SECRETARIA"
                        }
                      />
                    </Field>
                    <Field label="Vagas" required>
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        step={1}
                        required
                        value={teamCapacity}
                        onChange={(event) =>
                          setTeamCapacity(event.target.value)
                        }
                      />
                    </Field>
                    <button
                      className="button outline"
                      disabled={
                        teamBusy || teams.loading || Boolean(teams.error)
                      }
                    >
                      <Plus size={17} />
                      Criar {camper ? "equipe" : "departamento"}
                    </button>
                  </form>
                )}
                {editable && !camper && (
                  <p className="muted">
                    Após criar um departamento, publique uma nova versão da
                    ficha para incluí-lo nas preferências de novas candidaturas.
                  </p>
                )}
                {teams.loading ? (
                  <Loading />
                ) : teams.error ? (
                  <Notice>{teams.error}</Notice>
                ) : teams.data?.length ? (
                  teams.data.map((team) => (
                    <DepartmentCapacity
                      key={`${team.id}:${team.capacity}:${team.occupied}`}
                      team={team}
                      organizationId={organizationId}
                      campaignId={campaignId}
                      kind={campaign!.kind}
                      editable={editable && !eventClosed}
                      refresh={refresh}
                    />
                  ))
                ) : (
                  <Empty
                    title={
                      camper
                        ? "Nenhuma equipe cadastrada"
                        : "Nenhum departamento cadastrado"
                    }
                  />
                )}
              </div>
            </section>
          ) : (
            <section
              id="review-registrations-panel"
              role="tabpanel"
              aria-labelledby="review-registrations-tab"
            >
              <div className="panel review-controls">
                <div
                  className={`review-toolbar${isMobile ? " review-mobile-controls" : ""}`}
                >
                  <Field label="Pesquisar participante">
                    <div className="review-search">
                      <Search size={18} />
                      <input
                        type="search"
                        aria-label="Pesquisar participante"
                        value={query}
                        maxLength={120}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Nome do participante"
                      />
                    </div>
                  </Field>
                  {!isMobile && filterOptions}
                  {!isMobile && moreFiltersToggle}
                  {isMobile && (
                    <button
                      type="button"
                      className="button outline review-mobile-filter-trigger"
                      aria-label={`Filtros e ordenação${filterCount ? `, ${filterCount} filtros ativos` : ""}`}
                      aria-haspopup="dialog"
                      aria-expanded={mobileFiltersOpen}
                      onClick={() => setMobileFiltersOpen(true)}
                    >
                      <SlidersHorizontal size={19} />
                      <span>Filtros</span>
                      {filterCount > 0 && (
                        <span
                          className="review-filter-count"
                          aria-hidden="true"
                        >
                          {filterCount}
                        </span>
                      )}
                    </button>
                  )}
                </div>
                {isMobile && (
                  <p className="review-mobile-filter-summary">
                    {sorts[sort]} ·{" "}
                    {includeClosed
                      ? "Inclui recusadas e canceladas"
                      : "Recusadas e canceladas ocultas"}
                    {filterCount > 0 ? ` · ${filterCount} filtros ativos` : ""}
                  </p>
                )}
                {!isMobile && showFilters && advancedOptions}
              </div>
              {list.error && <Notice>{list.error}</Notice>}
              {teams.error && <Notice>{teams.error}</Notice>}
              <div className="panel review-list-panel">
                {list.loading ? (
                  <Loading />
                ) : list.data?.items.length ? (
                  <>
                    <div className="review-list-caption">
                      <strong>
                        {list.data.total}{" "}
                        {list.data.total === 1
                          ? "inscrição encontrada"
                          : "inscrições encontradas"}
                      </strong>
                      <small>
                        Confirmação de presença não substitui a confirmação
                        final pela organização.
                      </small>
                    </div>
                    <table
                      role={cardLayout ? "presentation" : undefined}
                      className={`review-registration-table${cardLayout ? " review-card-list" : ""}`}
                    >
                      <thead>
                        <tr>
                          <th>Participante</th>
                          <th>{teamLabel}</th>
                          <th>Ficha</th>
                          <th>Decisão</th>
                          <th>Convite / presença</th>
                          <th>Compartilhar</th>
                        </tr>
                      </thead>
                      <tbody
                        role={cardLayout ? "list" : undefined}
                        aria-label={
                          cardLayout ? "Inscrições em cards" : undefined
                        }
                      >
                        {list.data.items.map(row)}
                      </tbody>
                    </table>
                    <div className="pagination">
                      <button
                        disabled={page === 1}
                        onClick={() => changeSearch({ page: String(page - 1) })}
                      >
                        Anterior
                      </button>
                      <span>
                        Página {page} de{" "}
                        {Math.max(1, Math.ceil(list.data.total / 20))}
                      </span>
                      <button
                        disabled={page * 20 >= list.data.total}
                        onClick={() => changeSearch({ page: String(page + 1) })}
                      >
                        Próxima
                      </button>
                    </div>
                  </>
                ) : (
                  !list.error && (
                    <Empty title="Nenhuma inscrição neste filtro">
                      Ajuste a pesquisa ou os filtros para encontrar outras
                      candidaturas.
                    </Empty>
                  )
                )}
              </div>
            </section>
          )}
        </>
      )}
      {isMobile && mobileFiltersOpen && (
        <Modal
          title="Filtros e ordenação"
          onClose={() => setMobileFiltersOpen(false)}
        >
          <div className="review-mobile-filter-panel">
            {filterOptions}
            {advancedOptions}
          </div>
          <div className="review-mobile-filter-footer">
            <button
              type="button"
              className="button outline"
              onClick={() =>
                changeSearch({
                  team: null,
                  status: null,
                  origin: null,
                  completeness: null,
                  presence: null,
                  spirituality: null,
                  includeClosed: null,
                  sort: null,
                  page: null,
                })
              }
            >
              Limpar filtros
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => setMobileFiltersOpen(false)}
            >
              {list.loading
                ? "Ver inscrições"
                : `Ver ${list.data?.total ?? 0} ${list.data?.total === 1 ? "inscrição" : "inscrições"}`}
            </button>
          </div>
        </Modal>
      )}
      {selected && (
        <Modal
          title="Ficha do participante"
          dirty={dirty}
          closeRequested={navigationPending}
          onKeepEditing={() => {
            setSearch(previousDetailSearch.current, { replace: true });
            setNavigationPending(false);
          }}
          onClose={() => {
            setDirty(false);
            if (navigationPending) {
              setSelected(selectedQuery);
              setNavigationPending(false);
            } else {
              setSelected(null);
              changeSearch({ inscricao: null });
            }
          }}
        >
          <RegistrationDetail
            key={selected}
            organizationId={organizationId}
            registrationId={selected}
            onChanged={refresh}
            onDirtyChange={setDirty}
            teamContext={{
              campaignId,
              teams: teams.data,
              loading: teams.loading,
              error: teams.error,
            }}
          />
        </Modal>
      )}
      {pendingRegistration && (
        <Modal
          title="Informações pendentes"
          onClose={() => setPendingRegistration(null)}
        >
          <h3>{pendingRegistration.person.name}</h3>
          <p>
            {pendingRegistration.status === "CONFIRMED"
              ? "A vaga está confirmada. "
              : "A vaga pode ser confirmada antes da complementação. "}
            As informações abaixo continuam pendentes e serão coletadas
            posteriormente.
          </p>
          <ul className="review-pending-information">
            {registrationPendingInformation(pendingRegistration).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="muted">
            A confirmação da vaga não registra aceites nem autorizações. Quando
            exigida, a autorização do responsável deve ser obtida antes do
            evento.
          </p>
          <button
            type="button"
            className="button outline"
            onClick={() => openDetail(pendingRegistration)}
          >
            Abrir ficha
          </button>
        </Modal>
      )}
      {invite && (
        <Modal
          title="Convite e confirmação de presença"
          onClose={() => setInvite(null)}
        >
          <RegistrationInvite
            key={invite.id}
            organizationId={organizationId}
            registrationId={invite.id}
            onChanged={refresh}
            onClose={() => setInvite(null)}
          />
        </Modal>
      )}
    </div>
  );
}
