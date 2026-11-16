import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { useRemote } from "../lib/hooks";
import {
  date,
  dateTime,
  type EventEdition,
  type EventRegistrationSummary,
  type Role,
} from "../lib/types";
import { Empty, Field, Loading, Notice } from "./ui";
import "./EventRegistrationDashboard.css";

const eventLabels: Record<EventEdition["status"], string> = {
  DRAFT: "Em preparação",
  PUBLISHED: "Publicado",
  COMPLETED: "Realizado",
  CANCELLED: "Cancelado",
};

export function registrationDashboardAvailable(
  flags: {
    eventsEnabled?: boolean;
    volunteerRegistrationsReady?: boolean;
    camperRegistrationsReady?: boolean;
  },
  role: Role,
) {
  return (
    (role === "ORGANIZER" || role === "SECRETARY") &&
    (flags.eventsEnabled === true ||
      flags.volunteerRegistrationsReady === true ||
      flags.camperRegistrationsReady === true)
  );
}

export function defaultRegistrationDashboardEvent(
  events: EventEdition[],
  now = new Date(),
) {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // Event dates are PostgreSQL DATE values, serialized at UTC midnight. Keep
  // their calendar date; only the current day is derived in Brasília's zone.
  const start = (event: EventEdition) => event.startsAt.slice(0, 10);
  const end = (event: EventEdition) => event.endsAt.slice(0, 10);
  const latest = (left: EventEdition, right: EventEdition) =>
    start(right).localeCompare(start(left)) || left.id.localeCompare(right.id);
  return (
    events
      .filter(
        (event) =>
          event.status === "PUBLISHED" &&
          start(event) <= today &&
          end(event) >= today,
      )
      .sort(latest)[0] ??
    events
      .filter((event) => event.status === "PUBLISHED" && start(event) > today)
      .sort((left, right) => -latest(left, right))[0] ??
    events
      .filter(
        (event) =>
          ["PUBLISHED", "COMPLETED"].includes(event.status) &&
          end(event) < today,
      )
      .sort(latest)[0] ??
    null
  );
}

