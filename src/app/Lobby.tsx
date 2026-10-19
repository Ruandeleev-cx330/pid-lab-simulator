import { useState } from 'react';
import { PROJECTS } from '../projects/registry';
import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty, type ProjectAdapter } from '../projects/types';
import type { AppStore } from '../persistence/store';

function Thumb({ id }: { id: string }) {
  const common = { fill: 'none', stroke: '#5b6b7d', strokeWidth: 2.2, strokeLinecap: 'round' as const };
  switch (id) {
    case 'dc-motor':
      return (
        <svg viewBox="0 0 84 84" width="84" height="84" aria-hidden>
          <circle cx="42" cy="42" r="24" fill="#eef3f8" stroke="#5b6b7d" strokeWidth="2.2" />
          {[0, 60, 120].map((a) => (
            <line key={a} x1="42" y1="42" x2="42" y2="23" stroke="#5b6b7d" strokeWidth="3" strokeLinecap="round" transform={`rotate(${a} 42 42)`} />
          ))}
          <circle cx="42" cy="42" r="6" fill="#1f6feb" />
          <path d="M66 42 h 8" stroke="#9aa9b9" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'temperature':
      return (
        <svg viewBox="0 0 84 84" width="84" height="84" aria-hidden>
          <rect x="34" y="14" width="16" height="42" rx="8" fill="#eef3f8" stroke="#5b6b7d" strokeWidth="2.2" />
          <rect x="37" y="34" width="10" height="20" rx="5" fill="#e8590c" />
          <circle cx="42" cy="62" r="11" fill="#e8590c" stroke="#5b6b7d" strokeWidth="2.2" />
          <line x1="56" y1="24" x2="64" y2="24" stroke="#9aa9b9" strokeWidth="2" />
          <line x1="56" y1="34" x2="64" y2="34" stroke="#9aa9b9" strokeWidth="2" />
        </svg>
      );
    case 'liquid-level':
      return (
        <svg viewBox="0 0 84 84" width="84" height="84" aria-hidden>
          <rect x="20" y="14" width="44" height="56" rx="5" fill="#fbfdff" stroke="#5b6b7d" strokeWidth="2.2" />
          <rect x="23" y="42" width="38" height="25" rx="3" fill="#4dabf7" opacity="0.8" />
          <line x1="16" y1="36" x2="68" y2="36" stroke="#1f6feb" strokeWidth="2" strokeDasharray="4 3" />
        </svg>
      );
    case 'balancing-robot':
      return (
        <svg viewBox="0 0 84 84" width="84" height="84" aria-hidden>
          <g transform="rotate(8 42 60)">
            <rect x="32" y="20" width="20" height="40" rx="6" fill="#3d4c5c" />
            <circle cx="42" cy="16" r="6" fill="#5b6b7d" />
          </g>
          <circle cx="32" cy="64" r="9" fill="#eef3f8" stroke="#5b6b7d" strokeWidth="2.2" />
          <circle cx="52" cy="64" r="9" fill="#eef3f8" stroke="#5b6b7d" strokeWidth="2.2" />
          <line x1="12" y1="73" x2="72" y2="73" stroke="#c2cedc" strokeWidth="2" />
        </svg>
      );
    case 'inverted-pendulum':
      return (
        <svg viewBox="0 0 84 84" width="84" height="84" aria-hidden>
          <line x1="10" y1="66" x2="74" y2="66" stroke="#c2cedc" strokeWidth="2.2" />
          <rect x="30" y="52" width="26" height="12" rx="3" fill="#eef3f8" stroke="#5b6b7d" strokeWidth="2.2" />
          <circle cx="36" cy="65" r="4" fill="#9aa9b9" />
          <circle cx="51" cy="65" r="4" fill="#9aa9b9" />
          <line x1="43" y1="52" x2="52" y2="18" stroke="#25313d" strokeWidth="4" strokeLinecap="round" />
          <circle cx="52" cy="18" r="7" fill="#0f766e" />
        </svg>
      );
    default:
      return <svg {...common} viewBox="0 0 84 84" />;
  }
}

function bestFor(store: AppStore, projectId: string) {
  const all = store
    .getHistory(projectId)
    .slice()
    .sort((a, b) => b.completedAt - a.completedAt);
  return all[0];
}

function ProjectCard({
  project,
  store,
  onEnter
}: {
  project: ProjectAdapter;
  store: AppStore;
  onEnter: (difficulty: Difficulty) => void;
}) {
  const best = bestFor(store, project.meta.id);
  const [hover, setHover] = useState<Difficulty | null>(null);

  return (
    <article className="card" data-testid={`card-${project.meta.id}`}>
      <div className="card-top">
        <div className="card-thumb">
          <Thumb id={project.meta.id} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 className="card-name">{project.meta.name}</h3>
          <p className="card-tagline">{project.meta.tagline}</p>
          <p className="card-desc">{project.meta.description}</p>
        </div>
      </div>
      <div className="card-body">
        <div className="badge-row">
          {best ? (
            <span className="badge ok">
              最近达标 · {DIFFICULTY_LABELS[best.difficulty as Difficulty] ?? best.difficulty} · {best.elapsed.toFixed(0)} s
            </span>
          ) : (
            <span className="badge dim">尚无达标记录</span>
          )}
          <span className="badge dim">{project.meta.outputLabel} {project.meta.outputUnit}</span>
        </div>
        <div className="btn-row">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              className="btn small"
              style={{ flex: 1 }}
              onMouseEnter={() => setHover(d)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onEnter(d)}
              data-testid={`start-${project.meta.id}-${d}`}
            >
              {DIFFICULTY_LABELS[d]}
            </button>
          ))}
        </div>
        <div className="pid-help" style={{ minHeight: 28 }}>
          {hover
            ? project.plans[hover].description
            : `${project.plans.beginner.label} · ${project.plans.advanced.label}`}
        </div>
      </div>
      <div className="card-foot">
        <span className="hint">每轮随机生成初始 PID 参数，需要自行调参达标</span>
      </div>
    </article>
  );
}

