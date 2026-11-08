const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISO(new Date());

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** מספר הימים מהיום ועד התאריך (שלילי = עבר). */
export function daysUntil(iso: string, today = todayISO()): number {
  const [a, b] = [fromISO(today), fromISO(iso)];
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

export function countdown(days: number): string {
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  if (days === 2) return 'בעוד יומיים';
  if (days > 2) return `בעוד ${days} ימים`;
  if (days === -1) return 'אתמול';
  if (days === -2) return 'לפני יומיים';
  return `לפני ${-days} ימים`;
}

/** יום ראשון של השבוע (בישראל השבוע מתחיל ביום ראשון). */
export function startOfWeek(iso: string): string {
  return addDays(iso, -fromISO(iso).getDay());
}

const dayFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' });

export const formatDay = (iso: string) => dayFmt.format(fromISO(iso));
export const formatShort = (iso: string) => shortFmt.format(fromISO(iso));
export const formatMonth = (d: Date) => monthFmt.format(d);
