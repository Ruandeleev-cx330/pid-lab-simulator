import { clamp, rk4Step, type VectorSpace } from '../../simulation/numerical-integrators';
import type { PlantModel } from '../../simulation/types';

/**
 * Inverted pendulum on a cart (nonlinear cart-pole, point mass at distance l).
 *
 *   (M+m) x'' + m*l*cos(theta)*theta'' - m*l*sin(theta)*theta'^2 = F - b_c*x'
 *   m*l*cos(theta)*x'' + m*l^2*theta'' - m*g*l*sin(theta)        = -b_p*theta'
 *
 * Solved analytically for the accelerations:
 *   den = l*(M + m*sin^2(theta))
 *   theta'' = [(M+m)*g*sin(theta) - (F/l)*cos(theta) - m*cos(theta)*sin(theta)*theta'^2] / den
 *   x''     = [F - b_c*x' + m*l*sin(theta)*theta'^2 - m*g*sin(theta)*cos(theta)
 *              + b_p*theta'*cos(theta)/l] / (M + m*sin^2(theta))
 *
 * Actuator polarity: u is a drive command, the physical horizontal force is
 * F = -u. Positive u therefore accelerates the cart towards -x. With the angle
 * measured positive towards +x, a positive angle error produces a negative
 * command, which drives the cart towards the lean and stands the pole up - the
 * physically correct behaviour for an inverted pendulum (you must move the pivot
 * under the falling mass). This polarity constant is documented in
 * docs/physics-models.md and verified by tests/physics/pendulum.test.ts.
 *
 * Units: kg, m, N, rad, s.
 */
export interface InvertedPendulumState {
  x: number;
  xDot: number;
  theta: number;
  thetaDot: number;
}

export interface InvertedPendulumParams {
  cartMass: number;
  bobMass: number;
  length: number;
  gravity: number;
  cartFriction: number;
  pivotDamping: number;
  maxForce: number;
  railLimit: number;
  fallAngle: number;
  maxRate: number;
}

export const INVERTED_PENDULUM_PARAMS: InvertedPendulumParams = {
  cartMass: 0.5,
  bobMass: 0.2,
  length: 0.6,
  gravity: 9.81,
  cartFriction: 0.1,
  pivotDamping: 0.002,
  maxForce: 15,
  railLimit: 2.4,
  fallAngle: 0.6,
  maxRate: 10
};

/** Drive polarity: physical force = -u. */
export const PENDULUM_DRIVE_POLARITY = -1;

export function createInvertedPendulumPlant(
  params: InvertedPendulumParams = INVERTED_PENDULUM_PARAMS
): PlantModel<InvertedPendulumState> {
  const { cartMass: M, bobMass: m, length: l, gravity: g, cartFriction: bc, pivotDamping: bp } = params;

  const space: VectorSpace<InvertedPendulumState> = {
    encode: (s) => [s.x, s.xDot, s.theta, s.thetaDot],
    decode: (v) => ({ x: v[0], xDot: v[1], theta: v[2], thetaDot: v[3] }),
    derivative: (v, u, d = 0) => {
      const [, xDot, theta, thetaDot] = v;
      const F = PENDULUM_DRIVE_POLARITY * u + d;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      const den = l * (M + m * sin * sin);

      const thetaAcc =
        ((M + m) * g * sin - (F / l) * cos - m * cos * sin * thetaDot * thetaDot) / den;
      const xAcc =
        (F - bc * xDot + m * l * sin * thetaDot * thetaDot - m * g * sin * cos + (bp * thetaDot * cos) / l) /
        (M + m * sin * sin);

      return [xDot, xAcc, thetaDot, thetaAcc];
    }
  };

  return {
    id: 'inverted-pendulum',
    name: '倒立摆',
    outputLabel: '摆杆倾角',
    outputUnit: '°',
    disturbanceUnit: 'N',
    actuator: { min: -params.maxForce, max: params.maxForce, unit: 'N' },
    measure: (s) => (s.theta * 180) / Math.PI,
    telemetry: (s) => ({
      thetaDeg: (s.theta * 180) / Math.PI,
      thetaDot: s.thetaDot,
      cartPosition: s.x,
      cartSpeed: s.xDot
    }),
    clone: (s) => ({ ...s }),
    isFinite: (s) => Number.isFinite(s.x) && Number.isFinite(s.xDot) && Number.isFinite(s.theta) && Number.isFinite(s.thetaDot),
    safety: (s) => {
      if (!Number.isFinite(s.x) || !Number.isFinite(s.theta)) {
        return { ok: false, reason: '数值异常', detail: '倒立摆状态出现非有限数值' };
      }
      if (Math.abs(s.theta) > params.fallAngle) {
        return {
          ok: false,
          reason: '摆杆倒下',
          detail: `摆角超过 ${((params.fallAngle * 180) / Math.PI).toFixed(0)}° 的可恢复边界`
        };
      }
      if (Math.abs(s.x) > params.railLimit) {
        return { ok: false, reason: '小车越界', detail: `小车超出 ±${params.railLimit} m 轨道范围` };
      }
      if (Math.abs(s.thetaDot) > params.maxRate) {
        return { ok: false, reason: '角速度失控', detail: `摆杆角速度超过 ${params.maxRate} rad/s` };
      }
      return { ok: true };
    },
    step: (s, u, dt, d = 0) => rk4Step(space, s, clamp(u, -params.maxForce, params.maxForce), dt, 2, d),
    render: (s) => ({
      x: s.x,
      thetaDeg: (s.theta * 180) / Math.PI,
      thetaDot: s.thetaDot
    })
  };
}

export function initialPendulumState(thetaDeg: number, x = 0): InvertedPendulumState {
  return { x, xDot: 0, theta: (thetaDeg * Math.PI) / 180, thetaDot: 0 };
}
