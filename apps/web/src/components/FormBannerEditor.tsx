import { useEffect, useRef, useState } from "react";
import type { FormConfig } from "../lib/types";
import { Field, Notice } from "./ui";

export function useBannerPreview(file: File | null, currentUrl?: string) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return file ? url : currentUrl;
}

export function formBannerBody(config: FormConfig, file: File | null) {
  if (!file) return config;
  const body = new FormData();
  body.append("data", JSON.stringify(config));
  body.append("banner", file);
  return body;
}

export function FormBannerEditor({
  previewUrl,
  onFile,
  onRemove,
  disabled = false,
}: {
  previewUrl?: string;
  onFile: (file: File | null) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <section className="form-banner-editor">
      <Field
        label="Banner da ficha (opcional)"
        hint="Recomendado: 1600 × 400 pixels (proporção 4:1). JPEG, PNG ou WebP, até 10 MB. Use uma imagem horizontal, entre 2:1 e 6:1, com textos e logotipos legíveis no celular. A imagem será otimizada sem recortar."
      >
        <input
          ref={input}
          type="file"
          name="banner"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (
              !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
              file.size > 10 * 1024 * 1024
            ) {
              setError("Escolha um banner JPEG, PNG ou WebP com até 10 MB.");
              event.target.value = "";
              return;
            }
            setError("");
            onFile(file);
          }}
        />
      </Field>
      {error && <Notice>{error}</Notice>}
      {previewUrl && (
        <>
          <img
            className="form-banner-preview"
            src={previewUrl}
            alt="Prévia do banner da ficha"
          />
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => {
              if (input.current) input.current.value = "";
              setError("");
              onFile(null);
              onRemove();
            }}
          >
            Remover banner desta versão
          </button>
        </>
      )}
    </section>
  );
}
