import type { SessionSnapshot } from '../state/session';
import { VIEW_REGISTRY } from '../visualization/views';

interface Props {
  snapshot: SessionSnapshot;
  outputLabel: string;
  outputUnit: string;
  decimals: number;
  controlUnit: string;
}

export function Stage({ snapshot, outputLabel, outputUnit, decimals, controlUnit }: Props) {
  const View = VIEW_REGISTRY[snapshot.projectId];
  return (
    <div className="panel stage">
      <div className="stage-badge">
        <span className={`status-pill ${snapshot.status}`}>
          <span className="dot" />
          {snapshot.status === 'running' ? '实时' : snapshot.status === 'paused' ? '暂停' : snapshot.status === 'ready' ? '待开始' : snapshot.status === 'success' ? '达标' : snapshot.status === 'failed' ? '失败' : '…'}
        </span>
        <span className="badge blue">目标 {snapshot.target.toFixed(decimals)} {outputUnit}</span>
        <span className="badge dim">
          {outputLabel} {snapshot.measurement.toFixed(decimals)} {outputUnit}
        </span>
      </div>
      <div className="stage-readout">
        <div className="readout-item">
          <span className="v">
            {snapshot.measurement.toFixed(decimals)}
          </span>
          <span className="u">{outputLabel} / {outputUnit}</span>
        </div>
        <div className="readout-item">
          <span className="v" style={{ color: '#1f6feb' }}>
            {snapshot.target.toFixed(decimals)}
          </span>
          <span className="u">目标</span>
        </div>
        <div className="readout-item">
          <span className="v">{snapshot.control.toFixed(2)}</span>
          <span className="u">控制量 / {controlUnit}</span>
        </div>
      </div>
      {View ? <View snapshot={snapshot} /> : <div className="empty-note">缺少动画渲染器</div>}
    </div>
  );
}
