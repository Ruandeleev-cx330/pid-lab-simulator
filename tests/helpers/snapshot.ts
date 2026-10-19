import type { SessionSnapshot } from '../../src/state/session';
import type { MetricsSnapshot } from '../../src/metrics/tracker';
import type { SuccessCriteria } from '../../src/projects/types';

export function makeMetrics(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    time: 3,
    target: 200,
    measurement: 198,
    error: 2,
    absError: 2,
    control: 10,
    saturated: false,
    band: 5,
    peakOvershoot: 0,
    overshootPct: 1.2,
    iae: 40,
    ise: 90,
    settleTime: 1.2,
    dwellTime: 1.8,
    steadyStateError: 2,
    oscillationAmplitude: 1,
    oscillationCrossings: 2,
    disturbanceCount: 0,
    timeSinceDisturbance: null,
    insideBand: true,
    ...overrides
  };
}

export function makeCriteria(overrides: Partial<SuccessCriteria> = {}): SuccessCriteria {
  return {
    toleranceAbs: 5,
    toleranceRel: 0,
    holdTime: 3,
    maxOvershootPct: 12,
    maxIAE: 110,
    maxOscillationAmp: 7,
    minRunTime: 5,
    requireDisturbance: false,
    ...overrides
  };
}

export function makeSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    version: 1,
    status: 'ready',
    projectId: 'dc-motor',
    difficulty: 'beginner',
    challengeId: 'dc-motor-beginner-abc-0',
    seed: 42,
    target: 200,
    gains: { kp: 0.05, ki: 0.1, kd: 0.002 },
    initialGains: { kp: 0.03, ki: 0.06, kd: 0.001 },
    time: 3,
    measurement: 198,
    error: 2,
    control: 10,
    saturated: false,
    metrics: makeMetrics(),
    telemetry: { current: 0.4 },
    render: {},
    verdict: { status: 'running', reason: '稳定性观察中', detail: '...' },
    criteria: makeCriteria(),
    timeLimit: 60,
    events: [],
    checklist: [],
    disturbances: [],
    stateDetails: { 电枢电流: '0.40 A' },
    result: null,
    message: null,
    speed: 1,
    historyVersion: 1,
    ...overrides
  };
}
