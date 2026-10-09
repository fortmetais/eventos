import { useParams, Link } from "react-router-dom";
import { CalendarDays, Church, MapPin, Heart, Users } from "lucide-react";
import { useRemote } from "../lib/hooks";
import type { EventEdition } from "../lib/types";
import { date, dateTime } from "../lib/types";
import { BackLink, Loading, Notice, PageHeading } from "../components/ui";
export function EventDetail() {
  const { id } = useParams();
  const state = useRemote<EventEdition>(`/public/events/${id}`);
  if (state.loading) return <Loading />;
  if (state.error)
    return (
      <div className="narrow-shell">
        <Notice>{state.error}</Notice>
      </div>
    );
  const event = state.data!;
  return (
    <div className="narrow-shell">
      <BackLink to="/">Todos os eventos</BackLink>
      <PageHeading eyebrow={event.type.name} title={event.name}>
        {event.organization?.name}
      </PageHeading>
      {event.imageUrl && (
        <img className="event-cover" src={event.imageUrl} alt={event.name} />
      )}
      <section className="panel">
        <div className="detail-facts">
          <p>
            <CalendarDays size={19} />
            {date(event.startsAt)} até {date(event.endsAt)}
          </p>
          <p>
            <MapPin size={19} />
            {event.location} · {event.city}
          </p>
          <p>
            <Church size={19} />
            {event.organization?.name}
          </p>
        </div>
        <p className="description">{event.description}</p>
      </section>
      <div className="campaign-options">
        {event.campaigns.map((c) => (
          <section className="panel" key={c.id}>
            {c.kind === "CAMPER" ? (
              <Users className="purple" />
            ) : (
              <Heart className="purple" />
            )}
            <h2>{c.kind === "CAMPER" ? "Quero participar" : "Quero servir"}</h2>
            <p>
              Inscrições de {dateTime(c.opensAt)} até {dateTime(c.closesAt)}.
            </p>
            {c.open ? (
              <Link className="button primary" to={`/inscricao/${c.id}`}>
                {c.kind === "CAMPER"
                  ? "Fazer inscrição"
                  : "Candidatar-me à equipe"}
              </Link>
            ) : (
              <span className="badge neutral">
                {new Date(c.opensAt) > new Date()
                  ? "Inscrições em breve"
                  : "Inscrições indisponíveis"}
              </span>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
