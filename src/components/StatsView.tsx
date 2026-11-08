import type { Exam, Snapshot } from '../../shared/types';
import { formatShort } from '../dates';
import KidAvatar from './KidAvatar';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (n: number | null) => (n === null ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function StatsView({ snap }: { snap: Snapshot }) {
  const graded = snap.exams.filter((e): e is Exam & { score: number } => e.score !== null);

  if (graded.length === 0) {
    return (
      <div className="empty">
        <p>עוד אין ציונים.</p>
        <p className="muted">אחרי מבחן, פתחו אותו והוסיפו את הציון.</p>
      </div>
    );
  }

  return (
    <>
      {snap.children.map((k) => {
        const mine = graded.filter((e) => e.child_id === k.id).sort((a, b) => a.date.localeCompare(b.date));
        if (!mine.length) return null;
        const subjects = new Map<string, number[]>();
        for (const e of mine) subjects.set(e.subject, [...(subjects.get(e.subject) ?? []), e.score]);
        const recent = mine.slice(-8);
        const max = Math.max(100, ...recent.map((e) => e.score));
        return (
          <section key={k.id} className="stat-card" style={{ ['--kid' as string]: k.color }}>
            <div className="stat-head">
              <KidAvatar kid={k} />
              <div>
                <h3>{k.name}</h3>
                <span className="muted">{mine.length} ציונים</span>
              </div>
              <div className="stat-avg">
                <b>{fmt(avg(mine.map((e) => e.score)))}</b>
                <span className="muted">ממוצע</span>
              </div>
            </div>
            <div className="bars" aria-label="ציונים אחרונים">
              {recent.map((e) => (
                <div key={e.id} className="bar" title={`${e.subject} · ${formatShort(e.date)} · ${e.score}`}>
                  <span className="bar-val">{e.score}</span>
                  <span className="bar-fill" style={{ height: `${(e.score / max) * 100}%` }} />
                  <span className="bar-lbl">{e.subject.slice(0, 4)}</span>
                </div>
              ))}
            </div>
            <table className="subj-table">
              <tbody>
                {[...subjects.entries()]
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([s, xs]) => (
                    <tr key={s}>
                      <td>{s}</td>
                      <td className="muted">{xs.length}</td>
                      <td>
                        <b>{fmt(avg(xs))}</b>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
