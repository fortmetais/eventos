import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useOutletContext,
  useParams,
} from "react-router-dom";
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Plus,
  ShieldCheck,
  Users,
  Church,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { clearPendingInvitation, rememberInvitation } from "../lib/navigation";
import { useRemote } from "../lib/hooks";
import { api } from "../lib/api";
import type {
  EventEdition,
  Membership,
  Organization,
  Page,
  Role,
} from "../lib/types";
import { roleLabels } from "../lib/types";
import {
  Empty,
  Field,
  Loading,
  Notice,
  OrganizationAvatar,
  PageHeading,
} from "../components/ui";
export type OrgContext = {
  organizationId: string;
  membership: Membership;
  organization: Organization;
};
export function useOrganization() {
  return useOutletContext<OrgContext>();
}
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
                  {m.organization.city} · {roleLabels[m.role]}
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
  const auth = useAuth();
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
  const base = `/organizacao/${organizationId}`;
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-org">
          <OrganizationAvatar organization={membership.organization} />
          <h3>{membership.organization.name}</h3>
          <small>{roleLabels[membership.role]}</small>
        </div>
        <nav aria-label="Organização">
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
                {(auth.eventsEnabled || auth.volunteerRegistrationsEnabled) && (
                  <NavLink to={`${base}/inscricoes`}>
                    <ClipboardList size={18} />
                    {auth.eventsEnabled
                      ? "Inscrições"
                      : "Candidaturas de servos"}
                  </NavLink>
                )}
              </>
            )}
          {membership.role === "ORGANIZER" && (
            <NavLink to={`${base}/membros`}>
              <Users size={18} />
              Membros e convites
            </NavLink>
          )}
          {(auth.eventsEnabled || auth.volunteerRegistrationsReady) &&
            membership.healthEventIds.length > 0 && (
              <NavLink to={`${base}/saude`}>
                <ShieldCheck size={18} />
                Cuidados de saúde
              </NavLink>
            )}
          <Link to="/organizacao">
            <Church size={18} />
            Trocar organização
          </Link>
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
export function OrganizationDashboard() {
  const auth = useAuth();
  if (!auth.eventsEnabled && auth.eventManagementEnabled)
    return <EventPreparationDashboard />;
  return <FullOrganizationDashboard />;
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
export function PlatformAdmin() {
  const state = useRemote<Page<Organization>>(
    "/admin/organizations?pageSize=100",
  );
  const [editing, setEditing] = useState(false);
  const [editingOrganization, setEditingOrganization] =
    useState<Organization | null>(null);
  const [organizationActive, setOrganizationActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({
    name: "",
    kind: "PARISH",
    city: "",
    state: "PR",
    contact: "",
    logoUrl: "",
  });
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/admin/organizations${editingOrganization ? `/${editingOrganization.id}` : ""}`,
        {
          method: editingOrganization ? "PUT" : "POST",
          body: {
            ...values,
            logoUrl: values.logoUrl || null,
            ...(editingOrganization ? { active: organizationActive } : {}),
          },
        },
      );
      setEditing(false);
      setEditingOrganization(null);
      setValues({
        name: "",
        kind: "PARISH",
        city: "",
        state: "PR",
        contact: "",
        logoUrl: "",
      });
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wide-shell">
      <PageHeading
        eyebrow="ADMINISTRAÇÃO DA PLATAFORMA"
        title="Organizações e paróquias"
        action={
          <button
            className="button primary"
            onClick={() => {
              setEditingOrganization(null);
              setValues({
                name: "",
                kind: "PARISH",
                city: "",
                state: "PR",
                contact: "",
                logoUrl: "",
              });
              setEditing((v) => !v);
            }}
          >
            <Plus size={17} />
            Nova organização
          </button>
        }
      >
        Cadastre uma comunidade e convide seu primeiro organizador.
      </PageHeading>
      {editing && (
        <form className="panel" onSubmit={save}>
          <h2>
            {editingOrganization ? "Editar organização" : "Nova organização"}
          </h2>
          {error && <Notice>{error}</Notice>}
          <div className="form-grid">
            <Field label="Nome" required>
              <input
                required
                value={values.name}
                onChange={(e) =>
                  setValues((v) => ({ ...v, name: e.target.value }))
                }
              />
            </Field>
            <Field label="Tipo">
              <select
                value={values.kind}
                onChange={(e) =>
                  setValues((v) => ({ ...v, kind: e.target.value }))
                }
              >
                <option value="PARISH">Paróquia</option>
                <option value="COMMUNITY">Comunidade</option>
                <option value="ORGANIZATION">Organização</option>
              </select>
            </Field>
            <Field label="Cidade" required>
              <input
                required
                value={values.city}
                onChange={(e) =>
                  setValues((v) => ({ ...v, city: e.target.value }))
                }
              />
            </Field>
            <Field label="UF" required>
              <input
                required
                maxLength={2}
                pattern="[A-Z]{2}"
                value={values.state}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    state: e.target.value.toUpperCase(),
                  }))
                }
              />
            </Field>
            <Field label="Contato" required>
              <input
                required
                value={values.contact}
                onChange={(e) =>
                  setValues((v) => ({ ...v, contact: e.target.value }))
                }
              />
            </Field>
            <Field label="URL HTTPS do logotipo (opcional)">
              <input
                type="url"
                value={values.logoUrl}
                onChange={(e) =>
                  setValues((v) => ({ ...v, logoUrl: e.target.value }))
                }
              />
            </Field>
          </div>
          {editingOrganization && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={organizationActive}
                onChange={(e) => setOrganizationActive(e.target.checked)}
              />
              Organização ativa
            </label>
          )}
          <div className="button-row">
            <button disabled={busy} className="button primary">
              {busy
                ? "Salvando…"
                : editingOrganization
                  ? "Salvar organização"
                  : "Cadastrar organização"}
            </button>
            <button
              type="button"
              className="button outline"
              onClick={() => setEditing(false)}
            >
              Fechar
            </button>
          </div>
        </form>
      )}
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <Notice>{state.error}</Notice>
      ) : state.data?.items.length ? (
        <div className="org-admin-grid">
          {state.data.items.map((o) => (
            <section className="panel" key={o.id}>
              <div className="card-top">
                <OrganizationAvatar organization={o} />
                <div>
                  <h3>{o.name}</h3>
                  <p>
                    {o.city} · {o.state}
                  </p>
                </div>
              </div>
              <p>
                {o._count?.events ?? 0} eventos · {o._count?.memberships ?? 0}{" "}
                membros · {o.active ? "Ativa" : "Suspensa"}
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setEditingOrganization(o);
                  setOrganizationActive(o.active);
                  setValues({
                    name: o.name,
                    kind: o.kind,
                    city: o.city,
                    state: o.state,
                    contact: o.contact ?? "",
                    logoUrl: o.logoUrl ?? "",
                  });
                  setEditing(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Editar organização
              </button>
              <Link
                className="button outline full"
                to={`/admin/organizacoes/${o.id}/membros`}
              >
                Gerir membros e enviar convite <Users size={17} />
              </Link>
            </section>
          ))}
        </div>
      ) : (
        <Empty title="A primeira comunidade começa aqui">
          Cadastre a paróquia e convide o responsável.
        </Empty>
      )}
    </div>
  );
}
interface MembersResponse {
  members: Membership[];
  invitations: {
    id: string;
    email: string;
    role: Role;
    expiresAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
  }[];
  events?: { id: string; name: string }[];
}
export function Members() {
  const params = useParams();
  const organizationId = params.organizationId!;
  const state = useRemote<MembersResponse>(
    `/organizations/${organizationId}/members`,
  );
  const hasPendingInvitations = Boolean(
    state.data?.invitations.some(
      (invitation) =>
        !invitation.acceptedAt &&
        !invitation.revokedAt &&
        new Date(invitation.expiresAt) > new Date(),
    ),
  );
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") state.refreshInBackground();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const timer = hasPendingInvitations
      ? window.setInterval(refreshVisible, 15000)
      : undefined;
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [state.refreshInBackground, hasPendingInvitations]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("ORGANIZER");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Membership | null>(null);
  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const response = await api<{ delivery: string; link: string }>(
        `/organizations/${organizationId}/invitations`,
        { method: "POST", body: { email, role } },
      );
      setInfo(
        response.delivery === "sent"
          ? "Convite enviado por e-mail."
          : `Convite criado. Compartilhe este link com a pessoa convidada: ${response.link}`,
      );
      setEmail("");
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function updateMember(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      await api(`/organizations/${organizationId}/members/${edit.id}`, {
        method: "PATCH",
        body: {
          role: edit.role,
          active: edit.active,
          healthEventIds: edit.healthEventIds,
        },
      });
      setEdit(null);
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(invitationId: string) {
    try {
      await api(
        `/organizations/${organizationId}/invitations/${invitationId}`,
        { method: "DELETE" },
      );
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageHeading
        title="Membros e convites"
        action={
          <button
            className="button outline"
            onClick={state.refresh}
            disabled={state.loading}
          >
            <RefreshCw size={17} />
            {state.loading ? "Atualizando…" : "Atualizar lista"}
          </button>
        }
      >
        Cada pessoa acessa somente o que precisa para sua função.
      </PageHeading>
      {error && <Notice>{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      <form className="panel inline-form" onSubmit={invite}>
        <Field label="E-mail da pessoa convidada" required>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Função">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {Object.entries(roleLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <button className="button primary" disabled={busy}>
          Enviar convite
        </button>
      </form>
      {edit && (
        <form className="panel" onSubmit={updateMember}>
          <h3>Permissões de {edit.account?.email}</h3>
          <Field label="Função">
            <select
              value={edit.role}
              onChange={(e) =>
                setEdit((v) => (v ? { ...v, role: e.target.value as Role } : v))
              }
            >
              {Object.entries(roleLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={edit.active}
              onChange={(e) =>
                setEdit((v) => (v ? { ...v, active: e.target.checked } : v))
              }
            />
            Acesso administrativo ativo
          </label>
          <h4>Autorização para consultar saúde</h4>
          <p className="muted">
            Selecione explicitamente os eventos autorizados.
          </p>
          {state.data?.events?.map((event) => (
            <label className="checkbox" key={event.id}>
              <input
                type="checkbox"
                checked={edit.healthEventIds.includes(event.id)}
                onChange={(e) =>
                  setEdit((v) =>
                    v
                      ? {
                          ...v,
                          healthEventIds: e.target.checked
                            ? [...v.healthEventIds, event.id]
                            : v.healthEventIds.filter((id) => id !== event.id),
                        }
                      : v,
                  )
                }
              />
              {event.name}
            </label>
          ))}
          <div className="button-row">
            <button className="button primary" disabled={busy}>
              Salvar permissões
            </button>
            <button
              type="button"
              className="button outline"
              onClick={() => setEdit(null)}
            >
              Fechar
            </button>
          </div>
        </form>
      )}
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <Notice>{state.error}</Notice>
      ) : (
        <>
          <section className="panel">
            <h2>Membros</h2>
            {state.data?.members.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Função</th>
                      <th>Acesso</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.data.members.map((m) => (
                      <tr key={m.id}>
                        <td>{m.account?.email}</td>
                        <td>{roleLabels[m.role]}</td>
                        <td>
                          <span className="badge neutral">
                            {m.active ? "Ativo" : "Suspenso"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => setEdit({ ...m })}
                          >
                            Editar permissões
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Nenhum convite foi aceito ainda.</p>
            )}
          </section>
          <section className="panel">
            <h2>Convites</h2>
            {state.data?.invitations.map((i) => (
              <div className="list-row" key={i.id}>
                <div>
                  <strong>{i.email}</strong>
                  <p>
                    {roleLabels[i.role]} ·{" "}
                    {i.acceptedAt
                      ? "Aceito"
                      : i.revokedAt
                        ? "Revogado"
                        : new Date(i.expiresAt) < new Date()
                          ? "Expirado"
                          : "Aguardando aceite"}
                  </p>
                </div>
                {!i.acceptedAt && !i.revokedAt && (
                  <button
                    className="text-button danger"
                    onClick={() => void revoke(i.id)}
                  >
                    Revogar
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
export function AdminMembers() {
  return (
    <div className="narrow-shell">
      <Link className="back-link" to="/admin">
        ← Organizações
      </Link>
      <Members />
    </div>
  );
}
export function Invitation() {
  const { token } = useParams();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [acceptedOrganizationId, setAcceptedOrganizationId] = useState<
    string | null
  >(null);
  useEffect(() => {
    rememberInvitation(`/convite/${token}`);
  }, [token]);
  async function accept() {
    setBusy(true);
    setError("");
    try {
      const membership = await api<Membership>(`/invitations/${token}/accept`, {
        method: "POST",
      });
      await auth.refresh();
      clearPendingInvitation();
      setAcceptedOrganizationId(membership.organizationId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (auth.loading || (auth.session && !auth.access && !auth.error))
    return <Loading />;
  if (acceptedOrganizationId)
    return <Navigate replace to={`/organizacao/${acceptedOrganizationId}`} />;
  return (
    <div className="auth-shell">
      <span className="eyebrow">CAMINHAR JUNTOS</span>
      <h1>Você recebeu um convite</h1>
      <section className="panel">
        <p>
          Entre com o e-mail que recebeu o convite para fazer parte da
          organização.
        </p>
        {error && <Notice>{error}</Notice>}
        {auth.error && <Notice>{auth.error}</Notice>}
        {auth.session ? (
          <button
            className="button primary full"
            onClick={() => void accept()}
            disabled={busy || !auth.access}
          >
            {busy ? "Aguarde…" : "Aceitar convite"}
          </button>
        ) : (
          <Link
            className="button primary full"
            to={`/entrar?next=${encodeURIComponent(`/convite/${token}`)}`}
          >
            Entrar para aceitar
          </Link>
        )}
        {auth.session && (
          <p>
            Após aceitar, você entrará no painel da organização que enviou o
            convite.
          </p>
        )}
        <Link className="back-link" to="/" onClick={clearPendingInvitation}>
          Continuar depois
        </Link>
      </section>
    </div>
  );
}
