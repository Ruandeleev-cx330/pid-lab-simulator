import { clamp, rk4Step, type VectorSpace } from '../../simulation/numerical-integrators';
import type { PlantModel } from '../../simulation/types';

/**
 * DC motor with armature dynamics.
 *
 *   J * domega/dt = Kt * i - b * omega - tau_load
 *   L * di/dt     = V - R * i - Ke * omega
 *   dtheta/dt     = omega                     (rotor angle, animation only)
 *
 * Units: omega [rad/s], i [A], V [V], tau [N*m], J [kg*m^2], L [H], R [ohm].
 * The electrical time constant (L/R = 5.3 ms) is shorter than the 10 ms control
 * period, so the plant integrates with 8 internal sub-steps for stability while
 * the controller keeps the fixed 10 ms period.
 */
export interface DcMotorState {
  omega: number;
  current: number;
  angle: number;
}

export interface DcMotorParams {
  inertia: number;
  viscousFriction: number;
  torqueConstant: number;
  backEmfConstant: number;
  resistance: number;
  inductance: number;
  maxVoltage: number;
  overSpeed: number;
  maxCurrent: number;
}

export const DC_MOTOR_PARAMS: DcMotorParams = {
  inertia: 0.0006,
  viscousFriction: 0.00002,
  torqueConstant: 0.05,
  backEmfConstant: 0.05,
  resistance: 1.5,
  inductance: 0.008,
  maxVoltage: 24,
  overSpeed: 700,
  maxCurrent: 30
};

const SUBSTEPS = 8;

export function createDcMotorPlant(params: DcMotorParams = DC_MOTOR_PARAMS): PlantModel<DcMotorState> {
  const space: VectorSpace<DcMotorState> = {
    encode: (s) => [s.omega, s.current, s.angle],
    decode: (v) => ({ omega: v[0], current: v[1], angle: v[2] }),
    derivative: (v, u, d = 0) => {
      const [omega, current] = v;
      const voltage = u;
      return [
        (params.torqueConstant * current - params.viscousFriction * omega - d) / params.inertia,
        (voltage - params.resistance * current - params.backEmfConstant * omega) / params.inductance,
        omega
      ];
    }
  };

  return {
    id: 'dc-motor',
    name: '直流电机转速',
    outputLabel: '转速',
    outputUnit: 'rad/s',
    disturbanceUnit: 'N·m',
    actuator: { min: 0, max: params.maxVoltage, unit: 'V' },
    measure: (s) => s.omega,
    telemetry: (s) => ({
      omega: s.omega,
      current: s.current,
      voltage: 0
    }),
    clone: (s) => ({ omega: s.omega, current: s.current, angle: s.angle }),
    isFinite: (s) => Number.isFinite(s.omega) && Number.isFinite(s.current) && Number.isFinite(s.angle),
    safety: (s) => {
      if (!Number.isFinite(s.omega) || !Number.isFinite(s.current)) {
        return { ok: false, reason: '数值异常', detail: '电机状态出现非有限数值' };
      }
      if (Math.abs(s.omega) > params.overSpeed) {
        return { ok: false, reason: '超速', detail: `转速超过 ${params.overSpeed} rad/s 保护阈值` };
      }
      if (Math.abs(s.current) > params.maxCurrent) {
        return { ok: false, reason: '过流', detail: `电枢电流超过 ${params.maxCurrent} A 保护阈值` };
      }
      return { ok: true };
    },
    step: (s, u, dt, d = 0) => rk4Step(space, s, clamp(u, 0, params.maxVoltage), dt, SUBSTEPS, d),
    render: (s) => ({
      omega: s.omega,
      angle: s.angle,
      current: s.current
    })
  };
}
