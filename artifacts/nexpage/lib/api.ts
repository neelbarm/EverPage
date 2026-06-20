import { getItem } from '@/lib/storage';

const AUTH_TOKEN_KEY = 'auth_session_token';

export function getApiBase(): string {
  // Explicit override for local development (e.g. http://localhost:3001)
  const override = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
  if (override) return `${override.replace(/\/$/, '')}/api`;
  const domain = (process.env.EXPO_PUBLIC_DOMAIN ?? '').trim();
  if (domain) return `https://${domain}/api`;
  return '/api';
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let token: string | null = null;
  try { token = await getItem(AUTH_TOKEN_KEY); } catch {}
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };
  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}
