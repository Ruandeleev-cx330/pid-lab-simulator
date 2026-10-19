import { useEffect, useState } from 'react';
import type { PidGains } from '../controllers/pid-controller';
import type { GainLimits, Range } from '../projects/types';
import type { ChallengeSession, SessionSnapshot } from '../state/session';

const KEYS: Array<'kp' | 'ki' | 'kd'> = ['kp', 'ki', 'kd'];
const LABELS: Record<'kp' | 'ki' | 'kd', { name: string; sub: string }> = {
  kp: { name: 'Kp', sub: '比例' },
  ki: { name: 'Ki', sub: '积分' },
  kd: { name: 'Kd', sub: '微分' }
};

interface RowProps {
  k: 'kp' | 'ki' | 'kd';
  value: number;
  range: Range;
  decimals: number;
  help: string;
  disabled: boolean;
  onCommit: (value: number) => { ok: boolean; message?: string };
}

function GainRow({ k, value, range, decimals, help, disabled, onCommit }: RowProps) {
  const [draft, setDraft] = useState(value.toFixed(decimals));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value.toFixed(decimals));
  }, [value, decimals]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    const result = onCommit(parsed);
    if (!result.ok) {
      setError(result.message ?? '输入无效');
      setDraft(value.toFixed(decimals));
      window.setTimeout(() => setError(null), 2600);
    } else {
      setError(null);
    }
  };

  return (
    <div className="pid-row">
      <div className="pid-head">
        <span className="pid-key">
          {LABELS[k].name}
          <span className="sub">{LABELS[k].sub}</span>
        </span>
        <input
          className={`pid-input${error ? ' invalid' : ''}`}
          value={draft}
          inputMode="decimal"
          aria-label={`${LABELS[k].name} 数值输入`}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit(draft);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'Escape') {
              setDraft(value.toFixed(decimals));
              setError(null);
            }
          }}
        />
      </div>
      <input
        className="pid-slider"
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        disabled={disabled}
        aria-label={`${LABELS[k].name} 滑块`}
        onChange={(e) => onCommit(Number(e.target.value))}
      />
      <div className="pid-range">
        <span>{range.min.toFixed(decimals)}</span>
        <span>{range.max.toFixed(decimals)}</span>
      </div>
      {error ? <div className="pid-error">{error}</div> : <div className="pid-help">{help}</div>}
    </div>
  );
}

interface Props {
  session: ChallengeSession;
  snapshot: SessionSnapshot;
  limits: GainLimits;
  help: { kp: string; ki: string; kd: string };
  onError: (message: string) => void;
}

export function PidPanel({ session, snapshot, limits, help, onError }: Props) {
  const locked = snapshot.status === 'success' || snapshot.status === 'failed' || snapshot.status === 'loading';
  const initial = snapshot.initialGains;

  const commit = (k: 'kp' | 'ki' | 'kd') => (value: number) => {
    const result = session.setGains({ [k]: value } as Partial<PidGains>);
    if (!result.ok && result.message) onError(result.message);
    return result;
  };

  return (
    <div className="panel" style={{ flex: '0 0 auto' }}>
      <div className="panel-head">
        <span className="panel-title">PID 参数</span>
        <span className="label" style={{ letterSpacing: 0, textTransform: 'none' }}>
          {locked ? '本轮已锁定' : '实时生效'}
        </span>
      </div>
      <div className="panel-body tight">
        {KEYS.map((k) => (
          <GainRow
            key={k}
            k={k}
            value={snapshot.gains[k]}
            range={limits[k]}
            decimals={limits.decimals}
            help={help[k]}
            disabled={locked}
            onCommit={commit(k)}
          />
        ))}
        {initial && (
          <div className="pid-help pid-start-hint" style={{ marginTop: 6 }}>
            本轮起始值 Kp {initial.kp.toFixed(limits.decimals)} · Ki {initial.ki.toFixed(limits.decimals)} · Kd{' '}
            {initial.kd.toFixed(limits.decimals)}
          </div>
        )}
      </div>
    </div>
  );
}
