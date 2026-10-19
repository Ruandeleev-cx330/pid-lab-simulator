/**
 * Fixed step simulation scheduler.
 *
 * Wall clock time is only used to decide *how many* fixed steps to run; the
 * physics always advances by exactly SIM_DT. Rendering happens once per frame,
 * independent of the number of physics steps.
 */

export interface SchedulerOptions {
  /** One physics step. Return false to stop the loop (terminal state). */
  step: () => boolean;
  /** Called once per animation frame after the physics steps. */
  onFrame: () => void;
  speed: number;
  maxStepsPerFrame?: number;
}

export interface SchedulerDeps {
  now: () => number;
  requestFrame: (cb: (timestamp: number) => void) => number;
  cancelFrame: (id: number) => void;
}

const defaultDeps: SchedulerDeps = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  requestFrame: (cb) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(cb)
      : (setTimeout(() => cb(defaultDeps.now()), 16) as unknown as number),
  cancelFrame: (id) => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
    else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
  }
};

export class FixedStepScheduler {
  private readonly options: SchedulerOptions;
  private readonly deps: SchedulerDeps;
  private readonly dt: number;
  private readonly maxStepsPerFrame: number;
  private frameId: number | null = null;
  private lastTimestamp: number | null = null;
  private accumulator = 0;
  private speed: number;
  private running = false;
  /** Diagnostics: how many frames had to drop backlog. */
  droppedFrames = 0;

  constructor(options: SchedulerOptions, dt: number, deps: Partial<SchedulerDeps> = {}) {
    this.options = options;
    this.dt = dt;
    this.deps = { ...defaultDeps, ...deps };
    this.speed = Math.max(0.1, options.speed);
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? 60;
  }

  get isRunning(): boolean {
    return this.running;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(10, speed));
  }

  getSpeed(): number {
    return this.speed;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = null;
    this.accumulator = 0;
    this.frameId = this.deps.requestFrame(this.onFrameBound);
  }

  stop(): void {
    this.running = false;
    if (this.frameId !== null) {
      this.deps.cancelFrame(this.frameId);
      this.frameId = null;
    }
    this.lastTimestamp = null;
    this.accumulator = 0;
  }

  private readonly onFrameBound = (timestamp: number): void => {
    if (!this.running) return;

    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp;
    }
    const elapsedMs = Math.min(Math.max(0, timestamp - this.lastTimestamp), 250);
    this.lastTimestamp = timestamp;

    this.accumulator += (elapsedMs / 1000) * this.speed;

    // Integer budget with a tiny epsilon so 0.25 s / 0.01 s is 25 steps and not
    // 24 due to binary floating point.
    const due = Math.floor((this.accumulator + 1e-9) / this.dt);
    const budget = Math.min(due, this.maxStepsPerFrame);
    let alive = true;
    for (let i = 0; i < budget; i += 1) {
      alive = this.options.step();
      if (!alive) break;
    }
    this.accumulator = Math.max(0, this.accumulator - budget * this.dt);

    if (due > this.maxStepsPerFrame) {
      // The window was throttled (tab switch, heavy frame). Drop the backlog
      // instead of trying to catch up with an unbounded burst of steps.
      this.accumulator = 0;
      this.droppedFrames += 1;
    }

    this.options.onFrame();

    if (!alive) {
      this.stop();
      return;
    }
    this.frameId = this.deps.requestFrame(this.onFrameBound);
  };
}
