import { useEffect, useState } from 'react';
import { getProject } from '../projects/registry';
import { DIFFICULTY_LABELS, type Difficulty } from '../projects/types';
import { AppStore } from '../persistence/store';
import { Lab } from './Lab';
import { Lobby } from './Lobby';

type Route = { name: 'lobby' } | { name: 'lab'; projectId: string; difficulty: Difficulty };

export function App() {
  const [store] = useState(() => new AppStore());
  const [route, setRoute] = useState<Route>({ name: 'lobby' });
  const [version, setVersion] = useState('1.0.0');

  useEffect(() => {
    const bridge = (window as unknown as { pidLab?: { getAppInfo?: () => Promise<{ version: string }> } }).pidLab;
    if (!bridge?.getAppInfo) return;
    void bridge
      .getAppInfo()
      .then((info) => {
        if (info?.version) setVersion(info.version);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">π</span>
          <span>PID Lab Simulator</span>
        </div>
        {route.name === 'lab' && (
          <>
            <span style={{ color: 'var(--border-strong)' }}>/</span>
            <span style={{ fontWeight: 600 }}>{getProject(route.projectId).meta.name}</span>
            <span className="badge blue">{DIFFICULTY_LABELS[route.difficulty]}</span>
            <button className="btn ghost small" onClick={() => setRoute({ name: 'lobby' })} data-testid="btn-back">
              ← 返回大厅
            </button>
          </>
        )}
        <div className="header-spacer" />
        <div className="header-meta">
          <span>本地离线仿真</span>
          <span>v{version}</span>
        </div>
      </header>

      {route.name === 'lobby' ? (
        <Lobby store={store} onEnter={(projectId, difficulty) => setRoute({ name: 'lab', projectId, difficulty })} />
      ) : (
        <Lab
          key={`${route.projectId}-${route.difficulty}`}
          project={getProject(route.projectId)}
          difficulty={route.difficulty}
          store={store}
          onExit={() => setRoute({ name: 'lobby' })}
        />
      )}
    </div>
  );
}
