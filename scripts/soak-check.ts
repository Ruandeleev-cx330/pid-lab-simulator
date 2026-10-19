/**
 * Dev helper: soak test for the history buffer and memory footprint.
 *   npx vite-node scripts/soak-check.ts
 */
import { generateChallenge } from '../src/challenges/generator';
import { REFERENCE_GAINS } from '../src/challenges/reference-policies';
import { getProject } from '../src/projects/registry';

const project = getProject('temperature');
const challenge = generateChallenge(project, 'advanced', 1, { validate: false });
const engine = project.createEngine(challenge, REFERENCE_GAINS.temperature);
const capacity = engine.history.capacity;
console.log(`history capacity = ${capacity} samples (${(capacity * 4 * 8) / 1024} KB)`);

const t0 = performance.now();
for (let minute = 1; minute <= 10; minute += 1) {
  engine.runFor(60);
  const mem = process.memoryUsage();
  console.log(
    `sim t=${engine.getTime().toFixed(0).padStart(4)}s  history=${String(engine.history.size).padStart(5)}/${capacity}` +
      `  heap=${(mem.heapUsed / 1048576).toFixed(1)}MB  rss=${(mem.rss / 1048576).toFixed(1)}MB`
  );
}
console.log(`wall time for 600 s of simulation: ${(performance.now() - t0).toFixed(0)} ms`);
