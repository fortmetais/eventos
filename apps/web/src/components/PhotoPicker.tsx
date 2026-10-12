import { preparePhotoUpload } from "../lib/photo-upload";
import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { Camera, ImagePlus, Check, LoaderCircle } from "lucide-react";
import { api } from "../lib/api";
import { Notice } from "./ui";
import { SignedPhoto } from "./SignedPhoto";
export interface PhotoPickerHandle {
  uploadPendingPhoto: () => Promise<boolean>;
}
export function PhotoPicker({
  ref,
  endpoint,
  draftToken,
  onUploaded,
  currentUrl,
  photoEndpoint,
  onUploadingChange,
  onPendingChange,
  uploadedMessage = "Foto enviada.",
  disabled = false,
}: {
  ref?: Ref<PhotoPickerHandle>;
  endpoint: string;
  draftToken?: string;
  onUploaded: (id: string, url: string) => void;
  currentUrl?: string;
  photoEndpoint?: string;
  onUploadingChange?: (uploading: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  uploadedMessage?: string;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loadedFile, setLoadedFile] = useState<File | null>(null);
  const [unreadableFile, setUnreadableFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0.5);
  const [y, setY] = useState(0.5);
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const inputId = useId();
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const previewImage = useRef<HTMLImageElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const uploadRequest = useRef<Promise<boolean> | null>(null);
  useImperativeHandle(ref, () => ({ uploadPendingPhoto: upload }));
  useEffect(() => {
    onUploadingChange?.(busy);
  }, [busy, onUploadingChange]);
  useEffect(() => {
    onPendingChange?.(Boolean(file));
  }, [file, onPendingChange]);
  function releaseCamera() {
    cameraRequest.current += 1;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  function closeCamera() {
    releaseCamera();
    setCameraOpen(false);
    setCameraReady(false);
    setCapturing(false);
  }
  useEffect(() => {
    const hideCamera = () => {
      if (document.hidden) closeCamera();
    };
    document.addEventListener("visibilitychange", hideCamera);
    return () => {
      document.removeEventListener("visibilitychange", hideCamera);
      releaseCamera();
    };
  }, []);
  async function openCamera() {
    setError("");
    setInfo("");
    if (!navigator.mediaDevices?.getUserMedia) {
      // Native capture remains available on browsers without live camera support.
      camera.current?.click();
      return;
    }
    closeCamera();
    const request = cameraRequest.current;
    setCameraOpen(true);
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
      });
      if (request !== cameraRequest.current || !video.current) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = next;
      video.current.srcObject = next;
      await video.current.play();
    } catch (cause) {
      if (request !== cameraRequest.current) return;
      closeCamera();
      const name = (cause as Error).name;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Permita o acesso à câmera nas configurações do navegador e tente novamente. Você também pode escolher uma foto."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "Nenhuma câmera disponível. Conecte uma webcam ou escolha uma foto."
            : "Não foi possível abrir a câmera. Verifique se ela está sendo usada em outro aplicativo ou escolha uma foto.",
      );
    }
  }
  function takePhoto() {
    const source = video.current;
    if (!source || !source.videoWidth || !source.videoHeight || capturing)
      return;
    setCapturing(true);
    const request = cameraRequest.current;
    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas indisponível");
      context.drawImage(source, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (request !== cameraRequest.current) return;
          closeCamera();
          if (blob)
            select(
              new File([blob], "foto-identificacao.jpg", {
                type: "image/jpeg",
              }),
            );
          else setError("Não foi possível capturar a foto. Tente novamente.");
        },
        "image/jpeg",
        0.9,
      );
    } catch {
      closeCamera();
      setError("Não foi possível capturar a foto. Tente novamente.");
    }
  }
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
    setInfo("");
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
    setLoadedFile(null);
    setUnreadableFile(null);
    setFile(next);
  }
  async function upload(): Promise<boolean> {
    if (uploadRequest.current) return uploadRequest.current;
    if (cameraOpen || capturing) {
      setError("Capture a foto ou feche a câmera antes de salvar o perfil.");
      return false;
    }
    if (!file) return true;
    if (unreadableFile === file) {
      setError("Não foi possível ler esta foto. Escolha outro arquivo.");
      return false;
    }
    if (loadedFile !== file) {
      setError("Aguarde o carregamento da foto e tente salvar novamente.");
      return false;
    }
    const pending = (async () => {
      setBusy(true);
      setError("");
      setInfo("");
      try {
        const side = Math.min(dimensions.width, dimensions.height) / zoom;
        const prepared = await preparePhotoUpload(file, previewImage.current, {
          left: (x * (dimensions.width - side)) / dimensions.width,
          top: (y * (dimensions.height - side)) / dimensions.height,
          size: side / Math.min(dimensions.width, dimensions.height),
        });
        const form = new FormData();
        form.append("photo", prepared.file);
        form.append("crop", JSON.stringify(prepared.crop));
        const result = await api<{ id: string; url: string }>(endpoint, {
          method: "POST",
          body: form,
          draftToken,
        });
        onUploaded(result.id, result.url);
        setFile(null);
        setInfo(uploadedMessage);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    })();
    uploadRequest.current = pending;
    try {
      return await pending;
    } finally {
      if (uploadRequest.current === pending) uploadRequest.current = null;
    }
  }
  const shown = preview || currentUrl;
  return (
    <div className="photo-picker">
      {error && <Notice>{error}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}
      {cameraOpen && (
        <section
          className="photo-camera"
          aria-label="Câmera para foto de identificação"
        >
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            aria-label="Prévia da câmera"
            onLoadedData={() => setCameraReady(true)}
          />
          <p className="muted" role="status">
            {cameraReady
              ? "Enquadre seu rosto e capture a foto."
              : "Aguardando acesso à câmera…"}
          </p>
          <div className="photo-options">
            <button
              type="button"
              className="button primary"
              disabled={!cameraReady || capturing || disabled}
              onClick={takePhoto}
            >
              <Camera size={17} /> Capturar foto
            </button>
            <button
              type="button"
              className="button outline"
              onClick={closeCamera}
              disabled={disabled}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}
      <div className="photo-preview">
        {!preview && photoEndpoint ? (
          <SignedPhoto
            endpoint={photoEndpoint}
            draftToken={draftToken}
            alt="Prévia da foto de identificação"
          />
        ) : shown ? (
          <img
            ref={previewImage}
            src={shown}
            alt="Prévia da foto de identificação"
            onLoad={(e) => {
              const width = e.currentTarget.naturalWidth;
              const height = e.currentTarget.naturalHeight;
              if (!width || !height) return;
              setDimensions({ width, height });
              if (preview && e.currentTarget.getAttribute("src") === preview) {
                setLoadedFile(file);
                setUnreadableFile(null);
              }
            }}
            onError={() => {
              if (preview) {
                setUnreadableFile(file);
                setLoadedFile(null);
                setError(
                  "Não foi possível ler esta foto. Escolha outro arquivo.",
                );
              } else {
                setError(
                  "Não foi possível mostrar sua foto. Atualize a página para tentar novamente.",
                );
              }
            }}
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
      {file && !cameraOpen ? (
        <>
          <p className="muted">Ajuste o enquadramento do seu rosto.</p>
          <label className="range-label">
            Aproximar
            <input
              aria-label="Aproximar foto"
              name={`${inputId}-zoom`}
              type="range"
              min="1"
              max="3"
              step=".05"
              value={zoom}
              disabled={busy || disabled}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <label className="range-label">
            Posição horizontal
            <input
              name={`${inputId}-horizontal`}
              type="range"
              min="0"
              max="1"
              step=".02"
              value={x}
              disabled={busy || disabled}
              onChange={(e) => setX(Number(e.target.value))}
            />
          </label>
          <label className="range-label">
            Posição vertical
            <input
              name={`${inputId}-vertical`}
              type="range"
              min="0"
              max="1"
              step=".02"
              value={y}
              disabled={busy || disabled}
              onChange={(e) => setY(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              if (!disabled) void upload();
            }}
            disabled={busy || disabled || loadedFile !== file}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}
            Usar esta foto
          </button>
          <button
            type="button"
            className="button outline"
            disabled={busy || disabled}
            onClick={() => {
              setFile(null);
              setError("");
              setInfo("");
            }}
          >
            Descartar foto
          </button>
        </>
      ) : null}
      <div className="photo-options">
        <button
          type="button"
          className="button outline"
          disabled={busy || cameraOpen || disabled}
          onClick={() => void openCamera()}
        >
          <Camera size={17} />
          Tirar foto
        </button>
        <button
          type="button"
          className="button outline"
          disabled={busy || cameraOpen || disabled}
          onClick={() => gallery.current?.click()}
        >
          <ImagePlus size={17} />
          {currentUrl || photoEndpoint ? "Trocar foto" : "Escolher foto"}
        </button>
      </div>
      <input
        className="sr-only"
        ref={camera}
        name={`${inputId}-camera`}
        aria-label="Foto pela câmera do dispositivo"
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
        name={`${inputId}-gallery`}
        aria-label="Arquivo da foto de identificação"
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
