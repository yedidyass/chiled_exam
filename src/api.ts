import type { Child, Exam, Family, Snapshot } from '../shared/types';

const TOKEN_KEY = 'ce_token';
const SNAP_KEY = 'ce_snapshot';

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* אחסון חסום — ממשיכים בלי */
  }
}

export const getToken = () => lsGet(TOKEN_KEY);
export const setToken = (t: string | null) => lsSet(TOKEN_KEY, t);

export function getCachedSnapshot(): Snapshot | null {
  const raw = lsGet(SNAP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}
export const cacheSnapshot = (s: Snapshot | null) => lsSet(SNAP_KEY, s ? JSON.stringify(s) : null);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(method: string, path: string, data?: unknown): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new ApiError(0, 'אין חיבור לאינטרנט');
  }
  if (!res.ok) {
    let msg = 'משהו השתבש, נסו שוב';
    if (res.status === 401) msg = 'קוד המשפחה לא תקין';
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type ChildInput = Omit<Child, 'id'>;
export type ExamInput = Omit<Exam, 'id'>;

export const api = {
  createFamily: (name: string) => req<{ token: string; family: Family }>('POST', '/family', { name }),
  me: () => req<Snapshot>('GET', '/me'),
  renameFamily: (name: string) => req<Family>('PUT', '/me', { name }),
  addChild: (c: ChildInput) => req<Child>('POST', '/children', c),
  updateChild: (id: string, c: ChildInput) => req<Child>('PUT', `/children/${id}`, c),
  deleteChild: (id: string) => req<void>('DELETE', `/children/${id}`),
  addExam: (e: ExamInput) => req<Exam>('POST', '/exams', e),
  updateExam: (id: string, e: ExamInput) => req<Exam>('PUT', `/exams/${id}`, e),
  deleteExam: (id: string) => req<void>('DELETE', `/exams/${id}`),
  pushKey: () => req<{ publicKey: string }>('GET', '/push/key'),
  pushSubscribe: (sub: PushSubscriptionJSON) => req<{ ok: true }>('POST', '/push/subscribe', sub),
  pushUnsubscribe: (endpoint: string) => req<void>('POST', '/push/unsubscribe', { endpoint }),
  pushTest: (endpoint: string) => req<{ status: number }>('POST', '/push/test', { endpoint }),
};
