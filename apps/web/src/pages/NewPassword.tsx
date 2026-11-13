import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Field, Loading, Notice, PageHeading } from "../components/ui";
import {
  localDestination,
  pendingInvitation,
  rememberInvitation,
} from "../lib/navigation";

export function NewPassword() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const candidate = localDestination(params.get("next")) ?? pendingInvitation();
  const requested =
    candidate && !/^\/nova-senha\/?(?:[?#]|$)/.test(candidate)
      ? candidate
      : null;
  const destination = requested ?? "/meu-perfil";
  const loginPath = `/entrar?next=${encodeURIComponent(`/nova-senha?next=${encodeURIComponent(destination)}`)}`;
  useEffect(() => {
    rememberInvitation(requested);
  }, [requested]);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forcedComplete, setForcedComplete] = useState(false);
  const requiredChange = auth.access?.passwordChangeRequired === true;
  const signInPath = `/entrar?modo=senha&next=${encodeURIComponent(destination)}`;
  const saving = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current || auth.loading) return;
    setError("");
    setMessage("");
    if (!auth.session || !auth.client) {
      setError(
        "Entre com seu e-mail ou abra o link de recuperação para definir sua senha.",
      );
      return;
    }
    if (password.length < 12) {
      setError("Use uma senha com pelo menos 12 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      if (requiredChange) {
        await api("/me/first-password", { method: "POST", body: { password } });
        setPassword("");
        setConfirmation("");
        await auth.logout().catch(() => {});
        setForcedComplete(true);
        setMessage(
          "Senha alterada. Entre novamente com sua nova senha para continuar.",
        );
        return;
      }
      const result = await auth.client.auth.updateUser({ password });
      if (result.error) {
        setError(
          "Não foi possível salvar a senha. Confira os requisitos ou entre novamente pelo e-mail e tente outra vez.",
        );
        return;
      }
      setPassword("");
      setConfirmation("");
      setMessage(
        "Senha salva. Nos próximos acessos, você poderá entrar com seu e-mail e essa senha.",
      );
    } catch {
      setError(
        "Não foi possível salvar a senha. Confira sua conexão e tente novamente.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (auth.loading) return <Loading />;
  if (!forcedComplete && message && auth.access && !auth.error)
    return <Navigate replace to={destination} />;
  if (forcedComplete)
    return (
      <div className="auth-shell">
        <PageHeading title="Senha atualizada" />
        <section className="panel">
          <Notice kind="success">{message}</Notice>
          <Link className="button primary full" to={signInPath}>
            Entrar com a nova senha
          </Link>
        </section>
      </div>
    );
  return (
    <div className="auth-shell">
      <PageHeading title="Definir nova senha">
        {requiredChange
          ? "Antes de continuar, substitua a senha temporária por uma senha pessoal com pelo menos 12 caracteres."
          : "Escolha uma senha com pelo menos 12 caracteres para os próximos acessos."}
      </PageHeading>
      {!auth.session || !auth.client ? (
        <section className="panel">
          <Notice kind="info">
            Entre com seu e-mail ou abra o link de recuperação para definir sua
            senha.
          </Notice>
          <Link className="button primary full" to={loginPath}>
            Entrar para definir senha
          </Link>
        </section>
      ) : (
        <form className="panel" onSubmit={submit}>
          {error && <Notice>{error}</Notice>}
          {message && <Notice kind="success">{message}</Notice>}
          <Field label="Nova senha">
            <input
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
          </Field>
          <Field label="Confirmar nova senha">
            <input
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={busy}
            />
          </Field>
          <button className="button primary full" disabled={busy}>
            {busy ? "Salvando senha…" : "Salvar senha"}
          </button>
        </form>
      )}
      <Link className="back-link" to={destination}>
        {requested?.startsWith("/convite/")
          ? "Voltar ao convite"
          : "Ir para minha área"}
      </Link>
    </div>
  );
}
