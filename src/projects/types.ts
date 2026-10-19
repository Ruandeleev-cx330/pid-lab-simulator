import type { PidGains } from '../controllers/pid-controller';
import type { SimulationEngine, EngineView } from '../simulation/engine';
import type { ChecklistItem } from './adapter';
import type { PlantModel, SafetyEnvelope } from '../simulation/types';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: '初级',
  intermediate: '中级',
  advanced: '高级'
};

export interface Range {
  min: number;
  max: number;
  step: number;
}

export interface GainLimits {
  kp: Range;
  ki: Range;
  kd: Range;
  /** Display / input precision (number of decimals). */
  decimals: number;
}

export interface DisturbanceSpec {
  label: string;
  unit: string;
  magnitude: number;
  duration: number;
  /** Success requires one disturbance that the system recovers from. */
  required: boolean;
  /** Preset scenario: the disturbance is injected automatically at this time. */
  autoAt?: number;
  /** Hint shown in the UI, e.g. "负载转矩 +0.018 N·m". */
  description: string;
}

export interface SuccessCriteria {
  toleranceAbs: number;
  toleranceRel: number;
  holdTime: number;
  maxOvershootPct: number;
  maxIAE: number;
  maxOscillationAmp: number;
  minRunTime: number;
  requireDisturbance: boolean;
  /** Optional absolute rate limit (rad/s) checked through telemetry. */
  rateLimit?: number;
  rateTelemetryKey?: string;
}

export interface ChallengeInstance {
  id: string;
  projectId: string;
  difficulty: Difficulty;
  seed: number;
  target: number;
  initialGains: PidGains;
  /** Project specific scalar describing the initial condition (e.g. angle). */
  initialCondition: number;
  disturbance: DisturbanceSpec | null;
  timeLimit: number;
  criteria: SuccessCriteria;
  configVersion: string;
}

export interface ProjectMeta {
  id: string;
  name: string;
  tagline: string;
  description: string;
  outputLabel: string;
  outputUnit: string;
  /** Unit of the actuator command (shown next to the control output). */
  controlUnit: string;
  /** Decimals used when displaying the measured value. */
  outputDecimals: number;
  /** Human readable description of the model, shown in the lab info panel. */
  modelSummary: string;
  controlHint: string;
}

export interface DifficultyPlan {
  label: string;
  description: string;
  targetRange: [number, number];
  /** Initial condition magnitude range (project specific). */
  initialRange: [number, number];
  /** Gain sampling band; must stay inside `gainLimits`. */
  gainSample: { kp: [number, number]; ki: [number, number]; kd: [number, number] };
  disturbance: DisturbanceSpec | null;
  criteria: SuccessCriteria;
  timeLimit: number;
}

export interface Verdict {
  status: 'running' | 'success' | 'failed';
  /** Short machine friendly reason. */
  reason: string;
  /** Human readable explanation shown in the UI. */
  detail: string;
  /**
   * Only for `running`: a monotonic spec (overshoot / IAE) is already violated,
   * so this round can no longer succeed but the simulation keeps running until
   * the user resets or the time limit is reached.
   */
  permanent?: boolean;
}

/** Erased project interface used by the session and the UI. */
export interface ProjectAdapter {
  meta: ProjectMeta;
  gainLimits: GainLimits;
  gainHelp: { kp: string; ki: string; kd: string };
  plans: Record<Difficulty, DifficultyPlan>;
  defaultDifficulty: Difficulty;
  /** Create the plant state for a challenge (deterministic from the challenge). */
  createEngine(challenge: ChallengeInstance, gains: PidGains): SimulationEngine;
  /**
   * Seconds the randomly generated starting gains must survive before the
   * challenge is considered "tunable but not hopeless". 0 for stable plants.
   */
  minSurvivalTime: number;
  /**
   * Minimum |target - initial measurement| for a generated challenge (0 = no
   * constraint). Prevents degenerate challenges where nothing has to be done.
   */
  minStep: number;
  /** Success / failure evaluation against the live engine view. */
  evaluate(view: EngineView, safety: SafetyEnvelope<unknown>, challenge: ChallengeInstance): Verdict;
  /** Project specific extra check on the current state (returns a reason when violated). */
  describeState(view: EngineView): Record<string, string>;
  /** Live success conditions exactly as `evaluate` interprets them. */
  checklist(view: EngineView, challenge: ChallengeInstance): ChecklistItem[];
}

/** Internal helper signature for building adapters. */
export interface ProjectSpec<S> {
  meta: ProjectMeta;
  gainLimits: GainLimits;
  gainHelp: { kp: string; ki: string; kd: string };
  plant: PlantModel<S>;
  defaultDifficulty: Difficulty;
  plans: Record<Difficulty, DifficultyPlan>;
  createState(challenge: ChallengeInstance): S;
  /** Derivative filter time constant for the PID. */
  derivativeFilterTau: number;
  /** See ProjectAdapter.minSurvivalTime. Defaults to 0. */
  minSurvivalTime?: number;
  /** See ProjectAdapter.minStep. Defaults to 0. */
  minStep?: number;
  /** Extra success gate that depends on the full state, not only the metrics. */
  extraSuccessCheck?(view: EngineView): string | null;
  /** Telemetry formatting for the metrics strip. */
  describeState(view: EngineView): Record<string, string>;
}
