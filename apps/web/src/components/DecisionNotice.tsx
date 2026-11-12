import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useRemote } from "../lib/hooks";
import { dateTime, type RegistrationDecisionSummary } from "../lib/types";
import { Loading, Notice } from "./ui";
import { CopyNoticeLink, RenewNoticeLink, WhatsAppIcon } from "./NoticeActions";

export interface DecisionNoticeState {
  ready: boolean;
  notice: null | {
    id: string;
    kind: "ACEITE" | "RECUSA";
    emailStatus: string;
    emailSentAt: string | null;
    whatsappSentAt: string | null;
    confirmedAt: string | null;
    declinedAt?: string | null;
    expiresAt: string;
    active: boolean;
    expired: boolean;
    spirituality?: NonNullable<
      RegistrationDecisionSummary["notice"]
    >["spirituality"];
    email: string | null;
    message: string | null;
    link: string | null;
    shortLink?: string | null;
    whatsappLink: string | null;
  };
}
const emailLabels: Record<string, string> = {
  PENDENTE: "Pendente",
  EM_ENVIO: "Envio em andamento",
  ENVIADA: "Enviado",
  FALHA: "Falha no envio",
  SEM_CONFIGURACAO: "Envio de e-mail indisponível",
  SEM_EMAIL: "O candidato não informou e-mail",
  INCERTO: "Envio não confirmado",
};
export function DecisionNotice({
  organizationId,
  registrationId,
  onChanged,
  initialWhatsApp = false,
  embedded = false,
  onStateChange,
  onBusyChange,
  onError,
}: {
  organizationId: string;
  registrationId: string;
  onChanged?: () => void;
  initialWhatsApp?: boolean;
  embedded?: boolean;
  onStateChange?: (state: DecisionNoticeState) => void;
  onBusyChange?: (busy: boolean) => void;
  onError?: (message: string) => void;
}) {
  const path = `/organizations/${organizationId}/registrations/${registrationId}/decision-notice`;
  const state = useRemote<DecisionNoticeState>(path);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [info, setInfo] = useState("");
  const [whatsappOpened, setWhatsappOpened] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const messageId = useId();
  const running = useRef(false);
  const callbacks = useRef({ onStateChange, onBusyChange, onError });
  callbacks.current = { onStateChange, onBusyChange, onError };
  const notice = state.data?.notice;
  const noticeKey = `${notice?.id}:${notice?.expiresAt}:${notice?.active}:${notice?.expired}:${notice?.confirmedAt}`;
  useEffect(() => {
    if (state.data) callbacks.current.onStateChange?.(state.data);
  }, [state.data]);
  useLayoutEffect(() => {
    callbacks.current.onBusyChange?.(busy);
  }, [busy]);
  useEffect(() => () => callbacks.current.onBusyChange?.(false), []);
  useEffect(() => {
    if (state.error) callbacks.current.onError?.(state.error);
  }, [state.error]);
  useEffect(() => {
    setWhatsappOpened(false);
    setShowMessage(false);
    setError("");
    setInfo("");
  }, [registrationId, noticeKey]);
  const whatsappButton = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (initialWhatsApp && state.data?.notice?.whatsappLink)
      whatsappButton.current?.focus();
  }, [initialWhatsApp, state.data?.notice?.whatsappLink]);
  async function action(suffix: string) {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      state.setData(
        await api<DecisionNoticeState>(`${path}/${suffix}`, { method: "POST" }),
      );
      if (suffix === "renew") setWhatsappOpened(false);
      onChanged?.();
      return true;
    } catch (error) {
      const message = (error as Error).message;
      setError(message);
      callbacks.current.onError?.(message);
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  if (state.loading) return <Loading />;
  if (state.error) return <Notice>{state.error}</Notice>;
  if (!state.data?.ready)
    return (
      <Notice kind="info">
        Os avisos ao candidato aguardam configuração. A decisão permanece
        registrada.
      </Notice>
    );
  if (!notice)
    return (
      <Notice kind="info">
        Esta decisão não possui aviso. A confirmação pode ser combinada
        diretamente com a organização.
      </Notice>
    );
  return (
    <section className="decision-notice">
      {!embedded && (
        <>
          <hr />
          <h3>
            {notice.kind === "ACEITE"
              ? "Aviso de aceite e presença"
              : "Aviso de recusa"}
          </h3>
        </>
      )}
      {error && <Notice>{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      {notice.kind === "ACEITE" && (
        <Notice kind={notice.confirmedAt ? "success" : "info"}>
          {notice.declinedAt
            ? `O candidato informou que não irá em ${dateTime(notice.declinedAt)}. Revise a candidatura e a vaga.`
            : notice.confirmedAt
              ? `Presença confirmada pelo candidato em ${dateTime(notice.confirmedAt)}.`
              : notice.whatsappSentAt || notice.emailSentAt
                ? "Aguardando o candidato confirmar presença pelo link. A confirmação final também exige alocação em equipe."
                : "Convite ainda não enviado. Escolha WhatsApp ou e-mail para solicitar a confirmação de presença."}
        </Notice>
      )}
      <p>
        E-mail: <strong>{emailLabels[notice.emailStatus] ?? "Pendente"}</strong>
        {notice.emailSentAt && ` em ${dateTime(notice.emailSentAt)}`}.
      </p>
      {notice.whatsappSentAt ? (
        <p>
          Envio pelo WhatsApp registrado em {dateTime(notice.whatsappSentAt)}.
        </p>
      ) : (
        <p>Envio pelo WhatsApp ainda não registrado.</p>
      )}
      {!notice.active ? (
        <Notice kind="info">
          Este aviso foi encerrado ou substituído. O link anterior não permite
          confirmar presença.
        </Notice>
      ) : (
        <>
          {notice.expired ? (
            <Notice kind="info">
              O link expirou. Renove-o para compartilhar novamente.
            </Notice>
          ) : (
            <>
              <div className="notice-share-actions">
                {notice.whatsappLink && (
                  <a
                    ref={whatsappButton}
                    className="review-whatsapp"
                    href={notice.whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Abrir mensagem no WhatsApp"
                    title="Abrir mensagem no WhatsApp"
                    onClick={() => setWhatsappOpened(true)}
                  >
                    <WhatsAppIcon />
                  </a>
                )}
                <CopyNoticeLink
                  key={noticeKey}
                  link={notice.shortLink ?? notice.link}
                  inputLabel="Link do candidato"
                  buttonLabel="Copiar link do candidato"
                  disabled={busy}
                  onError={(message) => callbacks.current.onError?.(message)}
                />
                {!notice.whatsappSentAt &&
                  notice.whatsappLink &&
                  whatsappOpened && (
                    <button
                      type="button"
                      className="button outline"
                      disabled={busy}
                      onClick={() => void action("whatsapp-sent")}
                    >
                      Marcar como enviado pelo WhatsApp
                    </button>
                  )}
                {notice.email && notice.emailStatus !== "ENVIADA" && (
                  <button
                    type="button"
                    className="button outline"
                    disabled={busy}
                    onClick={() => void action("email")}
                  >
                    Enviar por e-mail
                  </button>
                )}
              </div>
              {notice.message && (
                <>
                  <button
                    type="button"
                    className="text-button"
                    aria-expanded={showMessage}
                    aria-controls={messageId}
                    onClick={() => setShowMessage((value) => !value)}
                  >
                    {showMessage ? "Ocultar mensagem" : "Ver mensagem"}
                  </button>
                  {showMessage && (
                    <div
                      id={messageId}
                      className="notice-message"
                      role="region"
                      aria-label="Mensagem para o candidato"
                    >
                      <p>{notice.message}</p>
                    </div>
                  )}
                </>
              )}
              <p className="muted">
                Abrir o WhatsApp prepara a conversa. Envie a mensagem e depois
                registre o envio aqui.
              </p>
              {initialWhatsApp && !notice.whatsappLink && (
                <Notice kind="info">
                  Este candidato não tem um telefone válido para abrir o
                  WhatsApp. Confira a ficha ou utilize outro canal.
                </Notice>
              )}
            </>
          )}
          {!notice.confirmedAt && (
            <RenewNoticeLink
              key={noticeKey}
              disabled={busy}
              onConfirm={() => action("renew")}
            />
          )}
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={state.refresh}
          >
            Atualizar envio e presença
          </button>
        </>
      )}
    </section>
  );
}
