import { useEffect, useState } from "react";
import { Field } from "./ui";
import { normalizeEventSlug, publicEventPath } from "../lib/event-presentation";

function Artwork({
  label,
  previous,
  file,
  onFile,
  disabled,
  mobile = false,
}: {
  label: string;
  previous?: string | null;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
  mobile?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <section className="event-banner-editor">
      <h4>{label}</h4>
      {(preview || previous) && (
        <img
          className="event-banner-preview"
          src={preview || previous!}
          alt={`Prévia do ${mobile ? "banner de celular" : "banner de computador"}`}
        />
      )}
      <Field
        label={label}
        error={error}
        hint={`JPEG, PNG ou WebP até 10 MB. Recomendado: ${mobile ? "768 × 960 pixels (vertical)" : "1920 × 640 pixels (horizontal)"}. A imagem será otimizada sem cortar seu conteúdo.`}
      >
        <input
          type="file"
          disabled={disabled}
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            setError("");
            if (!selected) return;
            if (
              !["image/jpeg", "image/png", "image/webp"].includes(
                selected.type,
              ) ||
              selected.size > 10 * 1024 * 1024
            ) {
              setError("Escolha JPEG, PNG ou WebP com até 10 MB.");
              event.target.value = "";
              onFile(null);
              return;
            }
            onFile(selected);
          }}
        />
      </Field>
      {file && (
        <button
          type="button"
          disabled={disabled}
          className="text-button"
          onClick={() => onFile(null)}
        >
          Descartar arquivo selecionado
        </button>
      )}
    </section>
  );
}

export function EventPresentationEditor({
  eventId,
  slug,
  onSlug,
  desktopUrl,
  mobileUrl,
  desktop,
  mobile,
  onDesktop,
  onMobile,
  removeMobile,
  onRemoveMobile,
  disabled,
}: {
  eventId?: string | null;
  slug: string;
  onSlug: (value: string) => void;
  desktopUrl?: string | null;
  mobileUrl?: string | null;
  desktop: File | null;
  mobile: File | null;
  onDesktop: (file: File | null) => void;
  onMobile: (file: File | null) => void;
  removeMobile: boolean;
  onRemoveMobile: (remove: boolean) => void;
  disabled?: boolean;
}) {
  const path = publicEventPath({
    id: eventId || "identificador-do-evento",
    slug: normalizeEventSlug(slug),
  });
  return (
    <>
      <Field
        label="Endereço personalizado do evento (opcional)"
        hint="Use de 3 a 80 letras, números e hífens. Exemplo: 3-fac-2027. O link original do evento continua disponível."
      >
        <input
          name="slug"
          value={slug}
          minLength={3}
          maxLength={80}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          disabled={disabled}
          placeholder="3-fac-2027"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onSlug(event.target.value)}
          onBlur={() => onSlug(normalizeEventSlug(slug))}
        />
      </Field>
      <p className="event-public-link">
        Link para compartilhar:{" "}
        <span>
          {window.location.origin}
          {path}
        </span>
      </p>
      <h3>Banners do evento</h3>
      <div className="event-banner-editors">
        <Artwork
          label="Banner para computador (opcional)"
          previous={desktopUrl}
          file={desktop}
          onFile={onDesktop}
          disabled={disabled}
        />
        <div>
          <Artwork
            label="Banner para celular (opcional)"
            previous={removeMobile ? null : mobileUrl}
            file={mobile}
            onFile={(file) => {
              onMobile(file);
              if (file) onRemoveMobile(false);
            }}
            disabled={disabled}
            mobile
          />
          {mobileUrl && !removeMobile && !mobile && (
            <button
              className="text-button"
              type="button"
              disabled={disabled}
              onClick={() => onRemoveMobile(true)}
            >
              Remover banner de celular
            </button>
          )}
          {removeMobile && (
            <p role="status">
              Ao salvar, o celular usará o banner de computador.{" "}
              <button
                type="button"
                className="text-button"
                disabled={disabled}
                onClick={() => onRemoveMobile(false)}
              >
                Desfazer
              </button>
            </p>
          )}
          <p className="muted">
            Se não houver uma imagem para celular, será usado o banner de
            computador.
          </p>
        </div>
      </div>
    </>
  );
}
