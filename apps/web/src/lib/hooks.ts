import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
export function useRemote<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState("");
  const loadedPath = useRef<string | null>(null);
  const [request, setRequest] = useState({ revision: 0, background: false });
  const refresh = useCallback(
    () => setRequest((v) => ({ revision: v.revision + 1, background: false })),
    [],
  );
  const refreshInBackground = useCallback(
    () => setRequest((v) => ({ revision: v.revision + 1, background: true })),
    [],
  );
  useEffect(() => {
    if (!path) {
      loadedPath.current = null;
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    if (!request.background || loadedPath.current !== path) setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          loadedPath.current = path;
          setData(result);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, request]);
  return { data, loading, error, refresh, refreshInBackground, setData };
}
