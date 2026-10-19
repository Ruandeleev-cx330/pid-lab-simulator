import type { PidGains } from '../controllers/pid-controller';
import type { SessionResult } from '../state/session';

interface Props {
  result: SessionResult;
  initialGains: PidGains | null;
  decimals: number;
  outputUnit: string;
  onNextRound: () => void;
  onRetry: () => void;
  onClose: () => void;
  onLobby: () => void;
}

export function ResultOverlay({ result, initialGains, decimals, outputUnit, onNextRound, onRetry, onClose, onLobby }: Props) {
  const success = result.status === 'success';
  const m = result.metrics;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="本轮结果">
      <div className="result-card">
        <div className={`result-head ${success ? 'success' : 'failed'}`}>
          <h2 className="result-title">
            <span aria-hidden>{success ? '✓' : '✕'}</span>
            {success ? '本轮达标' : '本轮未达标'}
          </h2>
          <p className="result-sub">
            {result.reason} · {result.detail}
          </p>
        </div>
        <div className="result-body">
          <div className="result-grid">
            <div className="result-cell">
              <div className="l">仿真用时</div>
              <div className="v">{result.time.toFixed(1)} s</div>
            </div>
            <div className="result-cell">
              <div className="l">稳态误差</div>
              <div className="v">
                {m.steadyStateError.toFixed(3)} {outputUnit}
              </div>
            </div>
            <div className="result-cell">
              <div className="l">最大超调</div>
              <div className="v">{m.overshootPct.toFixed(1)}%</div>
            </div>
            <div className="result-cell">
              <div className="l">调节时间</div>
              <div className="v">{m.settleTime === null ? '—' : `${m.settleTime.toFixed(1)} s`}</div>
            </div>
            <div className="result-cell">
              <div className="l">累计误差</div>
              <div className="v">{m.iae.toFixed(1)}</div>
            </div>
            <div className="result-cell">
              <div className="l">扰动次数</div>
              <div className="v">{m.disturbanceCount}</div>
            </div>
          </div>

          <table className="gain-table">
            <thead>
              <tr>
                <th>参数</th>
                <th>本轮起始</th>
                <th>最终</th>
              </tr>
            </thead>
            <tbody>
              {(['kp', 'ki', 'kd'] as const).map((k) => (
                <tr key={k}>
                  <td>{k.toUpperCase()}</td>
                  <td>{initialGains ? initialGains[k].toFixed(decimals) : '—'}</td>
                  <td>{result.gains[k].toFixed(decimals)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="pid-help" style={{ marginBottom: 4 }}>
            达标判定由仿真内核的实时数据计算，只要满足上方公开指标即视为合格；本平台不提供唯一的“标准答案”。
          </p>
        </div>
        <div className="result-foot">
          <button className="btn ghost" onClick={onLobby}>
            返回项目大厅
          </button>
          <button className="btn" onClick={onClose}>
            查看曲线
          </button>
          {success ? (
            <button className="btn primary" onClick={onNextRound} data-testid="btn-result-next">
              再来一轮
            </button>
          ) : (
            <button className="btn primary" onClick={onRetry} data-testid="btn-result-retry">
              重置并重试
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
