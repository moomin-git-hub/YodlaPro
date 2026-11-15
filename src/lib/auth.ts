import { cloudEnabled, api, setToken, getToken, ApiError } from './api';
import { ls, uid, isEmail } from './util';

export interface AuthUser { id: string; email: string; name: string; createdAt: number; mode: 'local' | 'cloud'; guest?: boolean }

interface LocalAccount { id: string; email: string; name: string; salt: string; hash: string; rsalt: string; rhash: string; createdAt: number; guest?: boolean }

const ACC = 'yodla:accounts';
const SES = 'yodla:session';
type Listener = (u: AuthUser | null) => void;
const listeners = new Set<Listener>();
let current: AuthUser | null = null;
export let recoveryMode = false;
let resetToken = '';
const CU = 'yodla:cloudUser';

const emit = (u: AuthUser | null) => { current = u; listeners.forEach((l) => l(u)); };
export const onAuth = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };
export const getUser = () => current;

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function pbkdf2(pw: string, salt: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120_000, hash: 'SHA-256' }, k, 256);
  return b64(bits);
}
const randSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)).buffer);
const accounts = () => ls.get<LocalAccount[]>(ACC, []);
const toUser = (a: LocalAccount): AuthUser => ({ id: a.id, email: a.email, name: a.name, createdAt: a.createdAt, mode: 'local', guest: a.guest });

export class AuthError extends Error {}

export function validatePassword(pw: string) {
  return pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

export async function initAuth(): Promise<AuthUser | null> {
  if (cloudEnabled) {
    const sp = new URLSearchParams(location.search);
    const rt = sp.get('reset');
    if (rt) { resetToken = rt; recoveryMode = true; history.replaceState(null, '', location.pathname + location.hash); }
    if (getToken()) {
      try {
        const r = await api<{ user: ServerUser }>('/auth/me');
        current = cloudUser(r.user); ls.set(CU, current); return current;
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) { current = ls.get<AuthUser | null>(CU, null); if (current) return current; }
        else { setToken(null); ls.set(CU, null); }
      }
    }
  }
  const sid = ls.get<string | null>(SES, null);
  const a = accounts().find((x) => x.id === sid);
  current = a ? toUser(a) : null;
  return current;
}

type ServerUser = { id: string; email: string; name: string; createdAt: number };
const cloudUser = (u: ServerUser): AuthUser => ({ ...u, mode: 'cloud' });
function cloudSession(r: { token: string; user: ServerUser }) {
  setToken(r.token);
  const u = cloudUser(r.user);
  ls.set(CU, u);
  emit(u);
  return u;
}
const toAuthError = (e: unknown) => new AuthError(e instanceof ApiError && e.status === 0 ? 'offlineErr' : (e as Error).message);

export async function signUp(email: string, password: string, name: string): Promise<{ user: AuthUser | null; recoveryCode?: string; confirm?: boolean }> {
  email = email.trim().toLowerCase();
  if (!isEmail(email)) throw new AuthError('invalidEmail');
  if (!validatePassword(password)) throw new AuthError('weakPassword');
  if (!name.trim()) throw new AuthError('nameRequired');
  if (cloudEnabled) {
    try { return { user: cloudSession(await api('/auth/signup', { body: { email, password, name: name.trim() }, auth: false })) }; }
    catch (e) { throw toAuthError(e); }
  }
  if (accounts().some((a) => a.email === email)) throw new AuthError('emailTaken');
  const salt = randSalt(), rsalt = randSalt();
  const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  const acc: LocalAccount = { id: uid(), email, name: name.trim(), salt, hash: await pbkdf2(password, salt), rsalt, rhash: await pbkdf2(code, rsalt), createdAt: Date.now() };
  ls.set(ACC, [...accounts(), acc]);
  return { user: toUser(acc), recoveryCode: code.slice(0, 3) + '-' + code.slice(3) };
}

/** Local mode: activate the session after the user has seen their recovery code. */
export function activateLocal(id: string) {
  const a = accounts().find((x) => x.id === id);
  if (!a) return;
  ls.set(SES, a.id);
  emit(toUser(a));
}

