import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Users, Church, UserCog } from "lucide-react";
import { useAuth } from "../lib/auth";

import { useRemote } from "../lib/hooks";

import { OrganizationForm } from "../components/OrganizationForm";

import {
  EventRegistrationDashboard,
  registrationDashboardAvailable,
} from "../components/EventRegistrationDashboard";
import type { EventEdition } from "../lib/types";

import { Loading, Notice, PageHeading } from "../components/ui";
import { useOrganization } from "../lib/organization-context";

export function OrganizationDashboard() {
  const auth = useAuth();
  const { organizationId, membership, organization } = useOrganization();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const showRegistrationDashboard =
    membership.active !== false &&
    registrationDashboardAvailable(auth, membership.role);
  return (
    <>
      {showRegistrationDashboard ? (
        <EventRegistrationDashboard
          key={organizationId}
          organizationId={organizationId}
        />
      ) : !auth.eventsEnabled && auth.eventManagementEnabled ? (
        <EventPreparationDashboard />
      ) : (
        <FullOrganizationDashboard />
      )}
      {membership.role === "ORGANIZER" && (
        <>
          {editing ? (
            <OrganizationForm
              key={organizationId}
              organization={organization}
              scope="organization"
              onBusyChange={setBusy}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                void auth.refresh();
              }}
            />
          ) : (
            <section className="panel">
              <h2>Informações da organização</h2>
              <p>
                Atualize os dados de cadastro, o endereço e o logotipo da sua
                comunidade.
              </p>
              <button
                className="button outline"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                Editar informações
              </button>
            </section>
          )}
        </>
      )}
      {membership.role === "ORGANIZER" && (
        <section className="panel">
          <h2>Funções da organização</h2>
          <p>
            Cadastre as funções dos responsáveis e defina o perfil de acesso
            usado em Membros e convites.
          </p>
          <Link
            className="button outline"
            to={`/organizacao/${organizationId}/funcoes`}
          >
            <UserCog size={17} /> Gerenciar funções
          </Link>
        </section>
      )}
    </>
  );
}

function EventPreparationDashboard() {
  const { organizationId, membership } = useOrganization();
  return (
    <>
      <PageHeading
        eyebrow="SUA COMUNIDADE"
        title="Vamos preparar o próximo encontro"
      >
        Sua organização já pode preparar os eventos e seus períodos de
        inscrição.
      </PageHeading>
      <section className="panel">
        <h2>
          {membership.role === "ORGANIZER"
            ? "Cadastre o primeiro evento"
            : "Eventos da sua comunidade"}
        </h2>
        <p>
          Defina a data, os períodos de servos e campistas e a arte de
          divulgação. Os eventos ficam em preparação até a configuração das
          fichas.
        </p>
        {membership.role !== "HEALTH" && (
          <Link
            className="button primary"
            to={`/organizacao/${organizationId}/eventos`}
          >
            <CalendarDays size={18} />{" "}
            {membership.role === "ORGANIZER"
              ? "Preparar eventos"
              : "Consultar eventos"}
          </Link>
        )}
      </section>
      {membership.role === "ORGANIZER" && (
        <section className="panel">
          <h2>Responsáveis pela organização</h2>
          <p>
            Continue acompanhando os convites e as funções de cada responsável.
          </p>
          <Link
            className="button outline"
            to={`/organizacao/${organizationId}/membros`}
          >
            Membros e convites
          </Link>
        </section>
      )}
    </>
  );
}

function FullOrganizationDashboard() {
  const { organizationId, membership } = useOrganization();
  const auth = useAuth();
  const events = useRemote<EventEdition[]>(
    auth.eventsEnabled ? `/organizations/${organizationId}/events` : null,
  );
  return (
    <>
      <PageHeading
        eyebrow="SUA COMUNIDADE"
        title="Vamos preparar bons encontros"
      >
        Acompanhe os eventos e organize cada etapa com cuidado.
      </PageHeading>
      {!auth.eventsEnabled && (
        <section className="panel">
          <h2>Sua organização está pronta para começar.</h2>
          <p>
            Confira os responsáveis e os convites desta comunidade. Os eventos
            serão configurados na próxima etapa.
          </p>
          {membership.role === "ORGANIZER" && (
            <Link
              className="button primary"
              to={`/organizacao/${organizationId}/membros`}
            >
              Membros e convites
            </Link>
          )}
        </section>
      )}
      {auth.eventsEnabled && events.error && <Notice>{events.error}</Notice>}
      {!auth.eventsEnabled ? null : events.loading ? (
        <Loading />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <CalendarDays />
              <strong>{events.data?.length ?? 0}</strong>
              <span>Eventos cadastrados</span>
            </div>
            <div className="stat-card">
              <Church />
              <strong>
                {events.data?.filter((e) => e.status === "PUBLISHED").length ??
                  0}
              </strong>
              <span>Eventos publicados</span>
            </div>
            <div className="stat-card">
              <Users />
              <strong>
                {events.data?.reduce(
                  (sum, e) =>
                    sum +
                    e.campaigns.reduce(
                      (n, c) => n + (c._count?.registrations ?? 0),
                      0,
                    ),
                  0,
                ) ?? 0}
              </strong>
              <span>Inscrições recebidas</span>
            </div>
          </div>
          <section className="panel">
            <h2>O próximo passo</h2>
            <p>
              {membership.role === "ORGANIZER"
                ? "Cadastre uma edição, configure os períodos e publique as fichas antes de divulgar o evento."
                : membership.role === "HEALTH"
                  ? "Consulte os participantes dos eventos para os quais você recebeu autorização."
                  : "Acompanhe as inscrições e encaminhe cada pessoa pelo processo de análise."}
            </p>
            <Link
              className="button primary"
              to={
                membership.role === "HEALTH"
                  ? `/organizacao/${organizationId}/saude`
                  : `/organizacao/${organizationId}/${membership.role === "ORGANIZER" ? "eventos" : "inscricoes"}`
              }
            >
              Abrir{" "}
              {membership.role === "HEALTH"
                ? "cuidados"
                : membership.role === "ORGANIZER"
                  ? "eventos"
                  : "inscrições"}{" "}
              →
            </Link>
          </section>
        </>
      )}
    </>
  );
}
