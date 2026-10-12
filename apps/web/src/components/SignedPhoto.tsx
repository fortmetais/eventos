import { useEffect, useRef, useState } from "react";
import { ImageOff, LoaderCircle } from "lucide-react";
import { api } from "../lib/api";

// The private storage URL lasts 120 seconds. Renew before it expires, only
// while the photo is displayed and the browser tab is visible.
const renewalInterval = 90_000;
const unavailable = "Não foi possível carregar a foto.";

export function SignedPhoto({
  endpoint,
  draftToken,
  alt,
}: {
  endpoint: string;
  draftToken?: string;
  alt: string;
}) {
  const [photo, setPhoto] = useState({
    endpoint,
    draftToken,
    url: "",
    loading: true,
    error: "",
  });
  const controls = useRef({
    retry: () => {},
    failed: (_url: string) => {},
    loaded: (_url: string) => {},
  });

  useEffect(() => {
    let disposed = false;
    let pending = false;
    let currentUrl = "";
    let recoveryUsed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const cancelTimer = () => clearTimeout(timer);
    function fail() {
      cancelTimer();
      currentUrl = "";
      setPhoto({
        endpoint,
        draftToken,
        url: "",
        loading: false,
        error: unavailable,
      });
    }
    async function renew() {
      if (disposed || pending || document.visibilityState !== "visible") return;
      pending = true;
      cancelTimer();
      controller = new AbortController();
      setPhoto({
        endpoint,
        draftToken,
        url: currentUrl,
        loading: true,
        error: "",
      });
      try {
        const result = await api<{ url: string }>(endpoint, {
          draftToken,
          signal: controller.signal,
        });
        if (disposed) return;
        if (!result.url) throw new Error("Photo URL missing");
        currentUrl = result.url;
        setPhoto({
          endpoint,
          draftToken,
          url: currentUrl,
          loading: false,
          error: "",
        });
        timer = setTimeout(() => void renew(), renewalInterval);
      } catch {
        if (!disposed) fail();
      } finally {
        pending = false;
      }
    }
    controls.current = {
      retry: () => {
        recoveryUsed = false;
        void renew();
      },
      failed: (url) => {
        if (disposed || url !== currentUrl) return;
        if (recoveryUsed) {
          fail();
          return;
        }
        recoveryUsed = true;
        currentUrl = "";
        void renew();
      },
      loaded: (url) => {
        if (url === currentUrl) recoveryUsed = false;
      },
    };
    const visible = () => {
      if (document.visibilityState !== "visible") cancelTimer();
      else void renew();
    };
    const online = () => void renew();
    setPhoto({ endpoint, draftToken, url: "", loading: true, error: "" });
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", online);
    void renew();
    return () => {
      disposed = true;
      controller?.abort();
      cancelTimer();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", online);
      controls.current = {
        retry: () => {},
        failed: () => {},
        loaded: () => {},
      };
    };
  }, [endpoint, draftToken]);

  // Never display a URL belonging to a previous photo or draft, even before
  // the next effect runs.
  const matching =
    photo.endpoint === endpoint && photo.draftToken === draftToken;
  const url = matching ? photo.url : "";
  if (url)
    return (
      <img
        src={url}
        alt={alt}
        onLoad={() => controls.current.loaded(url)}
        onError={() => controls.current.failed(url)}
      />
    );
  return (
    <span
      className="signed-photo-status"
      role={matching && photo.error ? "alert" : "status"}
    >
      {matching && photo.error ? (
        <>
          <ImageOff size={24} aria-hidden="true" />
          <span>{photo.error}</span>
          <button
            type="button"
            className="text-button"
            onClick={() => controls.current.retry()}
          >
            Tentar carregar foto
          </button>
        </>
      ) : (
        <>
          <LoaderCircle className="spin" size={24} aria-hidden="true" />
          <span>Carregando foto…</span>
        </>
      )}
    </span>
  );
}
