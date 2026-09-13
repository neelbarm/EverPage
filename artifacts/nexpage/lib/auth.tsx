import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { setItem, getItem, deleteItem } from "@/lib/storage";

const AUTH_TOKEN_KEY = "auth_session_token";
const AUTH_IDENTITY_KEY = "auth_session_identity";

interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string, displayName: string, birthday: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<string>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  requestPasswordReset: async () => "",
  resetPassword: async () => {},
  logout: async () => {},
  changePassword: async () => {},
  deleteAccount: async () => {},
});

function getApiBaseUrl(): string {
  // A production native build must always reach the deployed API. Any build-time
  // EXPO_PUBLIC_DOMAIN is the Replit dev tunnel (serves HTML, not the API), which
  // caused "JSON Parse error: Unexpected character: <" on device — ignore it here.
  if (!__DEV__ && Platform.OS !== "web") {
    return "https://nex-page.replit.app";
  }
  // Explicit override for local development (e.g. http://localhost:3001)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  return "";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authRevision = useRef(0);
  const checking = useRef(false);

  const fetchUser = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    const revision = authRevision.current;
    try {
      const token = await getItem(AUTH_TOKEN_KEY);
      if (revision !== authRevision.current) return;
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      // This cache only unlocks this account's local data while offline.
      // Server operations still verify the token; it grants no server access.
      const cached = await getItem(AUTH_IDENTITY_KEY);
      if (revision !== authRevision.current) return;
      if (cached) {
        try {
          const identity = JSON.parse(cached);
          if (identity.token === token && typeof identity.user?.id === 'string') setUser(identity.user);
        } catch { /* Ignore an invalid optional identity cache. */ }
      }
      setIsLoading(false);

      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/local-auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (revision !== authRevision.current || await getItem(AUTH_TOKEN_KEY) !== token) return;

      if (res.ok && data.user) {
        setUser(data.user);
        await setItem(AUTH_IDENTITY_KEY, JSON.stringify({ token, user: data.user }));
      } else if (res.status === 401 || res.status === 403) {
        // Only an explicit authentication rejection invalidates a persisted
        // credential. Network errors and temporary 5xx responses are
        // retryable and must not log a valid client out.
        await deleteItem(AUTH_TOKEN_KEY);
        await deleteItem(AUTH_IDENTITY_KEY);
        setUser(null);
      }
    } catch {
      // Keep the previous identity and token through transient outages.
    } finally {
      checking.current = false;
      if (revision === authRevision.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUser();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void fetchUser();
    });
    const interval = setInterval(() => { void fetchUser(); }, 60_000);
    return () => { subscription.remove(); clearInterval(interval); };
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    authRevision.current += 1;
    const apiBase = getApiBaseUrl();
    if (!apiBase) throw new Error("API base URL not configured");

    const res = await fetch(`${apiBase}/api/local-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Login failed (${res.status})`);
    }

    if (data.token) {
      await setItem(AUTH_TOKEN_KEY, data.token);
      await setItem(AUTH_IDENTITY_KEY, JSON.stringify({ token: data.token, user: data.user }));
      setUser(data.user);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, username: string, displayName: string, birthday: string) => {
    authRevision.current += 1;
    const apiBase = getApiBaseUrl();
    if (!apiBase) throw new Error("API base URL not configured");

    const res = await fetch(`${apiBase}/api/local-auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username, displayName, birthday }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Registration failed (${res.status})`);
    }

    if (data.token) {
      await setItem(AUTH_TOKEN_KEY, data.token);
      await setItem(AUTH_IDENTITY_KEY, JSON.stringify({ token: data.token, user: data.user }));
      setUser(data.user);
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<string> => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) throw new Error("API base URL not configured");

    const res = await fetch(`${apiBase}/api/local-auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not send a reset link. Please try again.");
    return data.message || "If an EverPage account exists for that email, we sent a reset link.";
  }, []);

  const resetPassword = useCallback(async (token: string, newPassword: string): Promise<void> => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) throw new Error("API base URL not configured");

    const res = await fetch(`${apiBase}/api/local-auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not reset password. Please request a new link.");
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) throw new Error("API base URL not configured");
    const token = await getItem(AUTH_TOKEN_KEY);
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(`${apiBase}/api/local-auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Password change failed (${res.status})`);
    }
  }, []);

  const logout = useCallback(async () => {
    authRevision.current += 1;
    try {
      const token = await getItem(AUTH_TOKEN_KEY);
      if (token) {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/api/local-auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // ignore
    } finally {
      await deleteItem(AUTH_TOKEN_KEY);
      await deleteItem(AUTH_IDENTITY_KEY);
      setUser(null);
    }
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    authRevision.current += 1;
    const apiBase = getApiBaseUrl();
    if (!apiBase) throw new Error("API base URL not configured");
    const token = await getItem(AUTH_TOKEN_KEY);
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(`${apiBase}/api/local-auth/account`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Delete failed (${res.status})`);
    }

    await deleteItem(AUTH_TOKEN_KEY);
    await deleteItem(AUTH_IDENTITY_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        requestPasswordReset,
        resetPassword,
        logout,
        changePassword,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
