import { useUnsavedChanges } from "../lib/unsaved-changes";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Plus, Eye, ClipboardList } from "lucide-react";
import { useOrganization } from "./Organization";
import { useRemote } from "../lib/hooks";
import { api } from "../lib/api";
import type { EventEdition } from "../lib/types";
import { date } from "../lib/types";
import { Empty, Field, Loading, Notice, PageHeading } from "../components/ui";

import { useAuth } from "../lib/auth";
import { EventSetups } from "./EventSetups";
import { EventPresentationEditor } from "../components/EventPresentationEditor";
import { normalizeEventSlug, publicEventPath } from "../lib/event-presentation";
import {
  DepartmentsEditor,
  departmentRows,
  departmentPayload,
} from "../components/DepartmentsEditor";
import { CampaignEditor } from "../components/CampaignEditor";

const blankEvent = {
  typeName: "FAC",
  name: "",
  description: "",
  imageUrl: "",
  slug: "",
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
  const [desktop, setDesktop] = useState<File | null>(null);
  const [mobile, setMobile] = useState<File | null>(null);
  const [mobileUrl, setMobileUrl] = useState<string | null>(null);
  const [removeMobile, setRemoveMobile] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  function resetImages(url?: string | null) {
    setDesktop(null);
    setMobile(null);
    setMobileUrl(url ?? null);
    setRemoveMobile(false);
    setEditorVersion((v) => v + 1);
  }
  const [departments, setDepartments] = useState(() => departmentRows());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const editable = membership.role === "ORGANIZER";
  const initialDraft = useRef<string | null>(null);
  const currentDraft = JSON.stringify({ values, departments, removeMobile });
  useEffect(() => {
    initialDraft.current = editor ? currentDraft : null;
  }, [editor, editorVersion]);
  const { run: discardDraft } = useUnsavedChanges(
    editor &&
      initialDraft.current !== null &&
      (initialDraft.current !== currentDraft || Boolean(desktop || mobile)),
    { busy },
  );
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = {
        ...values,
        slug: normalizeEventSlug(values.slug) || null,
        imageUrl: values.imageUrl || null,
        removeMobileArtwork: removeMobile,
        ...(!editingId ? { departments: departmentPayload(departments) } : {}),
      };
      let body: typeof data | FormData = data;
      if (desktop || mobile) {
        const files = new FormData();
        files.append("data", JSON.stringify(data));
        if (desktop) files.append("artwork", desktop);
        if (mobile) files.append("mobileArtwork", mobile);
        body = files;
      }
      await api(
        `/organizations/${organizationId}/events${editingId ? `/${editingId}` : ""}`,
        {
          method: editingId ? "PUT" : "POST",
          body,
        },
      );
      setEditor(false);
      setEditingId(null);
      setValues(blankEvent);
      resetImages();
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
      slug: event.slug ?? "",
      location: event.location,
      city: event.city,
      startsAt: event.startsAt.slice(0, 10),
      endsAt: event.endsAt.slice(0, 10),
    });
    resetImages(event.mobileImageUrl);
    setEditor(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <>
      <PageHeading
        title="Eventos e fichas"
        action={
          editable && !editor ? (
            <button
              className="button primary"
              onClick={() => {
                setEditingId(null);
                setValues(blankEvent);
                resetImages();
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
          <EventPresentationEditor
            key={editorVersion}
            eventId={editingId}
            slug={values.slug}
            onSlug={(slug) => setValues((v) => ({ ...v, slug }))}
            desktopUrl={values.imageUrl}
            mobileUrl={mobileUrl}
            desktop={desktop}
            mobile={mobile}
            onDesktop={setDesktop}
            onMobile={setMobile}
            removeMobile={removeMobile}
            onRemoveMobile={setRemoveMobile}
            disabled={busy}
          />
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
              disabled={busy}
              onClick={() => void discardDraft(() => setEditor(false))}
            >
              Fechar
            </button>
          </div>
        </form>
      )}
      {editor ? null : state.loading ? (
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
                {["DRAFT", "PUBLISHED"].includes(event.status) &&
                  event.campaigns.some((c) => c.kind === "CAMPER") && (
                    <Link
                      className="button outline"
                      to={`/organizacao/${organizationId}/eventos/${event.id}/ficha-campistas`}
                    >
                      Ficha de campistas
                    </Link>
                  )}
                <button className="text-button" onClick={() => edit(event)}>
                  Editar informações
                </button>
                <Link
                  className="button outline"
                  to={`/organizacao/${organizationId}/mensagens?evento=${event.id}`}
                >
                  Mensagem de aceite
                </Link>
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
                    <Link className="text-button" to={publicEventPath(event)}>
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
