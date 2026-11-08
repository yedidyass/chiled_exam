import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { EXAM_STATUSES, EXAM_TYPES } from '../../shared/types';
import type { Exam, ExamStatus, ExamType, Snapshot } from '../../shared/types';
import type { Actions } from '../App';
import { addDays, formatDay, startOfWeek, todayISO } from '../dates';
import { STATUS_LABEL, TYPE_LABEL } from '../labels';
import Sheet from './Sheet';

export interface ExamDraft {
  exam?: Exam;
  date?: string;
  childId?: string;
}

export default function ExamForm({ snap, draft, actions, onClose }: { snap: Snapshot; draft: ExamDraft; actions: Actions; onClose: () => void }) {
  const editing = draft.exam;
  const today = todayISO();
  const [childId, setChildId] = useState(editing?.child_id ?? draft.childId ?? (snap.children.length === 1 ? snap.children[0].id : ''));
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [date, setDate] = useState(editing?.date ?? draft.date ?? addDays(today, 1));
  const [type, setType] = useState<ExamType>(editing?.type ?? 'exam');
  const [topics, setTopics] = useState(editing?.topics ?? '');
  const [status, setStatus] = useState<ExamStatus>(editing?.status ?? 'none');
  const [score, setScore] = useState(editing?.score?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // השלמה אוטומטית: מקצועות של הילד שנבחר קודם, ואחר כך של כולם.
  const subjects = useMemo(() => {
    const mine = snap.exams.filter((e) => e.child_id === childId).map((e) => e.subject);
    return [...new Set([...mine, ...snap.exams.map((e) => e.subject)])];
  }, [snap.exams, childId]);

  const quickDates = [
    { label: 'מחר', value: addDays(today, 1) },
    { label: 'מחרתיים', value: addDays(today, 2) },
    { label: 'שבוע הבא', value: addDays(startOfWeek(today), 7) },
  ];

  const isPast = date < today;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!childId) return setErr('בחרו ילד');
    if (!subject.trim()) return setErr('מה המקצוע?');
    if (!date) return setErr('בחרו תאריך');
    const s = score.trim() === '' ? null : Number(score);
    if (s !== null && (!Number.isFinite(s) || s < 0 || s > 1000)) return setErr('ציון לא תקין');
    setBusy(true);
    const ok = await actions.saveExam(editing?.id ?? null, {
      child_id: childId,
      subject: subject.trim(),
      date,
      type,
      topics: topics.trim(),
      status,
      score: s,
    });
    setBusy(false);
    if (ok) onClose();
  }

  async function remove() {
    if (!editing || !confirm('למחוק את המבחן?')) return;
    setBusy(true);
    const ok = await actions.deleteExam(editing.id);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet title={editing ? 'עריכת מבחן' : 'מבחן חדש'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="field">
          <span className="label">של מי?</span>
          <div className="kid-pick">
            {snap.children.map((k) => (
              <button
                type="button"
                key={k.id}
                className={'kid-opt' + (childId === k.id ? ' on' : '')}
                style={{ ['--kid' as string]: k.color }}
                onClick={() => setChildId(k.id)}
              >
                <span className="kid-emoji">{k.emoji || k.name.slice(0, 1)}</span>
                {k.name}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="label">מקצוע</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            list="subjects"
            placeholder="מתמטיקה, אנגלית…"
            maxLength={60}
            autoFocus={!editing}
          />
          <datalist id="subjects">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>

        <div className="field">
          <span className="label">מתי?</span>
          <div className="chips tight">
            {quickDates.map((q) => (
              <button type="button" key={q.label} className={'chip' + (date === q.value ? ' on' : '')} onClick={() => setDate(q.value)}>
                {q.label}
              </button>
            ))}
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {date && <span className="hint">{formatDay(date)}</span>}
        </div>

        <div className="field">
          <span className="label">סוג</span>
          <div className="segmented">
            {EXAM_TYPES.map((t) => (
              <button type="button" key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="label">חומר למבחן</span>
          <textarea value={topics} onChange={(e) => setTopics(e.target.value)} rows={3} maxLength={2000} placeholder="פרקים, עמודים, נושאים" />
        </label>

        {editing && !isPast && (
          <div className="field">
            <span className="label">מוכנות</span>
            <div className="segmented">
              {EXAM_STATUSES.map((s) => (
                <button type="button" key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {(editing || isPast) && (
          <label className="field">
            <span className="label">ציון</span>
            <input type="number" inputMode="decimal" min={0} max={1000} step="any" value={score} onChange={(e) => setScore(e.target.value)} placeholder="—" />
          </label>
        )}

        {err && <p className="error">{err}</p>}

        <div className="form-actions">
          <button className="btn primary" disabled={busy}>
            {editing ? 'שמירה' : 'הוספה'}
          </button>
          {editing && (
            <button type="button" className="btn danger-ghost" onClick={remove} disabled={busy}>
              מחיקה
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
