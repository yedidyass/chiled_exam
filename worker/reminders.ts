import type { PushMessage } from './push';

export const TZ = 'Asia/Jerusalem';
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const TYPE_LABEL: Record<string, string> = { exam: 'מבחן', quiz: 'בוחן', assignment: 'הגשה', bagrut: 'בגרות' };

/** התאריך של היום בישראל (YYYY-MM-DD). */
export function israelToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekday = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay();

export interface ReminderExam {
  family_id: string;
  date: string;
  subject: string;
  type: string;
  status: string;
  child_name: string;
  emoji: string;
}

function dayLabel(date: string, today: string): string {
  if (date === addDays(today, 1)) return 'מחר';
  if (date === addDays(today, 2)) return 'מחרתיים';
  return `יום ${HE_DAYS[weekday(date)]}`;
}

function line(e: ReminderExam): string {
  const kind = e.type === 'exam' ? '' : ` (${TYPE_LABEL[e.type] ?? e.type})`;
  const ready = e.status === 'ready' ? ' ✓' : '';
  return `${e.emoji ? e.emoji + ' ' : ''}${e.child_name} – ${e.subject}${kind}${ready}`;
}

function bodyOf(groups: Map<string, ReminderExam[]>, today: string, withDay: boolean): string {
  const lines: string[] = [];
  for (const [date, list] of groups) {
    if (withDay) lines.push(`${dayLabel(date, today)}:`);
    for (const e of list) lines.push(withDay ? `  ${line(e)}` : line(e));
  }
  return lines.slice(0, 12).join('\n');
}

const plural = (n: number) => (n === 1 ? 'מבחן אחד' : `${n} מבחנים`);

/**
 * תזכורת ערב (א׳–ה׳): מבחנים של מחר ומחרתיים, כך שכל מבחן מקבל שתי תזכורות.
 * ביום חמישי התזכורת מכסה עד יום שני, כי בשישי ובשבת לא נשלחות התראות.
 */
export function dailyWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, 1), to: addDays(today, weekday(today) === 4 ? 4 : 2) };
}

export function dailyMessage(exams: ReminderExam[], today: string): PushMessage | null {
  if (!exams.length) return null;
  const groups = groupByDate(exams);
  const tomorrow = groups.get(addDays(today, 1));
  const onlyTomorrow = tomorrow && groups.size === 1;
  return {
    title: onlyTomorrow ? `מחר: ${plural(exams.length)}` : `מבחנים קרובים: ${plural(exams.length)}`,
    body: bodyOf(groups, today, !onlyTomorrow),
    tag: `daily-${today}`,
    url: '/',
  };
}

/** סיכום שבועי (יום ראשון בבוקר): כל המבחנים מהיום ועד שבת. */
export function weeklyWindow(today: string): { from: string; to: string } {
  return { from: today, to: addDays(today, 6 - weekday(today)) };
}

export function weeklyMessage(exams: ReminderExam[], today: string): PushMessage | null {
  if (!exams.length) return null;
  const groups = groupByDate(exams);
  const lines: string[] = [];
  for (const [date, list] of groups) {
    const label = date === today ? 'היום' : `${HE_DAYS[weekday(date)]}`;
    lines.push(`${label}: ${list.map((e) => `${e.emoji ? e.emoji + ' ' : ''}${e.child_name} ${e.subject}`).join(', ')}`);
  }
  const kids = new Set(exams.map((e) => e.child_name)).size;
  return {
    title: `השבוע: ${plural(exams.length)}${kids > 1 ? ` ל-${kids} ילדים` : ''}`,
    body: lines.slice(0, 8).join('\n'),
    tag: `weekly-${today}`,
    url: '/',
  };
}

function groupByDate(exams: ReminderExam[]): Map<string, ReminderExam[]> {
  const m = new Map<string, ReminderExam[]>();
  for (const e of [...exams].sort((a, b) => a.date.localeCompare(b.date))) m.set(e.date, [...(m.get(e.date) ?? []), e]);
  return m;
}
