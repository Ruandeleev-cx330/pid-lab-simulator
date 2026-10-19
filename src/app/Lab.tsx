import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ProjectAdapter, Difficulty } from '../projects/types';
import type { AppStore } from '../persistence/store';
import { ChallengeSession } from '../state/session';
import { PidPanel } from '../components/PidPanel';
import { Toolbar } from '../components/Toolbar';
import { MetricsStrip } from '../components/MetricsStrip';
import { GateBar } from '../components/GateBar';
import { EventLog } from '../components/EventLog';
import { ResultOverlay } from '../components/ResultOverlay';
import { Stage } from '../components/Stage';
import { ResponseChart } from '../components/ResponseChart';
import { DIFFICULTY_LABELS } from '../projects/types';

const SPEEDS = [0.5, 1, 2, 5];

interface Props {
  project: ProjectAdapter;
  difficulty: Difficulty;
  store: AppStore;
  onExit: () => void;
}

export function Lab({ project, difficulty, store, onExit }: Props) {
  const [session] = useState(
    () => new ChallengeSession({ project, difficulty, store })
  );
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [notice, setNotice] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showControl, setShowControl] = useState(false);
  const [targetDraft, setTargetDraft] = useState('');

  const plan = project.plans[difficulty];
  const meta = project.meta;

  useEffect(() => {
    return () => session.destroy();
  }, [session]);

  useEffect(() => {
    if (snapshot.status === 'success' || snapshot.status === 'failed') setShowResult(true);
  }, [snapshot.status, snapshot.challengeId]);

  useEffect(() => {
    setTargetDraft(snapshot.target.toFixed(meta.outputDecimals));
  }, [snapshot.target, meta.outputDecimals]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(id);
  }, [notice]);

  const history = session.getHistory();

  const targetEditable =
    (snapshot.status === 'ready' || snapshot.status === 'running' || snapshot.status === 'paused') &&
    plan.targetRange[0] !== plan.targetRange[1];

  const applyTarget = () => {
    const result = session.setTarget(Number(targetDraft));
    if (!result.ok && result.message) setNotice(result.message);
  };

  return (
    <div className="lab">
      <div className="lab-col left" style={{ overflowY: 'auto' }}>
        <div className="panel" style={{ flex: '0 0 auto' }}>
          <div className="panel-head">
            <span className="panel-title">当前项目</span>
            <span className="badge blue">{DIFFICULTY_LABELS[difficulty]}</span>
          </div>
          <div className="panel-body tight">
            <h2 className="proj-name">{meta.name}</h2>
            <p className="proj-sub">{plan.label}</p>
            <div className="kv">
              <span className="k">目标值</span>
              {targetEditable ? (
                <span style={{ display: 'flex', gap: 5 }}>
                  <input
                    className="pid-input"
                    style={{ width: 78 }}
                    value={targetDraft}
                    aria-label="目标值"
                    onChange={(e) => setTargetDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyTarget();
                    }}
                  />
                  <button className="btn small" onClick={applyTarget}>
                    设定
                  </button>
                </span>
              ) : (
                <span className="v em">
                  {snapshot.target.toFixed(meta.outputDecimals)} {meta.outputUnit}
                </span>
              )}
            </div>
            <div className="kv">
              <span className="k">允许目标范围</span>
              <span className="v">
                {plan.targetRange[0]} – {plan.targetRange[1]} {meta.outputUnit}
              </span>
            </div>
            <div className="kv">
              <span className="k">挑战时限</span>
              <span className="v">{snapshot.timeLimit.toFixed(0)} s</span>
            </div>
            <div className="divider" />
            {Object.entries(snapshot.stateDetails).map(([k, v]) => (
              <div className="kv" key={k}>
                <span className="k">{k}</span>
                <span className="v">{v}</span>
              </div>
            ))}
            <div className="model-note">{meta.modelSummary}</div>
            <div className="pid-help" style={{ marginTop: 6 }}>
              {meta.controlHint}
            </div>
            {snapshot.disturbances.length > 0 && (
              <div className="pid-help" style={{ marginTop: 4, color: '#b45309' }}>
                已施加扰动 {snapshot.disturbances.length} 次
                {snapshot.disturbances
                  .slice(-1)
                  .map((d) => ` · ${d.label} ${d.magnitude > 0 ? '+' : ''}${d.magnitude} ${d.unit}`)}
              </div>
            )}
          </div>
        </div>

        <EventLog events={snapshot.events} />
      </div>

      <div className="lab-center">
        <Stage
          snapshot={snapshot}
          outputLabel={meta.outputLabel}
          outputUnit={meta.outputUnit}
          decimals={meta.outputDecimals}
          controlUnit={meta.controlUnit}
        />

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">响应曲线</span>
            <div className="chart-legend">
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: '#1f6feb' }} />
                目标
              </span>
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: '#0f766e', height: 2 }} />
                实际
              </span>
              <label className="legend-item" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={showControl} onChange={(e) => setShowControl(e.target.checked)} />
                控制量
              </label>
              <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`btn small ${snapshot.speed === s ? 'primary' : 'ghost'}`}
                  style={{ padding: '2px 6px' }}
                  onClick={() => session.setSpeed(s)}
                  title="仿真倍速：只改变每秒推进的仿真步数"
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <ResponseChart
            history={history}
            version={snapshot.historyVersion}
            target={snapshot.target}
            unit={meta.outputUnit}
            decimals={meta.outputDecimals}
            disturbances={snapshot.disturbances}
            showControl={showControl}
            controlUnit={meta.controlUnit}
          />
        </div>
      </div>

      <div className="lab-col right">
        <PidPanel
          session={session}
          snapshot={snapshot}
          limits={project.gainLimits}
          help={project.gainHelp}
          onError={setNotice}
        />
        <Toolbar
          session={session}
          snapshot={snapshot}
          hasDisturbance={Boolean(snapshot.criteria?.requireDisturbance || plan.disturbance)}
          onNotice={setNotice}
          onOpenResult={() => setShowResult(true)}
        />
        {snapshot.message && (
          <div className="panel" style={{ flex: '0 0 auto' }}>
            <div className="panel-body tight">
              <div className="pid-error">{snapshot.message}</div>
              {snapshot.status === 'error' && (
                <button className="btn small" style={{ marginTop: 6 }} onClick={() => void session.nextRound()}>
                  重新生成
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="lab-foot">
        <GateBar snapshot={snapshot} />
        <MetricsStrip
          snapshot={snapshot}
          outputUnit={meta.outputUnit}
          controlUnit={meta.controlUnit}
          decimals={meta.outputDecimals}
        />
      </div>

      {notice && <div className="toast">{notice}</div>}

      {showResult && snapshot.result && (
        <ResultOverlay
          result={snapshot.result}
          initialGains={snapshot.initialGains}
          decimals={project.gainLimits.decimals}
          outputUnit={meta.outputUnit}
          onClose={() => setShowResult(false)}
          onRetry={() => {
            setShowResult(false);
            session.reset();
          }}
          onNextRound={() => {
            setShowResult(false);
            void session.nextRound();
          }}
          onLobby={onExit}
        />
      )}
    </div>
  );
}
