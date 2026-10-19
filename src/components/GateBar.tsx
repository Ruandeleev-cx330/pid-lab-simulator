import type { SessionSnapshot } from '../state/session';

/**
 * Live success gates as a horizontal strip: the user always sees which published
 * condition is still missing, even on a 1366x768 screen.
 */
export function GateBar({ snapshot }: { snapshot: SessionSnapshot }) {
  const items = snapshot.checklist;
  const blocked = snapshot.verdict?.permanent;

  return (
    <div className="gates" data-testid="gates">
      <span className="gates-label">达标条件</span>
      {items.length === 0 && <span className="gate dim">开始仿真后显示</span>}
      {items.map((item) => (
        <span
          key={item.key}
          className={`gate ${item.ok ? 'ok' : item.blocked ? 'blocked' : ''}`}
          title={`${item.label}：${item.detail}`}
          data-testid={`check-${item.key}`}
        >
          <span className="g-icon">{item.ok ? '✓' : item.blocked ? '✕' : '○'}</span>
          <span className="g-name">{item.label}</span>
          <span className="g-val">{item.detail}</span>
        </span>
      ))}
      {blocked && <span className="gate blocked">本轮已无法达标 · 可重置后重试</span>}
    </div>
  );
}
