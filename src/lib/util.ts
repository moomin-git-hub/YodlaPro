export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });

// --- tiny IndexedDB key-value store (falls back to localStorage) ---
let dbp: Promise<IDBDatabase> | null = null;
function idb() {
  if (!dbp)
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('yodla', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  return dbp;
}
export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => res(q.result as T);
      q.onerror = () => rej(q.error);
    });
  } catch {
    const v = localStorage.getItem('kv:' + key);
    return v ? JSON.parse(v) : undefined;
  }
}
export async function kvSet(key: string, val: unknown) {
  try {
    const db = await idb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    try { localStorage.setItem('kv:' + key, JSON.stringify(val)); } catch { /* quota */ }
  }
}
export async function kvDel(key: string) {
  try {
    const db = await idb();
    db.transaction('kv', 'readwrite').objectStore('kv').delete(key);
  } catch { localStorage.removeItem('kv:' + key); }
}

export const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } },
};

export function compressImage(file: File, max = 900, quality = 0.82): Promise<string> {
  return new Promise((res, rej) => {
    if (!file.type.startsWith('image/')) return rej(new Error('not-image'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => rej(new Error('bad-image'));
    img.src = url;
  });
}

export function download(name: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const readFileText = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); });

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export function csvEscape(s: string) { return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

export function parseDelimited(text: string): string[][] {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#')) ?? '';
  const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim()) && !row[0].startsWith('#')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim()) && !row[0].startsWith('#')) rows.push(row);
  return rows;
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

/** True when a key event is typed into a text field (input, textarea, select or a rich contenteditable editor). */
export function isTyping(e: Event) {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || !!el.closest?.('[contenteditable=""],[contenteditable="true"]');
}