export function EventRegistrationDashboard({
  organizationId,
}: {
  organizationId: string;
}) {
  const [search, setSearch] = useSearchParams();
  const requestedEvent = search.get("evento") ?? "";
  const campaignId = search.get("campaign") ?? "";
  const events = useRemote<EventEdition[]>(
    `/organizations/${organizationId}/events`,
  );
  const eventOptions =
    events.data?.filter((item) => item.organizationId === organizationId) ?? [];
  const defaultEvent = defaultRegistrationDashboardEvent(eventOptions);
  const eventId = requestedEvent || defaultEvent?.id || "";
  const event = eventOptions.find((item) => item.id === eventId);
  const context = `${organizationId}:${event?.id ?? ""}`;
  const [snapshot, setSnapshot] = useState<{
    context: string;
    value: EventRegistrationSummary;
  } | null>(null);
  const [requestState, setRequestState] = useState({
    context: "",
    busy: false,
    error: "",
  });
  const [revision, setRevision] = useState(0);
  const running = useRef(false);
  const summary =
    snapshot?.context === context && snapshot.value.eventId === eventId
      ? snapshot.value
      : null;
  const busy = requestState.context === context && requestState.busy;
  const error = requestState.context === context ? requestState.error : "";
  useEffect(() => {
    if (requestedEvent || !defaultEvent) return;
    setSearch(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("evento", defaultEvent.id);
        return next;
      },
      { replace: true },
    );
  }, [requestedEvent, defaultEvent?.id, setSearch]);
  useEffect(() => {
    if (!event) return;
    const controller = new AbortController();
    running.current = true;
    setRequestState({ context, busy: true, error: "" });
    api<EventRegistrationSummary>(
      `/organizations/${organizationId}/events/${event.id}/registration-summary`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        if (value.eventId !== event.id)
          throw new Error(
            "O resumo recebido não corresponde ao evento selecionado. Atualize para tentar novamente.",
          );
        setSnapshot({ context, value });
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setRequestState({
            context,
            busy: false,
            error: (failure as Error).message,
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          running.current = false;
          setRequestState((previous) =>
            previous.context === context
              ? { ...previous, busy: false }
              : previous,
          );
        }
      });
    return () => {
      controller.abort();
      running.current = false;
    };
  }, [organizationId, event?.id, context, revision]);
  const refresh = useCallback(() => {
    if (eventId && !running.current) setRevision((previous) => previous + 1);
  }, [eventId]);
  useEffect(() => {
    if (!event) return;
    const visibleRefresh = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(visibleRefresh, 30_000);
    window.addEventListener("focus", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
    };
  }, [event?.id, refresh]);
  function selectEvent(id: string) {
    setSearch((previous) => {
      const next = new URLSearchParams(previous);
      next.set("evento", id);
      next.delete("campaign");
      return next;
    });
  }
  const campaigns = summary?.campaigns ?? [];
  const selectedCampaign = campaignId
    ? campaigns.find((campaign) => campaign.id === campaignId)
    : null;
  const invalidCampaign = Boolean(summary && campaignId && !selectedCampaign);
  const counts =
    summary && !invalidCampaign ? (selectedCampaign ?? summary.totals) : null;
  function registrationsLink(values: Record<string, string> = {}) {
    const parameters = new URLSearchParams({
      evento: eventId,
      aba: "inscricoes",
      ...(campaignId ? { campaign: campaignId } : {}),
      ...values,
    });
    return `/organizacao/${organizationId}/inscricoes?${parameters}`;
  }
  const metrics: {
    label: string;
    value: number | null;
    filters: Record<string, string>;
    tone: string;
  }[] = counts
    ? [
        {
          label: "Inscritos",
          value: counts.total,
          filters: { includeClosed: "true" },
          tone: "total",
        },
        {
          label: "Aceitos",
          value: counts.byStatus.APPROVED,
          filters: { status: "APPROVED" },
          tone: "accepted",
        },
        {
          label: "Recusados",
          value: counts.byStatus.REJECTED,
          filters: { status: "REJECTED", includeClosed: "true" },
          tone: "rejected",
        },
        {
          label: "Vagas confirmadas",
          value: counts.byStatus.CONFIRMED,
          filters: { status: "CONFIRMED" },
          tone: "confirmed",
        },
        {
          label: "Vou participar",
          value: summary!.presenceAvailable ? counts.candidateGoing : null,
          filters: { presence: "VOU", includeClosed: "true" },
          tone: "presence",
        },
      ]
    : [];
  return (
    <section
      className="event-registration-dashboard"
      aria-label="Resumo das inscrições do evento"
    >
      <header className="event-dashboard-heading">
        <h1>Visão geral</h1>
        <button
          type="button"
          className="button outline event-dashboard-refresh"
          aria-label="Atualizar resumo"
          disabled={busy || events.loading}
          onClick={() => {
            events.refreshInBackground();
            refresh();
          }}
        >
          <RefreshCw size={17} aria-hidden="true" />
          <span>Atualizar</span>
        </button>
      </header>
      {events.loading && !eventOptions.length ? (
        <Loading />
      ) : events.error ? (
        <Notice>{events.error}</Notice>
      ) : null}
      {eventOptions.length ? (
        <>
          <div className="event-dashboard-selectors">
            <Field label="Evento">
              <select
                value={event?.id ?? ""}
                onChange={(change) => selectEvent(change.target.value)}
              >
                {!event && <option value="">Selecione um evento</option>}
                {eventOptions.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} · {eventLabels[item.status]}
                  </option>
                ))}
              </select>
            </Field>
            {campaigns.length > 1 && (
              <Field label="Campanha">
                <select
                  value={campaignId}
                  onChange={(change) =>
                    setSearch((previous) => {
                      const next = new URLSearchParams(previous);
                      if (change.target.value)
                        next.set("campaign", change.target.value);
                      else next.delete("campaign");
                      return next;
                    })
                  }
                >
                  <option value="">Todas</option>
                  {invalidCampaign && (
                    <option value={campaignId}>Campanha indisponível</option>
                  )}
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.kind === "VOLUNTEER" ? "Servos" : "Campistas"}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {event ? (
            <>
              <p className="event-dashboard-context">
                {date(event.startsAt)}
                {event.endsAt !== event.startsAt
                  ? ` a ${date(event.endsAt)}`
                  : ""}{" "}
                · {event.city} · {eventLabels[event.status]}
              </p>
              {error && (
                <Notice>
                  {error}
                  {summary && " Os números exibidos são da última atualização."}
                </Notice>
              )}
              {!summary && !error && <Loading />}
              {invalidCampaign && (
                <Notice>
                  Campanha indisponível para este evento.{" "}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setSearch((previous) => {
                        const next = new URLSearchParams(previous);
                        next.delete("campaign");
                        return next;
                      })
                    }
                  >
                    Mostrar todas as campanhas
                  </button>
                </Notice>
              )}
              {counts && (
                <>
                  <div
                    className="event-dashboard-metrics"
                    aria-busy={busy || undefined}
                  >
                    {metrics.map((metric) =>
                      metric.value === null ? (
                        <div
                          className={`event-dashboard-metric metric-${metric.tone}`}
                          key={metric.tone}
                          aria-label={`${metric.label}: indisponível`}
                        >
                          <span>{metric.label}</span>
                          <strong>—</strong>
                          <small>Confirmação por link indisponível</small>
                        </div>
                      ) : (
                        <Link
                          className={`event-dashboard-metric metric-${metric.tone}`}
                          key={metric.tone}
                          to={registrationsLink(metric.filters)}
                          aria-label={`${metric.label}: ${metric.value}. Ver inscrições`}
                        >
                          <span>{metric.label}</span>
                          <strong>{metric.value}</strong>
                          <small>Ver inscrições →</small>
                        </Link>
                      ),
                    )}
                  </div>
                  <p className="event-dashboard-updated">
                    Atualizado em {dateTime(summary!.generatedAt)} · horário de
                    Brasília
                  </p>
                </>
              )}
            </>
          ) : (
            <Notice kind="info">
              {requestedEvent
                ? "Evento indisponível ou sem acesso nesta organização."
                : "Selecione um evento para acompanhar as inscrições."}
            </Notice>
          )}
        </>
      ) : !events.loading && !events.error ? (
        <Empty title="Nenhum evento disponível">
          Os eventos da organização aparecerão aqui.
        </Empty>
      ) : null}
    </section>
  );
}
