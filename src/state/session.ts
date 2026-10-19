import { ChallengeGenerationError, generateChallenge } from '../challenges/generator';
import { randomSeed } from '../challenges/rng';
import type { PidGains } from '../controllers/pid-controller';
import type { AppStore, HistoryEntry } from '../persistence/store';
import type { ChecklistItem } from '../projects/adapter';
import type {
  ChallengeInstance,
  Difficulty,
  ProjectAdapter,
  SuccessCriteria,
  Verdict
} from '../projects/types';
import { SimulationEngine, type DisturbanceEvent } from '../simulation/engine';
import { FixedStepScheduler } from '../simulation/scheduler';
import { SIM_DT } from '../simulation/types';
import type { MetricsSnapshot } from '../metrics/tracker';

export type ChallengeStatus = 'loading' | 'ready' | 'running' | 'paused' | 'success' | 'failed' | 'error';

export interface SessionEvent {
  id: number;
  simTime: number;
  wallTime: number;
  kind: 'param' | 'disturbance' | 'target' | 'status';
  text: string;
}

export interface SessionResult {
  status: 'success' | 'failed';
  reason: string;
  detail: string;
  time: number;
  gains: PidGains;
  metrics: MetricsSnapshot;
  target: number;
  challengeId: string;
  projectId: string;
  difficulty: Difficulty;
  disturbanceCount: number;
  completedAt: number;
}

export interface SessionSnapshot {
  version: number;
  status: ChallengeStatus;
  projectId: string;
  difficulty: Difficulty;
  challengeId: string | null;
  seed: number | null;
  target: number;
  gains: PidGains;
  /** Gains the round started with (for the "you started here" comparison). */
  initialGains: PidGains | null;
  time: number;
  measurement: number;
  error: number;
  control: number;
  saturated: boolean;
  metrics: MetricsSnapshot | null;
  telemetry: Record<string, number>;
  render: Record<string, number>;
  verdict: Verdict | null;
  criteria: SuccessCriteria | null;
  timeLimit: number;
  events: SessionEvent[];
  checklist: ChecklistItem[];
  disturbances: DisturbanceEvent[];
  stateDetails: Record<string, string>;
  result: SessionResult | null;
  message: string | null;
  speed: number;
  historyVersion: number;
}

