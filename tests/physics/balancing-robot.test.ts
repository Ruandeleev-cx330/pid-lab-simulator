import {
  BALANCING_ROBOT_PARAMS,
  createBalancingRobotPlant,
  initialBalancingState,
  type BalancingRobotState
} from '../../src/projects/balancing-robot/model';
import { closedLoop, openLoop } from '../helpers/sim';

const plant = createBalancingRobotPlant();
const deg = (rad: number) => (rad * 180) / Math.PI;

describe('balancing robot plant', () => {
  test('the upright pose is unstable without control', () => {
    const { state } = openLoop<BalancingRobotState>(plant, initialBalancingState(2), 0, 2);
    expect(Math.abs(deg(state.theta))).toBeGreaterThan(2);
    expect(Math.abs(state.omega)).toBeGreaterThan(0);
  });

  test('a small lean grows exponentially (correct unstable gravity term)', () => {
    const { samples } = openLoop<BalancingRobotState>(plant, initialBalancingState(1), 0, 1);
    const first = Math.abs(samples[10].y);
    const last = Math.abs(samples[samples.length - 1].y);
    expect(last).toBeGreaterThan(first * 5);
  });

  test('a negative reaction torque rotates the body back towards upright', () => {
    const start = initialBalancingState(6);
    const startRad = (6 * Math.PI) / 180;
    const positive = openLoop<BalancingRobotState>(plant, start, 1, 0.1).state.theta;
    const negative = openLoop<BalancingRobotState>(plant, start, -1, 0.1).state.theta;
    expect(negative).toBeLessThan(startRad);
    expect(positive).toBeGreaterThan(startRad);
  });

  test('a PD controller stabilises the body', () => {
    const { samples, stopped } = closedLoop<BalancingRobotState>(
      plant,
      initialBalancingState(4),
      { kp: 0.42, ki: 0.03, kd: 0.042 },
      0,
      8
    );
    expect(stopped).toBeUndefined();
    const finalAngle = Math.abs(samples[samples.length - 1].y);
    expect(finalAngle).toBeLessThan(0.2);
  });

  test('a gain below the gravity threshold cannot stand the robot up', () => {
    const { samples, stopped } = closedLoop<BalancingRobotState>(
      plant,
      initialBalancingState(4),
      { kp: 0.02, ki: 0, kd: 0.01 },
      0,
      4
    );
    expect(stopped).toBeDefined();
    const finalAngle = Math.abs(samples[samples.length - 1].y);
    expect(finalAngle).toBeGreaterThan(4);
  });

  test('the wheels react to the body torque through the reaction couple', () => {
    const state = openLoop<BalancingRobotState>(plant, initialBalancingState(0), -1, 0.5).state;
    // Negative body torque == positive wheel torque, so the wheels spin forward.
    expect(state.wheelSpeed).toBeGreaterThan(0);
    expect(state.drift).toBeGreaterThan(0);
  });

  test('the fall angle is a hard safety boundary', () => {
    const state: BalancingRobotState = { theta: 1.0, omega: 0, wheelAngle: 0, wheelSpeed: 0, drift: 0 };
    const safety = plant.safety(state);
    expect(safety.ok).toBe(false);
    expect(safety.reason).toBe('车身倾倒');
  });

  test('actuator saturation bounds the applied torque', () => {
    const state = openLoop<BalancingRobotState>(plant, initialBalancingState(0), 999, 0.5).state;
    const capped = openLoop<BalancingRobotState>(plant, initialBalancingState(0), BALANCING_ROBOT_PARAMS.maxTorque, 0.5).state;
    expect(state.omega).toBeCloseTo(capped.omega, 9);
  });

  test('the model never silently pulls the body upright', () => {
    // No control and no projection: the angle must keep growing past the target.
    const { state } = openLoop<BalancingRobotState>(plant, initialBalancingState(10), 0, 0.5);
    expect(Math.abs(deg(state.theta))).toBeGreaterThan(10);
  });
});
