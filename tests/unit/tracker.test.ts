import { MetricsTracker } from '../../src/metrics/tracker';

const DT = 0.01;

let clock = 0;

function run(
  tracker: MetricsTracker,
  seconds: number,
  fn: (t: number) => { y: number; r: number; u?: number }
): void {
  const steps = Math.round(seconds / DT);
  for (let i = 1; i <= steps; i += 1) {
    clock += DT;
    const sample = fn(clock);
    tracker.observe(clock, sample.r, sample.y, sample.u ?? 0, false, DT);
  }
}

beforeEach(() => {
  clock = 0;
});

describe('MetricsTracker', () => {
  test('IAE and ISE integrate over simulation time', () => {
    const tracker = new MetricsTracker({ toleranceAbs: 0.1, holdTime: 1 });
    tracker.reset(0, 10);
    run(tracker, 1, () => ({ y: 0, r: 10 }));
    const snap = tracker.snapshot();
    expect(snap.iae).toBeCloseTo(10, 6);
    expect(snap.ise).toBeCloseTo(100, 6);
  });

  test('overshoot is relative to the step size', () => {
    const tracker = new MetricsTracker({ toleranceAbs: 0.1, holdTime: 0.5 });
    tracker.reset(0, 10);
    run(tracker, 1, (t) => ({ y: t < 0.5 ? t * 24 : 12, r: 10 }));
    expect(tracker.overshootPct).toBeCloseTo(20, 0);
  });

  test('a brief crossing of the target is not reported as settled', () => {
    const tracker = new MetricsTracker({ toleranceAbs: 0.5, holdTime: 2 });
    tracker.reset(0, 10);
    run(tracker, 1, () => ({ y: 10, r: 10 }));
    run(tracker, 5, () => ({ y: 5, r: 10 }));
    const snap = tracker.snapshot();
    expect(snap.settleTime).toBeNull();
    expect(snap.dwellTime).toBe(0);
  });

  test('settling time is the start of a dwell that survives the hold time', () => {
    const tracker = new MetricsTracker({ toleranceAbs: 0.5, holdTime: 2 });
    tracker.reset(0, 10);
    run(tracker, 3, () => ({ y: 0, r: 10 }));
    run(tracker, 4, () => ({ y: 9.9, r: 10 }));
    const snap = tracker.snapshot();
    expect(snap.settleTime).toBeCloseTo(3, 1);
    expect(snap.dwellTime).toBeGreaterThan(1.9);
  });

  test('steady state error averages the recent window', () => {
    const tracker = new MetricsTracker({ toleranceAbs: 0.5, holdTime: 1, steadyWindow: 1 });
    tracker.reset(0, 10);
    run(tracker, 2, () => ({ y: 9.5, r: 10 }));
    expect(tracker.snapshot().steadyStateError).toBeCloseTo(0.5, 6);
  });

  test('oscillation amplitude measures recent peak to peak swing', () => {
    const tracker = new MetricsTracker({ toleranceAbs: 0.1, holdTime: 0.5, oscillationWindow: 1 });
    tracker.reset(0, 0);
    run(tracker, 2, (t) => ({ y: Math.sin(t * 2 * Math.PI * 2) * 2, r: 0 }));
    const snap = tracker.snapshot();
    expect(snap.oscillationAmplitude).toBeGreaterThan(3.5);
    expect(snap.oscillationCrossings).toBeGreaterThan(3);
  });

  test('a monotonic ramp is not reported as oscillation', () => {
    const tracker = new MetricsTracker({ toleranceAbs: 0.5, holdTime: 1, oscillationWindow: 1.5 });
    tracker.reset(0, 100);
    run(tracker, 3, (t) => ({ y: t * 10, r: 100 }));
    const snap = tracker.snapshot();
    expect(snap.oscillationCrossings).toBe(0);
    expect(snap.oscillationAmplitude).toBe(0);
  });

  test('a monotonic ramp is not reported as oscillation', () => {
    const tracker = new MetricsTracker({ toleranceAbs: 0.5, holdTime: 1, oscillationWindow: 1.5 });
    tracker.reset(0, 100);
    run(tracker, 3, (t) => ({ y: t * 10, r: 100 }));
    const snap = tracker.snapshot();
    expect(snap.oscillationCrossings).toBe(0);
    expect(snap.oscillationAmplitude).toBe(0);
  });

  test('a disturbance invalidates the settled verdict but keeps counting time', () => {
    const tracker = new MetricsTracker({ toleranceAbs: 0.5, holdTime: 1 });
    tracker.reset(0, 10);
    run(tracker, 3, () => ({ y: 10, r: 10 }));
    expect(tracker.snapshot().settleTime).not.toBeNull();
    tracker.markDisturbance(clock);
    run(tracker, 0.5, () => ({ y: 12, r: 10 }));
    const snap = tracker.snapshot();
    expect(snap.settleTime).toBeNull();
    expect(snap.timeSinceDisturbance).toBeCloseTo(0.5, 6);
    expect(snap.disturbanceCount).toBe(1);
  });

  test('overshoot freezes after a disturbance (recovery is judged differently)', () => {
    const tracker = new MetricsTracker({ toleranceAbs: 0.1, holdTime: 0.5 });
    tracker.reset(0, 10);
    run(tracker, 1, () => ({ y: 9, r: 10 }));
    tracker.markDisturbance(1);
    run(tracker, 1, () => ({ y: 18, r: 10 }));
    expect(tracker.overshootPct).toBe(0);
  });

  test('a setpoint change re-baselines the settling window', () => {
    const tracker = new MetricsTracker({ toleranceAbs: 0.5, holdTime: 1 });
    tracker.reset(0, 10);
    run(tracker, 3, () => ({ y: 10, r: 10 }));
    tracker.markSetpointChange(clock, 10, 20);
    run(tracker, 0.2, () => ({ y: 10, r: 20 }));
    expect(tracker.snapshot().settleTime).toBeNull();
    expect(tracker.snapshot().disturbanceCount).toBe(0);
  });
});
