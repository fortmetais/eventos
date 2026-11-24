import { useDisclosureDismiss } from "../lib/useDisclosureDismiss";
import { useEffect, useId, useRef, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  ShieldCheck,
  Users,
  Church,
  UserCog,
  MessageSquare,
  Menu,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../lib/auth";

import { roleLabels } from "../lib/types";
import {
  Empty,
  Loading,
  Notice,
  OrganizationAvatar,
  PageHeading,
} from "../components/ui";
import { useOrganization, type OrgContext } from "../lib/organization-context";
export { useOrganization };
export type { OrgContext };
export { OrganizationDashboard } from "./OrganizationDashboard";
export { PlatformAdmin } from "./PlatformAdmin";
export { Members, AdminMembers } from "./Members";
export { Invitation } from "./Invitation";

export function OrganizationPicker() {
  const { access } = useAuth();
  if (!access) return <Loading />;
  const organizations = access.organizations;
  if (organizations.length === 1)
    return (
      <Navigate
        replace
        to={`/organizacao/${organizations[0].organizationId}`}
      />
    );
  return (
    <div className="narrow-shell">
      <PageHeading title="Suas organizações">
        Selecione a comunidade que você deseja administrar.
      </PageHeading>
      {organizations.length ? (
        <div className="org-list">
          {organizations.map((m) => (
            <Link
              className="org-selection panel"
              key={m.id}
              to={`/organizacao/${m.organizationId}`}
            >
              <OrganizationAvatar organization={m.organization} />
              <div>
                <h3>{m.organization.name}</h3>
                <p>
                  {m.organization.city} ·{" "}
                  {m.function?.name ?? roleLabels[m.role]}
                </p>
              </div>
              <span>→</span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="Você ainda não tem uma organização">
          Aceite um convite para começar a organizar eventos.
        </Empty>
      )}
    </div>
  );
}

export function OrganizationLayout() {
  const { organizationId } = useParams();
  const location = useLocation();
  const auth = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useDisclosureDismiss(
    mobileMenuOpen,
    () => setMobileMenuOpen(false),
    mobileMenuButton,
    sidebar,
  );
  const navigationId = useId();
  const base = `/organizacao/${organizationId}`;
  const selection = new URLSearchParams(location.search);
  const context = new URLSearchParams();
  for (const key of ["evento", "campaign"]) {
    const value = selection.get(key);
    if (value) context.set(key, value);
  }
  const campaignQuery = context.size ? `?${context}` : "";
  const compactMobileNavigation = [base, `${base}/inscricoes`].includes(
    location.pathname.replace(/\/$/, ""),
  );
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);
  const membership = auth.access?.organizations.find(
    (m) => m.organizationId === organizationId,
  );
  if (!membership)
    return (
      <div className="narrow-shell">
        <Notice>Você não tem acesso a esta organização.</Notice>
        <Link to="/organizacao">Selecionar outra organização</Link>
      </div>
    );
  return (
    <div
      className={`admin-shell admin-shell--mobile-navigation${compactMobileNavigation ? " admin-shell--registrations" : ""}`}
    >
      <aside
        className={`sidebar${mobileMenuOpen ? " mobile-organization-open" : ""}`}
        ref={sidebar}
      >
        <button
          ref={mobileMenuButton}
          className="organization-mobile-toggle"
          type="button"
          aria-label="Menu da organização"
          aria-expanded={mobileMenuOpen}
          aria-controls={navigationId}
          onClick={() => setMobileMenuOpen((value) => !value)}
        >
          <Menu size={21} aria-hidden="true" />
          <span className="organization-mobile-toggle-copy">
            <small>Menu da organização</small>
            <strong>{membership.organization.name}</strong>
          </span>
          <ChevronDown
            size={19}
            className="organization-mobile-chevron"
            aria-hidden="true"
          />
        </button>
        <div className="sidebar-org">
          <OrganizationAvatar organization={membership.organization} />
          <h3>{membership.organization.name}</h3>
          <small>
            {membership.function?.name ?? roleLabels[membership.role]}
          </small>
        </div>
        <nav
          id={navigationId}
          aria-label="Organização"
          onClick={(event) => {
            if ((event.target as Element).closest("a"))
              setMobileMenuOpen(false);
          }}
        >
          <NavLink end to={base}>
            <LayoutDashboard size={18} />
            Visão geral
          </NavLink>
          {(auth.eventsEnabled || auth.eventManagementEnabled) &&
            membership.role !== "HEALTH" && (
              <>
                <NavLink to={`${base}/eventos`}>
                  <CalendarDays size={18} />
                  {auth.eventsEnabled ? "Eventos e fichas" : "Eventos"}
                </NavLink>
                {(auth.eventsEnabled ||
                  auth.volunteerRegistrationsEnabled ||
                  auth.camperRegistrationsEnabled) && (
                  <NavLink to={`${base}/inscricoes${campaignQuery}`}>
                    <ClipboardList size={18} />
                    {auth.eventsEnabled || auth.camperRegistrationsEnabled
                      ? "Inscrições"
                      : "Candidaturas de servos"}
                  </NavLink>
                )}
              </>
            )}
          {membership.role === "ORGANIZER" && (
            <NavLink to={`${base}/funcoes`}>
              <UserCog size={18} />
              Funções
            </NavLink>
          )}
          {membership.role === "ORGANIZER" && (
            <NavLink to={`${base}/mensagens${campaignQuery}`}>
              <MessageSquare size={18} />
              Mensagens
            </NavLink>
          )}
          {membership.role === "ORGANIZER" && (
            <NavLink to={`${base}/cadastros-anteriores`}>
              <Users size={18} />
              Cadastros anteriores
            </NavLink>
          )}
          {membership.role === "ORGANIZER" && (
            <NavLink to={`${base}/membros`}>
              <Users size={18} />
              Membros e convites
            </NavLink>
          )}
          {(auth.eventsEnabled ||
            auth.volunteerRegistrationsReady ||
            auth.camperRegistrationsReady) &&
            membership.healthEventIds.length > 0 && (
              <NavLink to={`${base}/saude`}>
                <ShieldCheck size={18} />
                Cuidados de saúde
              </NavLink>
            )}
          {(auth.access?.organizations.length ?? 0) >= 2 && (
            <Link to="/organizacao">
              <Church size={18} />
              Trocar organização
            </Link>
          )}
        </nav>
      </aside>
      <div className="admin-main">
        <Outlet
          context={
            {
              organizationId: organizationId!,
              membership,
              organization: membership.organization,
            } satisfies OrgContext
          }
        />
      </div>
    </div>
  );
}
