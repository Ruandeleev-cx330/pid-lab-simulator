/**
 * Calibration helper (development only).
 *
 *   npx vite-node scripts/tune.ts            # check the internal reference policies
 *   npx vite-node scripts/tune.ts search     # random search for a working policy
 *
 * This script prints the internal reference gains. It is a developer tool and is
 * never shipped inside the app bundle (electron-builder only ships dist/).
 */
import { generateChallenge } from '../src/challenges/generator';
import { referenceGainsFor } from '../src/challenges/reference-policies';
import { simulateChallenge } from '../src/challenges/validation';
import type { PidGains } from '../src/controllers/pid-controller';
import type { Difficulty, ProjectAdapter } from '../src/projects/types';
import { PROJECTS } from '../src/projects/registry';
import { createRng } from '../src/challenges/rng';

const DIFFS: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
const SEEDS = [12345, 777, 20260101];

function check(project: ProjectAdapter, difficulty: Difficulty, gains: PidGains, verbose = true) {
  let ok = 0;
  let worstTime = 0;
  let worstOvershoot = 0;
  for (const seed of SEEDS) {
    const challenge = generateChallenge(project, difficulty, seed, { validate: false });
    const outcome = simulateChallenge(project, challenge, gains);
    if (outcome.status === 'success') {
      ok += 1;
      worstTime = Math.max(worstTime, outcome.time);
      worstOvershoot = Math.max(worstOvershoot, outcome.metrics?.overshootPct ?? 0);
      if (verbose) {
        console.log(
          `      seed ${seed} ok @${outcome.time.toFixed(1)}s iae=${(outcome.metrics?.iae ?? 0).toFixed(1)} osc=${(outcome.metrics?.oscillationAmplitude ?? 0).toFixed(3)} settle=${(outcome.metrics?.settleTime ?? -1).toFixed(1)}`
        );
      }
    } else if (verbose) {
      console.log(
        `      seed ${seed} FAIL ${outcome.status} @${outcome.time.toFixed(1)}s ${outcome.reason} ${outcome.detail}`
      );
    }
  }
  if (verbose) {
    console.log(
      `${project.meta.id}/${difficulty}: ${ok}/${SEEDS.length} ok, worst settle ${worstTime.toFixed(1)}s, worst overshoot ${worstOvershoot.toFixed(1)}%`
    );
  }
  return ok;
}

function search(project: ProjectAdapter, difficulty: Difficulty, tries = 120): PidGains | null {
  const limits = project.gainLimits;
  const rng = createRng(0xc0ffee);
  let best: { gains: PidGains; score: number } | null = null;
  for (let i = 0; i < tries; i += 1) {
    const gains: PidGains = {
      kp: Number(rng.range(limits.kp.min + (limits.kp.max - limits.kp.min) * 0.02, limits.kp.max * 0.95).toFixed(limits.decimals)),
      ki: Number(rng.range(limits.ki.min, limits.ki.max * 0.7).toFixed(limits.decimals)),
      kd: Number(rng.range(limits.kd.min, limits.kd.max * 0.6).toFixed(limits.decimals))
    };
    const ok = check(project, difficulty, gains, false);
    if (ok > (best?.score ?? -1)) {
      best = { gains, score: ok };
      console.log(`  trial ${i}: ${ok}/${SEEDS.length}`, gains);
      if (ok === SEEDS.length) return gains;
    }
  }
  return best && best.score > 0 ? best.gains : null;
}

const mode = process.argv[2] ?? 'check';

for (const project of PROJECTS) {
  console.log(`\n=== ${project.meta.id} ===`);
  const ref = referenceGainsFor(project.meta.id);
  console.log('  reference:', ref);
  for (const difficulty of DIFFS) {
    check(project, difficulty, ref);
    if (mode === 'search') {
      const candidate = search(project, difficulty);
      if (candidate) console.log('  best candidate:', candidate);
    }
  }
}
