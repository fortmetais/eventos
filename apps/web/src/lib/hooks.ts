import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { api } from "./api";

type RemoteState<T> = { path: string | null; data: T | null; loading: boolean; error: string };
export function useRemote<T>(path: string | null) {
  const requestedPath = useRef(path);
  requestedPath.current = path;
  const [state, setState] = useState<RemoteState<T>>({ path, data: null, loading: Boolean(path), error: "" });
  const [request, setRequest] = useState({ revision: 0, background: false });
  const refresh = useCallback(() => setRequest((v) => ({ revision: v.revision + 1, background: false })), []);
  const refreshInBackground = useCallback(() => setRequest((v) => ({ revision: v.revision + 1, background: true })), []);
  useEffect(() => {
    if (!path) {
      setState({ path, data: null, loading: false, error: "" });
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({
      path, data: previous.path === path ? previous.data : null,
      loading: !request.background || previous.path !== path || previous.data === null, error: "",
    }));
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ path, data, loading: false, error: "" });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState((previous) => ({
          path, data: previous.path === path ? previous.data : null, loading: false, error: error.message,
        }));
      });
    return () => controller.abort();
  }, [path, request]);
  const setData = useCallback((value: SetStateAction<T | null>) => {
    if (requestedPath.current !== path) return;
    setState((previous) => ({
      path,
      data: typeof value === "function"
        ? (value as (value: T | null) => T | null)(previous.path === path ? previous.data : null)
        : value,
      loading: previous.path === path ? previous.loading : false,
      error: previous.path === path ? previous.error : "",
    }));
  }, [path]);
  // A render with a different URL must never expose data or errors from the previous context.
  const current = state.path === path ? state : { path, data: null, loading: Boolean(path), error: "" };
  return { data: current.data, loading: current.loading, error: current.error, refresh, refreshInBackground, setData };
}
