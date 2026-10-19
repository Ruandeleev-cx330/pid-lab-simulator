import {
  createInvertedPendulumPlant,
  INVERTED_PENDULUM_PARAMS,
  initialPendulumState,
  type InvertedPendulumState
} from '../../src/projects/inverted-pendulum/model';
import { closedLoop, openLoop } from '../helpers/sim';

const plant = createInvertedPendulumPlant();
const deg = (rad: number) => (rad * 180) / Math.PI;

describe('inverted pendulum plant', () => {
  test('the upright pose is unstable without control', () => {
    const { state } = openLoop<InvertedPendulumState>(plant, initialPendulumState(3), 0, 2);
    expect(Math.abs(state.theta)).toBeGreaterThan((3 * Math.PI) / 180);
  });

  test('a positive drive command moves the cart towards -x (documented polarity)', () => {
    const { state } = openLoop<InvertedPendulumState>(plant, initialPendulumState(0), 1, 0.2);
    expect(state.x).toBeLessThan(0);
    expect(state.xDot).toBeLessThan(0);
  });

  test('driving the cart under the lean reduces the angle (physical direction)', () => {
    // theta > 0 means leaning towards +x; the recovery drive must push the cart to +x.
    const start = initialPendulumState(8);
    const recovery = openLoop<InvertedPendulumState>(plant, start, -1, 0.15).state;
    const worse = openLoop<InvertedPendulumState>(plant, start, 1, 0.15).state;
    expect(recovery.theta).toBeLessThan((8 * Math.PI) / 180);
    expect(worse.theta).toBeGreaterThan((8 * Math.PI) / 180);
    expect(recovery.x).toBeGreaterThan(0);
  });

  test('control force affects both the angle and the cart position', () => {
    const a = openLoop<InvertedPendulumState>(plant, initialPendulumState(0.5), -2, 0.3).state;
    expect(Math.abs(a.x)).toBeGreaterThan(0.001);
    expect(Math.abs(a.thetaDot)).toBeGreaterThan(0.01);
  });

  test('a PD controller stabilises the pendulum angle', () => {
    const { samples, stopped } = closedLoop<InvertedPendulumState>(
      plant,
      initialPendulumState(4),
      { kp: 0.5, ki: 0.05, kd: 0.055 },
      0,
      8
    );
    expect(stopped).toBeUndefined();
    expect(Math.abs(samples[samples.length - 1].y)).toBeLessThan(0.2);
  });

  test('a gain below the gravity threshold lets the pole fall', () => {
    const { samples, stopped } = closedLoop<InvertedPendulumState>(
      plant,
      initialPendulumState(4),
      { kp: 0.02, ki: 0, kd: 0.01 },
      0,
      4
    );
    expect(stopped).toBeDefined();
    expect(Math.abs(samples[samples.length - 1].y)).toBeGreaterThan(4);
  });

  test('the rail limit is a hard safety boundary', () => {
    const state: InvertedPendulumState = { x: 2.5, xDot: 0, theta: 0, thetaDot: 0 };
    const safety = plant.safety(state);
    expect(safety.ok).toBe(false);
    expect(safety.reason).toBe('小车越界');
  });

  test('the fall angle is a hard safety boundary', () => {
    const state: InvertedPendulumState = { x: 0, xDot: 0, theta: 0.9, thetaDot: 0 };
    expect(plant.safety(state).reason).toBe('摆杆倒下');
  });

  test('the model never resets the cart or the angle by itself', () => {
    const { state } = openLoop<InvertedPendulumState>(plant, { x: 0, xDot: 0, theta: 0.2, thetaDot: 2 }, 0, 0.5);
    expect(Math.abs(state.theta)).toBeGreaterThan(0.2);
    expect(Math.abs(state.x)).toBeGreaterThan(0);
  });

  test('the force command is clamped to the actuator range', () => {
    const saturated = openLoop<InvertedPendulumState>(plant, initialPendulumState(0), 500, 0.5).state;
    const atLimit = openLoop<InvertedPendulumState>(
      plant,
      initialPendulumState(0),
      INVERTED_PENDULUM_PARAMS.maxForce,
      0.5
    ).state;
    expect(saturated.x).toBeCloseTo(atLimit.x, 9);
  });

  test('the linearised instability grows with the analytic rate', () => {
    const { state } = openLoop<InvertedPendulumState>(plant, { x: 0, xDot: 0, theta: 1e-4, thetaDot: 0 }, 0, 1);
    const growth = state.theta / 1e-4;
    const lambda = Math.sqrt(
      ((INVERTED_PENDULUM_PARAMS.cartMass + INVERTED_PENDULUM_PARAMS.bobMass) * INVERTED_PENDULUM_PARAMS.gravity) /
        (INVERTED_PENDULUM_PARAMS.cartMass * INVERTED_PENDULUM_PARAMS.length)
    );
    const expected = Math.cosh(lambda);
    // Cart friction removes a little energy, so the growth is slightly below cosh.
    expect(growth).toBeGreaterThan(expected * 0.6);
    expect(growth).toBeLessThan(expected * 1.05);
  });

  test('a small angle stays small: no automatic upright magic', () => {
    const { state } = openLoop<InvertedPendulumState>(plant, initialPendulumState(0.001), 0, 0.2);
    expect(deg(state.theta)).toBeGreaterThan(0.001);
  });
});
