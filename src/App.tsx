import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Child, Exam, Snapshot } from '../shared/types';
import { api, ApiError, cacheSnapshot, getCachedSnapshot, getToken, setToken } from './api';
import type { ChildInput, ExamInput } from './api';
import Onboarding from './components/Onboarding';
import HomeView from './components/HomeView';
import CalendarView from './components/CalendarView';
import StatsView from './components/StatsView';
import KidsView from './components/KidsView';
import SettingsView from './components/SettingsView';
import ExamForm from './components/ExamForm';
import { currentSubscription } from './push';
import type { ExamDraft } from './components/ExamForm';

type Tab = 'home' | 'calendar' | 'stats' | 'kids' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'קרובים', icon: '📋' },
  { id: 'calendar', label: 'לוח שנה', icon: '📅' },
  { id: 'stats', label: 'ציונים', icon: '📈' },
  { id: 'kids', label: 'ילדים', icon: '👦' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
];

export interface Actions {
  saveExam: (id: string | null, input: ExamInput) => Promise<boolean>;
  deleteExam: (id: string) => Promise<boolean>;
  saveChild: (id: string | null, input: ChildInput) => Promise<boolean>;
  deleteChild: (id: string) => Promise<boolean>;
  renameFamily: (name: string) => Promise<boolean>;
  openExam: (draft: ExamDraft) => void;
}

/** קוד הצטרפות מקישור שיתוף: https://.../#join=CODE */
function takeJoinCode(): string | null {
  const m = location.hash.match(/join=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname);
  return m[1];
}

export default function App() {
  const [token, setTok] = useState<string | null>(() => {
    const joined = takeJoinCode();
    if (joined) {
      setToken(joined);
      cacheSnapshot(null);
      return joined;
    }
    return getToken();
  });
  const [snap, setSnap] = useState<Snapshot | null>(() => (token ? getCachedSnapshot() : null));
  const [tab, setTab] = useState<Tab>('home');
  const [draft, setDraft] = useState<ExamDraft | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  const update = useCallback((fn: (s: Snapshot) => Snapshot) => {
    setSnap((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      cacheSnapshot(next);
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    cacheSnapshot(null);
    setTok(null);
    setSnap(null);
  }, []);

  const load = useCallback(async () => {
    if (!getToken()) return;
    try {
      const s = await api.me();
      cacheSnapshot(s);
      setSnap(s);
      setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        showToast('קוד המשפחה לא תקין');
        logout();
      } else setOffline(true);
    }
  }, [logout, showToast]);

  // מרענן את שיוך המנוי למשפחה (למשל אחרי הצטרפות מקישור או חידוש מנוי ע"י הדפדפן)
  useEffect(() => {
    if (!token) return;
    currentSubscription()
      .then((sub) => sub && api.pushSubscribe(sub.toJSON()))
      .catch(() => {});
  }, [token]);

  // טעינה ראשונית + רענון כשחוזרים לאפליקציה וכל דקה (סנכרון בין ההורים).
  useEffect(() => {
    if (!token) return;
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', load);
    const t = window.setInterval(() => document.visibilityState === 'visible' && load(), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', load);
      window.clearInterval(t);
    };
  }, [token, load]);

  const attempt = useCallback(
    async (fn: () => Promise<void>, okMsg?: string) => {
      try {
        await fn();
        if (okMsg) showToast(okMsg);
        return true;
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : 'משהו השתבש');
        return false;
      }
    },
    [showToast],
  );

  const actions: Actions = useMemo(
    () => ({
      saveExam: (id, input) =>
        attempt(async () => {
          const saved: Exam = id ? await api.updateExam(id, input) : await api.addExam(input);
          update((s) => ({
            ...s,
            exams: (id ? s.exams.map((x) => (x.id === id ? saved : x)) : [...s.exams, saved]).sort((a, b) =>
              a.date.localeCompare(b.date),
            ),
          }));
        }, id ? 'נשמר' : 'המבחן נוסף'),
      deleteExam: (id) =>
        attempt(async () => {
          await api.deleteExam(id);
          update((s) => ({ ...s, exams: s.exams.filter((x) => x.id !== id) }));
        }, 'נמחק'),
      saveChild: (id, input) =>
        attempt(async () => {
          const saved: Child = id ? await api.updateChild(id, input) : await api.addChild(input);
          update((s) => ({
            ...s,
            children: id ? s.children.map((x) => (x.id === id ? saved : x)) : [...s.children, saved],
          }));
        }),
      deleteChild: (id) =>
        attempt(async () => {
          await api.deleteChild(id);
          update((s) => ({
            ...s,
            children: s.children.filter((x) => x.id !== id),
            exams: s.exams.filter((x) => x.child_id !== id),
          }));
        }),
      renameFamily: (name) =>
        attempt(async () => {
          const f = await api.renameFamily(name);
          update((s) => ({ ...s, family: f }));
        }, 'נשמר'),
      openExam: (d) => setDraft(d),
    }),
    [attempt, update],
  );

  if (!token) {
    return (
      <Onboarding
        onCreated={(t, s) => {
          setToken(t);
          cacheSnapshot(s);
          setSnap(s);
          setTok(t);
          setTab('kids');
        }}
        onJoin={(code) => {
          setToken(code);
          setTok(code);
        }}
      />
    );
  }

  if (!snap) {
    return (
      <div className="center-screen">
        {offline ? (
          <>
            <p>אין חיבור לאינטרנט.</p>
            <button className="btn" onClick={load}>
              נסו שוב
            </button>
          </>
        ) : (
          <p className="muted">טוען…</p>
        )}
      </div>
    );
  }

  const noKids = snap.children.length === 0;

  return (
    <div className="app">
      <header className="topbar">
        <h1>{TABS.find((t) => t.id === tab)!.label}</h1>
        <span className="family-name">{snap.family.name}</span>
      </header>
      {offline && <div className="offline-bar">מצב לא מקוון — מוצג המידע האחרון שנשמר</div>}

      <main className="content">
        {tab === 'home' && <HomeView snap={snap} actions={actions} onGoKids={() => setTab('kids')} />}
        {tab === 'calendar' && <CalendarView snap={snap} actions={actions} />}
        {tab === 'stats' && <StatsView snap={snap} />}
        {tab === 'kids' && <KidsView snap={snap} actions={actions} />}
        {tab === 'settings' && <SettingsView snap={snap} token={token} actions={actions} onLogout={logout} showToast={showToast} />}
      </main>

      {!noKids && tab !== 'settings' && tab !== 'kids' && (
        <button className="fab" aria-label="הוספת מבחן" onClick={() => setDraft({})}>
          +
        </button>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {draft && <ExamForm snap={snap} draft={draft} actions={actions} onClose={() => setDraft(null)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
