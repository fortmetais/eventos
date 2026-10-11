import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  findBrazilianCities,
  loadBrazilianCities,
  type BrazilianCity,
} from "../lib/brazil-cities";

export function CityAutocomplete({
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
  const listId = `${id}-cities`;
  const helpId = `${id}-help`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [cities, setCities] = useState<BrazilianCity[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const { matches, hasMore } = useMemo(
    () => findBrazilianCities(cities ?? [], value),
    [cities, value],
  );

  useEffect(() => {
    if (!open || cities) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    loadBrazilianCities()
      .then((result) => {
        if (!cancelled) setCities(result);
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
  }, [open, cities, retry]);

  useEffect(() => {
    if (open && active >= 0)
      listRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  function choose(city: BrazilianCity) {
    onChange(city.label);
    setActive(-1);
    setOpen(false);
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
            ? `${id}-city-${active}`
            : undefined
        }
        aria-describedby={helpId}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Digite o nome da cidade ou a UF"
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
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setActive(-1);
          } else if (event.key === "Tab") {
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
            aria-label="Cidades brasileiras"
          >
            {matches.map((city, index) => (
              <li
                key={city.label}
                id={`${id}-city-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(city)}
              >
                {city.label}
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="city-more">
              Digite mais letras ou a UF para refinar a busca.
            </div>
          )}
        </div>
      )}
      <small id={helpId} role="status" aria-live="polite">
        {open && loading ? (
          "Carregando cidades…"
        ) : open && failed ? (
          <>
            Não foi possível carregar as cidades. Você pode informar Cidade - UF
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
          cities &&
          value.trim().length >= 2 &&
          matches.length === 0 ? (
          "Nenhuma cidade encontrada. Revise o nome ou informe Cidade - UF."
        ) : (
          "Digite pelo menos 2 letras e selecione Cidade - UF."
        )}
      </small>
    </div>
  );
}
