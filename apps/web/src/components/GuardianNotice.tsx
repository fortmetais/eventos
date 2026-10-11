import { useState } from "react";
import { api } from "../lib/api";
import { useRemote } from "../lib/hooks";
import type { GuardianSummary, GuardianRecord } from "../lib/guardian";
import { dateTime } from "../lib/types";
import { Loading, Notice } from "./ui";
import { SignatureImage } from "./SignaturePad";
type State = {
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
}: {
  organizationId: string;
  registrationId: string;
}) {
  const base = `/organizations/${organizationId}/registrations/${registrationId}/guardian`;
  const remote = useRemote<State>(base);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function action(name: string) {
    setBusy(true);
    setError("");
    try {
      await api(`${base}/${name}`, { method: "POST" });
      remote.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
      </Notice>
    ) : null;
  const item = remote.data.authorization;
  if (!item)
    return remote.data.needsAuthorization ? (
      <section className="guardian-notice">
        <h3>Autorização do responsável</h3>
        <Notice>
          Esta ficha de menor ainda não tem termo. Crie a solicitação antes de
          confirmar a participação.
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
      <h3>Autorização do responsável</h3>
      {error && <Notice>{error}</Notice>}
      {item.signedAt ? (
        <>
          <Notice kind="success">
            Assinado por {item.signedData?.name} em {dateTime(item.signedAt)}.
          </Notice>
          <details>
            <summary>Consultar termo e assinatura</summary>
            <p>
              Responsável: {item.signedData?.name} · CPF: {item.signedData?.cpf}{" "}
              · {item.signedData?.relationship}
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
          </details>
        </>
      ) : (
        <>
          <Notice>
            {item.expired
              ? "Link expirado. Renove para o responsável assinar."
              : "Pendente de preenchimento e assinatura. A participação ainda não pode ser confirmada."}
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
            <div className="button-row">
              {item.whatsappLink && (
                <a
                  className="button primary"
                  href={item.whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Enviar pelo WhatsApp
                </a>
              )}
              {item.link && (
                <button
                  className="button outline"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(item.link!)
                      .catch(() => setError("Não foi possível copiar o link."))
                  }
                >
                  Copiar link
                </button>
              )}
              {item.email && (
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => void action("email")}
                >
                  Reenviar e-mail
                </button>
              )}
              <button
                className="button outline"
                disabled={busy}
                onClick={() => void action("renew")}
              >
                Renovar link
              </button>
            </div>
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
