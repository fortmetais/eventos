import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useAuth } from "../lib/auth";

import { useRemote } from "../lib/hooks";
import { api } from "../lib/api";

import { InvitationLinkActions } from "../components/InvitationLinkActions";
import { TemporaryInvitationAccess } from "../components/TemporaryInvitationAccess";

import type { Membership, OrganizationFunction, Role } from "../lib/types";
import { roleLabels } from "../lib/types";
import { Field, Loading, Notice, PageHeading } from "../components/ui";

interface MembersResponse {
  invitationLinksReady?: boolean;
  functions: OrganizationFunction[];
  members: Membership[];
  invitations: {
    id: string;
    email: string;
    role: Role;
    functionId?: string | null;
    function?: OrganizationFunction | null;
    expiresAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
    canCopyLink?: boolean;
  }[];
  events?: { id: string; name: string }[];
}

export function Members() {
  const auth = useAuth();
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
  const [functionId, setFunctionId] = useState("");
  const functions = state.data?.functions ?? [];
  const activeFunctions = functions.filter((value) => value.active);
  const selectedId = functionId
    ? activeFunctions.some((value) => value.id === functionId)
      ? functionId
      : ""
    : ((
        activeFunctions.find((value) => value.defaultRole === "ORGANIZER") ??
        activeFunctions[0]
      )?.id ?? "");
  const selectedFunction = activeFunctions.find(
    (value) => value.id === selectedId,
  );
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Membership | null>(null);
  const saving = useRef(false);
  useEffect(() => {
    setFunctionId("");
    setEdit(null);
    setError("");
    setInfo("");
    setEmail("");
  }, [organizationId]);
  async function invite(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (!selectedFunction)
        throw new Error("Selecione uma função ativa da organização.");
      const response = await api<{ delivery: string; link: string }>(
        `/organizations/${organizationId}/invitations`,
        { method: "POST", body: { email, functionId: selectedFunction.id } },
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
      saving.current = false;
      setBusy(false);
    }
  }
  async function updateMember(e: FormEvent) {
    e.preventDefault();
    if (!edit || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/organizations/${organizationId}/members/${edit.id}`, {
        method: "PATCH",
        body: {
          ...(edit.functionId
            ? { functionId: edit.functionId }
            : { role: edit.role }),
          active: edit.active,
          healthEventIds: edit.healthEventIds,
        },
      });
      setEdit(null);
      state.refresh();
      await auth.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function revoke(invitationId: string) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await api(
        `/organizations/${organizationId}/invitations/${invitationId}`,
        { method: "DELETE" },
      );
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
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
            disabled={state.loading || busy}
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
      <Link
        className="button outline"
        to={
          auth.access?.account.platformAdmin
            ? `/admin/organizacoes/${organizationId}/funcoes`
            : `/organizacao/${organizationId}/funcoes`
        }
      >
        Gerenciar funções
      </Link>
      <form className="panel inline-form" onSubmit={invite}>
        <Field label="E-mail da pessoa convidada" required>
          <input
            type="email"
            disabled={busy || state.loading || Boolean(state.error)}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Função" required>
          <select
            required
            disabled={busy || state.loading || Boolean(state.error)}
            value={selectedId}
            onChange={(e) => setFunctionId(e.target.value)}
          >
            <option value="">Selecione uma função</option>
            {activeFunctions.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name} · {roleLabels[value.role]}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="button primary"
          disabled={
            busy || state.loading || Boolean(state.error) || !selectedId
          }
        >
          Enviar convite
        </button>
      </form>
      {!state.loading && !state.error && !activeFunctions.length && (
        <Notice kind="info">
          Cadastre ou reative uma função para enviar novos convites.
        </Notice>
      )}
      {edit && (
        <form className="panel" onSubmit={updateMember}>
          <h3>Permissões de {edit.account?.email}</h3>
          <Field label="Função do membro" required>
            <select
              required
              disabled={busy}
              value={edit.functionId ?? ""}
              onChange={(e) => {
                const value = functions.find(
                  (value) => value.id === e.target.value,
                );
                if (value)
                  setEdit((v) =>
                    v
                      ? {
                          ...v,
                          functionId: value.id,
                          role: value.role,
                          healthEventIds:
                            value.role === v.role ? v.healthEventIds : [],
                        }
                      : v,
                  );
              }}
            >
              {!edit.functionId && (
                <option value="">
                  {roleLabels[edit.role]} — vínculo anterior
                </option>
              )}
              {functions
                .filter((value) => value.active || value.id === edit.functionId)
                .map((value) => (
                  <option
                    key={value.id}
                    value={value.id}
                    disabled={!value.active}
                  >
                    {value.name} · {roleLabels[value.role]}
                    {!value.active ? " — inativa (vínculo atual)" : ""}
                  </option>
                ))}
            </select>
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              disabled={busy}
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
                disabled={busy}
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
              disabled={busy}
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
                        <td>
                          {m.function?.name ?? roleLabels[m.role]}
                          <p className="muted">Perfil: {roleLabels[m.role]}</p>
                        </td>
                        <td>
                          <span className="badge neutral">
                            {m.active ? "Ativo" : "Suspenso"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              setEdit({
                                ...m,
                                functionId:
                                  m.functionId ??
                                  functions.find(
                                    (value) =>
                                      value.active &&
                                      value.role === m.role &&
                                      value.defaultRole === m.role,
                                  )?.id ??
                                  functions.find(
                                    (value) =>
                                      value.active && value.role === m.role,
                                  )?.id ??
                                  null,
                              })
                            }
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
            {state.data?.invitationLinksReady === false &&
              hasPendingInvitations && (
                <Notice kind="info">
                  A cópia dos links de convite aguarda configuração do sistema.
                </Notice>
              )}
            {state.data?.invitations.map((i) => (
              <div className="list-row invitation-list-row" key={i.id}>
                <div>
                  <strong>{i.email}</strong>
                  <p>
                    {i.function?.name ?? roleLabels[i.role]} ·{" "}
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
                  <div className="invitation-link-controls">
                    {state.data?.invitationLinksReady &&
                      new Date(i.expiresAt) > new Date() && (
                        <InvitationLinkActions
                          key={`${organizationId}:${i.id}:${i.expiresAt}`}
                          organizationId={organizationId}
                          invitationId={i.id}
                          email={i.email}
                          expiresAt={i.expiresAt}
                          canCopyLink={Boolean(i.canCopyLink)}
                          disabled={busy}
                          onChanged={state.refreshInBackground}
                        />
                      )}
                    {auth.access?.account.platformAdmin &&
                      new Date(i.expiresAt) > new Date() && (
                        <TemporaryInvitationAccess
                          key={`temporary:${organizationId}:${i.id}:${i.expiresAt}`}
                          organizationId={organizationId}
                          invitationId={i.id}
                          email={i.email}
                          disabled={busy}
                        />
                      )}
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => void revoke(i.id)}
                    >
                      Revogar
                    </button>
                  </div>
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
