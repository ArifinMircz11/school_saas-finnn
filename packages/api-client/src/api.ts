// Shared API client with automatic access-token attach & refresh-on-401.

export interface AuthUser {
  id: string; email: string; firstName: string; lastName: string;
  roles: string[]; permissions: string[]; schoolId: string | null;
  teacherId?: string; studentId?: string; parentId?: string; principalId?: string; avatarUrl?: string;
  school?: { id: string; name: string; logoUrl?: string; status: string } | null;
  [k: string]: unknown;
}

let apiBaseUrl = (import.meta.env.VITE_API_URL as string || (import.meta.env.DEV ? 'http://localhost:5000/api' : '')).replace(/\/$/, '');
export const setApiBase = (u: string) => { apiBaseUrl = u.replace(/\/$/, ''); };

const KEY_USER = 'saa_user';
const KEY_ACCESS = 'saa_access';
const KEY_REFRESH = 'saa_refresh';

export function storeSession(access: string, refresh: string, user: AuthUser) {
  localStorage.setItem(KEY_ACCESS, access);
  localStorage.setItem(KEY_REFRESH, refresh);
  localStorage.setItem(KEY_USER, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(KEY_ACCESS);
  localStorage.removeItem(KEY_REFRESH);
  localStorage.removeItem(KEY_USER);
}
export function getAccess(): string | null { return localStorage.getItem(KEY_ACCESS); }
export function getRefresh(): string | null { return localStorage.getItem(KEY_REFRESH); }
export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(KEY_USER);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUser; } catch { return null; }
}

export function hasRole(user: AuthUser | null, role: string): boolean {
  return !!user && user.roles.includes(role);
}
export function can(user: AuthUser | null, permission: string): boolean {
  return !!user && user.permissions.includes(permission);
}

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    const json = await res.json();
    if (json.success && json.data?.accessToken) {
      localStorage.setItem(KEY_ACCESS, json.data.accessToken);
      return true;
    }
    clearSession();
    return false;
  } catch { clearSession(); return false; }
}

export interface ApiResult<T> { success: boolean; message?: string; code?: string; status?: number; data: T; }

interface RequestOptions { method?: string; body?: unknown; file?: File; fileField?: string; }

async function single<T>(token: string | null, path: string, options: RequestOptions): Promise<ApiResult<T>> {
  const method = options.method || (options.body || options.file ? 'POST' : 'GET');
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.file) {
    const fd = new FormData();
    fd.append(options.fileField || 'document', options.file);
    if (options.body && typeof options.body === 'object') {
      Object.entries(options.body).forEach(([k, v]) => fd.append(k, String(v)));
    }
    body = fd;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const res = await fetch(`${apiBaseUrl}${path}`, { method, headers, body });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text }; }
  if (!res.ok) {
    return { success: false, message: json.message || `HTTP ${res.status}`, code: json.code, status: res.status, data: (json.details as T) || (null as T) };
  }
  return { success: true, status: res.status, data: (json.data ?? json) as T, message: json.message };
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  let attempt = await single<T>(getAccess(), path, options);
  if (attempt.status === 401 && attempt.code === 'TOKEN_EXPIRED') {
    if (await tryRefresh()) {
      attempt = await single<T>(getAccess(), path, options);
    }
  }
  return attempt;
}
