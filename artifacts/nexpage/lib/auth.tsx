import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { Platform } from "react-native";
import { setItem, getItem, deleteItem } from "@/lib/storage";

const AUTH_TOKEN_KEY = "auth_session_token";

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
  register: (email: string, password: string, username: string, displayName: string) => Promise<void>;
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

  const fetchUser = useCallback(async () => {
    try {
      const token = await getItem(AUTH_TOKEN_KEY);
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/local-auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.user) {
        setUser(data.user);
      } else {
        await deleteItem(AUTH_TOKEN_KEY);
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
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
      setUser(data.user);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, username: string, displayName: string) => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) throw new Error("API base URL not configured");

    const res = await fetch(`${apiBase}/api/local-auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username, displayName }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Registration failed (${res.status})`);
    }

    if (data.token) {
      await setItem(AUTH_TOKEN_KEY, data.token);
      setUser(data.user);
    }
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
      setUser(null);
    }
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
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
