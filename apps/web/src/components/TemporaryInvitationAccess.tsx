import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Copy, X } from "lucide-react";
import { api } from "../lib/api";
import { Field, Notice } from "./ui";
import "./TemporaryInvitationAccess.css";

type TemporaryAccess = {
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  mustChangePassword: true;
  emailsSent: false;
};

type Props = {
  organizationId: string;
  invitationId: string;
  email: string;
  disabled: boolean;
};

export function TemporaryInvitationAccess(props: Props) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const opened = useRef(false);
  return (
    <>
      <button
        type="button"
        className="button outline temporary-access-trigger"
        disabled={props.disabled}
        onClick={() => {
          if (opened.current) return;
          opened.current = true;
          setRequestId(crypto.randomUUID());
        }}
      >
        Liberar acesso com senha temporária
      </button>
      {requestId && (
        <TemporaryAccessDialog
          {...props}
          requestId={requestId}
          onClose={() => {
            setRequestId(null);
            opened.current = false;
          }}
        />
      )}
    </>
  );
}

function TemporaryAccessDialog({
  organizationId,
  invitationId,
  email,
  requestId,
  onClose,
}: Props & { requestId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef<AbortController | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TemporaryAccess | null>(null);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [alreadyGranted, setAlreadyGranted] = useState(false);

  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const element = dialog.current;
    if (!element) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    document.body.style.overflow = "hidden";
    heading.current?.focus();
    return () => {
      request.current?.abort();
      request.current = null;
      if (typeof element.close === "function") element.close();
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);

  function close() {
    if (request.current) return;
    setResult(null);
    setReason("");
    setAcknowledged(false);
    setCopyMessage("");
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (request.current || result || alreadyGranted) return;
    if (
      reason.trim().length < 10 ||
      reason.trim().length > 500 ||
      !acknowledged
    ) {
      setError(
        "Informe um motivo de 10 a 500 caracteres e confirme as consequências desta liberação.",
      );
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await api<TemporaryAccess>(
        `/admin/organizations/${organizationId}/invitations/${invitationId}/temporary-access`,
        {
          method: "POST",
          body: {
            reason: reason.trim(),
            acknowledgeEmailBypass: true,
            requestId,
          },
          signal: controller.signal,
        },
      );
      if (!controller.signal.aborted) {
        setResult(response);
        setReason("");
        setAcknowledged(false);
        heading.current?.focus();
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      const code =
        typeof cause === "object" && cause !== null && "code" in cause
          ? cause.code
          : undefined;
      if (code === "TEMPORARY_ACCESS_ALREADY_GRANTED") {
        setAlreadyGranted(true);
        setError(
          "Esta operação pode já ter sido aplicada. A senha não pode ser recuperada. Confira a conta e o registro administrativo antes de fechar esta janela e abrir uma nova operação para gerar outra senha temporária.",
        );
      } else if (code === "TEMPORARY_ACCESS_POSSIBLY_APPLIED") {
        setAlreadyGranted(true);
        setError(
          "A liberação pode ter sido aplicada, mas a senha não pode ser recuperada. Reenviar esta operação não exibirá a senha. Confira a conta e o registro administrativo antes de iniciar uma nova geração.",
        );
      } else if (code === "TEMPORARY_ACCESS_IN_PROGRESS") {
        setAlreadyGranted(true);
        setError(
          "Já existe uma liberação em andamento para este convite. Confira a conta e o registro administrativo antes de iniciar outra operação.",
        );
      } else if (code === "TEMPORARY_ACCESS_PROTECTED_ACCOUNT") {
        setAlreadyGranted(true);
        setError(
          "Esta ação não permite liberar a própria conta nem contas de administradores gerais.",
        );
      } else if (code === "INVITATION_NOT_PENDING") {
        setAlreadyGranted(true);
        setError(
          "Este convite já não está pendente ou válido. Feche esta janela e atualize a lista de convites.",
        );
      } else {
        setError(
          "Não foi possível concluir a liberação. Tente novamente nesta janela. Reenviar esta operação não gera outra senha; se ela já tiver sido aplicada, o sistema avisará.",
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  async function copy(kind: "password" | "instructions") {
    if (!result) return;
    const text =
      kind === "password"
        ? result.temporaryPassword
        : `Acesse: ${result.loginUrl}\nE-mail: ${result.email}\nSenha temporária: ${result.temporaryPassword}\nAo entrar, defina uma nova senha pessoal. Nenhum e-mail foi enviado.\nApós criar sua senha pessoal, abra o link do convite fornecido pela organização para aceitar sua participação.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage(
        kind === "password" ? "Senha copiada." : "Instruções copiadas.",
      );
    } catch {
      setCopyMessage(
        "Não foi possível copiar automaticamente. Selecione os dados exibidos nesta janela para copiar manualmente.",
      );
    }
  }

  return (
    <dialog
      ref={dialog}
      className="temporary-access-dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="temporary-access-header">
        <h2 ref={heading} id={titleId} tabIndex={-1}>
          Liberar acesso com senha temporária
        </h2>
        <button
          type="button"
          className="button outline icon-button"
          aria-label="Fechar janela"
          disabled={busy}
          onClick={close}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="temporary-access-body" aria-busy={busy}>
        <p id={descriptionId}>
          Liberação administrativa para <strong>{email}</strong>.
        </p>
        {error && <Notice>{error}</Notice>}
        {result ? (
          <>
            <Notice kind="success">
              Acesso liberado. A pessoa deverá trocar a senha ao entrar. Nenhum
              e-mail foi enviado.
            </Notice>
            <Notice kind="info">
              Guarde a senha agora. Ela aparece somente nesta janela e não
              poderá ser recuperada depois de fechar.
            </Notice>
            <p>
              Envie também o link do convite disponível na lista. Depois de criar
              a senha pessoal, a pessoa deve abrir esse link para aceitar o
              convite.
            </p>
            <Field label="E-mail de acesso">
              <input readOnly value={result.email} autoComplete="off" />
            </Field>
            <Field label="Senha temporária">
              <input
                readOnly
                value={result.temporaryPassword}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Link para entrar">
              <input readOnly value={result.loginUrl} autoComplete="off" />
            </Field>
            <div className="temporary-access-actions">
              <button
                type="button"
                className="button outline"
                onClick={() => void copy("password")}
              >
                <Copy size={16} aria-hidden="true" />
                Copiar senha
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => void copy("instructions")}
              >
                <Copy size={16} aria-hidden="true" />
                Copiar instruções
              </button>
              <button type="button" className="button primary" onClick={close}>
                Fechar
              </button>
            </div>
            {copyMessage && <Notice kind="info">{copyMessage}</Notice>}
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)} noValidate>
            <p>
              A senha atual dessa conta será substituída e as sessões serão
              encerradas. A confirmação por e-mail será dispensada. A pessoa
              será obrigada a definir uma nova senha pessoal no próximo acesso.
            </p>
            <p>
              Esta ação não envia e-mail e não aceita o convite automaticamente.
              Entregue as instruções diretamente à pessoa.
            </p>
            <Field
              label="Motivo da liberação"
              required
              hint="De 10 a 500 caracteres. O motivo ficará registrado para a administração."
            >
              <textarea
                rows={3}
                required
                minLength={10}
                maxLength={500}
                value={reason}
                disabled={busy || alreadyGranted}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <label className="temporary-access-acknowledgement">
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={busy || alreadyGranted}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                Entendo que a senha atual será substituída, as sessões serão
                encerradas e a confirmação por e-mail será dispensada.
              </span>
            </label>
            <div className="temporary-access-actions">
              <button
                type="button"
                className="button outline"
                disabled={busy}
                onClick={close}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={
                  busy ||
                  alreadyGranted ||
                  reason.trim().length < 10 ||
                  reason.trim().length > 500 ||
                  !acknowledged
                }
              >
                {busy ? "Liberando acesso…" : "Liberar acesso"}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
