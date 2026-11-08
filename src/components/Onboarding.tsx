import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Snapshot } from '../../shared/types';
import { api, ApiError } from '../api';

export default function Onboarding({
  notice,
  onCreated,
  onJoin,
}: {
  notice?: string | null;
  onCreated: (token: string, s: Snapshot) => void;
  onJoin: (code: string) => void;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('join');
  // null = עוד לא ידוע (או אין חיבור) — מציגים את שתי האפשרויות, והשרת יכריע
  const [signupOpen, setSignupOpen] = useState<boolean | null>(null);

  useEffect(() => {
    api.config().then(
      (c) => {
        setSignupOpen(c.signupOpen);
        if (c.signupOpen) setMode('create');
      },
      () => setSignupOpen(null),
    );
  }, []);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const { token, family } = await api.createFamily(name.trim());
      onCreated(token, { family, children: [], exams: [] });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'משהו השתבש');
    } finally {
      setBusy(false);
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const m = code.trim().match(/(?:join=)?([A-Za-z0-9_-]{20,})\s*$/);
    if (!m) return setErr('הדביקו את הקישור או הקוד שקיבלתם');
    onJoin(m[1]);
  }

  return (
    <div className="onboarding">
      <img src="/icon.svg" alt="" width={88} height={88} />
      <h1>מבחנים בבית</h1>
      <p className="muted">כל המבחנים של כל הילדים, במקום אחד.</p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {signupOpen === false ? (
        <p className="muted small">יש לכם קישור או ברקוד מבן משפחה? הדביקו אותו כאן כדי להצטרף.</p>
      ) : (
        <div className="segmented">
          <button className={mode === 'create' ? 'on' : ''} onClick={() => (setMode('create'), setErr(''))}>
            משפחה חדשה
          </button>
          <button className={mode === 'join' ? 'on' : ''} onClick={() => (setMode('join'), setErr(''))}>
            הצטרפות
          </button>
        </div>
      )}

      {mode === 'create' && signupOpen !== false ? (
        <form className="form" onSubmit={create}>
          <label className="field">
            <span className="label">שם המשפחה</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="משפחת כהן" maxLength={60} autoFocus />
          </label>
          <button className="btn primary wide" disabled={busy}>
            יצירה
          </button>
        </form>
      ) : (
        <form className="form" onSubmit={join}>
          <label className="field">
            <span className="label">קישור או קוד הצטרפות</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" autoFocus />
          </label>
          <button className="btn primary wide">הצטרפות</button>
        </form>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
