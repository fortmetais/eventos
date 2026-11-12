import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { date } from "../lib/types";
import { BackLink, Loading, Notice } from "../components/ui";
import { decodeDecisionLink } from "../lib/decision-link";
import "./DecisionResponse.css";

interface ResponseSummary {
  kind: "ACEITE" | "RECUSA";
  participation?: "CAMPER" | "VOLUNTEER";
  candidateName: string;
  confirmedAt: string | null;
  declinedAt?: string | null;
  canRespond?: boolean;
  expiresAt: string;
  spirituality?: {
    startsAt: string;
    answer: boolean | null;
    respondedAt: string | null;
    canRespond: boolean;
  } | null;
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
export function ShortDecisionResponse() {
  const navigate = useNavigate();
  const [code] = useState(() => window.location.hash.slice(1));
  const [error, setError] = useState("");
  useEffect(() => {
    // The fragment never reaches the server. Clear it before requesting any candidate data.
    history.replaceState(history.state, "", window.location.pathname);
    try {
      const { noticeId, token } = decodeDecisionLink(code);
      sessionStorage.setItem(`fac:decision:${noticeId}`, token);
      navigate(`/resposta/${noticeId}`, { replace: true });
    } catch (error) {
      setError((error as Error).message);
    }
  }, [code, navigate]);
  return error ? (
    <div className="auth-shell">
      <Notice>{error}</Notice>
    </div>
  ) : (
    <Loading />
  );
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
  async function saveResponse(
    suffix: string,
    response: { resposta: "VOU" | "NAO_IREI" } | { response: boolean },
  ) {
    setBusy(true);
    setError("");
    try {
      setData(
        await api<ResponseSummary>(
          `/public/decision-responses/${noticeId}${suffix}`,
          { method: "POST", body: { token, ...response } },
        ),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const canRespond =
    data?.canRespond ??
    (data ? new Date(data.expiresAt).getTime() > Date.now() : false);
  return (
    <div className="auth-shell decision-response">
      <BackLink to="/eventos">Eventos</BackLink>
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
                  : data.declinedAt
                    ? "Sua resposta foi registrada"
                    : data.confirmedAt
                      ? "Você informou que vai participar!"
                      : data.participation === "CAMPER"
                        ? "Sua inscrição foi aprovada!"
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
                  {data.candidateName},{" "}
                  {data.participation === "CAMPER"
                    ? "agradecemos seu interesse em participar. Sua inscrição não foi selecionada para esta edição."
                    : "agradecemos sua disponibilidade para servir. Sua candidatura não foi selecionada para esta edição."}
                  Esperamos contar com você em uma próxima oportunidade!
                </p>
              ) : (
                <>
                  <div className="decision-response-block">
                    <p id="participation-question">
                      {data.candidateName}, ficamos felizes em contar com você!
                      Confirme que pretende participar como{" "}
                      {data.participation === "CAMPER" ? "campista" : "servo"}{" "}
                      neste evento.
                    </p>
                    <div
                      className="decision-response-actions"
                      role="group"
                      aria-label="Participação no evento"
                      aria-describedby="participation-question"
                      aria-busy={busy}
                    >
                      <button
                        type="button"
                        className={`button ${data.confirmedAt ? "primary" : "outline"}`}
                        aria-pressed={!!data.confirmedAt}
                        disabled={busy || !canRespond}
                        onClick={() =>
                          void saveResponse("", { resposta: "VOU" })
                        }
                      >
                        Vou participar
                      </button>
                      <button
                        type="button"
                        className={`button ${data.declinedAt ? "primary" : "outline"}`}
                        aria-pressed={!!data.declinedAt}
                        disabled={busy || !canRespond}
                        onClick={() =>
                          void saveResponse("", { resposta: "NAO_IREI" })
                        }
                      >
                        Não irei
                      </button>
                    </div>
                    {data.declinedAt ? (
                      <Notice kind="info">
                        Você informou que não irá. A organização foi informada e
                        avaliará sua vaga.
                      </Notice>
                    ) : (
                      data.confirmedAt && (
                        <Notice kind="success">
                          Você informou que vai participar!{" "}
                          {data.participation === "CAMPER"
                            ? "A organização finalizará a confirmação da participação conforme as vagas e a autorização do responsável, quando necessária."
                            : "A organização finalizará sua equipe e a confirmação da participação."}
                        </Notice>
                      )
                    )}
                  </div>
                  {data.spirituality && (
                    <div className="decision-response-block">
                      <p id="spirituality-question">
                        Você participará da espiritualidade do dia{" "}
                        {new Intl.DateTimeFormat("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        }).format(new Date(data.spirituality.startsAt))}{" "}
                        às{" "}
                        {new Intl.DateTimeFormat("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          hour: "2-digit",
                          minute: "2-digit",
                          hourCycle: "h23",
                        }).format(new Date(data.spirituality.startsAt))}{" "}
                        horas?
                      </p>
                      <div
                        className="decision-response-actions"
                        role="group"
                        aria-label="Participação na espiritualidade"
                        aria-describedby="spirituality-question"
                        aria-busy={busy}
                      >
                        {([true, false] as const).map((response) => (
                          <button
                            type="button"
                            key={String(response)}
                            className={`button ${data.spirituality!.answer === response ? "primary" : "outline"}`}
                            aria-pressed={
                              data.spirituality!.answer === response
                            }
                            disabled={busy || !data.spirituality!.canRespond}
                            onClick={() =>
                              void saveResponse("/spirituality", { response })
                            }
                          >
                            {response ? "Sim" : "Não"}
                          </button>
                        ))}
                      </div>
                      {data.spirituality.answer !== null && (
                        <Notice kind="success">
                          {data.spirituality.answer
                            ? "Você informou que participará da espiritualidade."
                            : "Você informou que não participará da espiritualidade."}
                        </Notice>
                      )}
                    </div>
                  )}
                  {(!canRespond || data.spirituality?.canRespond === false) && (
                    <p className="muted">
                      Este link expirou. Procure a organização para alterar suas
                      respostas.
                    </p>
                  )}
                  <p className="muted decision-response-footer">
                    Você pode confirmar sem criar conta.{" "}
                    {data.participation === "CAMPER"
                      ? "A organização finalizará sua participação."
                      : "A organização definirá sua equipe."}
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
