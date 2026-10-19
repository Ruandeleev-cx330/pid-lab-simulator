import { createDcMotorPlant, DC_MOTOR_PARAMS, type DcMotorState } from '../../src/projects/dc-motor/model';
import { closedLoop, openLoop, valueAt } from '../helpers/sim';

const plant = createDcMotorPlant();
const { torqueConstant: Kt, backEmfConstant: Ke, resistance: R, viscousFriction: b, maxVoltage } = DC_MOTOR_PARAMS;

/** No-load steady state speed for a given armature voltage. */
const steadySpeed = (voltage: number, load = 0) => (Kt * voltage - load * R) / (Kt * Ke + b * R);

describe('DC motor plant', () => {
  test('a voltage step spins the motor up to the analytic steady state', () => {
    const { state } = openLoop<DcMotorState>(plant, { omega: 0, current: 0, angle: 0 }, 12, 3);
    expect(state.omega).toBeCloseTo(steadySpeed(12), 0);
    expect(state.omega).toBeGreaterThan(200);
  });

  test('the electrical time constant dominates the initial current', () => {
    const { samples } = openLoop<DcMotorState>(plant, { omega: 0, current: 0, angle: 0 }, 12, 0.02);
    // At t=0 the current is limited only by R: V/R = 8 A
    expect(samples.length).toBeGreaterThan(2);
    const fresh = openLoop<DcMotorState>(plant, { omega: 0, current: 0, angle: 0 }, 12, 0.01);
    expect(fresh.state.current).toBeGreaterThan(5);
    expect(fresh.state.current).toBeLessThan(8.1);
  });

  test('a load torque reduces the steady state speed', () => {
    const noLoad = openLoop<DcMotorState>(plant, { omega: 0, current: 0, angle: 0 }, 12, 3).state.omega;
    const loaded = openLoop<DcMotorState>(plant, { omega: 0, current: 0, angle: 0 }, 12, 3, 0.02).state.omega;
    expect(loaded).toBeLessThan(noLoad);
    expect(loaded).toBeCloseTo(steadySpeed(12, 0.02), 0);
  });

  test('the voltage command is clamped to the actuator range', () => {
    const a = openLoop<DcMotorState>(plant, { omega: 0, current: 0, angle: 0 }, 100, 2).state.omega;
    const b = openLoop<DcMotorState>(plant, { omega: 0, current: 0, angle: 0 }, maxVoltage, 2).state.omega;
    expect(a).toBeCloseTo(b, 6);
  });

  test('with no input and no load the rotor never accelerates on its own', () => {
    const { state } = openLoop<DcMotorState>(plant, { omega: 0, current: 0, angle: 0 }, 0, 5);
    expect(state.omega).toBeCloseTo(0, 6);
    expect(state.current).toBeCloseTo(0, 6);
  });

  test('the rotor angle integrates the speed', () => {
    // With a shorted armature the back-EMF brakes the rotor; the angle still
    // integrates whatever speed remains.
    const { state } = openLoop<DcMotorState>(plant, { omega: 100, current: 0, angle: 0 }, 0, 0.5);
    expect(state.angle).toBeGreaterThan(20);
    expect(state.omega).toBeLessThan(100);
  });

  test('a PI controller tracks the speed target', () => {
    const { state, samples } = closedLoop<DcMotorState>(
      plant,
      { omega: 0, current: 0, angle: 0 },
      { kp: 0.085, ki: 0.32, kd: 0.001 },
      200,
      4
    );
    expect(state.omega).toBeCloseTo(200, 0);
    expect(valueAt(samples, 2)).toBeGreaterThan(190);
  });

  test('the controller removes the steady state error caused by a load step', () => {
    const target = 200;
    const { state } = closedLoop<DcMotorState>(
      plant,
      { omega: 0, current: 0, angle: 0 },
      { kp: 0.085, ki: 0.32, kd: 0 },
      target,
      12,
      { disturbance: (t) => (t > 4 ? 0.02 : 0) }
    );
    expect(state.omega).toBeCloseTo(target, 0);
  });
});
