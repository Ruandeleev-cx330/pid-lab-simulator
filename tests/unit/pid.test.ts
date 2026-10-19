import { PidController } from '../../src/controllers/pid-controller';

function makePid(overrides: Partial<ConstructorParameters<typeof PidController>[0]> = {}): PidController {
  return new PidController({
    gains: { kp: 1, ki: 0, kd: 0 },
    outputMin: -100,
    outputMax: 100,
    derivativeFilterTau: 0.05,
    ...overrides
  });
}

describe('PidController', () => {
  test('Kp = 0 makes the proportional term zero', () => {
    const pid = makePid({ gains: { kp: 0, ki: 0, kd: 0 } });
    pid.reset(0);
    const result = pid.update(10, 0, 0.01);
    expect(result.p).toBe(0);
    expect(result.output).toBe(0);
  });

  test('Ki = 0 stops integral accumulation', () => {
    const pid = makePid({ gains: { kp: 1, ki: 0, kd: 0 } });
    pid.reset(0);
    for (let i = 0; i < 100; i += 1) pid.update(10, 0, 0.01);
    expect(pid.getIntegral()).toBe(0);
  });

  test('Kd = 0 disables the derivative term', () => {
    const pid = makePid({ gains: { kp: 0, ki: 0, kd: 0 } });
    pid.reset(0);
    for (let i = 0; i < 10; i += 1) {
      const r = pid.update(0, i * 0.1, 0.01);
      expect(Math.abs(r.d)).toBe(0);
    }
  });

  test('positive and negative errors produce the correct control direction', () => {
    const pid = makePid({ gains: { kp: 2, ki: 0, kd: 0 } });
    pid.reset(0);
    expect(pid.update(10, 0, 0.01).output).toBeGreaterThan(0);
    expect(pid.update(-10, 0, 0.01).output).toBeLessThan(0);
  });

  test('discrete integral accumulates Ki * e * dt per step', () => {
    const pid = makePid({ gains: { kp: 0, ki: 1, kd: 0 } });
    pid.reset(0);
    for (let i = 0; i < 10; i += 1) pid.update(1, 0, 0.01);
    expect(pid.getIntegral()).toBeCloseTo(0.1, 10);
  });

  test('derivative filter converges to the measurement slope', () => {
    const pid = makePid({ gains: { kp: 0, ki: 0, kd: 1 }, derivativeFilterTau: 0.05 });
    pid.reset(0);
    // y ramps at 2 units/s
    for (let i = 1; i <= 200; i += 1) pid.update(0, i * 0.01 * 2, 0.01);
    expect(pid.getFilteredDerivative()).toBeCloseTo(2, 2);
    // D = -Kd * dy/dt
    expect(pid.update(0, 4.02, 0.01).d).toBeCloseTo(-2, 1);
  });

  test('setpoint step does not produce a derivative kick', () => {
    const pid = makePid({ gains: { kp: 1, ki: 0, kd: 5 }, derivativeFilterTau: 0.05 });
    pid.reset(0);
    // measurement stays at 0 while the target jumps
    const before = pid.update(0, 0, 0.01);
    const after = pid.update(100, 0, 0.01);
    expect(Math.abs(before.d)).toBe(0);
    expect(Math.abs(after.d)).toBe(0);
    expect(after.p).toBe(100);
  });

  test('output is clamped to the actuator limits', () => {
    const pid = makePid({ gains: { kp: 100, ki: 0, kd: 0 }, outputMin: 0, outputMax: 24 });
    pid.reset(0);
    const result = pid.update(100, 0, 0.01);
    expect(result.rawOutput).toBe(10000);
    expect(result.output).toBe(24);
    expect(result.saturated).toBe(true);
  });

  test('conditional integration freezes the integral while saturated', () => {
    const pid = makePid({ gains: { kp: 10, ki: 5, kd: 0 }, outputMin: 0, outputMax: 10 });
    pid.reset(0);
    for (let i = 0; i < 500; i += 1) pid.update(10, 0, 0.01);
    const integralAtSaturation = pid.getIntegral();
    // Integral must not wind up for 5 s while the output is pinned at the limit.
    expect(integralAtSaturation).toBeLessThan(1.0001);

    // Reverse the error: the output must leave saturation immediately.
    const first = pid.update(-1, 0, 0.01);
    expect(first.rawOutput).toBeLessThan(10);
  });

  test('anti-windup prevents a huge reverse overshoot after a long saturation', () => {
    const pid = makePid({ gains: { kp: 5, ki: 2, kd: 0 }, outputMin: 0, outputMax: 10 });
    pid.reset(0);
    for (let i = 0; i < 2000; i += 1) pid.update(50, 0, 0.01);
    // After the error flips, the controller should react within a few steps.
    let stepsToNegative = -1;
    for (let i = 0; i < 200; i += 1) {
      const r = pid.update(-5, 0, 0.01);
      if (r.rawOutput < 0) {
        stepsToNegative = i;
        break;
      }
    }
    expect(stepsToNegative).toBeGreaterThanOrEqual(0);
    expect(stepsToNegative).toBeLessThan(5);
  });

  test('changing gains keeps the controller state (no hidden reset)', () => {
    const pid = makePid({ gains: { kp: 1, ki: 1, kd: 0 } });
    pid.reset(0);
    for (let i = 0; i < 50; i += 1) pid.update(1, 0, 0.01);
    const integral = pid.getIntegral();
    expect(integral).toBeGreaterThan(0);
    pid.setGains({ kp: 2, ki: 1, kd: 0.5 });
    expect(pid.getIntegral()).toBe(integral);
  });

  test('reset clears the integral and the derivative filter', () => {
    const pid = makePid({ gains: { kp: 1, ki: 1, kd: 1 } });
    pid.reset(0);
    for (let i = 0; i < 50; i += 1) pid.update(1, i * 0.01, 0.01);
    pid.reset(5);
    expect(pid.getIntegral()).toBe(0);
    expect(pid.getFilteredDerivative()).toBe(0);
    // The first update after reset must not differentiate across the reset.
    expect(Math.abs(pid.update(5, 5, 0.01).d)).toBe(0);
  });

  test('NaN inputs are rejected and never propagate', () => {
    const pid = makePid();
    pid.reset(0);
    const result = pid.update(Number.NaN, 0, 0.01);
    expect(result.output).toBe(0);
    expect(pid.getFault()).toContain('非法');
    expect(Number.isFinite(pid.getIntegral())).toBe(true);
  });
});
