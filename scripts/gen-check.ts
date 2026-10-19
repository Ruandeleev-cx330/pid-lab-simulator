/**
 * Dev helper: generate one challenge per project/difficulty with full validation
 * and report timing + the sampled starting gains (no reference gains printed).
 *
 *   npx vite-node scripts/gen-check.ts
 */
import { generateChallenge } from '../src/challenges/generator';
import { PROJECTS } from '../src/projects/registry';
import type { Difficulty } from '../src/projects/types';

const DIFFS: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
const seeds = [1, 42, 999, 2026, 31337];

for (const project of PROJECTS) {
  for (const difficulty of DIFFS) {
    const t0 = performance.now();
    let ok = 0;
    const gains: string[] = [];
    for (const seed of seeds) {
      try {
        const ch = generateChallenge(project, difficulty, seed);
        ok += 1;
        gains.push(`kp=${ch.initialGains.kp} ki=${ch.initialGains.ki} kd=${ch.initialGains.kd} tgt=${ch.target}`);
      } catch (error) {
        console.log(`  FAIL seed ${seed}:`, error instanceof Error ? error.message : error);
      }
    }
    const dt = performance.now() - t0;
    console.log(
      `${project.meta.id}/${difficulty}: ${ok}/${seeds.length} in ${dt.toFixed(0)}ms (${(dt / seeds.length).toFixed(0)}ms each)`
    );
    for (const g of gains) console.log('    ', g);
  }
}
