export type ExamType = 'exam' | 'quiz' | 'assignment' | 'bagrut';
export type ExamStatus = 'none' | 'studying' | 'ready';

export const EXAM_TYPES: ExamType[] = ['exam', 'quiz', 'assignment', 'bagrut'];
export const EXAM_STATUSES: ExamStatus[] = ['none', 'studying', 'ready'];

export interface Family {
  id: string;
  name: string;
}

export interface Child {
  id: string;
  name: string;
  grade: string;
  color: string;
  emoji: string;
  sort_order: number;
  /** 0 = אין תמונה; אחרת גרסת התמונה (חותמת זמן) */
  photo_v: number;
}

export interface Exam {
  id: string;
  child_id: string;
  subject: string;
  date: string; // YYYY-MM-DD
  type: ExamType;
  topics: string;
  status: ExamStatus;
  score: number | null;
}

export interface Snapshot {
  family: Family;
  children: Child[];
  exams: Exam[];
}
