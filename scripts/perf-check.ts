/**
 * Dev helper: measures raw physics throughput and memory footprint.
 *   npx vite-node scripts/perf-check.ts
 */
import { generateChallenge } from '../src/challenges/generator';
import { REFERENCE_GAINS } from '../src/challenges/reference-policies';
import { getProject } from '../src/projects/registry';

for (const id of ['temperature', 'dc-motor', 'liquid-level', 'balancing-robot', 'inverted-pendulum']) {
  const project = getProject(id);
  const challenge = generateChallenge(project, 'advanced', 2024, { validate: false });
  const engine = project.createEngine(challenge, REFERENCE_GAINS[id]);
  engine.runFor(2);

  const steps = 20000;
  const t0 = performance.now();
  for (let i = 0; i < steps; i += 1) engine.step();
  const elapsed = performance.now() - t0;
  const perStep = (elapsed / steps) * 1000;
  const realtime = (steps * 0.01) / (elapsed / 1000);
  console.log(
    `${id}: ${steps} steps in ${elapsed.toFixed(1)}ms = ${perStep.toFixed(2)} us/step, realtime factor ${realtime.toFixed(0)}x`
  );
}

const mem = process.memoryUsage();
console.log(`heapUsed ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`);
