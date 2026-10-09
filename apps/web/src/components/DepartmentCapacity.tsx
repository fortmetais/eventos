import { useState, type FormEvent } from "react";
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
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/organizations/${organizationId}/events/${team.eventId}/teams/${team.id}`,
        {
          method: "PUT",
          body: { capacity: Number(capacity) },
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
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
