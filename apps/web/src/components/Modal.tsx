import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  children,
  dirty = false,
  closeRequested = false,
  onKeepEditing,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  dirty?: boolean;
  closeRequested?: boolean;
  onKeepEditing?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const confirmationId = useId();
  const [confirming, setConfirming] = useState(false);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
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
      if (typeof element.close === "function") element.close();
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    if (confirming) keepEditing.current?.focus();
    else heading.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (!closeRequested) return;
    if (dirty) setConfirming(true);
    else closeHandler.current();
  }, [closeRequested, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  function continueEditing() {
    setConfirming(false);
    onKeepEditing?.();
  }
  function requestClose() {
    if (dirty) setConfirming(true);
    else onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="review-modal"
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (confirming) continueEditing();
        else requestClose();
      }}
    >
      <header className="review-modal-header" inert={confirming}>
        <h2 id={titleId} ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button
          type="button"
          className="button outline icon-button"
          aria-label="Fechar janela"
          onClick={requestClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="review-modal-body" inert={confirming}>
        {children}
      </div>
      {confirming && (
        <section
          className="review-modal-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={confirmationId}
        >
          <h3 id={confirmationId}>Descartar alterações não salvas?</h3>
          <p>Os dados que você ainda não salvou nesta ficha serão perdidos.</p>
          <div className="review-modal-footer button-row">
            <button
              ref={keepEditing}
              type="button"
              className="button primary"
              onClick={continueEditing}
            >
              Continuar editando
            </button>
            <button type="button" className="button outline" onClick={onClose}>
              Descartar e fechar
            </button>
          </div>
        </section>
      )}
    </dialog>
  );
}
