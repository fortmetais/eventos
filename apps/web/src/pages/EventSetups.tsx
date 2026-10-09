import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, ImagePlus, Plus } from "lucide-react";
import { useOrganization } from "./Organization";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useRemote } from "../lib/hooks";
import { api, ApiError } from "../lib/api";
import { date, dateTime, type EventEdition } from "../lib/types";
import { Empty, Field, Loading, Notice, PageHeading } from "../components/ui";
import {
  DepartmentsEditor,
  departmentRows,
  departmentPayload,
} from "../components/DepartmentsEditor";

const blank = {
  typeName: "FAC",
  name: "",
  description: "",
  location: "",
  city: "",
  startsAt: "",
  endsAt: "",
};
type Periods = Record<
  "VOLUNTEER" | "CAMPER",
  { open: string; close: string; capacity: string; waitlist: boolean }
>;
const blankPeriods: Periods = {
  VOLUNTEER: { open: "", close: "", capacity: "", waitlist: false },
  CAMPER: { open: "", close: "", capacity: "", waitlist: false },
};
function localTime(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .replace(" ", "T");
}

export function EventSetups() {
  const auth = useAuth();
  const { organizationId, organization, membership } = useOrganization();
  const state = useRemote<EventEdition[]>(
    `/organizations/${organizationId}/event-setups`,
  );
  const [editor, setEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState(blank);
  const [range, setRange] = useState(false);
  const [periods, setPeriods] = useState(blankPeriods);
  const [departments, setDepartments] = useState(() => departmentRows());
  const [artwork, setArtwork] = useState<File | null>(null);
  const [previousArt, setPreviousArt] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const editable = membership.role === "ORGANIZER";
  useEffect(() => {
    if (!artwork) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(artwork);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [artwork]);
  function begin(event?: EventEdition) {
    setEditorVersion((value) => value + 1);
    setEditingId(event?.id ?? null);
    setValues(
      event
        ? {
            typeName: event.type.name,
            name: event.name,
            description: event.description,
            location: event.location,
            city: event.city,
            startsAt: event.startsAt.slice(0, 10),
            endsAt: event.endsAt.slice(0, 10),
          }
        : { ...blank, city: organization.city },
    );
    setRange(Boolean(event && event.startsAt !== event.endsAt));
    const next = structuredClone(blankPeriods);
    for (const c of event?.campaigns ?? [])
      next[c.kind] = {
        open: localTime(c.opensAt),
        close: localTime(c.closesAt),
        capacity: c.capacity ? String(c.capacity) : "",
        waitlist: c.allowWaitlist,
      };
    setPeriods(next);
    setDepartments(departmentRows(event?.teams));
    setArtwork(null);
    setPreviousArt(event?.imageUrl ?? null);
    setError("");
    setSuccess("");
    setEditor(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const data = {
        event: { ...values, endsAt: range ? values.endsAt : values.startsAt },
        departments: departmentPayload(departments),
        campaigns: (["VOLUNTEER", "CAMPER"] as const).map((kind) => ({
          kind,
          opensAt: `${periods[kind].open}:00-03:00`,
          closesAt: `${periods[kind].close}:00-03:00`,
          capacity: periods[kind].capacity
            ? Number(periods[kind].capacity)
            : null,
          allowWaitlist: periods[kind].waitlist,
        })),
      };
      for (const c of data.campaigns)
        if (Date.parse(c.closesAt) <= Date.parse(c.opensAt))
          throw new Error(
            `O encerramento das inscrições de ${c.kind === "CAMPER" ? "campistas" : "servos"} deve ser posterior à abertura.`,
          );
      if (data.event.endsAt < data.event.startsAt)
        throw new Error(
          "O término do evento deve ser igual ou posterior ao início.",
        );
      const body = new FormData();
      body.append("data", JSON.stringify(data));
      if (artwork) body.append("artwork", artwork);
      await api(
        `/organizations/${organizationId}/event-setups${editingId ? `/${editingId}` : ""}`,
        {
          method: editingId ? "PUT" : "POST",
          body,
        },
      );
      setEditor(false);
      setArtwork(null);
      setSuccess(
        "Evento salvo em preparação, com departamentos, vagas e períodos de inscrição.",
      );
      state.refresh();
    } catch (error) {
      const details =
        error instanceof ApiError
          ? Object.values(error.fields?.fieldErrors ?? {})
              .flat()
              .join(" ")
          : "";
      setError(details || (error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Eventos"
        action={
          editable && !state.loading && !state.error ? (
            <button className="button primary" onClick={() => begin()}>
              <Plus size={17} /> Novo evento
            </button>
          ) : undefined
        }
      >
        Prepare o evento, os departamentos e vagas, os períodos de inscrição e a
        arte de divulgação.
      </PageHeading>
      {success && <Notice kind="success">{success}</Notice>}
      {error && <Notice>{error}</Notice>}
      {editor && (
        <form
          className="panel event-setup-form"
          key={editorVersion}
          onSubmit={save}
        >
          <h2>{editingId ? "Editar evento" : "Novo evento"}</h2>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <Field label="Nome do evento" required>
                <input
                  required
                  minLength={3}
                  maxLength={150}
                  value={values.name}
                  onChange={(e) =>
                    setValues({ ...values, name: e.target.value })
                  }
                  placeholder="Ex.: FAC 2027"
                />
              </Field>
              <Field label="Tipo de evento" required>
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={values.typeName}
                  onChange={(e) =>
                    setValues({ ...values, typeName: e.target.value })
                  }
                />
              </Field>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={range}
                onChange={(e) => setRange(e.target.checked)}
              />
              O evento dura mais de um dia
            </label>
            <div className="form-grid">
              <Field
                label={range ? "Data de início" : "Data do evento"}
                required
              >
                <input
                  type="date"
                  required
                  value={values.startsAt}
                  onChange={(e) =>
                    setValues({ ...values, startsAt: e.target.value })
                  }
                />
              </Field>
              {range && (
                <Field label="Data de término" required>
                  <input
                    type="date"
                    required
                    min={values.startsAt}
                    value={values.endsAt}
                    onChange={(e) =>
                      setValues({ ...values, endsAt: e.target.value })
                    }
                  />
                </Field>
              )}
              <Field label="Local do evento" required>
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  value={values.location}
                  onChange={(e) =>
                    setValues({ ...values, location: e.target.value })
                  }
                />
              </Field>
              <Field label="Cidade" required>
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={values.city}
                  onChange={(e) =>
                    setValues({ ...values, city: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Descrição" required>
              <textarea
                required
                minLength={10}
                maxLength={5000}
                value={values.description}
                onChange={(e) =>
                  setValues({ ...values, description: e.target.value })
                }
              />
            </Field>
            <h3>Períodos de inscrição</h3>
            <p>
              Horários de Brasília (America/Sao_Paulo). Os períodos são
              independentes e podem se sobrepor.
            </p>
            <div className="registration-periods">
              {(["VOLUNTEER", "CAMPER"] as const).map((kind) => {
                const label = kind === "VOLUNTEER" ? "Servos" : "Campistas";
                const value = periods[kind];
                const change = (changes: Partial<typeof value>) =>
                  setPeriods({ ...periods, [kind]: { ...value, ...changes } });
                return (
                  <section className="period-panel" key={kind}>
                    <h4>{label}</h4>
                    <Field label={`Abertura — ${label.toLowerCase()}`} required>
                      <input
                        type="datetime-local"
                        required
                        value={value.open}
                        onChange={(e) => change({ open: e.target.value })}
                      />
                    </Field>
                    <Field
                      label={`Encerramento — ${label.toLowerCase()}`}
                      required
                    >
                      <input
                        type="datetime-local"
                        required
                        min={value.open}
                        value={value.close}
                        onChange={(e) => change({ close: e.target.value })}
                      />
                    </Field>
                    {kind === "CAMPER" && (
                      <>
                        <Field label="Vagas de campistas (opcional nesta etapa)">
                          <input
                            type="number"
                            min={1}
                            max={100000}
                            step={1}
                            value={value.capacity}
                            onChange={(e) =>
                              change({ capacity: e.target.value })
                            }
                          />
                        </Field>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={value.waitlist}
                            onChange={(e) =>
                              change({ waitlist: e.target.checked })
                            }
                          />{" "}
                          Permitir lista de espera
                        </label>
                      </>
                    )}
                  </section>
                );
              })}
            </div>
            <DepartmentsEditor rows={departments} onChange={setDepartments} />
            <h3>Arte do evento</h3>
            <div className="artwork-editor">
              <div className="artwork-preview">
                {preview || previousArt ? (
                  <img
                    src={preview ?? previousArt!}
                    alt="Prévia da arte do evento"
                  />
                ) : (
                  <span>
                    <ImagePlus size={32} /> Arte vertical
                    <br />
                    9:16
                  </span>
                )}
              </div>
              <div>
                <Field
                  label={
                    previousArt
                      ? "Substituir a arte"
                      : "Selecionar arte (opcional)"
                  }
                  hint="JPEG, PNG ou WebP até 10 MB. Recomendado: 1080 × 1920 pixels (9:16 vertical)."
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    key={`${editingId ?? "new"}-${editor}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setError("");
                      if (
                        file &&
                        (!["image/jpeg", "image/png", "image/webp"].includes(
                          file.type,
                        ) ||
                          file.size > 10 * 1024 * 1024)
                      ) {
                        setError(
                          "Escolha uma arte JPEG, PNG ou WebP com até 10 MB.",
                        );
                        setArtwork(null);
                        e.target.value = "";
                        return;
                      }
                      setArtwork(file ?? null);
                    }}
                  />
                </Field>
                <p>
                  A imagem será otimizada sem recortar textos ou outros
                  elementos. A arte é destinada à divulgação pública.
                </p>
              </div>
            </div>
            <p>
              Ao salvar, o evento fica em preparação. A publicação será liberada
              após a configuração das fichas.
            </p>
            <div className="button-row">
              <button className="button primary" disabled={busy}>
                {busy ? "Salvando evento…" : "Salvar evento"}
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => {
                  setEditor(false);
                  setArtwork(null);
                  setError("");
                }}
              >
                Cancelar edição
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {state.loading ? (
        <Loading />
      ) : state.error ? (
        <>
          <Notice>{state.error}</Notice>
          <button className="button outline" onClick={state.refresh}>
            Atualizar eventos
          </button>
        </>
      ) : state.data?.length ? (
        state.data.map((event) => (
          <section className="panel event-preparation-card" key={event.id}>
            {event.imageUrl && (
              <img
                className="event-artwork-thumbnail"
                src={event.imageUrl}
                alt={`Arte de ${event.name}`}
              />
            )}
            <div className="event-preparation-info">
              <span className="eyebrow">
                {event.type.name} ·{" "}
                {event.status === "DRAFT"
                  ? "Em preparação"
                  : {
                      PUBLISHED: "Publicado",
                      CANCELLED: "Cancelado",
                      COMPLETED: "Realizado",
                    }[event.status]}
              </span>
              <h2>{event.name}</h2>
              <p>
                <CalendarDays size={15} /> {date(event.startsAt)}
                {event.startsAt !== event.endsAt
                  ? ` até ${date(event.endsAt)}`
                  : ""}{" "}
                · {event.city}
              </p>
              <p>{event.location}</p>
              {event.teams?.length > 0 && (
                <p className="department-summary">
                  {event.teams
                    .map(
                      (team) =>
                        `${team.name}: ${team.capacity == null ? "vagas a definir" : `${team.capacity} vagas`}`,
                    )
                    .join(" · ")}
                </p>
              )}
              {event.departmentsReady === false && (
                <Notice kind="info">
                  O cadastro de departamentos aguarda a atualização do banco
                  pelo SQL 08.
                </Notice>
              )}
              {event.campaigns.map((c) => (
                <div className="period-summary" key={c.id}>
                  <strong>
                    {c.kind === "VOLUNTEER" ? "Servos" : "Campistas"}
                  </strong>
                  <span>
                    {dateTime(c.opensAt)} até {dateTime(c.closesAt)}
                  </span>
                </div>
              ))}
              {editable && event.status === "DRAFT" && (
                <button className="button outline" onClick={() => begin(event)}>
                  Editar evento
                </button>
              )}
              {editable &&
                auth.volunteerRegistrationsEnabled &&
                ["DRAFT", "PUBLISHED"].includes(event.status) && (
                  <Link
                    className="button outline"
                    to={`/organizacao/${organizationId}/eventos/${event.id}/ficha-servos`}
                  >
                    Ficha de servos
                  </Link>
                )}
            </div>
          </section>
        ))
      ) : (
        <Empty title="Prepare seu primeiro evento">
          Cadastre o encontro e defina quando servos e campistas poderão se
          inscrever.
        </Empty>
      )}
    </>
  );
}
