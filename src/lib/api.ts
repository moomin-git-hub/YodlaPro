import { translate } from './i18n';
import { ls } from './util';

const RAW = import.meta.env.VITE_API_URL as string | undefined;
/** Set VITE_API_URL to your Render URL (or "/" when the server also hosts the app). Empty = local-only mode. */
export const cloudEnabled = !!RAW;
const BASE = (RAW ?? '').replace(/\/+$/, '');
const TOKEN = 'yodla:token';

export const getToken = () => ls.get<string | null>(TOKEN, null);
export const setToken = (t: string | null) => ls.set(TOKEN, t);

export class ApiError extends Error { constructor(msg: string, public status: number) { super(msg); } }

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; raw?: Blob; headers?: Record<string, string>; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  const tok = getToken();
  if (tok && opts.auth !== false) headers.Authorization = `Bearer ${tok}`;
  let body: BodyInit | undefined;
  if (opts.raw) { body = opts.raw; headers['Content-Type'] ||= opts.raw.type || 'application/octet-stream'; }
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
  let res: Response;
  try { res = await fetch(`${BASE}/api${path}`, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body }); }
  catch { throw new ApiError('offline', 0); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error === 'aiBusy' ? translate((['en', 'uz', 'ru'].includes(document.documentElement.lang) ? document.documentElement.lang : 'en') as 'en', 'aiBusy') : data?.error ?? `HTTP ${res.status}`, res.status);
  return data as T;
}

/** Upload a (compressed) image to Neon Object Storage via the server. Falls back to the data URL when offline/local. */
export async function storeImage(dataUrl: string): Promise<string> {
  if (!cloudEnabled || !getToken() || !dataUrl.startsWith('data:')) return dataUrl;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const r = await api<{ url: string }>('/images', { raw: blob });
    return r.url;
  } catch { return dataUrl; }
}
