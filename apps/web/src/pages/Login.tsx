import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useSearchParams, Link } from "react-router-dom";
import { Mail, ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Field, Notice, PageHeading } from "../components/ui";
import {
  localDestination,
  loginDestination,
  pendingInvitation,
  rememberInvitation,
} from "../lib/navigation";

const emailRetryKey = "fac:auth-email-retry-at";
function savedEmailRetry() {
  try {
    const deadline = Number(sessionStorage.getItem(emailRetryKey));
    return Number.isFinite(deadline) ? deadline : 0;
  } catch {
    return 0;
  }
}
function rateLimited(error: { status?: number; code?: string }) {
  return (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
  );
}
const emailLimitMessage =
  "O serviço de acesso atingiu um limite de solicitações ou de envio de e-mails. Aguarde e tente novamente. Se já tiver uma senha, você pode entrar com ela. O bloqueio pode durar mais conforme o limite do serviço.";
const accessLimitMessage =
  "Muitas tentativas de acesso. Aguarde antes de tentar novamente.";

export function Login() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [passwordMode, setPasswordMode] = useState(false);
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [info, setInfo] = useState("");
  const [retryAt, setRetryAt] = useState(savedEmailRetry);
  const [now, setNow] = useState(Date.now);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const sendingEmail = recovery || (!passwordMode && !sent);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  function pauseEmailRequests() {
    const deadline = Date.now() + 60_000;
    setNow(Date.now());
    setRetryAt(deadline);
    try {
      sessionStorage.setItem(emailRetryKey, String(deadline));
    } catch {
      // The in-memory pause still applies when storage is unavailable.
    }
  }
  const requested = localDestination(params.get("next")) ?? pendingInvitation();
  useEffect(() => {
    rememberInvitation(requested);
  }, [requested]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || (sendingEmail && retryAt > Date.now())) return;
    setError("");
    setBusy(true);
    try {
      if (!auth.client)
        throw new Error(
          "O acesso está sendo preparado. Tente novamente em breve.",
        );
      if (passwordMode) {
        const result = await auth.client.auth.signInWithPassword({
          email,
          password,
        });
        if (result.error)
          throw new Error(
            rateLimited(result.error)
              ? accessLimitMessage
              : "Confira seu e-mail e sua senha.",
          );
      } else if (!sent) {
        const callback = new URL("/entrar", window.location.origin);
        if (requested) callback.searchParams.set("next", requested);
        const result = await auth.client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: callback.toString() },
        });
        if (result.error) {
          if (rateLimited(result.error)) {
            pauseEmailRequests();
            throw new Error(emailLimitMessage);
          }
          throw new Error(
            "Não foi possível enviar o e-mail de acesso. Aguarde e tente novamente.",
          );
        }
        pauseEmailRequests();
        setSent(true);
      } else {
        const result = await auth.client.auth.verifyOtp({
          email,
          token: code,
          type: "email",
        });
        if (result.error)
          throw new Error(
            rateLimited(result.error)
              ? accessLimitMessage
              : "Código inválido ou expirado.",
          );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reset(e: FormEvent) {
    e.preventDefault();
    if (busy || retryAt > Date.now()) return;
    setBusy(true);
    setError("");
    try {
      if (!auth.client) throw new Error("Acesso indisponível no momento.");
      const callback = new URL("/nova-senha", window.location.origin);
      if (requested) callback.searchParams.set("next", requested);
      const result = await auth.client.auth.resetPasswordForEmail(email, {
        redirectTo: callback.toString(),
      });
      if (result.error) {
        if (rateLimited(result.error)) {
          pauseEmailRequests();
          throw new Error(emailLimitMessage);
        }
        throw new Error("Não foi possível enviar a recuperação.");
      }
      pauseEmailRequests();
      setInfo(
        "Se houver uma conta para este e-mail, você receberá as instruções.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!recovery && auth.session && !auth.loading && auth.access && !auth.error)
    return <Navigate replace to={loginDestination(auth.access, requested)} />;
  return (
    <div className="auth-shell">
      <div className="auth-icon">
        <Mail size={30} />
      </div>
      <PageHeading
        eyebrow="BEM-VINDO AO ENCONTRO"
        title={
          recovery
            ? "Recuperar acesso"
            : sent
              ? "Confira seu e-mail"
              : "Vamos caminhar juntos"
        }
      >
        {recovery
          ? "Enviaremos as instruções de recuperação."
          : sent
            ? "Abra o link de acesso recebido ou digite o código, se o e-mail apresentar um."
            : "Acesse suas inscrições ou organize os próximos eventos."}
      </PageHeading>
      <form className="panel" onSubmit={recovery ? reset : submit}>
        {error && <Notice>{error}</Notice>}
        {info && <Notice kind="success">{info}</Notice>}
        {!auth.loading && !auth.client && (
          <Notice>O acesso ainda está sendo preparado. Volte em breve.</Notice>
        )}
        {auth.error && <Notice>{auth.error}</Notice>}
        <Field label="Seu e-mail" required>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sent && !recovery}
          />
        </Field>
        {sent && !passwordMode && !recovery && (
          <Field label="Código de acesso" required>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
        )}
        {passwordMode && !recovery && (
          <Field label="Senha" required>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        )}
        <button
          disabled={
            busy ||
            auth.loading ||
            !auth.client ||
            (sendingEmail && retrySeconds > 0)
          }
          className="button primary full"
        >
          {busy
            ? "Aguarde…"
            : sendingEmail && retrySeconds > 0
              ? `Solicitar novamente em ${retrySeconds} s`
              : recovery
                ? "Enviar instruções"
                : sent || passwordMode
                  ? "Entrar"
                  : "Receber acesso por e-mail"}
          <ArrowRight size={17} />
        </button>
        {!sent && (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setPasswordMode(!passwordMode);
              setRecovery(false);
              setError("");
              setInfo("");
            }}
          >
            {passwordMode ? "Entrar por e-mail" : "Entrar com senha"}
          </button>
        )}
        {passwordMode && !recovery && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setRecovery(true);
              setError("");
              setInfo("");
            }}
          >
            Esqueci minha senha
          </button>
        )}
        {sent && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSent(false);
              setCode("");
              setError("");
            }}
          >
            Usar outro e-mail ou reenviar código
          </button>
        )}
        <p className="safe-note">
          <ShieldCheck size={16} /> Inscrever-se em um evento não exige criar
          uma conta.
        </p>
      </form>
      <Link className="back-link" to="/eventos">
        Voltar para os eventos
      </Link>
    </div>
  );
}
export function NewPassword() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const requested = localDestination(params.get("next")) ?? pendingInvitation();
  useEffect(() => {
    rememberInvitation(requested);
  }, [requested]);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!auth.session || !auth.client) {
      setError("Abra o link de recuperação enviado ao seu e-mail.");
      return;
    }
    const { error } = await auth.client.auth.updateUser({ password });
    if (error)
      setError(
        "Não foi possível alterar a senha. Use uma senha com pelo menos 12 caracteres.",
      );
    else setMessage("Senha atualizada. Você já pode acessar sua área.");
  }
  if (message && auth.access && !auth.loading && !auth.error && requested)
    return <Navigate replace to={requested} />;
  return (
    <div className="auth-shell">
      <PageHeading title="Definir nova senha" />
      <form className="panel" onSubmit={submit}>
        {error && <Notice>{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
        <Field label="Nova senha">
          <input
            required
            type="password"
            minLength={12}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button className="button primary">Salvar senha</button>
      </form>
      <Link to={requested ?? "/meu-perfil"}>
        {requested?.startsWith("/convite/")
          ? "Voltar ao convite"
          : "Ir para minha área"}
      </Link>
    </div>
  );
}
