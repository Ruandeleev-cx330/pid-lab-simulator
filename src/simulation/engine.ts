import { PidController, type PidGains } from '../controllers/pid-controller';
import { HistoryBuffer } from '../metrics/history';
import { MetricsTracker, type MetricsConfig, type MetricsSnapshot } from '../metrics/tracker';
import type { PlantModel, SafetyEnvelope } from './types';
import { SIM_DT } from './types';

/**
 * Type erased plant access. The generic type safety lives in `createPlantDriver`
 * and every concrete model; above this line the engine only deals with numbers.
 */
export interface PlantDriver {
  measure(): number;
  step(u: number, dt: number, disturbance: number): void;
  telemetry(): Record<string, number>;
  render(): Record<string, number>;
  safety(): SafetyEnvelope<unknown>;
  isFinite(): boolean;
}

export function createPlantDriver<S>(plant: PlantModel<S>, initial: S): PlantDriver {
  let state = plant.clone(initial);
  return {
    measure: () => plant.measure(state),
    step: (u, dt, disturbance) => {
      state = plant.step(state, u, dt, disturbance);
    },
    telemetry: () => plant.telemetry(state),
    render: () => plant.render(state),
    safety: () => plant.safety(state),
    isFinite: () => plant.isFinite(state)
  };
}

export interface DisturbanceEvent {
  id: string;
  label: string;
  magnitude: number;
  unit: string;
  startTime: number;
  endTime: number;
}

export interface EngineFault {
  message: string;
  time: number;
}

export interface EngineView {
  time: number;
  measurement: number;
  target: number;
  control: number;
  error: number;
  saturated: boolean;
  metrics: MetricsSnapshot;
  telemetry: Record<string, number>;
  render: Record<string, number>;
  fault: EngineFault | null;
  disturbances: DisturbanceEvent[];
  historyVersion: number;
}

export interface EngineConfig {
  gains: PidGains;
  target: number;
  actuator: { min: number; max: number };
  derivativeFilterTau: number;
  metrics: MetricsConfig;
  dt?: number;
  historyCapacity?: number;
}

export class SimulationEngine {
  readonly dt: number;
  readonly history: HistoryBuffer;
  private readonly driver: PlantDriver;
  private readonly pid: PidController;
  private readonly tracker: MetricsTracker;
  private readonly disturbanceQueue: DisturbanceEvent[] = [];
  private fault: EngineFault | null = null;
  private target: number;
  private currentControl = 0;
  private currentSaturated = false;
  private time = 0;
  private disturbanceSeq = 0;

  constructor(driver: PlantDriver, config: EngineConfig) {
    this.dt = config.dt ?? SIM_DT;
    this.driver = driver;
    this.target = config.target;
    this.pid = new PidController({
      gains: config.gains,
      outputMin: config.actuator.min,
      outputMax: config.actuator.max,
      derivativeFilterTau: config.derivativeFilterTau
    });
    this.tracker = new MetricsTracker(config.metrics);
    this.history = new HistoryBuffer(config.historyCapacity);

    const y = driver.measure();
    this.pid.reset(y);
    this.tracker.reset(y, config.target);
    this.history.push(0, y, config.target, 0);
  }

  getTime(): number {
    return this.time;
  }

  getTarget(): number {
    return this.target;
  }

  getControl(): number {
    return this.currentControl;
  }

  getFault(): EngineFault | null {
    return this.fault;
  }

  setGains(gains: PidGains): void {
    this.pid.setGains(gains);
  }

  getGains(): PidGains {
    return this.pid.getGains();
  }

  /**
   * A live setpoint change re-baselines the overshoot reference and restarts the
   * settling window: the previous in-band history is not valid for the new target.
   */
  setTarget(target: number): void {
    if (!Number.isFinite(target)) return;
    this.target = target;
    this.tracker.markSetpointChange(this.time, this.driver.measure(), target);
  }

  /**
   * Schedule a disturbance starting at the current simulation time.
   * `freezePeak` freezes the overshoot statistic: a scenario disturbance ends the
   * setpoint step response, an optional exploration disturbance does not.
   */
  addDisturbance(
    label: string,
    magnitude: number,
    duration: number,
    unit: string,
    freezePeak = true
  ): DisturbanceEvent | null {
    if (this.fault) return null;
    if (!Number.isFinite(magnitude) || !Number.isFinite(duration) || duration <= 0) return null;
    this.disturbanceSeq += 1;
    const event: DisturbanceEvent = {
      id: `dist-${this.disturbanceSeq}`,
      label,
      magnitude,
      unit,
      startTime: this.time,
      endTime: this.time + duration
    };
    this.disturbanceQueue.push(event);
    this.tracker.markDisturbance(this.time, freezePeak);
    return event;
  }

  activeDisturbance(): number {
    let sum = 0;
    for (const event of this.disturbanceQueue) {
      if (this.time >= event.startTime && this.time < event.endTime) sum += event.magnitude;
    }
    return sum;
  }

  /** Advance exactly one control period. */
  step(): void {
    if (this.fault) return;

    const t = this.time;
    const disturbance = this.activeDisturbance();
    const y = this.driver.measure();
    const result = this.pid.update(this.target, y, this.dt);

    if (this.pid.getFault()) {
      this.fault = { message: this.pid.getFault() as string, time: t };
      return;
    }

    this.currentControl = result.output;
    this.currentSaturated = result.saturated;

    this.driver.step(result.output, this.dt, disturbance);
    this.time = t + this.dt;

    if (!this.driver.isFinite()) {
      this.fault = { message: '被控对象状态出现非法数值（NaN/Infinity），仿真已停止', time: this.time };
      return;
    }

    const yNext = this.driver.measure();
    this.tracker.observe(this.time, this.target, yNext, result.output, result.saturated, this.dt);
    this.history.push(this.time, yNext, this.target, result.output);
  }

  /** Run a headless batch (used by challenge validation and tests). */
  runFor(seconds: number, onStep?: (engine: SimulationEngine) => void): void {
    const steps = Math.round(seconds / this.dt);
    for (let i = 0; i < steps; i += 1) {
      this.step();
      if (this.fault) return;
      if (onStep) onStep(this);
    }
  }

  safety(): SafetyEnvelope<unknown> {
    return this.driver.safety();
  }

  metrics(): MetricsSnapshot {
    return this.tracker.snapshot();
  }

  disturbances(): DisturbanceEvent[] {
    return this.disturbanceQueue.slice();
  }

  view(): EngineView {
    const metrics = this.tracker.snapshot();
    return {
      time: this.time,
      measurement: metrics.measurement,
      target: this.target,
      control: this.currentControl,
      error: metrics.error,
      saturated: this.currentSaturated,
      metrics,
      telemetry: this.driver.telemetry(),
      render: this.driver.render(),
      fault: this.fault,
      disturbances: this.disturbanceQueue.slice(),
      historyVersion: this.history.version
    };
  }
}
