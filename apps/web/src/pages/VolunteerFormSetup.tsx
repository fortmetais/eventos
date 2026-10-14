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
import { FormLayoutEditor } from "../components/FormLayoutEditor";
import { FormLayoutPreview } from "../components/RegistrationFields";
import { editableLayout } from "@fac/form-layout";
import { RegistrationBanner } from "../components/RegistrationBanner";
import {
  FormBannerEditor,
  formBannerBody,
  useBannerPreview,
} from "../components/FormBannerEditor";

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
  return <EventRegistrationSetup kind="VOLUNTEER" />;
}
export function CamperFormSetup() {
  return <EventRegistrationSetup kind="CAMPER" />;
}
function EventRegistrationSetup({ kind }: { kind: "VOLUNTEER" | "CAMPER" }) {
  const { eventId } = useParams();
  const { organizationId, membership } = useOrganization();
  const path = `/organizations/${organizationId}/events/${eventId}/${kind === "CAMPER" ? "camper" : "volunteer"}-form`;
  const state = useRemote<Setup>(membership.role === "ORGANIZER" ? path : null);
  if (membership.role !== "ORGANIZER")
    return (
      <Notice>Somente organizadores podem preparar e publicar a ficha.</Notice>
    );
  return (
    <>
      <PageHeading
        title={
          kind === "CAMPER"
            ? "Ficha de inscrição para campistas"
            : "Ficha de intenção para servos"
        }
      >
        {kind === "CAMPER"
          ? "Prepare as informações, os cuidados e as orientações para quem deseja participar do evento."
          : "Prepare as informações que ajudarão a organização a avaliar cada candidatura."}
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
            key={`${kind}:${state.data.form?.id ?? eventId}`}
            kind={kind}
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
  kind,
}: {
  data: Setup;
  path: string;
  organizationId: string;
  refresh: () => void;
  kind: "VOLUNTEER" | "CAMPER";
}) {
  const camper = kind === "CAMPER";
  const audience = camper ? "campistas" : "servos";
  const initial = (
    camper ? data.form?.config.camper : data.form?.config.volunteer
  )
    ? data.form!.config
    : data.template;
  const [fieldsConfig, setFieldsConfig] = useState<FormConfig>(() => ({
    ...initial,
    layout: editableLayout(initial, kind),
  }));
  const [description, setDescription] = useState(
    (camper ? initial.camper!.description : initial.volunteer!.description) ??
      "",
  );
  const [requirements, setRequirements] = useState(
    camper ? initial.camper!.requirements : initial.volunteer!.requirements,
  );
  const [training, setTraining] = useState(
    camper ? initial.camper!.arrivalInstructions : initial.volunteer!.training,
  );
  const [capacity, setCapacity] = useState(
    String(data.campaign.capacity ?? ""),
  );
  const [allowWaitlist, setAllowWaitlist] = useState(
    data.campaign.allowWaitlist,
  );
  const [terms, setTerms] = useState(initial.terms);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const bannerPreview = useBannerPreview(bannerFile, fieldsConfig.banner?.url);
  const config: FormConfig = {
    ...fieldsConfig,
    terms,
    ...(camper
      ? {
          camper: {
            template: "CAMPER_REGISTRATION_V1" as const,
            description,
            requirements,
            arrivalInstructions: training,
          },
        }
      : {
          volunteer: {
            template: "VOLUNTEER_INTENTION_V1",
            description,
            requirements,
            training,
          },
        }),
    questions: fieldsConfig.questions.map((q) =>
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
      if (camper)
        await api(
          `/organizations/${organizationId}/events/${data.event.id}/campaigns`,
          {
            method: "PUT",
            body: {
              kind,
              opensAt: data.campaign.opensAt,
              closesAt: data.campaign.closesAt,
              paused: data.campaign.paused,
              capacity: Number(capacity),
              allowWaitlist,
            },
          },
        );
      if (!camper) {
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
      }
      await api(path, {
        method: "POST",
        body: formBannerBody(config, bannerFile),
      });
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
            kind,
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
          Inscrições de {audience}: {dateTime(data.campaign.opensAt)} até{" "}
          {dateTime(data.campaign.closesAt)} (Brasília).
        </p>
        {data.form?.publishedAt && (
          <>
            <Notice kind="success">
              Ficha publicada — versão {data.form.version}. Inscrições iniciadas
              agora usam essa versão. Rascunhos anteriores e inscrições enviadas
              mantêm a versão original.
            </Notice>
            <Field label={`Link da ficha de ${audience}`}>
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
                {camper ? "Avaliar inscrições" : "Avaliar candidaturas"}
              </Link>
              <button
                className="button outline"
                disabled={busy}
                onClick={() => void pause()}
              >
                {data.campaign.paused
                  ? `Retomar inscrições de ${audience}`
                  : `Pausar inscrições de ${audience}`}
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
          {camper
            ? "A ficha completa reúne identificação, comunidade, chegada, saúde, emergência e autorização para menores. Você pode organizar e ocultar os campos permitidos."
            : "A idade é calculada pela data de nascimento. O candidato pode sugerir até três departamentos para servir."}
        </p>
        {error && <Notice>{error}</Notice>}
        <FormBannerEditor
          previewUrl={bannerPreview}
          onFile={setBannerFile}
          onRemove={() =>
            setFieldsConfig((current) => ({ ...current, banner: null }))
          }
          disabled={busy}
        />
        <Field
          label="Descrição"
          hint={
            camper
              ? "Apresente o encontro e a experiência proposta aos campistas."
              : "Apresente o evento e a proposta de servir à equipe."
          }
        >
          <textarea
            id="volunteer-description"
            name="description"
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field
          label={
            camper
              ? "Regras e requisitos para participar"
              : "Regras e requisitos para servir"
          }
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
          label={
            camper
              ? "Orientações de chegada e participação"
              : "Preparação e formações da equipe"
          }
          required
          hint={
            camper
              ? "Informe horários de chegada, transporte, o que levar e orientações para o encontro."
              : "Informe encontros, datas, horários e condições de participação deste evento."
          }
        >
          <textarea
            required
            minLength={10}
            maxLength={5000}
            value={training}
            onChange={(e) => setTraining(e.target.value)}
          />
        </Field>
        {!camper && (
          <section aria-label="Departamentos da ficha">
            <h3>Departamentos para preferência</h3>
            <p>
              As opções vêm dos departamentos cadastrados neste evento. A
              escolha do candidato não reserva vaga.
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
                Cadastre os departamentos e suas vagas antes de publicar a
                ficha.
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
        )}
        {camper && (
          <section aria-label="Vagas de campistas">
            <Field label="Quantidade de vagas de campistas" required>
              <input
                type="number"
                required
                min={1}
                max={100000}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={allowWaitlist}
                onChange={(e) => setAllowWaitlist(e.target.checked)}
              />
              Permitir lista de espera quando as vagas forem preenchidas.
            </label>
          </section>
        )}
        <Field
          label={camper ? "Termos da inscrição" : "Termos da candidatura"}
          required
        >
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
          permitido dentro do período de {audience}. Fichas já preenchidas
          manterão sua versão original.
        </Notice>
        <FormLayoutEditor
          form={config}
          kind={kind}
          onChange={setFieldsConfig}
          disabled={busy}
        />
        <div className="button-row">
          <button
            className="button primary"
            disabled={
              busy ||
              (!camper &&
                (!data.departmentsReady ||
                  !data.departments?.length ||
                  data.departments.some((team) => team.capacity == null)))
            }
          >
            {busy
              ? "Publicando…"
              : data.form?.publishedAt
                ? "Publicar nova versão"
                : `Publicar ficha de ${audience}`}
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
          <RegistrationBanner
            banner={config.banner}
            previewUrl={bannerPreview}
            eventName={data.event.name}
          />
          {description.trim() && (
            <>
              <h3>Descrição</h3>
              <p className="description">{description}</p>
            </>
          )}
          <h3>{camper ? "Regras para participar" : "Regras para servir"}</h3>
          <p className="description">{requirements}</p>
          <h3>
            {camper
              ? "Orientações de chegada e participação"
              : "Preparação da equipe"}
          </h3>
          <p className="description">{training}</p>
          <FormLayoutPreview
            form={config}
            kind={kind}
            bannerPreview={bannerPreview}
            showBanner={false}
          />
        </section>
      )}
    </>
  );
}