export async function signIn(email: string, password: string) {
  email = email.trim().toLowerCase();
  if (!isEmail(email)) throw new AuthError('invalidEmail');
  if (!password) throw new AuthError('passwordRequired');
  if (cloudEnabled) {
    try { return cloudSession(await api('/auth/login', { body: { email, password }, auth: false })); }
    catch (e) { throw toAuthError(e); }
  }
  const a = accounts().find((x) => x.email === email && !x.guest);
  if (!a || (await pbkdf2(password, a.salt)) !== a.hash) throw new AuthError('wrongCredentials');
  ls.set(SES, a.id);
  emit(toUser(a));
  return toUser(a);
}

export function continueAsGuest() {
  let a = accounts().find((x) => x.guest);
  if (!a) {
    a = { id: uid(), email: '', name: 'Guest', salt: '', hash: '', rsalt: '', rhash: '', createdAt: Date.now(), guest: true };
    ls.set(ACC, [...accounts(), a]);
  }
  ls.set(SES, a.id);
  emit(toUser(a));
}

export async function signOut() {
  if (current?.mode === 'cloud') {
    const { flush } = await import('./store');
    await flush().catch(() => {});
    setToken(null);
    ls.set(CU, null);
  }
  ls.set(SES, null);
  emit(null);
}

export async function requestReset(email: string) {
  if (!isEmail(email)) throw new AuthError('invalidEmail');
  if (!cloudEnabled) return;
  try { await api('/auth/forgot', { body: { email: email.trim(), redirect: location.origin + location.pathname }, auth: false }); }
  catch (e) { throw toAuthError(e); }
}

export async function resetWithCode(email: string, code: string, newPw: string) {
  if (!validatePassword(newPw)) throw new AuthError('weakPassword');
  const list = accounts();
  const a = list.find((x) => x.email === email.trim().toLowerCase() && !x.guest);
  const norm = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!a || (await pbkdf2(norm, a.rsalt)) !== a.rhash) throw new AuthError('wrongCode');
  a.salt = randSalt();
  a.hash = await pbkdf2(newPw, a.salt);
  ls.set(ACC, list);
}

export async function changePassword(newPw: string, oldPw?: string) {
  if (!validatePassword(newPw)) throw new AuthError('weakPassword');
  if (recoveryMode && resetToken) {
    try { await api('/auth/reset', { body: { token: resetToken, newPassword: newPw }, auth: false }); }
    catch (e) { throw toAuthError(e); }
    recoveryMode = false; resetToken = '';
    return;
  }
  if (current?.mode === 'cloud') {
    try { await api('/auth/password', { body: { oldPassword: oldPw ?? '', newPassword: newPw } }); }
    catch (e) { throw toAuthError(e); }
    return;
  }
  const list = accounts();
  const a = list.find((x) => x.id === current?.id);
  if (!a) throw new AuthError('notSignedIn');
  if ((await pbkdf2(oldPw ?? '', a.salt)) !== a.hash) throw new AuthError('wrongCredentials');
  a.salt = randSalt();
  a.hash = await pbkdf2(newPw, a.salt);
  ls.set(ACC, list);
}

export async function updateName(name: string) {
  if (!name.trim() || !current) throw new AuthError('nameRequired');
  if (current.mode === 'cloud') {
    try { await api('/auth/me', { method: 'PATCH', body: { name: name.trim() } }); } catch (e) { throw toAuthError(e); }
  } else {
    const list = accounts();
    const a = list.find((x) => x.id === current!.id);
    if (a) { a.name = name.trim(); ls.set(ACC, list); }
  }
  emit({ ...current, name: name.trim() });
}

export function clearRecovery() { recoveryMode = false; resetToken = ''; }

/** Turn the guest profile into a real local account, keeping its data. */
export async function upgradeGuest(email: string, password: string, name: string) {
  email = email.trim().toLowerCase();
  if (!isEmail(email)) throw new AuthError('invalidEmail');
  if (!validatePassword(password)) throw new AuthError('weakPassword');
  const list = accounts();
  if (list.some((a) => a.email === email)) throw new AuthError('emailTaken');
  const a = list.find((x) => x.id === current?.id && x.guest);
  if (!a) throw new AuthError('notSignedIn');
  const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  a.email = email; a.name = name.trim() || 'Learner'; a.guest = false;
  a.salt = randSalt(); a.hash = await pbkdf2(password, a.salt);
  a.rsalt = randSalt(); a.rhash = await pbkdf2(code, a.rsalt);
  ls.set(ACC, list);
  emit(toUser(a));
  return code.slice(0, 3) + '-' + code.slice(3);
}
