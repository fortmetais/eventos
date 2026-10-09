import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  createClient,
  type SupabaseClient,
  type Session,
} from "@supabase/supabase-js";
import { api, setAccessToken } from "./api";
import type { Access } from "./types";
interface AuthState {
  client: SupabaseClient | null;
  session: Session | null;
  access: Access | null;
  loading: boolean;
  error: string;
  eventsEnabled: boolean;
  eventManagementEnabled?: boolean;
  volunteerRegistrationsEnabled?: boolean;
  volunteerRegistrationsReady?: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventsEnabled, setEventsEnabled] = useState(false);
  const [eventManagementEnabled, setEventManagementEnabled] = useState(false);
  const [volunteerRegistrationsEnabled, setVolunteerRegistrationsEnabled] =
    useState(false);
  const [volunteerRegistrationsReady, setVolunteerRegistrationsReady] =
    useState(false);
  async function refresh() {
    try {
      setAccess(await api<Access>("/me/access"));
      setError("");
    } catch (e) {
      setAccess(null);
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    async function setup() {
      try {
        const settings = await api<{
          supabaseUrl: string | null;
          supabaseAnonKey: string | null;
          eventsEnabled?: boolean;
          eventManagementEnabled?: boolean;
          volunteerRegistrationsEnabled?: boolean;
          volunteerRegistrationsReady?: boolean;
        }>("/config");
        if (!active) return;
        setEventsEnabled(settings.eventsEnabled ?? true);
        setVolunteerRegistrationsEnabled(
          settings.volunteerRegistrationsEnabled ?? false,
        );
        setVolunteerRegistrationsReady(
          settings.volunteerRegistrationsReady ?? false,
        );
        setEventManagementEnabled(
          settings.eventManagementEnabled ?? settings.eventsEnabled ?? true,
        );
        if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
          setLoading(false);
          return;
        }
        const supabase = createClient(
          settings.supabaseUrl,
          settings.supabaseAnonKey,
        );
        setClient(supabase);
        const sync = async (next: Session | null) => {
          if (!active) return;
          setSession(next);
          setAccessToken(next?.access_token ?? null);
          if (next) await refresh();
          else setAccess(null);
          if (active) setLoading(false);
        };
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, next) => {
          void sync(next);
        });
        unsubscribe = () => subscription.unsubscribe();
        const { data } = await supabase.auth.getSession();
        await sync(data.session);
      } catch {
        if (active) {
          setError("Não foi possível conectar ao acesso.");
          setLoading(false);
        }
      }
    }
    void setup();
    return () => {
      active = false;
      unsubscribe?.();
      setAccessToken(null);
    };
  }, []);
  async function logout() {
    await client?.auth.signOut();
    setSession(null);
    setAccess(null);
    setAccessToken(null);
  }
  return (
    <AuthContext.Provider
      value={{
        client,
        session,
        access,
        loading,
        error,
        eventsEnabled,
        eventManagementEnabled,
        volunteerRegistrationsEnabled,
        volunteerRegistrationsReady,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider ausente.");
  return value;
}
