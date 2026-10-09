import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useOrganization } from "./Organization";
import { useRemote } from "../lib/hooks";
import { api, ApiError } from "../lib/api";
import {
  dateTime,
  type Campaign,
  type FormConfig,
  type FormVersion,
  type Team,
} from "../lib/types";
import { Field, Loading, Notice, PageHeading } from "../components/ui";
import { Questions } from "../components/Questions";

interface Setup {
  departmentsReady: boolean;
  departments: Team[];
  event: { id: string; name: string; status: string };
  campaign: Pick<
    Campaign,
    "id" | "opensAt" | "closesAt" | "paused" | "capacity" | "allowWaitlist"
  >;
  form: FormVersion | null;
  template: FormConfig;
}
export function VolunteerFormSetup() {
  const { eventId } = useParams();
  const { organizationId, membership } = useOrganization();
  const path = `/organizations/${organizationId}/events/${eventId}/volunteer-form`;
  const state = useRemote<Setup>(membership.role === "ORGANIZER" ? path : null);
  if (membership.role !== "ORGANIZER")
    return (
      <Notice>Somente organizadores podem preparar e publicar a ficha.</Notice>
    );
  return (
    <>
      <PageHeading title="Ficha de intenção para servos">
        Prepare as informações que ajudarão a organização a avaliar cada
        candidatura.
      </PageHeading>
      <Link className="back-link" to={`/organizacao/${organizationId}/eventos`}>
        ← Voltar aos eventos
      </Link>
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <>
          <Notice>{state.error}</Notice>
          <button className="button outline" onClick={state.refresh}>
            Atualizar ficha
          </button>
        </>
      ) : (
        state.data && (
          <Editor
            key={state.data.form?.id ?? eventId}
            data={state.data}
            path={path}
            organizationId={organizationId}
            refresh={state.refresh}
          />
        )
      )}
    </>
  );
}
function Editor({
  data,
  path,
  organizationId,
  refresh,
}: {
  data: Setup;
  path: string;
  organizationId: string;
  refresh: () => void;
}) {
  const initial = data.form?.config.volunteer
    ? data.form.config
    : data.template;
  const [requirements, setRequirements] = useState(
    initial.volunteer!.requirements,
  );
  const [training, setTraining] = useState(initial.volunteer!.training);
  const [terms, setTerms] = useState(initial.terms);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const config: FormConfig = {
    ...initial,
    terms,
    volunteer: { template: "VOLUNTEER_INTENTION_V1", requirements, training },
    questions: initial.questions.map((q) =>
      q.id === "equipes_preferencia"
        ? {
            ...q,
            ...data.template.questions.find(
              (question) => question.id === "equipes_preferencia",
            ),
          }
        : q,
    ),
  };
  async function publish(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const options = config.questions.find(
        (q) => q.id === "equipes_preferencia",
      )!.options;
      if (
        options.length < 1 ||
        options.length > 30 ||
        new Set(options).size !== options.length
      )
        throw new Error(
          "Cadastre de 1 a 30 departamentos diferentes e defina suas vagas no evento.",
        );
      await api(path, { method: "POST", body: config });
      refresh();
    } catch (error) {
      const fields =
        error instanceof ApiError
          ? Object.values(error.fields?.fieldErrors ?? {})
              .flat()
              .join(" ")
          : "";
      setError(fields || (error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pause() {
    setBusy(true);
    setError("");
    try {
      await api(
        `/organizations/${organizationId}/events/${data.event.id}/campaigns`,
        {
          method: "PUT",
          body: {
            kind: "VOLUNTEER",
            opensAt: data.campaign.opensAt,
            closesAt: data.campaign.closesAt,
            paused: !data.campaign.paused,
            capacity: data.campaign.capacity,
            allowWaitlist: data.campaign.allowWaitlist,
          },
        },
      );
      refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <h2>{data.event.name}</h2>
        <p>
          Inscrições de servos: {dateTime(data.campaign.opensAt)} até{" "}
          {dateTime(data.campaign.closesAt)} (Brasília).
        </p>
        {data.form?.publishedAt && (
          <>
            <Notice kind="success">
              Ficha publicada — versão {data.form.version}. Novas candidaturas
              usam essa versão.
            </Notice>
            <Field label="Link da ficha de servos">
              <input
                readOnly
                value={`${window.location.origin}/inscricao/${data.campaign.id}`}
                onFocus={(e) => e.target.select()}
              />
            </Field>
            <div className="button-row">
              <Link
                className="button outline"
                to={`/inscricao/${data.campaign.id}`}
              >
                Abrir ficha pública
              </Link>
              <Link
                className="button outline"
                to={`/organizacao/${organizationId}/inscricoes`}
              >
                Avaliar candidaturas
              </Link>
              <button
                className="button outline"
                disabled={busy}
                onClick={() => void pause()}
              >
                {data.campaign.paused
                  ? "Retomar inscrições de servos"
                  : "Pausar inscrições de servos"}
              </button>
            </div>
          </>
        )}
        {data.campaign.paused && (
          <Notice kind="info">
            As inscrições estão pausadas, mesmo durante o período.
          </Notice>
        )}
      </section>
      <form className="panel" onSubmit={publish}>
        <h2>
          {data.form?.publishedAt
            ? "Preparar uma nova versão"
            : "Preparar e publicar a ficha"}
        </h2>
        <p>
          A idade é calculada pela data de nascimento. O candidato pode sugerir
          até três departamentos para servir.
        </p>
        {error && <Notice>{error}</Notice>}
        <Field
          label="Regras e requisitos para servir"
          required
          hint="Informe os critérios deste evento, como idade mínima, região atendida e condições de participação."
        >
          <textarea
            required
            minLength={10}
            maxLength={5000}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
          />
        </Field>
        <Field
          label="Preparação e formações da equipe"
          required
          hint="Informe encontros, datas, horários e condições de participação deste evento."
        >
          <textarea
            required
            minLength={10}
            maxLength={5000}
            value={training}
            onChange={(e) => setTraining(e.target.value)}
          />
        </Field>
        <section aria-label="Departamentos da ficha">
          <h3>Departamentos para preferência</h3>
          <p>
            As opções vêm dos departamentos cadastrados neste evento. A escolha
            do candidato não reserva vaga.
          </p>
          {data.departments?.length ? (
            <ul>
              {data.departments.map((team) => (
                <li key={team.id}>
                  <strong>{team.name}</strong> —{" "}
                  {team.capacity == null
                    ? "vagas a definir"
                    : `${team.capacity} vagas`}
                </li>
              ))}
            </ul>
          ) : (
            <Notice kind="info">
              Cadastre os departamentos e suas vagas antes de publicar a ficha.
            </Notice>
          )}
          {!data.departmentsReady && (
            <Notice kind="info">
              Os departamentos aguardam a atualização do banco pelo SQL 08.
            </Notice>
          )}
          <Link
            className="text-button"
            to={`/organizacao/${organizationId}/${data.event.status === "DRAFT" ? "eventos" : `inscricoes?evento=${data.event.id}`}`}
          >
            Gerenciar departamentos e vagas
          </Link>
        </section>
        <Field label="Termos da candidatura" required>
          <textarea
            required
            minLength={20}
            maxLength={10000}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
        </Field>
        <Notice kind="info">
          Publicar disponibiliza a página do evento. O envio da ficha só será
          permitido dentro do período de servos. Fichas já preenchidas manterão
          sua versão original.
        </Notice>
        <div className="button-row">
          <button
            className="button primary"
            disabled={
              busy ||
              !data.departmentsReady ||
              !data.departments?.length ||
              data.departments.some((team) => team.capacity == null)
            }
          >
            {busy
              ? "Publicando…"
              : data.form?.publishedAt
                ? "Publicar nova versão"
                : "Publicar ficha de servos"}
          </button>
          <button
            type="button"
            className="button outline"
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? "Fechar prévia" : "Visualizar campos"}
          </button>
        </div>
      </form>
      {preview && (
        <section className="panel">
          <h2>Campos da ficha</h2>
          <p>
            Identificação, nascimento e idade calculada, celular, e-mail
            opcional, foto, camiseta, disponibilidade, saúde, emergência e os
            campos abaixo.
          </p>
          <fieldset disabled className="form-preview">
            <Questions
              questions={config.questions}
              answers={{}}
              onChange={() => {}}
            />
          </fieldset>
        </section>
      )}
    </>
  );
}
