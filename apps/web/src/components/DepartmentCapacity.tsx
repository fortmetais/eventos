import { useRef, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { Team } from "../lib/types";
import { Field, Notice } from "./ui";
export function DepartmentCapacity({
  team,
  organizationId,
  editable,
  refresh,
}: {
  team: Team;
  organizationId: string;
  editable: boolean;
  refresh: () => void;
}) {
  const [capacity, setCapacity] = useState(
    team.capacity == null ? "" : String(team.capacity),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const pending = useRef(false);
  const path = `/organizations/${organizationId}/events/${team.eventId}/teams/${team.id}`;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await api(path, {
        method: "PUT",
        body: { capacity: Number(capacity) },
      });
      refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await api(path, { method: "DELETE" });
      setConfirmingDelete(false);
      refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="department-capacity">
      <div>
        <strong>{team.name}</strong>
        <p>
          {team.occupied ?? 0} alocados ·{" "}
          {team.available == null
            ? "Vagas a definir"
            : `${team.available} disponíveis de ${team.capacity}`}
        </p>
      </div>
      {editable && (
        <form onSubmit={save} className="department-capacity-form">
          <Field label={`Vagas de ${team.name}`} required>
            <input
              type="number"
              required
              min={team.occupied ?? 0}
              max={100000}
              step={1}
              value={capacity}
              disabled={busy}
              onChange={(event) => setCapacity(event.target.value)}
            />
          </Field>
          <button
            className="button outline"
            disabled={busy || capacity === ""}
            aria-label={`Salvar vagas de ${team.name}`}
          >
            Salvar vagas
          </button>
        </form>
      )}
      {editable && (
        <div>
          {confirmingDelete ? (
            <>
              <p>Excluir {team.name} e suas vagas?</p>
              <div className="button-row">
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Confirmar exclusão
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="text-button danger"
              disabled={busy || (team.occupied ?? 0) > 0}
              aria-label={`Excluir departamento ${team.name}`}
              onClick={() => {
                setError("");
                setConfirmingDelete(true);
              }}
            >
              <Trash2 size={17} /> Excluir departamento
            </button>
          )}
          {(team.occupied ?? 0) > 0 && (
            <small>Há participantes vinculados a este departamento.</small>
          )}
        </div>
      )}
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
