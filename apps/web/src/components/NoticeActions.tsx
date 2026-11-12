import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { Field, Notice } from "./ui";
import "./NoticeActions.css";

export function WhatsAppIcon() {
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

export function CopyNoticeLink({
  link,
  inputLabel,
  buttonLabel = "Copiar link",
  disabled = false,
  onError,
}: {
  link: string | null;
  inputLabel: string;
  buttonLabel?: string;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const [status, setStatus] = useState<"" | "copied" | "failed">("");
  const [manual, setManual] = useState(false);
  const [copying, setCopying] = useState(false);
  const running = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setStatus("");
    setManual(false);
  }, [link]);
  useEffect(() => {
    if (manual) {
      input.current?.focus();
      input.current?.select();
    }
  }, [manual]);
  async function copy() {
    if (!link || running.current || disabled) return;
    running.current = true;
    setCopying(true);
    setStatus("");
    setManual(false);
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard indisponível");
      await navigator.clipboard.writeText(link);
      setStatus("copied");
    } catch {
      setStatus("failed");
      onError?.("Não foi possível copiar automaticamente o link.");
    } finally {
      running.current = false;
      setCopying(false);
    }
  }
  return (
    <div className="notice-copy-control">
      <button
        type="button"
        className="review-icon-button"
        disabled={disabled || copying || !link}
        aria-label={buttonLabel}
        title={`Copiar ${inputLabel.toLocaleLowerCase("pt-BR")}`}
        onClick={() => void copy()}
      >
        <Copy size={19} aria-hidden="true" />
      </button>
      {status === "copied" && (
        <span className="notice-copy-success" role="status">
          Link copiado.
        </span>
      )}
      {status === "failed" && (
        <div className="notice-manual-copy">
          <Notice>Não foi possível copiar automaticamente o link.</Notice>
          {!manual && (
            <button
              type="button"
              className="button outline"
              onClick={() => setManual(true)}
            >
              Exibir link para copiar manualmente
            </button>
          )}
          {manual && (
            <Field label={inputLabel}>
              <input
                ref={input}
                readOnly
                value={link ?? ""}
                onFocus={(event) => event.target.select()}
              />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

export function RenewNoticeLink({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const confirmingButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmingButton.current?.focus();
  }, [confirming]);
  async function confirm() {
    if (await onConfirm()) setConfirming(false);
  }
  return (
    <div className="notice-renew">
      {!confirming ? (
        <button
          ref={trigger}
          type="button"
          className="button outline"
          disabled={disabled}
          onClick={() => setConfirming(true)}
        >
          Renovar link
        </button>
      ) : (
        <div
          className="notice-renew-confirm"
          role="group"
          aria-label="Confirmar renovação do link"
        >
          <p>
            Ao renovar, o link anterior deixará de funcionar. Nenhuma mensagem
            será enviada automaticamente. Deseja gerar um novo link?
          </p>
          <div className="button-row">
            <button
              ref={confirmingButton}
              type="button"
              className="button outline"
              disabled={disabled}
              onClick={() => void confirm()}
            >
              Confirmar renovação
            </button>
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => {
                setConfirming(false);
                window.requestAnimationFrame(() => trigger.current?.focus());
              }}
            >
              Manter link atual
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
