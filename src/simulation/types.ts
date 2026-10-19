/**
 * Core simulation contracts.
 *
 * Everything in this folder is framework agnostic: no React, no Electron, no DOM.
 * That guarantees the physics can be unit tested and even run in the main process.
 */

/** Fixed simulation step. Every controller and plant update uses this value. */
export const SIM_DT = 0.01;

export interface ActuatorLimits {
  /** Minimum physical actuator command. */
  min: number;
  /** Maximum physical actuator command. */
  max: number;
  /** Human readable label, e.g. "电压 (V)". */
  unit: string;
}

export interface SafetyEnvelope<S> {
  ok: boolean;
  reason?: string;
  /** Optional human readable detail used by the failure panel. */
  detail?: string;
  state?: S;
}

/**
 * A controlled plant. Implementations own their state type, the derivative
 * function and the measurement extraction. They never read wall clock time.
 */
export interface PlantModel<S> {
  readonly id: string;
  readonly name: string;
  readonly outputLabel: string;
  readonly outputUnit: string;
  readonly actuator: ActuatorLimits;
  /** Unit of the scalar disturbance input accepted by `step`. */
  readonly disturbanceUnit: string;
  /** Measurement that is fed back to the PID controller. */
  measure(state: S): number;
  /** Additional telemetry for UI panels / animation (never used by the PID). */
  telemetry(state: S): Record<string, number>;
  /** Copy of the state (states are always treated as immutable snapshots). */
  clone(state: S): S;
  /** True when every state variable is a finite number. */
  isFinite(state: S): boolean;
  /** Physical safety evaluation (fall detection, rail limits, tank overflow...). */
  safety(state: S): SafetyEnvelope<S>;
  /**
   * One fixed-step update. Implementations may sub-step internally if stiff.
   * `disturbance` is expressed in the plant's own disturbance unit (see
   * `disturbanceUnit`) and is added to the dynamics, never to the animation.
   */
  step(state: S, u: number, dt: number, disturbance?: number): S;
  /** Animation payload derived from state only. */
  render(state: S): Record<string, number>;
}

/** A plant plus its immutable configuration. */
export interface PlantDefinition<S> {
  model: PlantModel<S>;
  /** Physics constants. Never randomised between rounds of the same project. */
  params: unknown;
}

export type SimulationStatus =
  | 'loading'
  | 'ready'
  | 'running'
  | 'paused'
  | 'success'
  | 'failed'
  | 'resetting'
  | 'error';

export interface SimulationSample {
  t: number;
  target: number;
  measurement: number;
  control: number;
  error: number;
}
