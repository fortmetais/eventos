import { useUnsavedChanges } from "../lib/unsaved-changes";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import type { Campaign, EventEdition } from "../lib/types";
import { dateTime } from "../lib/types";
import { Field, Notice } from "./ui";

import { FormVersionEditor } from "./FormVersionEditor";

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

export function CampaignEditor({
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
  const campaignDraft = JSON.stringify({
    open,
    close,
    capacity,
    waitlist,
    paused,
  });
  const campaignBaseline = useRef(campaignDraft);
  useEffect(() => {
    campaignBaseline.current = campaignDraft;
  }, [editing, kind]);
  const { run: discardCampaign } = useUnsavedChanges(
    editing && campaignDraft !== campaignBaseline.current,
    { busy },
  );
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
          onClick={() =>
            void discardCampaign(() => {
              setKind("CAMPER");
              setEditing(false);
            })
          }
        >
          Campistas
        </button>
        <button
          className={kind === "VOLUNTEER" ? "active" : ""}
          onClick={() =>
            void discardCampaign(() => {
              setKind("VOLUNTEER");
              setEditing(false);
            })
          }
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
              disabled={busy}
              onClick={() => void discardCampaign(() => setEditing(false))}
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
          <FormVersionEditor
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
