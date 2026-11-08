import type { Child, Exam } from '../../shared/types';
import { countdown, daysUntil, formatShort } from '../dates';
import { STATUS_ICON, STATUS_LABEL, TYPE_LABEL } from '../labels';
import KidAvatar from './KidAvatar';

export default function ExamCard({ exam, child, onClick }: { exam: Exam; child?: Child; onClick: () => void }) {
  const days = daysUntil(exam.date);
  const urgent = days >= 0 && days <= 1;
  return (
    <button className="exam-card" style={{ ['--kid' as string]: child?.color ?? '#868e96' }} onClick={onClick}>
      <KidAvatar kid={child} />
      <span className="exam-main">
        <span className="exam-title">
          {exam.subject}
          {exam.type !== 'exam' && <span className="type-tag">{TYPE_LABEL[exam.type]}</span>}
        </span>
        <span className="exam-sub">
          {child?.name} · {formatShort(exam.date)}
          {exam.topics && <> · {exam.topics.split('\n')[0]}</>}
        </span>
      </span>
      <span className="exam-side">
        {exam.score !== null ? (
          <span className="score">{exam.score}</span>
        ) : (
          <span className={'countdown' + (urgent ? ' urgent' : '')}>{countdown(days)}</span>
        )}
        {days >= 0 && exam.score === null && (
          <span className={'status s-' + exam.status} title={STATUS_LABEL[exam.status]}>
            {STATUS_ICON[exam.status]} {STATUS_LABEL[exam.status]}
          </span>
        )}
      </span>
    </button>
  );
}
