import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { useAuth } from "../lib/auth";
import {
  clearPendingInvitation,
  rememberInvitation,
  loginDestination,
} from "../lib/navigation";

import { api } from "../lib/api";

import type { Membership } from "../lib/types";

import { Loading, Notice } from "../components/ui";

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
  if (auth.access?.passwordChangeRequired)
    return (
      <Navigate
        replace
        to={loginDestination(auth.access, `/convite/${token}`)}
      />
    );
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
          <>
            <p>
              Após aceitar, você entrará no painel da organização que enviou o
              convite.
            </p>
            <Link
              className="back-link"
              to={`/nova-senha?next=${encodeURIComponent(`/convite/${token}`)}`}
            >
              Definir senha para próximos acessos
            </Link>
          </>
        )}
        <Link className="back-link" to="/" onClick={clearPendingInvitation}>
          Continuar depois
        </Link>
      </section>
    </div>
  );
}
