import type { Answer, Question } from "../lib/types";
import { Field } from "./ui";
export function Questions({
  questions,
  answers,
  onChange,
  errors = {},
}: {
  questions: Question[];
  answers: Record<string, Answer>;
  onChange: (id: string, answer: Answer) => void;
  errors?: Record<string, string>;
}) {
  return (
    <>
      {questions.map((q) => (
        <Field
          key={q.id}
          label={q.label}
          required={q.required}
          hint={q.hint}
          error={errors[q.id]}
          group={q.type === "multiple"}
        >
          {q.type === "text" ? (
            <textarea
              maxLength={2000}
              required={q.required}
              value={String(answers[q.id] ?? "")}
              onChange={(e) => onChange(q.id, e.target.value)}
            />
          ) : q.type === "number" ? (
            <input
              type="number"
              required={q.required}
              value={String(answers[q.id] ?? "")}
              onChange={(e) =>
                onChange(
                  q.id,
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            />
          ) : q.type === "date" ? (
            <input
              type="date"
              required={q.required}
              value={String(answers[q.id] ?? "")}
              onChange={(e) => onChange(q.id, e.target.value)}
            />
          ) : q.type === "boolean" ? (
            q.mustBeTrue ? (
              <span className="checkbox">
                <input
                  type="checkbox"
                  aria-label={q.label}
                  checked={answers[q.id] === true}
                  onChange={(e) => onChange(q.id, e.target.checked)}
                />{" "}
                Sim, estou de acordo
              </span>
            ) : (
              <select
                value={answers[q.id] === undefined ? "" : String(answers[q.id])}
                required={q.required}
                onChange={(e) =>
                  onChange(
                    q.id,
                    e.target.value === "" ? "" : e.target.value === "true",
                  )
                }
              >
                <option value="">Selecione</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            )
          ) : q.type === "single" ? (
            <select
              required={q.required}
              value={String(answers[q.id] ?? "")}
              onChange={(e) => onChange(q.id, e.target.value)}
            >
              <option value="">Selecione</option>
              {q.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <span className="check-options">
              {q.options.map((o) => (
                <label key={o} className="checkbox">
                  <input
                    type="checkbox"
                    checked={
                      Array.isArray(answers[q.id]) &&
                      (answers[q.id] as string[]).includes(o)
                    }
                    disabled={Boolean(
                      q.maxSelections &&
                      Array.isArray(answers[q.id]) &&
                      (answers[q.id] as string[]).length >= q.maxSelections &&
                      !(answers[q.id] as string[]).includes(o),
                    )}
                    onChange={(e) => {
                      const current = Array.isArray(answers[q.id])
                        ? (answers[q.id] as string[])
                        : [];
                      onChange(
                        q.id,
                        e.target.checked
                          ? q.exclusiveOption === o
                            ? [o]
                            : [
                                ...current.filter(
                                  (v) => v !== q.exclusiveOption,
                                ),
                                o,
                              ]
                          : current.filter((v) => v !== o),
                      );
                    }}
                  />
                  {o}
                </label>
              ))}
            </span>
          )}
        </Field>
      ))}
    </>
  );
}
