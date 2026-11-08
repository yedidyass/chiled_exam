import { useState } from 'react';
import type { Snapshot } from '../../shared/types';
import type { Actions } from '../App';
import { formatDay, formatMonth, toISO, todayISO } from '../dates';
import ExamCard from './ExamCard';
import KidFilter from './KidFilter';

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export default function CalendarView({ snap, actions }: { snap: Snapshot; actions: Actions }) {
  const today = todayISO();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(today);
  const [kid, setKid] = useState<string | null>(null);
  const kids = new Map(snap.children.map((c) => [c.id, c]));

  const exams = kid ? snap.exams.filter((e) => e.child_id === kid) : snap.exams;
  const byDate = new Map<string, typeof exams>();
  for (const e of exams) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  const first = new Date(month);
  first.setDate(1 - first.getDay());
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    cells.push(toISO(d));
  }
  // לא מציגים שורה שישית ריקה
  const weeks = cells.slice(35, 42).every((c) => Number(c.slice(5, 7)) !== month.getMonth() + 1) ? 5 : 6;

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const dayExams = byDate.get(selected) ?? [];

  return (
    <>
      <KidFilter kids={snap.children} value={kid} onChange={setKid} />
      <div className="cal-head">
        <button className="icon-btn" aria-label="החודש הקודם" onClick={() => shift(-1)}>
          ›
        </button>
        <h3>{formatMonth(month)}</h3>
        <button className="icon-btn" aria-label="החודש הבא" onClick={() => shift(1)}>
          ‹
        </button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-wd">
            {w}
          </div>
        ))}
        {cells.slice(0, weeks * 7).map((iso) => {
          const list = byDate.get(iso) ?? [];
          const distinctKids = new Set(list.map((e) => e.child_id)).size;
          const inMonth = Number(iso.slice(5, 7)) === month.getMonth() + 1;
          const cls = ['cal-day', inMonth ? '' : 'out', iso === today ? 'today' : '', iso === selected ? 'sel' : '', distinctKids > 1 ? 'busy' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <button key={iso} className={cls} onClick={() => setSelected(iso)} aria-label={`${formatDay(iso)}${list.length ? `, ${list.length} מבחנים` : ''}`}>
              <span className="num">{Number(iso.slice(8))}</span>
              <span className="dots">
                {list.slice(0, 4).map((e) => (
                  <i key={e.id} style={{ background: kids.get(e.child_id)?.color }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <section className="group">
        <h3 className="day-title">
          {formatDay(selected)}
          <button className="btn small" onClick={() => actions.openExam({ date: selected, childId: kid ?? undefined })}>
            + מבחן ביום הזה
          </button>
        </h3>
        {dayExams.length === 0 && <p className="muted">אין מבחנים ביום הזה.</p>}
        {dayExams.map((e) => (
          <ExamCard key={e.id} exam={e} child={kids.get(e.child_id)} onClick={() => actions.openExam({ exam: e })} />
        ))}
      </section>
    </>
  );
}
