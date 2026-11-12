import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useRemote } from "../lib/hooks";
import type { GuardianSummary, GuardianRecord } from "../lib/guardian";
import { dateTime } from "../lib/types";
import { Loading, Notice } from "./ui";
import { SignatureImage } from "./SignaturePad";
import { CopyNoticeLink, RenewNoticeLink, WhatsAppIcon } from "./NoticeActions";
export type GuardianNoticeState = {
  ready: boolean;
  needsAuthorization?: boolean;
  authorization:
    | (GuardianSummary &
        Pick<
          GuardianRecord,
          "signedData" | "signature" | "termsText" | "receiptHash"
        >)
    | null;
};
export function GuardianNotice({
  organizationId,
  registrationId,
  allowPendingConfirmation = false,
  embedded = false,
  onStateChange,
  onBusyChange,
  onError,
  onChanged,
}: {
  organizationId: string;
  registrationId: string;
  allowPendingConfirmation?: boolean;
  embedded?: boolean;
  onStateChange?: (state: GuardianNoticeState) => void;
  onBusyChange?: (busy: boolean) => void;
  onError?: (message: string) => void;
  onChanged?: () => void;
}) {
  const base = `/organizations/${organizationId}/registrations/${registrationId}/guardian`;
  const remote = useRemote<GuardianNoticeState>(base);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [showTerm, setShowTerm] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const documentId = useId();
  const messageId = useId();
  const running = useRef(false);
  const callbacks = useRef({ onStateChange, onBusyChange, onError });
  callbacks.current = { onStateChange, onBusyChange, onError };
  const item = remote.data?.authorization;
  const authorizationKey = `${item?.id}:${item?.expiresAt}:${item?.active}:${item?.expired}:${item?.signedAt}`;
  useEffect(() => {
    if (remote.data) callbacks.current.onStateChange?.(remote.data);
  }, [remote.data]);
  useLayoutEffect(() => {
    callbacks.current.onBusyChange?.(busy);
  }, [busy]);
  useEffect(() => () => callbacks.current.onBusyChange?.(false), []);
  useEffect(() => {
    if (remote.error) callbacks.current.onError?.(remote.error);
  }, [remote.error]);
  useEffect(() => {
    setShowTerm(false);
    setShowMessage(false);
    setError("");
  }, [registrationId, authorizationKey]);
  async function action(name: string) {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      remote.setData(
        await api<GuardianNoticeState>(`${base}/${name}`, { method: "POST" }),
      );
      onChanged?.();
      return true;
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      callbacks.current.onError?.(message);
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  if (remote.loading) return <Loading />;
  if (remote.error) return <Notice>{remote.error}</Notice>;
  if (!remote.data?.ready)
    return remote.data?.needsAuthorization ? (
      <Notice>
        O envio de termos aos responsáveis aguarda configuração pela
        administração da plataforma.
        {allowPendingConfirmation &&
          " A vaga pode ser confirmada; a autorização do responsável permanece obrigatória antes do evento."}
      </Notice>
    ) : null;
  if (!item)
    return remote.data.needsAuthorization ? (
      <section className="guardian-notice">
        {!embedded && <h3>Autorização do responsável</h3>}
        <Notice>
          {allowPendingConfirmation
            ? "Esta ficha de menor ainda não tem termo. A vaga pode ser confirmada; a autorização do responsável permanece obrigatória antes do evento."
            : "Esta ficha de menor ainda não tem termo. Crie a solicitação antes de confirmar a participação."}
        </Notice>
        {error && <Notice>{error}</Notice>}
        <button
          className="button outline"
          disabled={busy}
          onClick={() => void action("renew")}
        >
          Criar termo do responsável
        </button>
      </section>
    ) : null;
  return (
    <section className="guardian-notice">
      {!embedded && <h3>Autorização do responsável</h3>}
      {error && <Notice>{error}</Notice>}
      {item.signedAt ? (
        <>
          <Notice kind="success">
            Assinado por {item.signedData?.name} em {dateTime(item.signedAt)}.
          </Notice>
          <button
            type="button"
            className="button outline"
            aria-expanded={showTerm}
            aria-controls={documentId}
            onClick={() => setShowTerm((value) => !value)}
          >
            {showTerm ? "Ocultar termo" : "Consultar termo"}
          </button>
          {showTerm && (
            <div
              id={documentId}
              className="notice-term"
              role="region"
              aria-label="Termo e assinatura do responsável"
            >
              <p>
                Responsável: {item.signedData?.name} · CPF:{" "}
                {item.signedData?.cpf} · {item.signedData?.relationship}
              </p>
              <p>
                Contato: {item.signedData?.phone} · {item.signedData?.email}
              </p>
              <p>Cidade da assinatura: {item.signedData?.city}</p>
              <p>
                Imagem e voz:{" "}
                {item.signedData?.imageAuthorized
                  ? "Autorizadas"
                  : "Não autorizadas"}
              </p>
              <div className="terms-text">{item.termsText}</div>
              <SignatureImage value={item.signature ?? []} />
              <p className="receipt-hash">Comprovante: {item.receiptHash}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <Notice>
            {item.expired
              ? "Link expirado. Renove para o responsável assinar."
              : "Pendente de preenchimento e assinatura."}
            {allowPendingConfirmation
              ? " A vaga pode ser confirmada; a autorização do responsável permanece obrigatória antes do evento."
              : !item.expired &&
                " A participação ainda não pode ser confirmada."}
          </Notice>
          <p>
            E-mail:{" "}
            {item.emailStatus === "ENVIADA"
              ? "Enviado"
              : item.emailStatus === "SEM_CONFIGURACAO"
                ? "SMTP não configurado"
                : item.emailStatus === "FALHA"
                  ? "Falha no envio"
                  : "Pendente"}
          </p>
          {item.active && (
            <>
              <div className="notice-share-actions">
                {!item.expired && item.whatsappLink && (
                  <a
                    className="review-whatsapp"
                    href={item.whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Enviar autorização pelo WhatsApp ao responsável"
                    title="Enviar autorização pelo WhatsApp ao responsável"
                  >
                    <WhatsAppIcon />
                  </a>
                )}
                {!item.expired && item.link && (
                  <CopyNoticeLink
                    key={authorizationKey}
                    link={item.link}
                    inputLabel="Link do responsável"
                    buttonLabel="Copiar link do responsável"
                    disabled={busy}
                    onError={(message) => callbacks.current.onError?.(message)}
                  />
                )}
                {!item.expired && item.email && (
                  <button
                    className="button outline"
                    disabled={busy}
                    onClick={() => void action("email")}
                  >
                    {item.emailStatus === "ENVIADA"
                      ? "Reenviar e-mail"
                      : "Enviar por e-mail"}
                  </button>
                )}
              </div>
              {!item.expired && item.whatsappLink && (
                <GuardianMessage
                  whatsappLink={item.whatsappLink}
                  show={showMessage}
                  id={messageId}
                  onToggle={() => setShowMessage((value) => !value)}
                />
              )}
              <RenewNoticeLink
                key={authorizationKey}
                disabled={busy}
                onConfirm={() => action("renew")}
              />
            </>
          )}
          <p className="muted">
            O botão do WhatsApp abre uma mensagem pronta; confirme o envio no
            aplicativo. Renovar invalida o link anterior.
          </p>
        </>
      )}
    </section>
  );
}

function GuardianMessage({
  whatsappLink,
  show,
  id,
  onToggle,
}: {
  whatsappLink: string;
  show: boolean;
  id: string;
  onToggle: () => void;
}) {
  let message: string | null = null;
  try {
    message = new URL(whatsappLink).searchParams.get("text");
  } catch {
    /* Invalid links do not disclose a message. */
  }
  if (!message) return null;
  return (
    <>
      <button
        type="button"
        className="text-button"
        aria-expanded={show}
        aria-controls={id}
        onClick={onToggle}
      >
        {show ? "Ocultar mensagem" : "Ver mensagem"}
      </button>
      {show && (
        <div
          id={id}
          className="notice-message"
          role="region"
          aria-label="Mensagem para o responsável"
        >
          <p>{message}</p>
        </div>
      )}
    </>
  );
}