export interface SessionOptions {
  project: ProjectAdapter;
  difficulty: Difficulty;
  seed?: number;
  store?: AppStore;
  /** Inject scheduler dependencies for tests. */
  schedulerDeps?: ConstructorParameters<typeof FixedStepScheduler>[2];
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class ChallengeSession {
  readonly project: ProjectAdapter;
  readonly difficulty: Difficulty;

  private readonly store?: AppStore;
  private readonly schedulerDeps?: SessionOptions['schedulerDeps'];
  private readonly listeners = new Set<() => void>();

  private challenge: ChallengeInstance | null = null;
  private engine: SimulationEngine | null = null;
  private scheduler: FixedStepScheduler | null = null;
  private gains: PidGains = { kp: 0, ki: 0, kd: 0 };
  private status: ChallengeStatus = 'loading';
  private verdict: Verdict | null = null;
  private result: SessionResult | null = null;
  private message: string | null = null;
  private events: SessionEvent[] = [];
  private eventSeq = 0;
  private speed: number;
  private version = 0;
  private snapshot: SessionSnapshot;
  private generation = 0;
  /** True once the scenario-injected (preset) disturbance has fired. */
  private autoApplied = false;
  private initPromise: Promise<void> = Promise.resolve();
  private destroyed = false;

  constructor(options: SessionOptions) {
    this.project = options.project;
    this.difficulty = options.difficulty;
    this.store = options.store;
    this.schedulerDeps = options.schedulerDeps;
    this.speed = options.store?.getSpeed(options.project.meta.id) ?? 1;
    this.snapshot = this.buildSnapshot();
    this.initPromise = this.load(options.seed ?? randomSeed());
  }

  /** Resolves when the initial challenge has been generated. */
  ready(): Promise<void> {
    return this.initPromise;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SessionSnapshot => this.snapshot;

  getHistory() {
    return this.engine?.history ?? null;
  }

  getEngine(): SimulationEngine | null {
    return this.engine;
  }

  private buildSnapshot(): SessionSnapshot {
    const challenge = this.challenge;
    const view = this.engine?.view() ?? null;
    return {
      version: this.version,
      status: this.status,
      projectId: this.project.meta.id,
      difficulty: this.difficulty,
      challengeId: challenge?.id ?? null,
      seed: challenge?.seed ?? null,
      target: view?.target ?? challenge?.target ?? 0,
      gains: { ...this.gains },
      initialGains: challenge ? { ...challenge.initialGains } : null,
      time: view?.time ?? 0,
      measurement: view?.measurement ?? 0,
      error: view?.error ?? 0,
      control: view?.control ?? 0,
      saturated: view?.saturated ?? false,
      metrics: view?.metrics ?? null,
      telemetry: view?.telemetry ?? {},
      render: view?.render ?? {},
      verdict: this.verdict,
      criteria: challenge?.criteria ?? null,
      timeLimit: challenge?.timeLimit ?? 0,
      events: this.events.slice(),
      checklist: view && challenge ? this.project.checklist(view, challenge) : [],
      disturbances: view?.disturbances ?? [],
      stateDetails: view ? this.project.describeState(view) : {},
      result: this.result,
      message: this.message,
      speed: this.speed,
      historyVersion: view?.historyVersion ?? 0
    };
  }

  private publish(): void {
    this.version += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private pushEvent(kind: SessionEvent['kind'], text: string): void {
    this.eventSeq += 1;
    this.events.push({
      id: this.eventSeq,
      simTime: this.engine?.getTime() ?? 0,
      wallTime: Date.now(),
      kind,
      text
    });
    if (this.events.length > 200) this.events = this.events.slice(-200);
  }

  // --------------------------------------------------------------- lifecycle

  private async load(seed: number): Promise<void> {
    const generation = ++this.generation;
    this.status = 'loading';
    this.message = null;
    this.publish();

    // Yield one macrotask so the loading state can paint before the (bounded but
    // potentially slow) solvability validation runs.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    if (this.destroyed || generation !== this.generation) return;

    try {
      const challenge = generateChallenge(this.project, this.difficulty, seed);
      if (this.destroyed || generation !== this.generation) return;
      this.challenge = challenge;
      this.gains = { ...challenge.initialGains };
      this.engine = this.project.createEngine(challenge, this.gains);
      this.events = [];
      this.eventSeq = 0;
      this.result = null;
      this.verdict = null;
      this.autoApplied = false;
      this.scheduler?.stop();
      this.scheduler = null;
      this.status = 'ready';
    } catch (error) {
      const detail =
        error instanceof ChallengeGenerationError
          ? `${error.message}（${error.diagnostics.slice(-2).join('；')}）`
          : error instanceof Error
            ? error.message
            : String(error);
      this.status = 'error';
      this.message = `挑战生成失败：${detail}`;
    }
    this.publish();
  }

  async nextRound(): Promise<void> {
    const previous = this.challenge?.initialGains;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const seed = randomSeed();
      if (seed === this.challenge?.seed) continue;
      await this.load(seed);
      if (this.status !== 'ready') return;
      const next = this.challenge?.initialGains;
      // Guarantee a genuinely new starting point.
      if (!previous || !next || next.kp !== previous.kp || next.ki !== previous.ki || next.kd !== previous.kd) {
        return;
      }
    }
    this.message = '无法生成与上一轮不同的初始参数，请重试';
    this.publish();
  }

  start(): void {
    if (!this.engine) return;
    if (this.status !== 'ready' && this.status !== 'paused') return;
    this.status = 'running';
    this.message = null;
    this.ensureScheduler().start();
    this.pushEvent('status', this.events.length === 0 ? '开始仿真' : '继续仿真');
    this.publish();
  }

  pause(): void {
    if (this.status !== 'running') return;
    this.scheduler?.stop();
    this.status = 'paused';
    this.pushEvent('status', '暂停仿真');
    this.publish();
  }

  /** Restore the initial plant state of the current challenge, keeping gains. */
  reset(): void {
    if (!this.challenge) return;
    this.scheduler?.stop();
    this.scheduler = null;
    this.engine = this.project.createEngine(this.challenge, this.gains);
    this.events = [];
    this.eventSeq = 0;
    this.result = null;
    this.verdict = null;
    this.autoApplied = false;
    this.message = null;
    this.status = 'ready';
    this.pushEvent('status', '重置实验：状态回到本轮初始条件，保留当前 PID 参数');
    this.publish();
  }

  destroy(): void {
    this.destroyed = true;
    this.generation += 1;
    this.scheduler?.stop();
    this.scheduler = null;
    this.listeners.clear();
  }

  // ------------------------------------------------------------------ tuning

  setGains(patch: Partial<PidGains>): { ok: boolean; message?: string } {
    if (this.status === 'success' || this.status === 'failed') {
      return { ok: false, message: '本轮已结束，请重置实验或开始下一轮' };
    }
    const limits = this.project.gainLimits;
    const next: PidGains = { ...this.gains };
    const changed: string[] = [];

    for (const key of ['kp', 'ki', 'kd'] as const) {
      const raw = patch[key];
      if (raw === undefined) continue;
      if (!Number.isFinite(raw)) {
        return { ok: false, message: `${key.toUpperCase()} 必须是有限数值` };
      }
      const range = limits[key];
      if (raw < range.min || raw > range.max) {
        return {
          ok: false,
          message: `${key.toUpperCase()} 超出允许范围 ${range.min} – ${range.max}`
        };
      }
      const rounded = Number(raw.toFixed(limits.decimals));
      if (rounded !== next[key]) {
        changed.push(`${key.toUpperCase()} ${next[key].toFixed(limits.decimals)} → ${rounded.toFixed(limits.decimals)}`);
        next[key] = rounded;
      }
    }

    if (changed.length === 0) return { ok: true };

    this.gains = next;
    this.engine?.setGains(next);
    this.pushEvent('param', changed.join('，'));
    this.publish();
    return { ok: true };
  }

  setTarget(value: number): { ok: boolean; message?: string } {
    if (!this.challenge || !this.engine) return { ok: false, message: '尚未初始化' };
    if (this.status !== 'ready' && this.status !== 'running' && this.status !== 'paused') {
      return { ok: false, message: '本轮已结束，无法修改目标' };
    }
    const plan = this.project.plans[this.difficulty];
    if (!Number.isFinite(value)) return { ok: false, message: '目标值必须是有限数值' };
    if (value < plan.targetRange[0] || value > plan.targetRange[1]) {
      return {
        ok: false,
        message: `目标值需在 ${plan.targetRange[0]} – ${plan.targetRange[1]} ${this.project.meta.outputUnit} 之间`
      };
    }
    const rounded = Number(value.toFixed(this.project.meta.outputDecimals));
    this.challenge.target = rounded;
    // Re-baseline: the settling window restarts, so a late target move cannot be
    // used to shortcut the success conditions.
    this.engine.setTarget(rounded);
    this.pushEvent('target', `目标值改为 ${rounded} ${this.project.meta.outputUnit}（评价基准已重置）`);
    this.publish();
    return { ok: true };
  }

  addDisturbance(): { ok: boolean; message?: string } {
    if (!this.challenge || !this.engine) return { ok: false, message: '尚未初始化' };
    if (this.status !== 'running') {
      return { ok: false, message: '只有仿真运行中才能施加扰动' };
    }
    const spec = this.challenge.disturbance;
    if (!spec) return { ok: false, message: '当前难度没有扰动配置' };
    if (this.engine.getTime() < this.challenge.criteria.minRunTime) {
      return { ok: false, message: `请等待运行满 ${this.challenge.criteria.minRunTime} s 后再施加扰动` };
    }
    const event = this.engine.addDisturbance(
      spec.label,
      spec.magnitude,
      spec.duration,
      spec.unit,
      spec.required
    );
    if (!event) return { ok: false, message: '扰动施加失败' };
    this.pushEvent(
      'disturbance',
      `施加${spec.label} ${spec.magnitude > 0 ? '+' : ''}${spec.magnitude} ${spec.unit}，持续 ${spec.duration} s`
    );
    this.publish();
    return { ok: true };
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.scheduler?.setSpeed(speed);
    this.store?.setSpeed(this.project.meta.id, speed);
    this.publish();
  }

  // -------------------------------------------------------------- simulation

  private ensureScheduler(): FixedStepScheduler {
    if (!this.scheduler) {
      this.scheduler = new FixedStepScheduler(
        {
          step: () => this.stepOnce(),
          onFrame: () => this.publish(),
          speed: this.speed,
          maxStepsPerFrame: 80
        },
        SIM_DT,
        this.schedulerDeps
      );
    }
    return this.scheduler;
  }

  /** One fixed physics step plus the verdict evaluation. */
  stepOnce(): boolean {
    if (this.status !== 'running' || !this.engine || !this.challenge) return false;

    this.engine.step();

    const spec = this.challenge.disturbance;
    if (spec && spec.autoAt !== undefined && !this.autoApplied && this.engine.getTime() >= spec.autoAt) {
      this.autoApplied = true;
      this.engine.addDisturbance(spec.label, spec.magnitude, spec.duration, spec.unit, spec.required);
      this.pushEvent(
        'disturbance',
        `预设扰动：${spec.label} ${spec.magnitude > 0 ? '+' : ''}${spec.magnitude} ${spec.unit}，持续 ${spec.duration} s`
      );
    }

    const safety = this.engine.safety();
    const view = this.engine.view();
    const verdict = this.project.evaluate(view, safety, this.challenge);
    this.verdict = verdict;

    if (verdict.status === 'success' || verdict.status === 'failed') {
      this.finish(verdict, view.metrics);
      return false;
    }
    return true;
  }

  private finish(verdict: Verdict, metrics: MetricsSnapshot): void {
    this.scheduler?.stop();
    this.status = verdict.status === 'success' ? 'success' : 'failed';
    const challenge = this.challenge;
    if (!challenge) return;

    this.result = {
      status: verdict.status === 'success' ? 'success' : 'failed',
      reason: verdict.reason,
      detail: verdict.detail,
      time: this.engine?.getTime() ?? 0,
      gains: { ...this.gains },
      metrics,
      target: this.engine?.getTarget() ?? challenge.target,
      challengeId: challenge.id,
      projectId: this.project.meta.id,
      difficulty: this.difficulty,
      disturbanceCount: metrics.disturbanceCount,
      completedAt: Date.now()
    };

    this.pushEvent('status', verdict.status === 'success' ? `达标：${verdict.detail}` : `失败：${verdict.reason}`);

    if (verdict.status === 'success' && this.store) {
      const entry: HistoryEntry = {
        challengeId: challenge.id,
        projectId: this.project.meta.id,
        difficulty: this.difficulty,
        target: challenge.target,
        gains: { ...this.gains },
        elapsed: this.result.time,
        overshootPct: metrics.overshootPct,
        settleTime: metrics.settleTime,
        iae: metrics.iae,
        completedAt: this.result.completedAt,
        configVersion: challenge.configVersion
      };
      this.store.addHistory(entry);
    }

    this.publish();
  }

  /** Test hook: advance the physics without the animation loop. */
  advanceForTest(steps: number): void {
    if (this.status !== 'running') return;
    for (let i = 0; i < steps; i += 1) {
      if (!this.stepOnce()) return;
    }
    this.publish();
  }

  /** Test hook: total simulated time is never derived from wall clock. */
  isSchedulerRunning(): boolean {
    return this.scheduler?.isRunning ?? false;
  }
}

export const realTimeNow = now;
