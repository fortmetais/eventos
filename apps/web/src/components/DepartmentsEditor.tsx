import { Plus, Trash2 } from "lucide-react";
import { Field } from "./ui";
import type { Team } from "../lib/types";

export interface DepartmentRow {
  key: string;
  id?: string;
  name: string;
  capacity: string;
}
export function departmentRows(teams: Team[] = []): DepartmentRow[] {
  return teams.length
    ? teams.map((team) => ({
        key: team.id,
        id: team.id,
        name: team.name,
        capacity: team.capacity == null ? "" : String(team.capacity),
      }))
    : [emptyDepartment()];
}
function emptyDepartment(): DepartmentRow {
  return { key: crypto.randomUUID(), name: "", capacity: "" };
}
export function departmentPayload(rows: DepartmentRow[]) {
  const departments = rows.map(({ id, name, capacity }) => ({
    ...(id ? { id } : {}),
    name: name
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleUpperCase("pt-BR"),
    capacity: Number(capacity),
  }));
  if (
    !departments.length ||
    rows.some((row) => !row.capacity || !row.name.trim()) ||
    departments.some(
      (row) =>
        row.name.length < 2 ||
        !Number.isInteger(row.capacity) ||
        row.capacity < 0 ||
        row.capacity > 100000,
    )
  )
    throw new Error(
      "Informe o nome e a quantidade de vagas de cada departamento.",
    );
  if (new Set(departments.map((row) => row.name)).size !== departments.length)
    throw new Error("Os departamentos devem ter nomes diferentes.");
  return departments;
}
export function DepartmentsEditor({
  rows,
  onChange,
}: {
  rows: DepartmentRow[];
  onChange: (rows: DepartmentRow[]) => void;
}) {
  return (
    <section className="departments-editor" aria-label="Departamentos e vagas">
      <h3>Departamentos e vagas de servos</h3>
      <p>
        Cadastre os departamentos deste evento. A preferência na ficha não
        reserva vaga; a alocação de um servo aprovado ocupa uma vaga.
      </p>
      {rows.map((row, index) => (
        <div className="department-row" key={row.key}>
          <Field label={`Departamento ${index + 1}`} required>
            <input
              required
              minLength={2}
              maxLength={100}
              placeholder="Ex.: MANUTENÇÃO, ANJO, LÍDER"
              value={row.name}
              onChange={(e) =>
                onChange(
                  rows.map((value) =>
                    value.key === row.key
                      ? { ...value, name: e.target.value }
                      : value,
                  ),
                )
              }
            />
          </Field>
          <Field label={`Vagas — departamento ${index + 1}`} required>
            <input
              required
              type="number"
              min={0}
              max={100000}
              step={1}
              value={row.capacity}
              onChange={(e) =>
                onChange(
                  rows.map((value) =>
                    value.key === row.key
                      ? { ...value, capacity: e.target.value }
                      : value,
                  ),
                )
              }
            />
          </Field>
          <button
            type="button"
            className="text-button department-remove"
            disabled={rows.length === 1}
            aria-label={`Remover departamento ${index + 1}`}
            onClick={() =>
              onChange(rows.filter((value) => value.key !== row.key))
            }
          >
            <Trash2 size={17} /> Remover
          </button>
        </div>
      ))}
      <div className="button-row">
        <button
          type="button"
          className="button outline"
          disabled={rows.length >= 30}
          onClick={() => onChange([...rows, emptyDepartment()])}
        >
          <Plus size={17} /> Adicionar departamento
        </button>
        <strong>
          Total de vagas de servos:{" "}
          {rows.reduce((total, row) => total + (Number(row.capacity) || 0), 0)}
        </strong>
      </div>
    </section>
  );
}
