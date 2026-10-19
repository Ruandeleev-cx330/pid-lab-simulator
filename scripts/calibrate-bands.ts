/**
 * Dev calibration: scan the gain space and find the region where a round is
 * PLAYABLE - the starting gains neither win on their own, nor trip a monotonic
 * gate, nor fall over. The sampling band of each difficulty is then set from the
 * bounding box of that region.
 *
 *   npx vite-node scripts/calibrate-bands.ts [projectId]
 */
import { generateChallenge } from '../src/challenges/generator';
import { createRng } from '../src/challenges/rng';
import type { PidGains } from '../src/controllers/pid-controller';
import { PROJECTS } from '../src/projects/registry';
import type { Difficulty, ProjectAdapter } from '../src/projects/types';

const DIFFS: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
const SAMPLES = 60;

type Kind = 'success' | 'blocked' | 'fell' | 'timeout';

function classify(project: ProjectAdapter, seed: number, difficulty: Difficulty, gains: PidGains): Kind {
  const challenge = generateChallenge(project, difficulty, seed, { validate: false });
  const engine = project.createEngine(challenge, gains);
  let blocked = false;
  let applied = false;
  const autoAt = challenge.disturbance?.autoAt;
  while (engine.getTime() < challenge.timeLimit) {
    engine.step();
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
    if (engine.getFault()) return 'fell';
    const safety = engine.safety();
    if (!safety.ok) return 'fell';
    const verdict = project.evaluate(engine.view(), safety, challenge);
    if (verdict.status === 'success') return 'success';
    // reaching the time limit is the normal end of a playable round
    if (verdict.status === 'failed' && !verdict.reason.includes('挑战时限')) return 'fell';
    if (verdict.permanent) blocked = true;
  }
  return blocked ? 'blocked' : 'timeout';
}

const only = process.argv[2];

for (const project of PROJECTS) {
  if (only && project.meta.id !== only) continue;
  const lim = project.gainLimits;
  for (const difficulty of DIFFS) {
    const rng = createRng(0x5eed + difficulty.length * 977);
    const playable: PidGains[] = [];
    const counts: Record<Kind, number> = { success: 0, blocked: 0, fell: 0, timeout: 0 };

    for (let i = 0; i < SAMPLES; i += 1) {
      const gains: PidGains = {
        // log-ish spread over the slider range so both ends get explored
        kp: Number((lim.kp.min + (lim.kp.max - lim.kp.min) * rng.next() ** 1.6).toFixed(lim.decimals)),
        ki: Number((lim.ki.min + (lim.ki.max - lim.ki.min) * rng.next() ** 1.6).toFixed(lim.decimals)),
        kd: Number((lim.kd.min + (lim.kd.max - lim.kd.min) * rng.next() ** 1.6).toFixed(lim.decimals))
      };
      // two different challenge seeds so a single lucky draw does not decide
      const kinds = [11, 222].map((seed) => classify(project, seed, difficulty, gains));
      const kind = kinds.includes('blocked') ? 'blocked' : kinds.includes('fell') ? 'fell' : kinds.includes('success') ? 'success' : 'timeout';
      counts[kind] += 1;
      if (kind === 'timeout') playable.push(gains);
    }

    const range = (key: keyof PidGains) => {
      if (!playable.length) return '—';
      const values = playable.map((g) => g[key]).sort((a, b) => a - b);
      const at = (f: number) => values[Math.min(values.length - 1, Math.floor(f * values.length))];
      return `${at(0.1).toFixed(lim.decimals)}–${at(0.9).toFixed(lim.decimals)} (p50 ${at(0.5).toFixed(lim.decimals)})`;
    };

    console.log(
      `${project.meta.id.padEnd(19)} ${difficulty.padEnd(13)} 可玩 ${String(playable.length).padStart(2)}/${SAMPLES}` +
        `  (成功 ${counts.success} / 卡死 ${counts.blocked} / 失稳 ${counts.fell})` +
        `  可玩区间 kp ${range('kp')}  ki ${range('ki')}  kd ${range('kd')}`
    );
  }
}
