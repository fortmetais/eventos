import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { normalizeCitySearch } from "../lib/brazil-cities";

type Parish = { id: string; name: string; city: string; state: string | null };

export function ParishAutocomplete({
  value,
  onChange,
  label,
  required,
  invalid,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
  invalid?: boolean;
  name: string;
}) {
  const id = useId();
  const listId = `${id}-parishes`;
  const helpId = `${id}-help`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [parishes, setParishes] = useState<Parish[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const catalog = useMemo(
    () =>
      (parishes ?? []).map((parish) => {
        const location = [parish.city, parish.state]
          .filter(Boolean)
          .join(" - ");
        const label = [parish.name, location].filter(Boolean).join(" — ");
        return { ...parish, label, search: normalizeCitySearch(label) };
      }),
    [parishes],
  );
  const filtered = useMemo(() => {
    const query = normalizeCitySearch(value);
    if (query.length < 2) return [];
    const tokens = query.split(" ");
    return catalog.filter((parish) =>
      tokens.every((token) => parish.search.includes(token)),
    );
  }, [catalog, value]);
  const matches = filtered.slice(0, 20);

  useEffect(() => {
    if (!open || parishes) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    api<Parish[]>("/public/parishes")
      .then((result) => {
        if (!cancelled) setParishes(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, parishes, retry]);

  useEffect(() => {
    if (open && active >= 0)
      listRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  function choose(parish: (typeof catalog)[number]) {
    onChange(parish.label);
    setOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  }

  return (
    <div
      className="city-autocomplete"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <input
        ref={inputRef}
        name={name}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open && matches.length > 0}
        aria-controls={open && matches.length > 0 ? listId : undefined}
        aria-activedescendant={
          open && active >= 0 && matches[active]
            ? `${id}-parish-${active}`
            : undefined
        }
        aria-describedby={helpId}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        placeholder="Busque ou escreva o nome da paróquia"
        maxLength={2000}
        required={required}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (matches.length)
              setActive((current) =>
                event.key === "ArrowDown"
                  ? Math.min(current + 1, matches.length - 1)
                  : current < 0
                    ? matches.length - 1
                    : Math.max(current - 1, 0),
              );
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (active >= 0 && matches[active]) choose(matches[active]);
            else setOpen(false);
          } else if (event.key === "Escape" || event.key === "Tab") {
            if (event.key === "Escape") event.preventDefault();
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {open && matches.length > 0 && (
        <div className="city-suggestions">
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Paróquias cadastradas"
          >
            {matches.map((parish, index) => (
              <li
                key={parish.id}
                id={`${id}-parish-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(parish)}
              >
                {parish.label}
              </li>
            ))}
          </ul>
          {filtered.length > 20 && (
            <div className="city-more">
              Digite mais letras ou a cidade/UF para refinar a busca.
            </div>
          )}
        </div>
      )}
      <small id={helpId} role="status" aria-live="polite">
        {open && loading ? (
          "Carregando paróquias…"
        ) : open && failed ? (
          <>
            Não foi possível carregar as sugestões. Escreva o nome da paróquia
            ou{" "}
            <button
              type="button"
              className="city-retry"
              onClick={() => setRetry((current) => current + 1)}
            >
              tentar novamente
            </button>
            .
          </>
        ) : open &&
          parishes &&
          value.trim().length >= 2 &&
          matches.length === 0 ? (
          "Nenhuma paróquia encontrada. Você pode manter o nome digitado."
        ) : (
          "Digite pelo menos 2 letras para buscar. Se não encontrar sua paróquia, escreva o nome normalmente."
        )}
      </small>
    </div>
  );
}
