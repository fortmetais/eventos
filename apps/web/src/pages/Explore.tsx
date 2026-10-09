import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Church,
  Heart,
  MapPin,
  Search,
  Users,
} from "lucide-react";
import { useRemote } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { organizationDestination, pendingInvitation } from "../lib/navigation";
import type { EventEdition, Page } from "../lib/types";
import { date } from "../lib/types";
import { Empty, Loading, Notice, OrganizationAvatar } from "../components/ui";
export function EventCard({ event }: { event: EventEdition }) {
  const organization = event.organization!;
  return (
    <article className="event-card">
      <div className="card-top">
        <OrganizationAvatar organization={organization} />
        <div>
          <span className="event-type">{event.type.name}</span>
          <Link to={`/eventos/${event.id}`}>
            <h3>{event.name}</h3>
          </Link>
        </div>
      </div>
      <div className="event-facts">
        <p>
          <CalendarDays size={17} />
          <strong>
            {date(event.startsAt)} até {date(event.endsAt)}
          </strong>
        </p>
        <p>
          <Church size={17} />
          <span>{organization.name}</span>
        </p>
        <p>
          <MapPin size={17} />
          <span>
            {event.city}
            {organization.state ? ` · ${organization.state}` : ""}
          </span>
        </p>
      </div>
      <div className="event-actions">
        {event.campaigns
          .filter((c) => c.open)
          .map((c) => (
            <Link
              className={`button ${c.kind === "CAMPER" ? "primary" : "outline"}`}
              key={c.id}
              to={`/inscricao/${c.id}`}
            >
              {c.kind === "CAMPER" ? <Users size={17} /> : <Heart size={17} />}{" "}
              {c.kind === "CAMPER"
                ? "Participar do evento"
                : "Trabalhar na equipe"}
              <ArrowRight size={16} />
            </Link>
          ))}
      </div>
    </article>
  );
}
export function Explore() {
  const auth = useAuth();
  if (auth.loading)
    return (
      <div className="narrow-shell">
        <Loading />
      </div>
    );
  if (!auth.eventsEnabled && !auth.volunteerRegistrationsReady) {
    if (auth.session && !auth.access)
      return (
        <div className="narrow-shell">
          {auth.error ? (
            <>
              <Notice>{auth.error}</Notice>
              <button
                className="button outline"
                onClick={() => void auth.refresh()}
              >
                Tentar novamente
              </button>
            </>
          ) : (
            <Loading />
          )}
        </div>
      );
    const invitation = pendingInvitation();
    if (auth.session && invitation) return <Navigate replace to={invitation} />;
    if (auth.access?.organizations.length && !auth.access.account.platformAdmin)
      return <Navigate replace to={organizationDestination(auth.access)} />;
    const admin = auth.access?.account.platformAdmin;
    return (
      <div className="narrow-shell">
        <section className="panel">
          <span className="eyebrow">BEM-VINDO AO ENCONTRO</span>
          <h1>
            {admin ? "Comece pela sua comunidade." : "Bem-vindo ao Encontro."}
          </h1>
          <p>
            {admin
              ? "Cadastre as paróquias, convide os responsáveis e organize quem vai cuidar dos próximos encontros."
              : auth.session
                ? "Para acessar o painel de uma organização, abra o link do convite recebido e confirme o aceite com o e-mail convidado."
                : "Entre para acessar sua área pessoal ou o painel da sua organização."}
          </p>
          <Link
            className="button primary"
            to={admin ? "/admin" : auth.session ? "/meu-perfil" : "/entrar"}
          >
            {admin
              ? "Administrar organizações"
              : auth.session
                ? "Minha área"
                : "Entrar"}
          </Link>
          <p>
            Os eventos e as inscrições serão disponibilizados na próxima etapa.
          </p>
        </section>
      </div>
    );
  }
  return <EventExplore />;
}
function EventExplore() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "9",
    ...(search ? { q: search } : {}),
    ...(city ? { city } : {}),
  });
  const events = useRemote<Page<EventEdition>>(`/public/events?${params}`);
  return (
    <div className="public-shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="little-dot" />
            COMUNIDADE EM MOVIMENTO
          </span>
          <h1>
            Seu próximo encontro
            <br />
            pode <em>transformar você.</em>
          </h1>
          <p>
            Encontre um acampamento, viva uma nova experiência
            <br className="desktop-only" /> ou coloque seus dons a serviço de
            uma comunidade.
          </p>
          <a className="hero-link" href="#eventos">
            Encontre seu próximo evento <ArrowRight size={17} />
          </a>
          <div className="hero-notes">
            <span>
              <Users size={16} /> Para participar
            </span>
            <span>
              <Heart size={16} /> Para servir
            </span>
            <span>
              <Church size={16} /> Para pertencer
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-sun" />
          <div className="art-orbit" />
          <div className="art-hill back" />
          <div className="art-hill front" />
          <div className="art-chapel">
            <Church size={118} strokeWidth={1.1} />
          </div>
          <span className="floating-note top">
            <Heart size={16} /> Bons encontros, novas histórias
          </span>
          <span className="floating-note bottom">
            <span className="little-dot" /> Sua comunidade está aqui
          </span>
          <div className="art-star">✦</div>
        </div>
      </section>
      <section id="eventos" className="events-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ESCOLHA SUA PRÓXIMA EXPERIÊNCIA</span>
            <h2>
              Eventos abertos para inscrição{" "}
              <span className="count">{events.data?.total ?? "—"}</span>
            </h2>
          </div>
          <span className="section-caption">
            Campistas e voluntários são bem-vindos
          </span>
        </div>
        <div className="filter-bar">
          <label className="search-field">
            <Search size={20} />
            <input
              aria-label="Buscar evento ou paróquia"
              placeholder="Buscar evento ou paróquia…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="city-field">
            <MapPin size={18} />
            <input
              aria-label="Filtrar por cidade"
              placeholder="Todas as cidades"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {(query || city) && (
            <button
              className="text-button"
              onClick={() => {
                setQuery("");
                setCity("");
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
        {events.loading ? (
          <Loading />
        ) : events.error ? (
          <>
            <Notice>Não foi possível carregar os eventos agora.</Notice>
            <button className="button outline" onClick={events.refresh}>
              Tentar novamente
            </button>
          </>
        ) : events.data?.items.length ? (
          <div className="events-grid">
            {events.data.items.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <Empty
            title={
              search || city
                ? "Nenhum evento encontrado"
                : "Novos encontros estão chegando"
            }
          >
            {search || city
              ? "Tente outro nome ou cidade."
              : "Quando as inscrições abrirem, você poderá encontrar seu próximo acampamento aqui."}
          </Empty>
        )}
        {events.data && events.data.total > 9 && (
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </button>
            <span>
              Página {page} de {Math.ceil(events.data.total / 9)}
            </span>
            <button
              disabled={page * 9 >= events.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </section>
      <section className="community-banner">
        <span className="banner-icon">
          <Heart size={28} />
        </span>
        <div>
          <h3>Cada encontro começa com um sim.</h3>
          <p>
            Participe como campista ou faça parte da equipe que torna tudo
            possível.
          </p>
        </div>
        <span className="banner-star" aria-hidden="true">
          ✦
        </span>
      </section>
    </div>
  );
}
