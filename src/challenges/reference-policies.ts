import type { PidGains } from '../controllers/pid-controller';

/**
 * INTERNAL ONLY.
 *
 * These gain sets are used exclusively by `challenges/validation.ts` to prove
 * that a generated challenge is solvable: "there exists at least one gain set in
 * the allowed range that reaches the success criteria".
 *
 * They are NOT the answer. Any gain set that satisfies the published criteria is
 * accepted. These values must never be rendered in the UI, written to logs, or
 * included in exported results - see tests/unit/no-leak.test.ts.
 *
 * Calibrated with `npm run calibrate` (scripts/calibrate.ts) against the real
 * simulation, with margin, and re-verified by tests/challenge/solvability.test.ts.
 */
export const REFERENCE_GAINS: Record<string, PidGains> = {
  temperature: { kp: 34, ki: 1.6, kd: 12 },
  'dc-motor': { kp: 0.085, ki: 0.32, kd: 0.001 },
  'liquid-level': { kp: 0.03, ki: 0.0034, kd: 0.02 },
  'balancing-robot': { kp: 0.42, ki: 0.03, kd: 0.042 },
  'inverted-pendulum': { kp: 0.5, ki: 0.05, kd: 0.055 }
};

export function referenceGainsFor(projectId: string): PidGains {
  const gains = REFERENCE_GAINS[projectId];
  if (!gains) throw new Error(`missing internal reference policy for ${projectId}`);
  return { ...gains };
}
