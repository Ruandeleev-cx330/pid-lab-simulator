import { clamp, rk4Step, type VectorSpace } from '../../simulation/numerical-integrators';
import type { PlantModel } from '../../simulation/types';

/**
 * Two wheel balancing robot - teaching model.
 *
 * State: body pitch angle theta [rad], angular rate omega [rad/s], wheel angle
 * phi [rad] and wheel rate omegaW [rad/s].
 *
 *   J_b * domega/dt = m*g*l*sin(theta) - b*omega + u + tau_ext
 *   J_w * domegaW/dt = -u - b_w*omegaW
 *   dphi/dt  = omegaW
 *   dx/dt    = r * omegaW      (rolling without slipping)
 *   dtheta/dt = omega
 *
 * `u` is the reaction torque that the drive system applies to the *body*
 * (u = -wheel torque). This mirrors real hardware: to catch a lean towards +theta
 * the wheels must be driven towards +theta, so the body receives a torque of the
 * opposite sign. Gravity produces the unstable term m*g*l*sin(theta) > 0 for
 * theta > 0, which is exactly the inverted pendulum instability.
 *
 * Units: kg, m, N*m, rad, s.
 */
export interface BalancingRobotState {
  theta: number;
  omega: number;
  wheelAngle: number;
  wheelSpeed: number;
  drift: number;
}

export interface BalancingRobotParams {
  bodyMass: number;
  comHeight: number;
  inertia: number;
  damping: number;
  gravity: number;
  wheelInertia: number;
  wheelDamping: number;
  wheelRadius: number;
  maxTorque: number;
  fallAngle: number;
  maxRate: number;
}

export const BALANCING_ROBOT_PARAMS: BalancingRobotParams = {
  bodyMass: 1.5,
  comHeight: 0.35,
  inertia: 0.35,
  damping: 0.05,
  gravity: 9.81,
  wheelInertia: 0.02,
  wheelDamping: 0.05,
  wheelRadius: 0.075,
  maxTorque: 8,
  fallAngle: 0.7,
  maxRate: 12
};

export function createBalancingRobotPlant(
  params: BalancingRobotParams = BALANCING_ROBOT_PARAMS
): PlantModel<BalancingRobotState> {
  const gravityTorque = params.bodyMass * params.gravity * params.comHeight;

  const space: VectorSpace<BalancingRobotState> = {
    encode: (s) => [s.theta, s.omega, s.wheelAngle, s.wheelSpeed, s.drift],
    decode: (v) => ({ theta: v[0], omega: v[1], wheelAngle: v[2], wheelSpeed: v[3], drift: v[4] }),
    derivative: (v, u, d = 0) => {
      const theta = v[0];
      const omega = v[1];
      const wheelSpeed = v[3];
      return [
        omega,
        (gravityTorque * Math.sin(theta) - params.damping * omega + u + d) / params.inertia,
        wheelSpeed,
        (-u - params.wheelDamping * wheelSpeed) / params.wheelInertia,
        params.wheelRadius * wheelSpeed
      ];
    }
  };

  return {
    id: 'balancing-robot',
    name: '二轮平衡小车',
    outputLabel: '车身倾角',
    outputUnit: '°',
    disturbanceUnit: 'N·m',
    actuator: { min: -params.maxTorque, max: params.maxTorque, unit: 'N·m' },
    measure: (s) => (s.theta * 180) / Math.PI,
    telemetry: (s) => ({
      thetaDeg: (s.theta * 180) / Math.PI,
      omega: s.omega,
      wheelSpeed: s.wheelSpeed,
      drift: s.drift
    }),
    clone: (s) => ({ ...s }),
    isFinite: (s) =>
      Number.isFinite(s.theta) && Number.isFinite(s.omega) && Number.isFinite(s.wheelAngle) && Number.isFinite(s.drift),
    safety: (s) => {
      if (!Number.isFinite(s.theta) || !Number.isFinite(s.omega)) {
        return { ok: false, reason: '数值异常', detail: '车身状态出现非有限数值' };
      }
      if (Math.abs(s.theta) > params.fallAngle) {
        return {
          ok: false,
          reason: '车身倾倒',
          detail: `倾角超过 ${((params.fallAngle * 180) / Math.PI).toFixed(0)}° 的可恢复边界`
        };
      }
      if (Math.abs(s.omega) > params.maxRate) {
        return { ok: false, reason: '角速度失控', detail: `角速度超过 ${params.maxRate} rad/s` };
      }
      return { ok: true };
    },
    step: (s, u, dt, d = 0) => rk4Step(space, s, clamp(u, -params.maxTorque, params.maxTorque), dt, 2, d),
    render: (s) => ({
      thetaDeg: (s.theta * 180) / Math.PI,
      wheelAngle: s.wheelAngle,
      wheelSpeed: s.wheelSpeed,
      drift: s.drift
    })
  };
}

export function initialBalancingState(thetaDeg: number): BalancingRobotState {
  return {
    theta: (thetaDeg * Math.PI) / 180,
    omega: 0,
    wheelAngle: 0,
    wheelSpeed: 0,
    drift: 0
  };
}
