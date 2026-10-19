import type { ChallengeSession, SessionSnapshot } from '../state/session';

interface Props {
  session: ChallengeSession;
  snapshot: SessionSnapshot;
  hasDisturbance: boolean;
  onNotice: (message: string) => void;
  onOpenResult: () => void;
}

export function Toolbar({ session, snapshot, hasDisturbance, onNotice, onOpenResult }: Props) {
  const { status } = snapshot;
  const finished = status === 'success' || status === 'failed';
  const canStart = status === 'ready' || status === 'paused';
  const loading = status === 'loading';

  return (
    <div className="panel" style={{ flex: '0 0 auto' }}>
      <div className="panel-head">
        <span className="panel-title">仿真控制</span>
        <span className={`status-pill ${status}`}>
          <span className="dot" />
          {
            {
              loading: '生成中',
              ready: '就绪',
              running: '运行中',
              paused: '已暂停',
              success: '已达标',
              failed: '本轮失败',
              error: '出错'
            }[status]
          }
        </span>
      </div>
      <div className="panel-body tight">
        <div className="btn-row grow">
          {status === 'running' ? (
            <button className="btn" onClick={() => session.pause()} data-testid="btn-pause">
              ❚❚ 暂停
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={!canStart}
              onClick={() => session.start()}
              data-testid="btn-start"
            >
              ▶ {status === 'paused' ? '继续' : '开始'}
            </button>
          )}
          <button
            className="btn"
            disabled={loading}
            onClick={() => session.reset()}
            data-testid="btn-reset"
            title="恢复本轮初始状态，保留当前 PID 参数"
          >
            ↺ 重置
          </button>
        </div>
        <div className="btn-row grow" style={{ marginTop: 6 }}>
          <button
            className="btn"
            disabled={status !== 'running' || !hasDisturbance}
            onClick={() => {
              const result = session.addDisturbance();
              if (!result.ok && result.message) onNotice(result.message);
            }}
            data-testid="btn-disturbance"
            title={hasDisturbance ? '在模型上施加一次外部扰动' : '当前难度未配置扰动场景，可在中/高级难度体验'}
          >
            ⚡ 施加扰动
          </button>
          <button className="btn" onClick={() => void session.nextRound()} data-testid="btn-next">
            ⤼ 下一轮
          </button>
        </div>
        {finished && (
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn" style={{ flex: 1 }} onClick={onOpenResult}>
              查看本轮结果
            </button>
          </div>
        )}
        <div className="pid-help toolbar-hint" style={{ marginTop: 7 }}>
          {status === 'ready' && '调整参数后点击开始，改动立即生效'}
          {status === 'running' && '运行中可直接调参，下一步生效'}
          {status === 'paused' && '已暂停：时间与曲线停止推进'}
          {status === 'success' && '本轮已达标，仿真已冻结'}
          {status === 'failed' && '本轮失败，可重置后重试'}
          {status === 'loading' && '正在生成并验证本轮挑战…'}
        </div>
      </div>
    </div>
  );
}
