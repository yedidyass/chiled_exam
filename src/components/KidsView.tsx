import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { Child, Snapshot } from '../../shared/types';
import type { Actions } from '../App';
import { todayISO } from '../dates';
import { CHILD_COLORS, CHILD_EMOJIS } from '../labels';
import Sheet from './Sheet';
import KidAvatar from './KidAvatar';
import { prepareImage } from '../photos';

function KidForm({ kid, snap, actions, onClose }: { kid: Child | null; snap: Snapshot; actions: Actions; onClose: () => void }) {
  const used = new Set(snap.children.map((c) => c.color));
  const [name, setName] = useState(kid?.name ?? '');
  const [grade, setGrade] = useState(kid?.grade ?? '');
  const [color, setColor] = useState(kid?.color ?? CHILD_COLORS.find((c) => !used.has(c)) ?? CHILD_COLORS[0]);
  const [emoji, setEmoji] = useState(kid?.emoji ?? CHILD_EMOJIS[snap.children.length % CHILD_EMOJIS.length]);
  const [busy, setBusy] = useState(false);
  // undefined = בלי שינוי, Blob = תמונה חדשה, null = הסרה
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState('');

  useEffect(() => {
    if (!(photo instanceof Blob)) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoErr('');
    try {
      setPhoto(await prepareImage(file));
    } catch {
      setPhotoErr('לא הצלחנו לקרוא את התמונה');
    }
  }

  const hasPhoto = photo instanceof Blob || (photo === undefined && !!kid?.photo_v);
  const previewKid: Child = { id: kid?.id ?? 'new', name: name || '?', grade, color, emoji, sort_order: 0, photo_v: kid?.photo_v ?? 0 };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const saved = await actions.saveChild(kid?.id ?? null, {
      name: name.trim(),
      grade: grade.trim(),
      color,
      emoji,
      sort_order: kid?.sort_order ?? snap.children.length,
    });
    const ok = saved && (photo === undefined || (await actions.setChildPhoto(saved.id, photo)));
    setBusy(false);
    if (ok) onClose();
  }

  async function remove() {
    if (!kid) return;
    const n = snap.exams.filter((e) => e.child_id === kid.id).length;
    if (!confirm(`למחוק את ${kid.name}${n ? ` ואת ${n} המבחנים שלו` : ''}?`)) return;
    setBusy(true);
    const ok = await actions.deleteChild(kid.id);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet title={kid ? `עריכת ${kid.name}` : 'ילד חדש'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <span className="label">תמונה</span>
          <div className="photo-field">
            <KidAvatar kid={previewKid} size={84} src={photo === undefined ? undefined : preview} />
            <div className="photo-actions">
              <span className="btn file-btn">
                {hasPhoto ? 'החלפת תמונה' : 'העלאת תמונה'}
                <input type="file" accept="image/*" onChange={pick} aria-label="בחירת תמונה" />
              </span>
              {hasPhoto && (
                <button type="button" className="btn danger-ghost" onClick={() => setPhoto(null)}>
                  הסרת תמונה
                </button>
              )}
            </div>
          </div>
          {photoErr && <p className="error">{photoErr}</p>}
        </div>
        <label className="field">
          <span className="label">שם</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus={!kid} required />
        </label>
        <label className="field">
          <span className="label">כיתה</span>
          <input value={grade} onChange={(e) => setGrade(e.target.value)} maxLength={20} placeholder="למשל ה׳2" />
        </label>
        <div className="field">
          <span className="label">צבע</span>
          <div className="swatches">
            {CHILD_COLORS.map((c) => (
              <button type="button" key={c} className={'swatch' + (color === c ? ' on' : '')} style={{ background: c }} aria-label={c} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">סמל (כשאין תמונה)</span>
          <div className="emojis">
            {CHILD_EMOJIS.map((em) => (
              <button type="button" key={em} className={'emoji' + (emoji === em ? ' on' : '')} onClick={() => setEmoji(em)}>
                {em}
              </button>
            ))}
          </div>
        </div>
        <div className="form-actions">
          <button className="btn primary" disabled={busy}>
            שמירה
          </button>
          {kid && (
            <button type="button" className="btn danger-ghost" onClick={remove} disabled={busy}>
              מחיקה
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

export default function KidsView({ snap, actions }: { snap: Snapshot; actions: Actions }) {
  const [editing, setEditing] = useState<Child | null | undefined>(undefined);
  const today = todayISO();

  return (
    <>
      {snap.children.length === 0 && (
        <div className="empty">
          <p>בואו נוסיף את הילדים.</p>
          <p className="muted">לכל ילד צבע משלו, כדי שתזהו מיד של מי המבחן.</p>
        </div>
      )}
      <div className="kid-list">
        {snap.children.map((k) => {
          const upcoming = snap.exams.filter((e) => e.child_id === k.id && e.date >= today).length;
          return (
            <button key={k.id} className="kid-row" style={{ ['--kid' as string]: k.color }} onClick={() => setEditing(k)}>
              <KidAvatar kid={k} size={48} />
              <span className="exam-main">
                <span className="exam-title">{k.name}</span>
                <span className="exam-sub">{k.grade ? `כיתה ${k.grade}` : 'כיתה לא הוגדרה'}</span>
              </span>
              <span className="muted">{upcoming ? `${upcoming} קרובים` : ''}</span>
            </button>
          );
        })}
      </div>
      <button className="btn primary wide" onClick={() => setEditing(null)}>
        + הוספת ילד
      </button>
      {editing !== undefined && <KidForm kid={editing} snap={snap} actions={actions} onClose={() => setEditing(undefined)} />}
    </>
  );
}
