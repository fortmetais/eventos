import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Check, LoaderCircle } from "lucide-react";
import { api } from "../lib/api";
import { Notice } from "./ui";
export function PhotoPicker({
  endpoint,
  draftToken,
  onUploaded,
  currentUrl,
}: {
  endpoint: string;
  draftToken?: string;
  onUploaded: (id: string, url: string) => void;
  currentUrl?: string;
}) {
  const [preview, setPreview] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0.5);
  const [y, setY] = useState(0.5);
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function select(next: File | undefined) {
    setError("");
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setError("Escolha uma foto JPEG, PNG ou WebP.");
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError("A foto deve ter até 10 MB.");
      return;
    }
    setZoom(1);
    setX(0.5);
    setY(0.5);
    setFile(next);
  }
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const side = Math.min(dimensions.width, dimensions.height) / zoom;
      const form = new FormData();
      form.append("photo", file);
      form.append(
        "crop",
        JSON.stringify({
          left: (x * (dimensions.width - side)) / dimensions.width,
          top: (y * (dimensions.height - side)) / dimensions.height,
          size: side / Math.min(dimensions.width, dimensions.height),
        }),
      );
      const result = await api<{ id: string; url: string }>(endpoint, {
        method: "POST",
        body: form,
        draftToken,
      });
      onUploaded(result.id, result.url);
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shown = preview || currentUrl;
  return (
    <div className="photo-picker">
      {error && <Notice>{error}</Notice>}
      <div className="photo-preview">
        {shown ? (
          <img
            src={shown}
            alt="Prévia da foto de identificação"
            onLoad={(e) =>
              setDimensions({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
            style={
              preview
                ? {
                    position: "absolute",
                    width: `${(dimensions.width / (Math.min(dimensions.width, dimensions.height) / zoom)) * 100}%`,
                    height: `${(dimensions.height / (Math.min(dimensions.width, dimensions.height) / zoom)) * 100}%`,
                    left: `${((-x * (dimensions.width - Math.min(dimensions.width, dimensions.height) / zoom)) / (Math.min(dimensions.width, dimensions.height) / zoom)) * 100}%`,
                    top: `${((-y * (dimensions.height - Math.min(dimensions.width, dimensions.height) / zoom)) / (Math.min(dimensions.width, dimensions.height) / zoom)) * 100}%`,
                    objectFit: "fill",
                  }
                : undefined
            }
          />
        ) : (
          <ImagePlus size={42} />
        )}
      </div>
      {file ? (
        <>
          <p className="muted">Ajuste o enquadramento do seu rosto.</p>
          <label className="range-label">
            Aproximar
            <input
              aria-label="Aproximar foto"
              type="range"
              min="1"
              max="3"
              step=".05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <label className="range-label">
            Posição horizontal
            <input
              type="range"
              min="0"
              max="1"
              step=".02"
              value={x}
              onChange={(e) => setX(Number(e.target.value))}
            />
          </label>
          <label className="range-label">
            Posição vertical
            <input
              type="range"
              min="0"
              max="1"
              step=".02"
              value={y}
              onChange={(e) => setY(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="button primary"
            onClick={() => void upload()}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}
            Usar esta foto
          </button>
        </>
      ) : null}
      <div className="photo-options">
        <button
          type="button"
          className="button outline"
          disabled={busy}
          onClick={() => camera.current?.click()}
        >
          <Camera size={17} />
          Tirar foto
        </button>
        <button
          type="button"
          className="button outline"
          disabled={busy}
          onClick={() => gallery.current?.click()}
        >
          <ImagePlus size={17} />
          {currentUrl ? "Trocar foto" : "Escolher foto"}
        </button>
      </div>
      <input
        className="sr-only"
        ref={camera}
        tabIndex={-1}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        onChange={(e) => {
          select(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        className="sr-only"
        ref={gallery}
        tabIndex={-1}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          select(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <small className="muted">
        JPEG, PNG ou WebP · Até 10 MB · Foto usada para identificação
      </small>
    </div>
  );
}
