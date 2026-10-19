import type { SessionEvent } from '../state/session';

export function EventLog({ events }: { events: SessionEvent[] }) {
  const items = events.slice(-40).reverse();
  return (
    <div className="panel" style={{ flex: '1 1 auto', minHeight: 96 }}>
      <div className="panel-head">
        <span className="panel-title">操作与事件</span>
        <span className="label" style={{ letterSpacing: 0, textTransform: 'none' }}>
          {events.length} 条
        </span>
      </div>
      <div className="panel-body tight" style={{ overflowY: 'auto' }}>
        {items.length === 0 && <div className="empty-note">暂无记录。参数修改与扰动会记录在这里。</div>}
        <div className="log-list">
          {items.map((e) => (
            <div key={e.id} className={`log-item ${e.kind}`}>
              <span className="log-t">{e.simTime.toFixed(1)}s</span>
              <span className="log-text">{e.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
