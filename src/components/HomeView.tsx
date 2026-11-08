import { useState } from 'react';
import type { Exam, Snapshot } from '../../shared/types';
import type { Actions } from '../App';
import { addDays, daysUntil, startOfWeek, todayISO } from '../dates';
import ExamCard from './ExamCard';
import KidFilter from './KidFilter';

interface Group {
  key: string;
  title: string;
  exams: Exam[];
}

function groupExams(exams: Exam[]): Group[] {
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(startOfWeek(today), 6);
  const nextWeekEnd = addDays(weekEnd, 7);
  const groups: Group[] = [
    { key: 'pending', title: 'עבר — ממתינים לציון', exams: [] },
    { key: 'today', title: 'היום', exams: [] },
    { key: 'tomorrow', title: 'מחר', exams: [] },
    { key: 'week', title: 'עוד השבוע', exams: [] },
    { key: 'next', title: 'שבוע הבא', exams: [] },
    { key: 'later', title: 'בהמשך', exams: [] },
  ];
  const by = Object.fromEntries(groups.map((g) => [g.key, g]));
  for (const e of exams) {
    if (e.date < today) {
      if (e.score === null && daysUntil(e.date) >= -30) by.pending.exams.push(e);
    } else if (e.date === today) by.today.exams.push(e);
    else if (e.date === tomorrow) by.tomorrow.exams.push(e);
    else if (e.date <= weekEnd) by.week.exams.push(e);
    else if (e.date <= nextWeekEnd) by.next.exams.push(e);
    else by.later.exams.push(e);
  }
  return groups.filter((g) => g.exams.length);
}

export default function HomeView({ snap, actions, onGoKids }: { snap: Snapshot; actions: Actions; onGoKids: () => void }) {
  const [kid, setKid] = useState<string | null>(null);
  const kids = new Map(snap.children.map((c) => [c.id, c]));

  if (snap.children.length === 0) {
    return (
      <div className="empty">
        <p>עוד לא הוספתם ילדים.</p>
        <button className="btn" onClick={onGoKids}>
          הוספת ילדים
        </button>
      </div>
    );
  }

  const filtered = kid ? snap.exams.filter((e) => e.child_id === kid) : snap.exams;
  const groups = groupExams(filtered);
  const today = todayISO();
  const weekEnd = addDays(startOfWeek(today), 6);
  const thisWeek = filtered.filter((e) => e.date >= today && e.date <= weekEnd);
  const kidsThisWeek = new Set(thisWeek.map((e) => e.child_id)).size;

  return (
    <>
      <KidFilter kids={snap.children} value={kid} onChange={setKid} />
      <div className="summary">
        {thisWeek.length === 0 ? (
          <span>אין מבחנים השבוע 🎉</span>
        ) : (
          <span>
            השבוע: <b>{thisWeek.length}</b> {thisWeek.length === 1 ? 'מבחן' : 'מבחנים'}
            {!kid && kidsThisWeek > 1 && (
              <>
                {' '}
                ל-<b>{kidsThisWeek}</b> ילדים
              </>
            )}
          </span>
        )}
      </div>
      {groups.length === 0 && (
        <div className="empty">
          <p>אין מבחנים קרובים.</p>
          <p className="muted">לחצו על + כדי להוסיף מבחן.</p>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.key} className={'group g-' + g.key}>
          <h3>{g.title}</h3>
          {g.exams.map((e) => (
            <ExamCard key={e.id} exam={e} child={kids.get(e.child_id)} onClick={() => actions.openExam({ exam: e })} />
          ))}
        </section>
      ))}
    </>
  );
}
