import { useEffect, useId, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { api } from "../lib/api";
import type { Registration } from "../lib/types";
import type { DecisionNoticeState } from "./DecisionNotice";

function WhatsAppIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3 20.6l1.3-4.9a8.5 8.5 0 1 1 16.2-4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m8.6 7.5 1.2 2-1 1.2c.8 1.7 1.9 2.8 3.7 3.6l1.1-1 2.1 1.2c.1 1.5-1 2.1-2.2 1.8-3.6-.9-6.6-3.9-7.3-7.1-.2-1.2.9-2.2 2.4-1.7Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function RegistrationShareActions({
  organizationId,
  registration,
  disabled,
  canWhatsApp,
  canCopy,
  whatsappBlockedMessage,
  onChanged,
}: {
  organizationId: string;
  registration: Registration;
  disabled: boolean;
  canWhatsApp: boolean;
  canCopy: boolean;
  whatsappBlockedMessage?: string;
  onChanged: () => void;
}) {
  const path = `/organizations/${organizationId}/registrations/${registration.id}/decision-notice`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [openedNoticeId, setOpenedNoticeId] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState("");
  const [blockedHint, setBlockedHint] = useState(false);
  const hintId = useId();
  const whatsappControl = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const request = useRef<{
    controller: AbortController;
    popup: Window | null;
  } | null>(null);
  const summary = registration.decisionSummary?.notice;
  useEffect(() => {
    setBlockedHint(false);
  }, [
    registration.id,
    registration.status,
    canWhatsApp,
    whatsappBlockedMessage,
    disabled,
  ]);
  useEffect(() => {
    if (!blockedHint) return;
    const timer = window.setTimeout(() => setBlockedHint(false), 3500);
    const outside = (event: PointerEvent) => {
      if (!whatsappControl.current?.contains(event.target as Node))
        setBlockedHint(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBlockedHint(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [blockedHint]);
  useEffect(() => {
    setOpenedNoticeId(null);
    setManualLink("");
    setError("");
    setInfo("");
    setBusy(false);
    running.current = false;
    return () => {
      request.current?.controller.abort();
      request.current?.popup?.close();
      request.current = null;
    };
  }, [
    registration.id,
    registration.status,
    registration.team?.id,
    summary?.id,
    summary?.active,
    summary?.expired,
  ]);

  async function currentNotice(signal: AbortSignal) {
    const state = await api<DecisionNoticeState>(path, { signal });
    if (!state.ready || !state.notice?.active)
      throw new Error(
        "Convite indisponível. Confira o indicador de convite na linha.",
      );
    if (state.notice.expired)
      throw new Error(
        "O link expirou. Renove-o pelo indicador de convite antes de compartilhar.",
      );
    return state.notice;
  }
  async function share(kind: "whatsapp" | "copy" | "sent") {
    if (
      running.current ||
      disabled ||
      (kind === "whatsapp" ? !canWhatsApp : !canCopy)
    )
      return;
    running.current = true;
    setBusy(true);
    setError("");
    setInfo("");
    setManualLink("");
    // Reserve the tab during the click so mobile browsers keep the user gesture.
    const operation = {
      controller: new AbortController(),
      popup: null as Window | null,
    };
    request.current = operation;
    const signal = operation.controller.signal;
    try {
      if (kind === "whatsapp") {
        operation.popup = window.open("about:blank", "_blank");
        if (!operation.popup)
          throw new Error(
            "O navegador bloqueou a nova aba. Permita pop-ups para abrir o WhatsApp e tente novamente.",
          );
        operation.popup.opener = null;
      }
      if (kind === "copy") {
        const linkPromise = currentNotice(signal).then((notice) => {
          const link = notice.shortLink ?? notice.link;
          if (!link)
            throw new Error(
              "Link indisponível. Confira o indicador de convite na linha.",
            );
          return link;
        });
        // Start clipboard access during the click. Safari resolves the contents
        // later through ClipboardItem without losing the user gesture.
        let writing: Promise<void>;
        if (
          navigator.clipboard?.write &&
          typeof ClipboardItem !== "undefined"
        ) {
          const payload = linkPromise.then(
            (link) => new Blob([link], { type: "text/plain" }),
          );
          void payload.catch(() => {});
          try {
            writing = navigator.clipboard.write([
              new ClipboardItem({ "text/plain": payload }),
            ]);
          } catch (error) {
            writing = Promise.reject(error);
          }
        } else {
          writing = linkPromise.then((link) =>
            navigator.clipboard.writeText(link),
          );
        }
        const copied = writing.then(
          () => true,
          () => false,
        );
        const link = await linkPromise;
        const succeeded = await copied;
        if (signal.aborted) return;
        if (!succeeded) {
          setManualLink(link);
          throw new Error(
            "Não foi possível copiar automaticamente. Selecione e copie o link abaixo.",
          );
        }
        setInfo("Link copiado.");
        return;
      }
      const notice = await currentNotice(signal);
      if (signal.aborted) return;
      if (kind === "whatsapp") {
        if (
          !notice.whatsappLink ||
          new URL(notice.whatsappLink).origin !== "https://wa.me"
        )
          throw new Error(
            "O candidato não tem um telefone válido para abrir o WhatsApp. Copie o link ou confira a ficha.",
          );
        operation.popup!.location.replace(notice.whatsappLink);
        operation.popup = null;
        setOpenedNoticeId(notice.id);
        setInfo(
          "Conversa aberta. Após enviar a mensagem, marque como enviado.",
        );
      } else {
        if (!openedNoticeId || notice.id !== openedNoticeId) {
          setOpenedNoticeId(null);
          throw new Error(
            "O convite mudou. Abra a conversa novamente antes de registrar o envio.",
          );
        }
        await api<DecisionNoticeState>(`${path}/whatsapp-sent`, {
          method: "POST",
          signal,
        });
        if (signal.aborted) return;
        setOpenedNoticeId(null);
        setInfo("Envio pelo WhatsApp registrado.");
        onChanged();
      }
    } catch (error) {
      operation.popup?.close();
      if (!signal.aborted) setError((error as Error).message);
    } finally {
      if (request.current === operation) {
        request.current = null;
        running.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <div className="review-share" aria-busy={busy || undefined}>
      <div className="review-share-buttons">
        <div className="review-whatsapp-control" ref={whatsappControl}>
          <button
            type="button"
            className="review-whatsapp"
            disabled={
              disabled || busy || (!canWhatsApp && !whatsappBlockedMessage)
            }
            aria-disabled={disabled || busy || !canWhatsApp || undefined}
            aria-label={`Enviar convite por WhatsApp para ${registration.person.name}`}
            aria-describedby={blockedHint ? hintId : undefined}
            title={
              canWhatsApp
                ? "Abrir mensagem no WhatsApp em outra aba"
                : undefined
            }
            onBlur={() => setBlockedHint(false)}
            onClick={() => {
              if (!canWhatsApp && whatsappBlockedMessage) {
                setBlockedHint(true);
                return;
              }
              void share("whatsapp");
            }}
          >
            <WhatsAppIcon />
            <span className="review-action-label">WhatsApp</span>
          </button>
          {blockedHint && whatsappBlockedMessage && (
            <span
              id={hintId}
              className="review-whatsapp-tooltip"
              role="tooltip"
            >
              {whatsappBlockedMessage}
            </span>
          )}
        </div>
        <button
          type="button"
          className="review-icon-button review-copy-link"
          disabled={disabled || busy || !canCopy}
          aria-label={`Copiar link do candidato ${registration.person.name}`}
          title="Copiar link do candidato"
          onClick={() => void share("copy")}
        >
          <Copy size={18} aria-hidden="true" />
          <span className="review-action-label">Copiar link</span>
        </button>
      </div>
      {busy && <small role="status">Preparando…</small>}
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
      {info && (
        <small className="review-row-success" role="status">
          {info}
        </small>
      )}
      {manualLink && (
        <input
          aria-label={`Link do candidato ${registration.person.name}`}
          readOnly
          value={manualLink}
          onFocus={(event) => event.target.select()}
        />
      )}
      {openedNoticeId && !summary?.whatsappSentAt && (
        <button
          type="button"
          className="text-button review-mark-sent"
          disabled={disabled || busy || !canCopy}
          onClick={() => void share("sent")}
        >
          Marcar como enviado
        </button>
      )}
    </div>
  );
}
