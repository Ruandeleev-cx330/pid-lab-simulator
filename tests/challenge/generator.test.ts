import { ChallengeGenerationError, generateChallenge } from '../../src/challenges/generator';
import { REFERENCE_GAINS } from '../../src/challenges/reference-policies';
import { simulateChallenge } from '../../src/challenges/validation';
import { PROJECTS, getProject } from '../../src/projects/registry';
import type { Difficulty } from '../../src/projects/types';

const DIFFS: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

describe('challenge generator', () => {
  test('the same seed reproduces the same challenge', () => {
    for (const project of PROJECTS) {
      const a = generateChallenge(project, 'beginner', 123456);
      const b = generateChallenge(project, 'beginner', 123456);
      expect(b).toEqual(a);
    }
  });

  test('different seeds produce different starting gains', () => {
    for (const project of PROJECTS) {
      const sets = new Set<string>();
      for (let seed = 1; seed <= 6; seed += 1) {
        const c = generateChallenge(project, 'beginner', seed);
        sets.add(`${c.initialGains.kp}|${c.initialGains.ki}|${c.initialGains.kd}`);
      }
      expect(sets.size).toBeGreaterThan(3);
    }
  });

  test('every sampled gain stays inside the published limits', () => {
    for (const project of PROJECTS) {
      for (const difficulty of DIFFS) {
        for (let seed = 1; seed <= 3; seed += 1) {
          const c = generateChallenge(project, difficulty, seed);
          const limits = project.gainLimits;
          for (const key of ['kp', 'ki', 'kd'] as const) {
            expect(c.initialGains[key]).toBeGreaterThanOrEqual(limits[key].min);
            expect(c.initialGains[key]).toBeLessThanOrEqual(limits[key].max);
            expect(Number.isFinite(c.initialGains[key])).toBe(true);
          }
          expect(Number.isFinite(c.target)).toBe(true);
        }
      }
    }
  });

  test('the target of every generated challenge is inside the difficulty range', () => {
    for (const project of PROJECTS) {
      for (const difficulty of DIFFS) {
        const plan = project.plans[difficulty];
        for (let seed = 1; seed <= 3; seed += 1) {
          const c = generateChallenge(project, difficulty, seed);
          expect(c.target).toBeGreaterThanOrEqual(plan.targetRange[0]);
          expect(c.target).toBeLessThanOrEqual(plan.targetRange[1]);
        }
      }
    }
  });

  test('every generated challenge is solvable by the internal reference policy', () => {
    for (const project of PROJECTS) {
      for (const difficulty of DIFFS) {
        const challenge = generateChallenge(project, difficulty, 987654);
        const outcome = simulateChallenge(project, challenge, REFERENCE_GAINS[project.meta.id]);
        expect(outcome.status).toBe('success');
      }
    }
  }, 60000);

  test('the starting gains never solve the challenge on their own', () => {
    for (const project of PROJECTS) {
      for (const difficulty of DIFFS) {
        const challenge = generateChallenge(project, difficulty, 24680);
        const outcome = simulateChallenge(project, challenge, challenge.initialGains);
        expect(outcome.status).not.toBe('success');
      }
    }
  }, 60000);

  test('unstable plants survive the starting gains for the required time', () => {
    for (const project of PROJECTS.filter((p) => p.minSurvivalTime > 0)) {
      const challenge = generateChallenge(project, 'advanced', 555);
      const outcome = simulateChallenge(project, challenge, challenge.initialGains, {
        horizon: project.minSurvivalTime,
        sampleEvery: 10
      });
      expect(outcome.status).not.toBe('failed');
    }
  }, 60000);

  test('generation is bounded and reports diagnostics instead of looping forever', () => {
    const project = getProject('temperature');
    const impossible = { ...project, minStep: 1e9 };
    const started = Date.now();
    expect(() => generateChallenge(impossible, 'beginner', 1, { maxAttempts: 3 })).toThrow(ChallengeGenerationError);
    expect(Date.now() - started).toBeLessThan(5000);
    try {
      generateChallenge(impossible, 'beginner', 1, { maxAttempts: 3 });
    } catch (error) {
      const e = error as ChallengeGenerationError;
      expect(e.diagnostics.length).toBe(3);
      expect(e.message).toContain('没有生成可解挑战');
    }
  });

  test('a challenge always carries its own criteria and time limit', () => {
    const project = getProject('inverted-pendulum');
    const c = generateChallenge(project, 'advanced', 4242);
    expect(c.criteria.toleranceAbs).toBe(project.plans.advanced.criteria.toleranceAbs);
    expect(c.timeLimit).toBe(project.plans.advanced.timeLimit);
    expect(c.disturbance?.required).toBe(true);
    expect(c.configVersion).toMatch(/\d+\.\d+\.\d+/);
  });
});
