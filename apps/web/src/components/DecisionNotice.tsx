import { useState } from "react";
import { api } from "../lib/api";
import { useRemote } from "../lib/hooks";
import { dateTime } from "../lib/types";
import { Field, Loading, Notice } from "./ui";

export interface DecisionNoticeState {
  ready: boolean;
  notice: null | {
    id: string;
    kind: "ACEITE" | "RECUSA";
    emailStatus: string;
    emailSentAt: string | null;
    whatsappSentAt: string | null;
    confirmedAt: string | null;
    expiresAt: string;
    active: boolean;
    expired: boolean;
    email: string | null;
    message: string | null;
    link: string | null;
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
}: {
  organizationId: string;
  registrationId: string;
}) {
  const path = `/organizations/${organizationId}/registrations/${registrationId}/decision-notice`;
  const state = useRemote<DecisionNoticeState>(path);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [info, setInfo] = useState("");
  async function action(suffix: string) {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      state.setData(
        await api<DecisionNoticeState>(`${path}/${suffix}`, { method: "POST" }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(state.data!.notice!.link!);
      setInfo("Link copiado.");
    } catch {
      setError("Selecione e copie o link abaixo.");
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
  const notice = state.data.notice;
  if (!notice)
    return (
      <Notice kind="info">
        Esta decisão não possui aviso. A confirmação pode ser combinada
        diretamente com a organização.
      </Notice>
    );
  return (
    <section className="decision-notice">
      <hr />
      <h3>
        {notice.kind === "ACEITE"
          ? "Aviso de aceite e presença"
          : "Aviso de recusa"}
      </h3>
      {error && <Notice>{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      {notice.kind === "ACEITE" && (
        <Notice kind={notice.confirmedAt ? "success" : "info"}>
          {notice.confirmedAt
            ? `Presença confirmada pelo candidato em ${dateTime(notice.confirmedAt)}.`
            : "Aguardando o candidato confirmar presença pelo link. A confirmação final também exige alocação em equipe."}
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
              <Field label="Link do candidato">
                <input
                  readOnly
                  value={notice.link ?? ""}
                  onFocus={(e) => e.target.select()}
                />
              </Field>
              <details>
                <summary>Mensagem para o candidato</summary>
                <p className="description">{notice.message}</p>
              </details>
              <div className="button-row">
                {notice.whatsappLink && (
                  <a
                    className="button outline"
                    href={notice.whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir mensagem no WhatsApp
                  </a>
                )}
                <button
                  type="button"
                  className="button outline"
                  disabled={busy || !notice.link}
                  onClick={() => void copy()}
                >
                  Copiar link
                </button>
                {!notice.whatsappSentAt && notice.whatsappLink && (
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
              <p className="muted">
                Abrir o WhatsApp prepara a conversa. Envie a mensagem e depois
                registre o envio aqui.
              </p>
            </>
          )}
          {!notice.confirmedAt && (
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => void action("renew")}
            >
              Renovar link
            </button>
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
