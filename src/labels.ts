import type { ExamStatus, ExamType } from '../shared/types';

export const TYPE_LABEL: Record<ExamType, string> = {
  exam: 'מבחן',
  quiz: 'בוחן',
  assignment: 'הגשה',
  bagrut: 'בגרות',
};

export const STATUS_LABEL: Record<ExamStatus, string> = {
  none: 'עוד לא התחיל',
  studying: 'לומד',
  ready: 'מוכן',
};

export const STATUS_ICON: Record<ExamStatus, string> = {
  none: '○',
  studying: '◐',
  ready: '●',
};

export const CHILD_COLORS = ['#e8590c', '#2f9e44', '#1c7ed6', '#ae3ec9', '#e03131', '#0c8599', '#f08c00', '#5f3dc4'];
export const CHILD_EMOJIS = ['🦁', '🐯', '🐻', '🦊', '🐼', '🐸', '🐵', '🦄', '🐙', '🚀', '⚽', '🎸', '⭐', '🌈'];
