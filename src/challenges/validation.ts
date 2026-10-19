import type { PidGains } from '../controllers/pid-controller';
import { TIMEOUT_REASON } from '../projects/adapter';
import type { MetricsSnapshot } from '../metrics/tracker';
import type { ChallengeInstance, ProjectAdapter } from '../projects/types';

export interface SimulationOutcome {
  status: 'success' | 'failed' | 'timeout';
  /** Simulation time at which the verdict was reached. */
  time: number;
  reason: string;
  detail: string;
  /** True when the round was still running when the horizon was reached. */
  reachedHorizon: boolean;
  /** A monotonic gate (overshoot / IAE) was violated, so the round is unwinnable. */
  permanentlyBlocked: boolean;
  metrics: MetricsSnapshot | null;
}

export interface SimulateOptions {
  /** Simulation time at which the disturbance is injected, if any. */
  applyDisturbanceAt?: number;
  /** Evaluate the verdict every N physics steps (default 5). */
  sampleEvery?: number;
  /** Stop earlier than the challenge time limit. */
  horizon?: number;
}

/**
 * Headless run of the real engine with a given gain set.
 * Used for challenge validation and by the tests - never to control the user's
 * live simulation.
 */
export function simulateChallenge(
  project: ProjectAdapter,
  challenge: ChallengeInstance,
  gains: PidGains,
  options: SimulateOptions = {}
): SimulationOutcome {
  const engine = project.createEngine(challenge, gains);
  const sampleEvery = Math.max(1, options.sampleEvery ?? 5);
  const horizon = options.horizon ?? challenge.timeLimit;
  // Only scenario-scheduled disturbances are injected during validation. A
  // purely optional (exploration) disturbance is never applied automatically.
  const disturbanceAt =
    options.applyDisturbanceAt ?? challenge.disturbance?.autoAt ?? Number.POSITIVE_INFINITY;

  let applied = false;
  let permanentlyBlocked = false;
  let lastReason = '运行中';
  let lastDetail = '';
  let steps = 0;

  while (engine.getTime() <= horizon - 1e-9) {
    engine.step();
    steps += 1;

    if (engine.getFault()) {
      return {
        status: 'failed',
        time: engine.getTime(),
        reason: '数值故障',
        detail: engine.getFault()?.message ?? '',
        reachedHorizon: false,
        permanentlyBlocked,
        metrics: engine.view().metrics
      };
    }

    if (challenge.disturbance && !applied && engine.getTime() >= disturbanceAt) {
      engine.addDisturbance(
        challenge.disturbance.label,
        challenge.disturbance.magnitude,
        challenge.disturbance.duration,
        challenge.disturbance.unit
      );
      applied = true;
    }

    if (steps % sampleEvery === 0 || engine.getTime() >= horizon - 1e-9) {
      const safety = engine.safety();
      const view = engine.view();
      const verdict = project.evaluate(view, safety, challenge);
      lastReason = verdict.reason;
      lastDetail = verdict.detail;
      if (verdict.permanent) permanentlyBlocked = true;
      if (verdict.status === 'success') {
        return {
          status: 'success',
          time: engine.getTime(),
          reason: verdict.reason,
          detail: verdict.detail,
          reachedHorizon: false,
          permanentlyBlocked,
          metrics: view.metrics
        };
      }
      if (verdict.status === 'failed' && verdict.reason === TIMEOUT_REASON) {
        // The last step can cross the horizon by a float epsilon; that is the
        // normal end of a round, not a fault.
        return {
          status: 'timeout',
          time: engine.getTime(),
          reason: lastReason,
          detail: lastDetail,
          reachedHorizon: true,
          permanentlyBlocked,
          metrics: view.metrics
        };
      }
      if (verdict.status === 'failed') {
        return {
          status: 'failed',
          time: engine.getTime(),
          reason: verdict.reason,
          detail: verdict.detail,
          reachedHorizon: false,
          permanentlyBlocked,
          metrics: view.metrics
        };
      }
    }
  }

  return {
    status: 'timeout',
    time: engine.getTime(),
    reason: lastReason,
    detail: lastDetail,
    reachedHorizon: true,
    permanentlyBlocked,
    metrics: engine.view().metrics
  };
}

/**
 * Physical survival check: only safety envelope / numerical faults count.
 * Used to guarantee that the randomly generated starting gains do not drop an
 * unstable plant before the user has any chance to react.
 */
export function simulateSurvival(
  project: ProjectAdapter,
  challenge: ChallengeInstance,
  gains: PidGains,
  seconds: number
): { survived: boolean; time: number; reason?: string } {
  const engine = project.createEngine(challenge, gains);
  const steps = Math.round(seconds / engine.dt);
  for (let i = 0; i < steps; i += 1) {
    engine.step();
    if (engine.getFault()) {
      return { survived: false, time: engine.getTime(), reason: engine.getFault()?.message };
    }
    const safety = engine.safety();
    if (!safety.ok) {
      return { survived: false, time: engine.getTime(), reason: safety.reason };
    }
  }
  return { survived: true, time: engine.getTime() };
}

/** Run the engine with a fixed-step integration step override (numeric tests). */
export function simulateFor(
  project: ProjectAdapter,
  challenge: ChallengeInstance,
  gains: PidGains,
  seconds: number
): ReturnType<ProjectAdapter['createEngine']> {
  const engine = project.createEngine(challenge, gains);
  engine.runFor(seconds);
  return engine;
}
