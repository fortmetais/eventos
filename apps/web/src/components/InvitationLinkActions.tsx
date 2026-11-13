import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { api } from "../lib/api";
import { Field, Notice } from "./ui";
import "./InvitationLinkActions.css";

type InvitationLink = {
  link: string;
  expiresAt: string;
  regenerated: boolean;
};

export function InvitationLinkActions({
  organizationId,
  invitationId,
  email,
  expiresAt,
  canCopyLink,
  disabled,
  onChanged,
}: {
  organizationId: string;
  invitationId: string;
  email: string;
  expiresAt: string;
  canCopyLink: boolean;
  disabled: boolean;
  onChanged: () => void;
}) {
  const path = `/organizations/${organizationId}/invitations/${invitationId}/link`;
  const [confirming, setConfirming] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [manualLink, setManualLink] = useState("");
  const [showManual, setShowManual] = useState(false);
  const request = useRef<AbortController | null>(null);
  const manualInput = useRef<HTMLInputElement>(null);
  const changed = useRef(onChanged);
  changed.current = onChanged;
  useEffect(() => {
    setConfirming(false);
    setGenerated(false);
    setBusy(false);
    setError("");
    setInfo("");
    setManualLink("");
    setShowManual(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [path, expiresAt]);
  useEffect(() => {
    if (showManual) {
      manualInput.current?.focus();
      manualInput.current?.select();
    }
  }, [showManual]);

  async function copy(regenerate = false) {
    if (disabled || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const signal = controller.signal;
    setBusy(true);
    setError("");
    setInfo("");
    setManualLink("");
    setShowManual(false);
    try {
      const response = api<InvitationLink>(path, {
        method: "POST",
        body: regenerate ? { regenerate: true } : {},
        signal,
      });
      const linkPromise = response.then((result) => {
        if (signal.aborted)
          throw new DOMException("Ação cancelada.", "AbortError");
        return result.link;
      });
      // Reserve clipboard access within the click, including Safari's gesture requirement.
      let writing: Promise<void>;
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        const content = linkPromise.then(
          (link) => new Blob([link], { type: "text/plain" }),
        );
        void content.catch(() => {});
        try {
          writing = navigator.clipboard.write([
            new ClipboardItem({ "text/plain": content }),
          ]);
        } catch (cause) {
          writing = Promise.reject(cause);
        }
      } else {
        writing = linkPromise.then((link) => {
          if (!navigator.clipboard?.writeText)
            throw new Error("Cópia automática indisponível.");
          return navigator.clipboard.writeText(link);
        });
      }
      const copied = writing.then(
        () => true,
        () => false,
      );
      const result = await response;
      if (signal.aborted) return;
      if (result.regenerated) {
        setGenerated(true);
        setConfirming(false);
        changed.current();
      }
      const succeeded = await copied;
      if (signal.aborted) return;
      if (!succeeded) {
        setManualLink(result.link);
        setError(
          result.regenerated
            ? "O novo link foi gerado, mas o navegador não permitiu copiá-lo. Use a opção de cópia manual abaixo e compartilhe o novo link."
            : "O navegador não permitiu copiar o link automaticamente. Use a opção de cópia manual abaixo.",
        );
        return;
      }
      setInfo(
        result.regenerated
          ? "Novo link gerado e copiado. Compartilhe com a pessoa convidada; o link anterior foi invalidado. Nenhum e-mail foi enviado."
          : "Link do convite copiado.",
      );
    } catch (cause) {
      if (!signal.aborted) setError((cause as Error).message);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className="invitation-link-actions">
      {error && <Notice>{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      {canCopyLink || generated ? (
        <button
          type="button"
          className="button outline"
          disabled={disabled || busy}
          onClick={() => void copy()}
        >
          <Copy size={16} aria-hidden="true" />
          {busy ? "Copiando link…" : "Copiar link do convite"}
        </button>
      ) : confirming ? (
        <div>
          <Notice kind="info">
            Este convite é antigo e seu link original não pode ser recuperado.
            Gerar um novo link invalida o anterior. O prazo permanece o mesmo e
            nenhum e-mail será enviado; compartilhe o novo link com a pessoa.
          </Notice>
          <div className="button-row">
            <button
              type="button"
              className="button outline"
              disabled={disabled || busy}
              onClick={() => void copy(true)}
            >
              {busy ? "Gerando link…" : "Gerar novo link e copiar"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={disabled || busy}
              onClick={() => setConfirming(false)}
            >
              Cancelar geração
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button outline"
          disabled={disabled || busy}
          onClick={() => setConfirming(true)}
        >
          Gerar link para copiar
        </button>
      )}
      {manualLink && !showManual && (
        <button
          type="button"
          className="text-button"
          disabled={disabled || busy}
          onClick={() => setShowManual(true)}
        >
          Exibir link para copiar manualmente
        </button>
      )}
      {showManual && (
        <Field label={`Link do convite para ${email}`}>
          <input
            ref={manualInput}
            value={manualLink}
            readOnly
            onFocus={(event) => event.target.select()}
          />
        </Field>
      )}
    </div>
  );
}
