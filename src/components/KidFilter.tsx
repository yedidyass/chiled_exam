import type { Child } from '../../shared/types';

export default function KidFilter({ kids, value, onChange }: { kids: Child[]; value: string | null; onChange: (id: string | null) => void }) {
  if (kids.length < 2) return null;
  return (
    <div className="chips" role="tablist">
      <button className={'chip' + (value === null ? ' on' : '')} onClick={() => onChange(null)}>
        כולם
      </button>
      {kids.map((k) => (
        <button
          key={k.id}
          className={'chip' + (value === k.id ? ' on' : '')}
          style={{ ['--kid' as string]: k.color }}
          onClick={() => onChange(value === k.id ? null : k.id)}
        >
          {k.emoji} {k.name}
        </button>
      ))}
    </div>
  );
}
