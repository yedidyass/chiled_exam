import { useState } from 'react';
import type { Snapshot } from '../../shared/types';
import type { Actions } from '../App';

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
            if (confirm('לנתק את המכשיר? כדאי לשמור קודם את קישור ההצטרפות.')) onLogout();
          }}
        >
          ניתוק
        </button>
      </section>
    </div>
  );
}
