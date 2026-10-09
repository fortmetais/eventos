import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Plus, Eye, ClipboardList } from "lucide-react";
import { useOrganization } from "./Organization";
import { useRemote } from "../lib/hooks";
import { api } from "../lib/api";
import type {
  Campaign,
  EventEdition,
  FormConfig,
  Question,
} from "../lib/types";
import { date, dateTime } from "../lib/types";
import { Empty, Field, Loading, Notice, PageHeading } from "../components/ui";
import { Questions } from "../components/Questions";
import { useAuth } from "../lib/auth";
import { EventSetups } from "./EventSetups";
import {
  DepartmentsEditor,
  departmentRows,
  departmentPayload,
} from "../components/DepartmentsEditor";
const defaultTerms =
  "Declaro que as informações prestadas são verdadeiras e autorizo seu uso pela organização para analisar a inscrição, identificar participantes e organizar os cuidados necessários durante este evento. A participação depende da aprovação da organização. O uso de imagem é opcional e deve seguir as orientações informadas pela organização.";
const blankEvent = {
  typeName: "FAC",
  name: "",
  description: "",
  imageUrl: "",
  location: "",
  city: "",
  startsAt: "",
  endsAt: "",
};
export function ManageEvents() {
  const auth = useAuth();
  const { organizationId } = useOrganization();
  if (!auth.eventsEnabled) return <EventSetups key={organizationId} />;
  return <FullManageEvents />;
}
function FullManageEvents() {
  const { organizationId, membership } = useOrganization();
  const state = useRemote<EventEdition[]>(
    `/organizations/${organizationId}/events`,
  );
  const [editor, setEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState(blankEvent);
  const [departments, setDepartments] = useState(() => departmentRows());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const editable = membership.role === "ORGANIZER";
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/organizations/${organizationId}/events${editingId ? `/${editingId}` : ""}`,
        {
          method: editingId ? "PUT" : "POST",
          body: {
            ...values,
            imageUrl: values.imageUrl || null,
            ...(!editingId
              ? { departments: departmentPayload(departments) }
              : {}),
          },
        },
      );
      setEditor(false);
      setEditingId(null);
      setValues(blankEvent);
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function status(eventId: string, status: EventEdition["status"]) {
    setError("");
    setBusy(true);
    try {
      await api(`/organizations/${organizationId}/events/${eventId}/status`, {
        method: "PATCH",
        body: { status },
      });
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(event: EventEdition) {
    setEditingId(event.id);
    setValues({
      typeName: event.type.name,
      name: event.name,
      description: event.description,
      imageUrl: event.imageUrl ?? "",
      location: event.location,
      city: event.city,
      startsAt: event.startsAt.slice(0, 10),
      endsAt: event.endsAt.slice(0, 10),
    });
    setEditor(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <>
      <PageHeading
        title="Eventos e fichas"
        action={
          editable ? (
            <button
              className="button primary"
              onClick={() => {
                setEditingId(null);
                setValues(blankEvent);
                setDepartments(departmentRows());
                setEditor((v) => !v);
              }}
            >
              <Plus size={17} />
              Nova edição
            </button>
          ) : undefined
        }
      >
        Uma edição reúne campanhas com períodos e fichas independentes.
      </PageHeading>
      {error && <Notice>{error}</Notice>}
      {editor && (
        <form className="panel" onSubmit={save}>
          <h2>{editingId ? "Editar edição" : "Nova edição"}</h2>
          <div className="form-grid">
            <Field label="Tipo de evento" required>
              <input
                required
                value={values.typeName}
                onChange={(e) =>
                  setValues((v) => ({ ...v, typeName: e.target.value }))
                }
              />
            </Field>
            <Field label="Nome da edição" required>
              <input
                required
                value={values.name}
                onChange={(e) =>
                  setValues((v) => ({ ...v, name: e.target.value }))
                }
              />
            </Field>
            <Field label="Data inicial" required>
              <input
                type="date"
                required
                value={values.startsAt}
                onChange={(e) =>
                  setValues((v) => ({ ...v, startsAt: e.target.value }))
                }
              />
            </Field>
            <Field label="Data final" required>
              <input
                type="date"
                required
                value={values.endsAt}
                onChange={(e) =>
                  setValues((v) => ({ ...v, endsAt: e.target.value }))
                }
              />
            </Field>
            <Field label="Local" required>
              <input
                required
                value={values.location}
                onChange={(e) =>
                  setValues((v) => ({ ...v, location: e.target.value }))
                }
              />
            </Field>
            <Field label="Cidade" required>
              <input
                required
                value={values.city}
                onChange={(e) =>
                  setValues((v) => ({ ...v, city: e.target.value }))
                }
              />
            </Field>
          </div>
          <Field label="Descrição" required>
            <textarea
              minLength={10}
              required
              value={values.description}
              onChange={(e) =>
                setValues((v) => ({ ...v, description: e.target.value }))
              }
            />
          </Field>
          <Field label="URL HTTPS da imagem (opcional)">
            <input
              type="url"
              value={values.imageUrl}
              onChange={(e) =>
                setValues((v) => ({ ...v, imageUrl: e.target.value }))
              }
            />
          </Field>
          {!editingId && (
            <DepartmentsEditor rows={departments} onChange={setDepartments} />
          )}
          <div className="button-row">
            <button className="button primary" disabled={busy}>
              Salvar edição
            </button>
            <button
              type="button"
              className="button outline"
              onClick={() => setEditor(false)}
            >
              Fechar
            </button>
          </div>
        </form>
      )}
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <Notice>{state.error}</Notice>
      ) : state.data?.length ? (
        state.data.map((event) => (
          <section className="panel event-management" key={event.id}>
            <div className="list-row">
              <div>
                <span className="eyebrow">
                  {event.type.name} ·{" "}
                  {
                    {
                      DRAFT: "Rascunho",
                      PUBLISHED: "Publicado",
                      CANCELLED: "Cancelado",
                      COMPLETED: "Realizado",
                    }[event.status]
                  }
                </span>
                <h2>{event.name}</h2>
                <p>
                  <CalendarDays size={15} /> {date(event.startsAt)} até{" "}
                  {date(event.endsAt)} · {event.city}
                </p>
              </div>
              {editable && (
                <button
                  className="button outline"
                  onClick={() =>
                    setExpanded((v) => (v === event.id ? null : event.id))
                  }
                >
                  Configurar <ClipboardList size={16} />
                </button>
              )}
            </div>
            <div className="campaign-chips">
              {event.campaigns.map((c) => (
                <span className="badge neutral" key={c.id}>
                  {c.kind === "CAMPER" ? "Campistas" : "Servos"} ·{" "}
                  {c._count?.registrations ?? 0} inscritos ·{" "}
                  {c.paused
                    ? "Pausada"
                    : c.forms?.some((f) => f.publishedAt)
                      ? "Ficha publicada"
                      : "Sem ficha publicada"}
                </span>
              ))}
            </div>
            {editable && (
              <div className="button-row">
                <button className="text-button" onClick={() => edit(event)}>
                  Editar informações
                </button>
                {event.status === "DRAFT" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void status(event.id, "PUBLISHED")}
                  >
                    Publicar evento
                  </button>
                )}
                {event.status === "PUBLISHED" && (
                  <>
                    <Link className="text-button" to={`/eventos/${event.id}`}>
                      <Eye size={15} />
                      Ver página pública
                    </Link>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void status(event.id, "COMPLETED")}
                    >
                      Marcar como realizado
                    </button>
                  </>
                )}
                {["DRAFT", "PUBLISHED"].includes(event.status) && (
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => void status(event.id, "CANCELLED")}
                  >
                    Cancelar evento
                  </button>
                )}
              </div>
            )}
            {expanded === event.id && (
              <CampaignEditor
                event={event}
                organizationId={organizationId}
                onSaved={state.refresh}
              />
            )}
          </section>
        ))
      ) : (
        <Empty title="Sua primeira edição">
          Cadastre um evento para configurar as campanhas e fichas.
        </Empty>
      )}
    </>
  );
}
function localDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
  return parts.replace(" ", "T");
}
function CampaignEditor({
  event,
  organizationId,
  onSaved,
}: {
  event: EventEdition;
  organizationId: string;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"CAMPER" | "VOLUNTEER">("CAMPER");
  const existing = event.campaigns.find((c) => c.kind === kind);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState("");
  const [close, setClose] = useState("");
  const [capacity, setCapacity] = useState("");
  const [waitlist, setWaitlist] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function begin(c?: Campaign) {
    setOpen(c ? localDateTime(c.opensAt) : "");
    setClose(c ? localDateTime(c.closesAt) : "");
    setCapacity(c?.capacity ? String(c.capacity) : "");
    setWaitlist(c?.allowWaitlist ?? false);
    setPaused(c?.paused ?? false);
    setEditing(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/organizations/${organizationId}/events/${event.id}/campaigns`,
        {
          method: "PUT",
          body: {
            kind,
            opensAt: new Date(`${open}:00-03:00`).toISOString(),
            closesAt: new Date(`${close}:00-03:00`).toISOString(),
            capacity: capacity ? Number(capacity) : null,
            allowWaitlist: waitlist,
            paused,
          },
        },
      );
      setEditing(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="campaign-editor">
      <div className="tabs">
        <button
          className={kind === "CAMPER" ? "active" : ""}
          onClick={() => {
            setKind("CAMPER");
            setEditing(false);
          }}
        >
          Campistas
        </button>
        <button
          className={kind === "VOLUNTEER" ? "active" : ""}
          onClick={() => {
            setKind("VOLUNTEER");
            setEditing(false);
          }}
        >
          Servos / equipe
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      {editing ? (
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label="Abertura (horário de Brasília)" required>
              <input
                type="datetime-local"
                required
                value={open}
                onChange={(e) => setOpen(e.target.value)}
              />
            </Field>
            <Field label="Encerramento (horário de Brasília)" required>
              <input
                type="datetime-local"
                required
                value={close}
                onChange={(e) => setClose(e.target.value)}
              />
            </Field>
            <Field
              label={
                kind === "CAMPER"
                  ? "Vagas de campistas"
                  : "Limite de servos (opcional)"
              }
              required={kind === "CAMPER"}
            >
              <input
                type="number"
                min={1}
                required={kind === "CAMPER"}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Field>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={waitlist}
              onChange={(e) => setWaitlist(e.target.checked)}
            />
            Permitir lista de espera
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={paused}
              onChange={(e) => setPaused(e.target.checked)}
            />
            Pausar inscrições
          </label>
          <div className="button-row">
            <button className="button primary" disabled={busy}>
              Salvar campanha
            </button>
            <button
              type="button"
              className="button outline"
              onClick={() => setEditing(false)}
            >
              Fechar
            </button>
          </div>
        </form>
      ) : existing ? (
        <>
          <p>
            {dateTime(existing.opensAt)} até {dateTime(existing.closesAt)} ·{" "}
            {existing.capacity ?? "Sem limite"} vagas
          </p>
          <div className="button-row">
            <button className="button outline" onClick={() => begin(existing)}>
              Editar período e vagas
            </button>
            <Link className="text-button" to={`/inscricao/${existing.id}`}>
              Abrir link de inscrição ↗
            </Link>
          </div>
          <FormBuilder
            campaign={existing}
            organizationId={organizationId}
            onSaved={onSaved}
          />
        </>
      ) : (
        <>
          <p className="muted">
            Esta edição ainda não possui campanha de{" "}
            {kind === "CAMPER" ? "campistas" : "servos"}.
          </p>
          <button className="button primary" onClick={() => begin()}>
            Configurar campanha
          </button>
        </>
      )}
    </div>
  );
}
function FormBuilder({
  campaign,
  organizationId,
  onSaved,
}: {
  campaign: Campaign;
  organizationId: string;
  onSaved: () => void;
}) {
  const [editor, setEditor] = useState(false);
  const [preview, setPreview] = useState(false);
  const [values, setValues] = useState<FormConfig>({
    askCpf: false,
    askAddress: false,
    askShirt: true,
    questions: [],
    terms: defaultTerms,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [publish, setPublish] = useState(true);
  const latest = campaign.forms?.[0];
  function begin() {
    setValues(
      latest
        ? structuredClone(latest.config)
        : {
            askCpf: false,
            askAddress: false,
            askShirt: true,
            questions: [],
            terms: defaultTerms,
          },
    );
    setEditor(true);
  }
  function question(index: number, patch: Partial<Question>) {
    setValues((v) => ({
      ...v,
      questions: v.questions.map((q, i) =>
        i === index ? { ...q, ...patch } : q,
      ),
    }));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api<{ id: string }>(
        `/organizations/${organizationId}/campaigns/${campaign.id}/forms`,
        { method: "POST", body: values },
      );
      if (publish)
        await api(
          `/organizations/${organizationId}/campaigns/${campaign.id}/forms/${created.id}/publish`,
          { method: "POST" },
        );
      setEditor(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publishExisting() {
    setBusy(true);
    try {
      await api(
        `/organizations/${organizationId}/campaigns/${campaign.id}/forms/${latest!.id}/publish`,
        { method: "POST" },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-builder">
      <hr />
      <div className="list-row">
        <div>
          <h3>Ficha de inscrição</h3>
          <p>
            {latest
              ? `Versão ${latest.version} · ${latest.publishedAt ? "Publicada" : "Rascunho"}`
              : "Nenhuma versão criada"}
          </p>
        </div>
        <button className="button outline" onClick={begin}>
          {latest ? "Criar nova versão" : "Configurar ficha"}
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      {latest && !latest.publishedAt && !editor && (
        <button
          className="button primary"
          onClick={() => void publishExisting()}
          disabled={busy}
        >
          Publicar esta versão
        </button>
      )}
      {editor && (
        <form onSubmit={save}>
          <p className="muted">
            Identificação, foto, emergência e responsável legal fazem parte da
            base. Novas versões preservam as respostas antigas.
          </p>
          <div className="check-options">
            {(
              [
                ["askCpf", "Solicitar CPF (opcional)"],
                ["askAddress", "Solicitar endereço (opcional)"],
                ["askShirt", "Perguntar tamanho da camiseta"],
              ] as const
            ).map(([key, label]) => (
              <label className="checkbox" key={key}>
                <input
                  type="checkbox"
                  checked={values[key]}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [key]: e.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <h4>Perguntas adicionais</h4>
          <p className="muted">
            Use esta seção para perguntas do evento. Informações médicas devem
            ficar no bloco de saúde.
          </p>
          {values.questions.map((q, i) => (
            <div className="question-editor" key={q.id}>
              <Field label={`Pergunta ${i + 1}`} required>
                <input
                  required
                  minLength={3}
                  value={q.label}
                  onChange={(e) => question(i, { label: e.target.value })}
                />
              </Field>
              <div className="form-grid">
                <Field label="Tipo">
                  <select
                    value={q.type}
                    onChange={(e) =>
                      question(i, { type: e.target.value as Question["type"] })
                    }
                  >
                    {Object.entries({
                      text: "Texto",
                      number: "Número",
                      date: "Data",
                      boolean: "Sim / Não",
                      single: "Escolha única",
                      multiple: "Múltipla escolha",
                    }).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) =>
                      question(i, { required: e.target.checked })
                    }
                  />
                  Obrigatória
                </label>
              </div>
              {["single", "multiple"].includes(q.type) && (
                <Field label="Opções (uma por linha)">
                  <textarea
                    value={q.options.join("\n")}
                    onChange={(e) =>
                      question(i, { options: e.target.value.split("\n") })
                    }
                  />
                </Field>
              )}
              <div className="button-row">
                <button
                  type="button"
                  className="text-button"
                  disabled={i === 0}
                  onClick={() =>
                    setValues((v) => {
                      const questions = [...v.questions];
                      [questions[i - 1], questions[i]] = [
                        questions[i],
                        questions[i - 1],
                      ];
                      return { ...v, questions };
                    })
                  }
                >
                  Mover para cima
                </button>
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() =>
                    setValues((v) => ({
                      ...v,
                      questions: v.questions.filter((_, j) => j !== i),
                    }))
                  }
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="button outline"
            disabled={values.questions.length >= 30}
            onClick={() =>
              setValues((v) => ({
                ...v,
                questions: [
                  ...v.questions,
                  {
                    id: `q_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
                    label: "",
                    type: "text",
                    required: false,
                    options: [],
                  },
                ],
              }))
            }
          >
            <Plus size={16} />
            Adicionar pergunta
          </button>
          <Field
            label="Termos da campanha"
            required
            hint="Revise o texto com os responsáveis da organização antes de publicar."
          >
            <textarea
              required
              minLength={20}
              rows={5}
              value={values.terms}
              onChange={(e) =>
                setValues((v) => ({ ...v, terms: e.target.value }))
              }
            />
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            Publicar esta versão ao salvar
          </label>
          <div className="button-row">
            <button className="button primary" disabled={busy}>
              Salvar nova versão
            </button>
            <button
              type="button"
              className="button outline"
              onClick={() => setPreview((v) => !v)}
            >
              <Eye size={16} />
              Prévia
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setEditor(false)}
            >
              Fechar
            </button>
          </div>
          {preview && (
            <fieldset className="form-preview">
              <legend>Prévia das perguntas adicionais</legend>
              <Questions
                questions={values.questions}
                answers={{}}
                onChange={() => {}}
              />
            </fieldset>
          )}
        </form>
      )}
    </div>
  );
}
