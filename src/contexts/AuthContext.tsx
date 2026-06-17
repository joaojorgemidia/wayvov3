import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "operador" | "visualizador" | "superadmin";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  allowedCompanies: string[];
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [allowedCompanies, setAllowedCompanies] = useState<string[]>([]);

  const clearAccessData = useCallback(() => {
    setRoles([]);
    setAllowedCompanies([]);
  }, []);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const [rolesRes, companiesRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("user_companies").select("company_id").eq("user_id", userId),
      ]);
      setRoles((rolesRes.data || []).map((r: any) => r.role as AppRole));
      setAllowedCompanies((companiesRes.data || []).map((c: any) => c.company_id));
    } catch (e) {
      console.error("Error fetching user data:", e);
      clearAccessData();
    }
  }, [clearAccessData]);

  const syncSession = useCallback(async (nextSession: Session | null) => {
    const nextUser = nextSession?.user ?? null;

    setSession(nextSession);
    setUser(nextUser);

    if (nextUser) {
      await fetchUserData(nextUser.id);
      return;
    }

    clearAccessData();
  }, [clearAccessData, fetchUserData]);

  useEffect(() => {
    let mounted = true;

    // Set up listener FIRST (sync only — no awaits in callback to avoid deadlocks)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      const nextUser = nextSession?.user ?? null;
      setSession(nextSession);
      setUser(nextUser);
      // Defer async role/company fetch — never await inside this callback
      if (nextUser) {
        setTimeout(() => {
          if (mounted) void fetchUserData(nextUser.id);
        }, 0);
      } else {
        clearAccessData();
      }
    });

    // Then bootstrap existing session (only this path toggles `loading`)
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (session) {
        // Validate the session against the server — getSession() trusts localStorage
        // blindly and a stale/expired token blocks login without showing an error.
        // Only sign out on clear auth errors (401); transient network errors keep the local session.
        const { error } = await supabase.auth.getUser();
        if (error) {
          const status = (error as any)?.status ?? (error as any)?.code;
          const isAuthError = status === 401 || status === 403
            || error.message?.toLowerCase().includes("invalid")
            || error.message?.toLowerCase().includes("expired")
            || error.message?.toLowerCase().includes("not authenticated");
          if (isAuthError) {
            await supabase.auth.signOut({ scope: "local" });
            if (mounted) { await syncSession(null); setLoading(false); }
            return;
          }
          // Network/unknown error — trust the local session and continue
        }
      }

      await syncSession(session);
      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncSession, fetchUserData, clearAccessData]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    clearAccessData();
  }, [clearAccessData]);

  const isAdmin = roles.includes("admin");

  const refreshAccess = useCallback(async () => {
    if (user) await fetchUserData(user.id);
  }, [user, fetchUserData]);

  return (
    <AuthContext.Provider value={{ user, session, loading, roles, allowedCompanies, isAdmin, signIn, signOut, refreshAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
