import type { Child } from '../../shared/types';
import { usePhoto } from '../photos';

/** תמונת הילד אם יש, אחרת הסמל או האות הראשונה. */
export default function KidAvatar({ kid, size = 40, src }: { kid?: Child; size?: number; src?: string | null }) {
  const stored = usePhoto(kid);
  const url = src === undefined ? stored : src;
  return (
    <span
      className="kid-badge"
      style={{ width: size, height: size, fontSize: size * 0.55, ['--kid' as string]: kid?.color ?? '#868e96' }}
      aria-hidden
    >
      {url ? <img src={url} alt="" /> : kid?.emoji || kid?.name.slice(0, 1)}
    </span>
  );
}
