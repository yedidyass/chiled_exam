import { useEffect, useState } from 'react';
import type { Snapshot } from '../../shared/types';
import type { Actions } from '../App';
import { ApiError } from '../api';
import { disablePush, enablePush, getPushState, testPush } from '../push';
import type { PushState } from '../push';

function NotificationsCard({ showToast }: { showToast: (m: string) => void }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setState, () => setState('unsupported'));
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'לא הצלחנו להפעיל התראות במכשיר הזה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>התראות לפני מבחנים</h3>
      <p className="muted">
        תזכורת בערב (18:00, בקיץ 19:00), יומיים ויום לפני כל מבחן, וסיכום שבועי ביום ראשון בבוקר. בשישי ובשבת לא נשלחות התראות.
      </p>
      {state === null && <p className="muted">בודק…</p>}
      {state === 'ios-install' && (
        <p>
          באייפון התראות עובדות רק מהאפליקציה המותקנת: בספארי, כפתור השיתוף ← "הוספה למסך הבית", ואז לפתוח מהאייקון ולהפעיל כאן.
        </p>
      )}
      {state === 'unsupported' && <p>הדפדפן הזה לא תומך בהתראות.</p>}
      {state === 'denied' && <p>ההתראות חסומות. אפשר לאשר אותן בהגדרות האתר בדפדפן ואז לחזור לכאן.</p>}
      {state === 'off' && (
        <button
          className="btn primary wide"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const s = await enablePush();
              setState(s);
              if (s === 'on') showToast('ההתראות הופעלו');
            })
          }
        >
          הפעלת התראות במכשיר הזה
        </button>
      )}
      {state === 'on' && (
        <div className="row">
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await testPush();
                showToast('נשלחה התראת בדיקה');
              })
            }
          >
            שליחת בדיקה
          </button>
          <button
            className="btn danger-ghost"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await disablePush();
                setState('off');
              })
            }
          >
            כיבוי
          </button>
        </div>
      )}
    </section>
  );
}

export default function SettingsView({
  snap,
  token,
  actions,
  onLogout,
  showToast,
}: {
  snap: Snapshot;
  token: string;
  actions: Actions;
  onLogout: () => void;
  showToast: (m: string) => void;
}) {
  const [name, setName] = useState(snap.family.name);
  const link = `${location.origin}/#join=${token}`;

  async function share() {
    const data = { title: 'מבחנים בבית', text: `הצטרפות למעקב המבחנים של ${snap.family.name}`, url: link };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        /* בוטל — נעתיק במקום */
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast('הקישור הועתק');
    } catch {
      prompt('העתיקו את הקישור:', link);
    }
  }

  return (
    <div className="settings">
      <section className="card">
        <h3>שם המשפחה</h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name.trim() !== snap.family.name) actions.renameFamily(name.trim());
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <button className="btn">שמירה</button>
        </form>
      </section>

      <NotificationsCard showToast={showToast} />

      <section className="card">
        <h3>שיתוף עם בן/בת הזוג</h3>
        <p className="muted">
          שלחו את הקישור. מי שפותח אותו רואה ועורך את אותם מבחנים. הקישור הוא המפתח למידע, לכן שתפו אותו רק עם מי שצריך.
        </p>
        <button className="btn primary wide" onClick={share}>
          שיתוף קישור הצטרפות
        </button>
      </section>

      <section className="card">
        <h3>התקנה בטלפון</h3>
        <p className="muted">
          <b>אייפון:</b> בספארי, כפתור השיתוף ואז "הוספה למסך הבית".
          <br />
          <b>אנדרואיד:</b> בכרום, תפריט ⋮ ואז "התקנת אפליקציה".
        </p>
      </section>

      <section className="card">
        <h3>ניתוק המכשיר</h3>
        <p className="muted">המידע לא נמחק. אפשר להתחבר שוב עם קישור ההצטרפות.</p>
        <button
          className="btn danger-ghost"
          onClick={() => {
            if (confirm('לנתק את המכשיר? כדאי לשמור קודם את קישור ההצטרפות.')) disablePush().catch(() => {}).finally(onLogout);
          }}
        >
          ניתוק
        </button>
      </section>
    </div>
  );
}
