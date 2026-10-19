import type { SessionSnapshot } from '../state/session';

interface Props {
  snapshot: SessionSnapshot;
  outputUnit: string;
  controlUnit: string;
  decimals: number;
}

const num = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d);

export function MetricsStrip({ snapshot, outputUnit, controlUnit, decimals }: Props) {
  const m = snapshot.metrics;
  const overshootBad = m ? m.overshootPct > (snapshot.criteria?.maxOvershootPct ?? Infinity) : false;
  const iaeBad = m ? m.iae > (snapshot.criteria?.maxIAE ?? Infinity) : false;

  return (
    <div className="metrics-strip" data-testid="metrics-strip">
      <div className="metric" data-testid="metric-time">
        <span className="m-label">仿真时间</span>
        <span className="m-value">
          {num(snapshot.time, 2)}
          <span className="m-unit">s</span>
        </span>
      </div>
      <div className={`metric ${m && Math.abs(m.error) > m.band ? 'warn' : 'good'}`}>
        <span className="m-label">跟踪误差</span>
        <span className="m-value">
          {num(snapshot.error, decimals)}
          <span className="m-unit">{outputUnit}</span>
        </span>
      </div>
      <div className={`metric ${snapshot.saturated ? 'warn' : ''}`}>
        <span className="m-label">控制输出{snapshot.saturated ? ' · 饱和' : ''}</span>
        <span className="m-value">
          {num(snapshot.control, 2)}
          <span className="m-unit">{controlUnit}</span>
        </span>
      </div>
      <div className={`metric ${overshootBad ? 'bad' : ''}`}>
        <span className="m-label">超调</span>
        <span className="m-value">
          {num(m?.overshootPct, 1)}
          <span className="m-unit">%</span>
        </span>
      </div>
      <div className={`metric ${iaeBad ? 'bad' : ''}`}>
        <span className="m-label">累计误差 IAE</span>
        <span className="m-value">{num(m?.iae, 1)}</span>
      </div>
      <div className="metric">
        <span className="m-label">调节时间</span>
        <span className="m-value">
          {m?.settleTime === null || m?.settleTime === undefined ? '—' : m.settleTime.toFixed(1)}
          <span className="m-unit">s</span>
        </span>
      </div>
      <div className="metric">
        <span className="m-label">稳态误差</span>
        <span className="m-value">
          {num(m?.steadyStateError, decimals)}
          <span className="m-unit">{outputUnit}</span>
        </span>
      </div>
    </div>
  );
}