export function Lobby({
  store,
  onEnter
}: {
  store: AppStore;
  onEnter: (projectId: string, difficulty: Difficulty) => void;
}) {
  const total = store.getHistory().length;
  const [exported, setExported] = useState<string | null>(null);

  const exportHistory = async () => {
    const payload = JSON.stringify(
      { app: 'PID Lab Simulator', version: 1, exportedAt: new Date().toISOString(), history: store.getHistory() },
      null,
      2
    );
    const bridge = (window as unknown as { pidLab?: { exportResults?: (json: string) => Promise<{ ok: boolean; path?: string }> } })
      .pidLab;
    if (bridge?.exportResults) {
      const result = await bridge.exportResults(payload);
      setExported(result.ok ? `已导出到 ${result.path ?? '所选位置'}` : '导出已取消');
    } else {
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pid-lab-history.json';
      a.click();
      URL.revokeObjectURL(url);
      setExported('已下载成绩文件');
    }
    window.setTimeout(() => setExported(null), 3000);
  };

  return (
    <div className="lobby">
      <div className="lobby-inner">
        <div className="lobby-hero">
          <h1 className="lobby-title">选择一个控制项目</h1>
          <p className="lobby-sub">
            每个项目都是一个真实运行的离散时间控制回路：设定值 → 误差 → PID → 执行器限幅 → 被控对象 → 反馈。初始
            Kp/Ki/Kd 由本轮随机生成，你需要通过曲线、动画和指标自行调参，直到满足全部公开的达标条件。
          </p>
          <div className="lobby-note">
            <span>●</span> 共 {PROJECTS.length} 个项目 · 3 个难度 · 已完成 {total} 次达标 · 全部计算在本地离线运行
          </div>
        </div>

        <div className="cards">
          {PROJECTS.map((p) => (
            <ProjectCard key={p.meta.id} project={p} store={store} onEnter={(d) => onEnter(p.meta.id, d)} />
          ))}
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn small" onClick={exportHistory} data-testid="btn-export">
            导出成绩记录（JSON）
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              store.clearHistory();
              setExported('成绩记录已清空');
              window.setTimeout(() => setExported(null), 2500);
            }}
          >
            清空记录
          </button>
          {exported && <span className="pid-help">{exported}</span>}
        </div>
      </div>
    </div>
  );
}
