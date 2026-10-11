import { useState } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  LockKeyhole,
} from "lucide-react";
import {
  editableLayout,
  fieldCatalog,
  stepLabels,
  stepIds,
  syncLegacyFlags,
  type FormKind,
  type FormField,
  type StepId,
} from "@fac/form-layout";
import type { FormConfig } from "../lib/types";

export function FormLayoutEditor({
  form,
  kind,
  onChange,
  disabled = false,
}: {
  form: FormConfig;
  kind: FormKind;
  onChange: (config: FormConfig) => void;
  disabled?: boolean;
}) {
  const layout = editableLayout(form, kind);
  const catalog = new Map(
    fieldCatalog(form, kind).map((field) => [field.key, field]),
  );
  const [announcement, setAnnouncement] = useState("");
  function move(step: StepId, from: number, to: number) {
    const group = layout.steps.find((item) => item.step === step)!;
    if (
      disabled ||
      from === to ||
      from < 0 ||
      to < 0 ||
      to >= group.fields.length
    )
      return;
    const fields = [...group.fields];
    const [entry] = fields.splice(from, 1);
    fields.splice(to, 0, entry);
    onChange(
      syncLegacyFlags({
        ...form,
        layout: {
          ...layout,
          steps: layout.steps.map((item) =>
            item.step === step ? { ...item, fields } : item,
          ),
        },
      }),
    );
    setAnnouncement(`${catalog.get(entry.key)?.label}: posição ${to + 1}.`);
  }
  function toggle(key: string) {
    if (disabled || catalog.get(key)?.protectedReason) return;
    onChange(
      syncLegacyFlags({
        ...form,
        layout: {
          ...layout,
          steps: layout.steps.map((group) => ({
            ...group,
            fields: group.fields.map((entry) =>
              entry.key === key ? { ...entry, hidden: !entry.hidden } : entry,
            ),
          })),
        },
      }),
    );
  }
  return (
    <section
      className="form-layout-editor"
      aria-label="Organizar campos da ficha"
    >
      <h3>Organizar campos da ficha</h3>
      <p>
        Arraste pela alça ou use as setas para ordenar dentro de cada etapa. No
        celular, mantenha a alça pressionada antes de arrastar. Campos ocultos
        não serão exibidos nem exigidos.
      </p>
      {layout.steps.map((group) => (
        <section
          key={group.step}
          className="layout-step"
          aria-label={`Campos: ${stepLabels[stepIds.indexOf(group.step)]}`}
        >
          <h4>{stepLabels[stepIds.indexOf(group.step)]}</h4>
          <DragDropProvider
            sensors={(defaults) => [
              ...defaults.filter((sensor) => sensor !== PointerSensor),
              PointerSensor.configure({
                activationConstraints: (event) =>
                  event.pointerType === "touch"
                    ? [
                        new PointerActivationConstraints.Delay({
                          value: 250,
                          tolerance: 5,
                        }),
                      ]
                    : [new PointerActivationConstraints.Distance({ value: 5 })],
              }),
            ]}
            onDragEnd={(event) => {
              if (event.canceled) {
                setAnnouncement("Movimento cancelado.");
                return;
              }
              const source = event.operation.source;
              const target = event.operation.target;
              if (!source || !target) return;
              // O plugin otimista muda índices visuais durante o arraste; usamos a
              // posição inicial da lista e o índice final do sortable.
              const from = group.fields.findIndex(
                (entry) => entry.key === source.id,
              );
              const sortable = source as typeof source & { index?: number };
              const to =
                typeof sortable.index === "number"
                  ? sortable.index
                  : group.fields.findIndex((entry) => entry.key === target.id);
              move(group.step, from, to);
            }}
          >
            <ol className="layout-fields">
              {group.fields.map((entry, index) => (
                <LayoutRow
                  key={entry.key}
                  field={catalog.get(entry.key)!}
                  hidden={entry.hidden}
                  index={index}
                  count={group.fields.length}
                  disabled={disabled}
                  onMove={(delta) => move(group.step, index, index + delta)}
                  onToggle={() => toggle(entry.key)}
                />
              ))}
            </ol>
          </DragDropProvider>
        </section>
      ))}
      <p className="screen-reader-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

function LayoutRow({
  field,
  hidden,
  index,
  count,
  disabled,
  onMove,
  onToggle,
}: {
  field: FormField;
  hidden: boolean;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (delta: number) => void;
  onToggle: () => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: field.key,
    index,
    group: field.step,
    disabled,
  });
  return (
    <li
      ref={ref}
      className={`layout-field ${hidden ? "is-hidden" : ""} ${isDragging ? "is-dragging" : ""}`}
      data-field-key={field.key}
    >
      <button
        ref={handleRef}
        type="button"
        className="layout-handle"
        disabled={disabled}
        aria-label={`Arrastar ${field.label}`}
        title="Segure e arraste"
      >
        <GripVertical size={20} />
      </button>
      <div className="layout-field-label">
        <strong>{field.label}</strong>
        <small>
          {hidden
            ? "Oculto"
            : field.required
              ? "Obrigatório quando exibido"
              : "Opcional"}
        </small>
        {field.protectedReason && (
          <small className="layout-protected">
            <LockKeyhole size={12} />
            {field.protectedReason}
          </small>
        )}
      </div>
      <div className="layout-actions">
        <button
          type="button"
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
          aria-label={`Mover ${field.label} para cima`}
          title="Mover para cima"
        >
          <ArrowUp size={17} />
        </button>
        <button
          type="button"
          disabled={disabled || index === count - 1}
          onClick={() => onMove(1)}
          aria-label={`Mover ${field.label} para baixo`}
          title="Mover para baixo"
        >
          <ArrowDown size={17} />
        </button>
        <button
          type="button"
          disabled={disabled || Boolean(field.protectedReason)}
          onClick={onToggle}
          aria-label={`${hidden ? "Mostrar" : "Ocultar"} ${field.label}`}
          title={field.protectedReason ?? (hidden ? "Mostrar" : "Ocultar")}
        >
          {hidden ? <Eye size={17} /> : <EyeOff size={17} />}
          <span>{hidden ? "Mostrar" : "Ocultar"}</span>
        </button>
      </div>
    </li>
  );
}
