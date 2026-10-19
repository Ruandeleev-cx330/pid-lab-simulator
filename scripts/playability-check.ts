/**
 * Dev diagnostic: for the challenges the generator actually ACCEPTS, what happens
 * if the user does nothing with the starting gains?
 *
 *   success  - the round solves itself        (bad: trivial)
 *   blocked  - monotonic spec already violated (bad: needs a reset to be winnable)
 *   fell     - safety violation / fault        (bad: dead round)
 *   timeout  - ran the full limit, never达标   (good: this is the tuning task)
 */
import { generateChallenge } from '../src/challenges/generator';
import { PROJECTS } from '../src/projects/registry';
import type { Difficulty } from '../src/projects/types';

const SEEDS = (process.env.SEEDS ?? '11,22,33,44,55,66,77,88,99,111,222,333').split(',').map(Number);
const DIFFS: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

type Kind = 'success' | 'blocked' | 'fell' | 'timeout' | 'genfail';

for (const project of PROJECTS) {
  for (const difficulty of DIFFS) {
    const counts: Record<Kind, number> = { success: 0, blocked: 0, fell: 0, timeout: 0, genfail: 0 };
    const examples: string[] = [];
    const iaeSamples: Array<{ iae: number; settle: number | null }> = [];
    const t0 = performance.now();

    for (const seed of SEEDS) {
      let challenge;
      try {
        challenge = generateChallenge(project, difficulty, seed);
      } catch {
        counts.genfail += 1;
        continue;
      }
      const engine = project.createEngine(challenge, challenge.initialGains);
      let sawPermanent = false;
      let kind: Kind = 'timeout';
      let applied = false;
      const autoAt = challenge.disturbance?.autoAt;

      while (engine.getTime() < challenge.timeLimit) {
        engine.step();
        // mirror the session: the scenario disturbance fires on its own
        if (challenge.disturbance && autoAt !== undefined && !applied && engine.getTime() >= autoAt) {
          engine.addDisturbance(
            challenge.disturbance.label,
            challenge.disturbance.magnitude,
            challenge.disturbance.duration,
            challenge.disturbance.unit,
            challenge.disturbance.required
          );
          applied = true;
        }
        if (engine.getFault()) {
          kind = 'fell';
          break;
        }
        const safety = engine.safety();
        if (!safety.ok) {
          kind = 'fell';
          break;
        }
        const verdict = project.evaluate(engine.view(), safety, challenge);
        if (verdict.status === 'success') {
          kind = 'success';
          break;
        }
        if (verdict.status === 'failed' && !verdict.reason.includes('挑战时限')) {
          kind = 'fell';
          break;
        }
        if (verdict.permanent) sawPermanent = true;
      }

      if (kind === 'timeout' && sawPermanent) kind = 'blocked';
      counts[kind] += 1;
      iaeSamples.push({ iae: engine.view().metrics.iae, settle: engine.view().metrics.settleTime });
      if ((kind === 'blocked' || kind === 'fell' || kind === 'success') && examples.length < 2) {
        examples.push(
          `${kind}@${engine.getTime().toFixed(0)}s os=${engine.view().metrics.overshootPct.toFixed(0)}% kp=${challenge.initialGains.kp} kd=${challenge.initialGains.kd}`
        );
      }
    }

    const ok = counts.timeout;
    const sorted = iaeSamples.map((x) => x.iae).sort((a, b) => a - b);
    const q = (f: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] : 0);
    const iaeStats = `IAE p50=${q(0.5).toFixed(1)} p90=${q(0.9).toFixed(1)} max=${sorted[sorted.length - 1]?.toFixed(1) ?? '-'}`;
    console.log(
      `${project.meta.id.padEnd(19)} ${difficulty.padEnd(13)} ` +
        `可调 ${String(ok).padStart(2)}/${SEEDS.length}  已达标 ${counts.success}  卡死 ${counts.blocked}  失稳 ${counts.fell}  生成失败 ${counts.genfail}` +
        `  ${iaeStats} (${((performance.now() - t0) / SEEDS.length).toFixed(0)}ms/个)` +
        (examples.length ? `\n    ${examples.join(' ; ')}` : '')
    );
  }
}
