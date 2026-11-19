import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { UNSAFE_NavigationContext, useLocation } from "react-router-dom";
import { Modal } from "../components/Modal";

type Entry = { dirty: boolean; busy: boolean };
type Pending = { resolve: (discard: boolean) => void };
type Guard = {
  update: (id: string, entry: Entry | null) => void;
  run: (action: () => void | Promise<void>) => Promise<boolean>;
};
const UnsavedChangesContext = createContext<Guard | null>(null);

/** Mount inside BrowserRouter, around Routes. Forms register only their own unsaved work. */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const location = useLocation();
  const entries = useRef(new Map<string, Entry>());
  const bypass = useRef(0);
  const pendingRef = useRef<Pending | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [, refresh] = useState(0);
  const index = useRef<number | null>(
    typeof window.history.state?.idx === "number"
      ? window.history.state.idx
      : null,
  );
  const restorePop = useRef<(() => void) | null>(null);
  const allowPop = useRef(false);
  const hasChanges = useCallback(
    () =>
      [...entries.current.values()].some((entry) => entry.dirty || entry.busy),
    [],
  );
  const update = useCallback((id: string, entry: Entry | null) => {
    if (entry && (entry.dirty || entry.busy)) entries.current.set(id, entry);
    else entries.current.delete(id);
    if (pendingRef.current) refresh((version) => version + 1);
  }, []);
  const confirm = useCallback(() => {
    if (bypass.current || !hasChanges()) return Promise.resolve(true);
    if (pendingRef.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const request = { resolve };
      pendingRef.current = request;
      setPending(request);
    });
  }, [hasChanges]);
  const run = useCallback(
    (action: () => void | Promise<void>): Promise<boolean> => {
      const execute = () => {
        let result: void | Promise<void>;
        bypass.current += 1;
        try { result = action(); }
        catch (error) { return Promise.reject(error); }
        finally { bypass.current -= 1; }
        return Promise.resolve(result).then(() => true);
      };
      if (bypass.current || !hasChanges()) return execute();
      return confirm().then((discard) => discard ? execute() : false);
    },
    [confirm, hasChanges],
  );
  const finish = useCallback((discard: boolean) => {
    if (discard && [...entries.current.values()].some((entry) => entry.busy))
      return;
    const request = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    request?.resolve(discard);
  }, []);

  useLayoutEffect(() => {
    index.current =
      typeof window.history.state?.idx === "number"
        ? window.history.state.idx
        : null;
    allowPop.current = false;
  }, [location]);
  useLayoutEffect(() => {
    const original = {
      push: navigator.push,
      replace: navigator.replace,
      go: navigator.go,
    };
    const push: typeof navigator.push = (...args) => {
      if (bypass.current || !hasChanges()) original.push.apply(navigator, args);
      else void run(() => original.push.apply(navigator, args));
    };
    const replace: typeof navigator.replace = (...args) => {
      if (bypass.current || !hasChanges())
        original.replace.apply(navigator, args);
      else void run(() => original.replace.apply(navigator, args));
    };
    const go: typeof navigator.go = (...args) => {
      if (bypass.current || !hasChanges()) original.go.apply(navigator, args);
      else
        void run(() => {
          allowPop.current = true;
          original.go.apply(navigator, args);
        });
    };
    navigator.push = push;
    navigator.replace = replace;
    navigator.go = go;
    const unload = (event: BeforeUnloadEvent) => {
      if (!hasChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const pop = (event: PopStateEvent) => {
      const target =
        typeof event.state?.idx === "number" ? event.state.idx : null;
      if (allowPop.current) {
        allowPop.current = false;
        index.current = target;
        return;
      }
      if (restorePop.current) {
        event.stopImmediatePropagation();
        const restored = restorePop.current;
        restorePop.current = null;
        restored();
        return;
      }
      if (!hasChanges()) {
        index.current = target;
        return;
      }
      // BrowserRouter-managed entries carry idx; cross-document exits use native beforeunload.
      if (index.current === null || target === null || target === index.current)
        return;
      event.stopImmediatePropagation();
      const delta = target - index.current;
      const restored = new Promise<void>((resolve) => {
        restorePop.current = resolve;
      });
      window.history.go(-delta);
      void confirm().then(async (discard) => {
        await restored;
        if (discard) {
          allowPop.current = true;
          window.history.go(delta);
        }
      });
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("popstate", pop, true);
    return () => {
      if (navigator.push === push) navigator.push = original.push;
      if (navigator.replace === replace) navigator.replace = original.replace;
      if (navigator.go === go) navigator.go = original.go;
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("popstate", pop, true);
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
      restorePop.current?.();
      restorePop.current = null;
    };
  }, [navigator, hasChanges, run, confirm]);
  const guard = useMemo(() => ({ update, run }), [update, run]);
  const busy = [...entries.current.values()].some((entry) => entry.busy);
  return (
    <UnsavedChangesContext.Provider value={guard}>
      {children}
      {pending && (
        <Modal title="Alterações não salvas" onClose={() => finish(false)}>
          <p>
            {busy
              ? "Uma alteração está sendo salva. Aguarde a conclusão antes de sair."
              : "Existem alterações que ainda não foram salvas. Deseja descartá-las?"}
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button primary"
              onClick={() => finish(false)}
            >
              Continuar editando
            </button>
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => finish(true)}
            >
              Descartar alterações
            </button>
          </div>
        </Modal>
      )}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges(
  dirty: boolean,
  { busy = false }: { busy?: boolean } = {},
) {
  const guard = useContext(UnsavedChangesContext);
  const id = useId();
  const current = useRef({ dirty, busy });
  current.current = { dirty, busy };
  useLayoutEffect(() => {
    guard?.update(id, { dirty, busy });
    return () => guard?.update(id, null);
  }, [guard, id, dirty, busy]);
  useLayoutEffect(() => {
    if (guard) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (!current.current.dirty && !current.current.busy) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [guard]);
  const run = useCallback(
    async (action: () => void | Promise<void>) => {
      if (guard) return guard.run(action);
      if (
        current.current.busy ||
        (current.current.dirty &&
          !window.confirm("Descartar alterações não salvas?"))
      )
        return false;
      await action();
      return true;
    },
    [guard],
  );
  const markSaved = useCallback(() => {
    current.current = { dirty: false, busy: false };
    guard?.update(id, null);
  }, [guard, id]);
  return { run, markSaved };
}
