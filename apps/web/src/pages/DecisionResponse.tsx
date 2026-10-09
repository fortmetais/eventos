import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { date, dateTime } from "../lib/types";
import { Loading, Notice } from "../components/ui";

interface ResponseSummary {
  kind: "ACEITE" | "RECUSA";
  candidateName: string;
  confirmedAt: string | null;
  expiresAt: string;
  event: {
    name: string;
    startsAt: string;
    endsAt: string;
    organization: string;
  };
}
export function DecisionResponse() {
  const { noticeId } = useParams();
  return <ResponseForm key={noticeId} noticeId={noticeId!} />;
}
function ResponseForm({ noticeId }: { noticeId: string }) {
  const [data, setData] = useState<ResponseSummary | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [token] = useState(() => {
    const key = `fac:decision:${noticeId}`;
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (fragment && /^[A-Za-z0-9_-]{43}$/.test(fragment)) {
      sessionStorage.setItem(key, fragment);
      history.replaceState(history.state, "", window.location.pathname);
      return fragment;
    }
    return sessionStorage.getItem(key) ?? "";
  });
  useEffect(() => {
    const controller = new AbortController();
    async function view() {
      try {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token))
          throw new Error("Abra o link completo recebido da organização.");
        const response = await api<ResponseSummary>(
          `/public/decision-responses/${noticeId}/view`,
          { method: "POST", body: { token }, signal: controller.signal },
        );
        if (!controller.signal.aborted) setData(response);
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void view();
    return () => controller.abort();
  }, [noticeId, token]);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      setData(
        await api<ResponseSummary>(`/public/decision-responses/${noticeId}`, {
          method: "POST",
          body: { token },
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      {loading ? (
        <Loading />
      ) : (
        <section className="panel">
          {error && <Notice>{error}</Notice>}
          {data && (
            <>
              <span className="eyebrow">{data.event.organization}</span>
              <h1>
                {data.kind === "RECUSA"
                  ? "Não foi dessa vez!"
                  : data.confirmedAt
                    ? "Sua presença está confirmada!"
                    : "Sua candidatura foi aceita!"}
              </h1>
              <h2>{data.event.name}</h2>
              <p>
                {date(data.event.startsAt)}
                {data.event.endsAt !== data.event.startsAt &&
                  ` até ${date(data.event.endsAt)}`}
              </p>
              {data.kind === "RECUSA" ? (
                <p>
                  {data.candidateName}, agradecemos sua disponibilidade para
                  servir. Sua candidatura não foi selecionada para esta edição.
                  Esperamos contar com você em uma próxima oportunidade!
                </p>
              ) : data.confirmedAt ? (
                <>
                  <Notice kind="success">
                    Confirmamos sua resposta em {dateTime(data.confirmedAt)}.
                  </Notice>
                  <p>
                    A organização finalizará sua equipe e a confirmação da
                    participação. Aguarde as orientações para servir.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    {data.candidateName}, ficamos felizes em contar com você!
                    Confirme que pretende participar como servo neste evento.
                  </p>
                  <p>
                    Responda até {dateTime(data.expiresAt)} (horário de
                    Brasília).
                  </p>
                  <button
                    className="button primary full"
                    disabled={busy}
                    onClick={() => void confirm()}
                  >
                    {busy ? "Confirmando…" : "Confirmar minha presença"}
                  </button>
                  <p className="muted">
                    Você pode confirmar sem criar conta. A organização definirá
                    sua equipe.
                  </p>
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
