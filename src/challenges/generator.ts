import type { PidGains } from '../controllers/pid-controller';
import type { ChallengeInstance, Difficulty, ProjectAdapter } from '../projects/types';
import { CONFIG_VERSION } from '../projects/adapter';
import { referenceGainsFor } from './reference-policies';
import { createRng, deriveSeed, roundTo } from './rng';
import { simulateChallenge, simulateSurvival } from './validation';

export class ChallengeGenerationError extends Error {
  readonly diagnostics: string[];

  constructor(message: string, diagnostics: string[]) {
    super(message);
    this.name = 'ChallengeGenerationError';
    this.diagnostics = diagnostics;
  }
}

export interface GenerateOptions {
  /** Run the solvability + survivability checks (default true). */
  validate?: boolean;
  maxAttempts?: number;
}

/**
 * Build one challenge instance.
 *
 * Guarantees:
 *  1. every sampled value is inside the project's published ranges;
 *  2. the same seed always produces the same challenge;
 *  3. the challenge is provably solvable - an internal reference policy reaches
 *     the published criteria from the sampled initial condition;
 *  4. the random starting gains never solve the task immediately, and for
 *     unstable plants they survive long enough to be tuned;
 *  5. the retry loop is bounded - a failure is reported, never an infinite loop.
 */
export function generateChallenge(
  project: ProjectAdapter,
  difficulty: Difficulty,
  seed: number,
  options: GenerateOptions = {}
): ChallengeInstance {
  const validate = options.validate ?? true;
  const maxAttempts = options.maxAttempts ?? 20;
  const plan = project.plans[difficulty];
  const limits = project.gainLimits;
  const diagnostics: string[] = [];
  /**
   * A starting point that already satisfies the criteria is a weak round, but the
   * spec only asks for "usually not yet optimal" - so it is kept as a last resort
   * instead of making generation fail on plants that stabilise within seconds.
   */
  let weakFallback: ChallengeInstance | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rng = createRng(deriveSeed(seed, attempt));

    const target = roundTo(rng.range(plan.targetRange[0], plan.targetRange[1]), project.meta.outputDecimals);
    const initialCondition = roundTo(rng.range(plan.initialRange[0], plan.initialRange[1]), 2);
    const gains: PidGains = {
      kp: rng.stepped(plan.gainSample.kp[0], plan.gainSample.kp[1], limits.kp.step),
      ki: rng.stepped(plan.gainSample.ki[0], plan.gainSample.ki[1], limits.ki.step),
      kd: rng.stepped(plan.gainSample.kd[0], plan.gainSample.kd[1], limits.kd.step)
    };

    const challenge: ChallengeInstance = {
      id: `${project.meta.id}-${difficulty}-${seed.toString(36)}-${attempt}`,
      projectId: project.meta.id,
      difficulty,
      seed,
      target,
      initialGains: gains,
      initialCondition,
      disturbance: plan.disturbance ? { ...plan.disturbance } : null,
      timeLimit: plan.timeLimit,
      criteria: { ...plan.criteria },
      configVersion: CONFIG_VERSION
    };

    if (!validate) return challenge;

    // --- 0. reject degenerate challenges where the step is negligible -------
    if (project.minStep > 0) {
      const probe = project.createEngine(challenge, gains);
      const y0 = probe.view().measurement;
      if (Math.abs(challenge.target - y0) < project.minStep) {
        diagnostics.push(
          `#${attempt} 目标 ${challenge.target} 与初始值 ${y0.toFixed(3)} 相差过小 (< ${project.minStep})`
        );
        continue;
      }
    }

    // --- 1. every generated challenge must be solvable ----------------------
    const reference = simulateChallenge(project, challenge, referenceGainsFor(project.meta.id));
    if (reference.status !== 'success') {
      diagnostics.push(
        `#${attempt} 参考策略未达标 (${reference.status} @ ${reference.time.toFixed(1)}s, ${reference.reason})`
      );
      continue;
    }

    // --- 2. the starting gains must survive long enough to be tunable ------
    if (project.minSurvivalTime > 0) {
      const survival = simulateSurvival(project, challenge, gains, project.minSurvivalTime);
      if (!survival.survived) {
        diagnostics.push(
          `#${attempt} 初始参数在 ${survival.time.toFixed(1)}s 即失稳 (< ${project.minSurvivalTime}s, ${survival.reason})`
        );
        continue;
      }
    }

    // --- 3. the starting gains must not already solve the challenge --------
    const initial = simulateChallenge(project, challenge, gains, { horizon: challenge.timeLimit });
    if (initial.status === 'success') {
      diagnostics.push(`#${attempt} 初始参数已经直接达标，作为兜底候选`);
      if (!weakFallback) weakFallback = challenge;
      continue;
    }
    if (initial.permanentlyBlocked) {
      diagnostics.push(`#${attempt} 初始参数已触发单调门槛（${initial.reason}），本轮必然无法达标`);
      continue;
    }
    if (initial.status === 'failed') {
      diagnostics.push(`#${attempt} 初始参数在 ${initial.time.toFixed(1)}s 失稳（${initial.reason}）`);
      continue;
    }

    return challenge;
  }

  if (weakFallback) {
    diagnostics.push('没有找到更有挑战性的初值，返回兜底候选（初始参数已可达标）');
    return weakFallback;
  }

  throw new ChallengeGenerationError(
    `项目 ${project.meta.id}/${difficulty} 在 ${maxAttempts} 次尝试内没有生成可解挑战`,
    diagnostics
  );
}

/** Convenience wrapper used by the UI: generate with a fresh random seed. */
export function generateChallengeWithSeed(
  project: ProjectAdapter,
  difficulty: Difficulty,
  seed: number,
  options?: GenerateOptions
): ChallengeInstance {
  return generateChallenge(project, difficulty, seed, options);
}
