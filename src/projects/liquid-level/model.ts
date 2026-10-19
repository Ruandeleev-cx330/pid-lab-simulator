import { clamp, rk4Step, type VectorSpace } from '../../simulation/numerical-integrators';
import type { PlantModel } from '../../simulation/types';

/**
 * Gravity-drained tank (mass conservation).
 *
 *   A * dh/dt = q_in - k_o * sqrt(max(h, 0)) - q_leak
 *
 * Units: h [m], A [m^2], q [m^3/s], k_o [m^1.5/s].
 * The tank bottom is an explicit physical projection: h never goes negative, and
 * at h = 0 the outflow is exactly zero (no negative flow out of an empty tank).
 */
export interface LiquidLevelState {
  level: number;
}

export interface LiquidLevelParams {
  area: number;
  outflowCoefficient: number;
  maxInflow: number;
  maxLevel: number;
  minSafeLevel: number;
}

export const LIQUID_LEVEL_PARAMS: LiquidLevelParams = {
  area: 0.08,
  outflowCoefficient: 0.02,
  maxInflow: 0.05,
  maxLevel: 1.5,
  minSafeLevel: 0.02
};

export function createLiquidLevelPlant(params: LiquidLevelParams = LIQUID_LEVEL_PARAMS): PlantModel<LiquidLevelState> {
  const space: VectorSpace<LiquidLevelState> = {
    encode: (s) => [s.level],
    decode: (v) => ({ level: v[0] }),
    derivative: (v, u, d = 0) => {
      const h = Math.max(0, v[0]);
      const outflow = params.outflowCoefficient * Math.sqrt(h);
      return [(u - outflow - d) / params.area];
    },
    project: (v) => [Math.max(0, Math.min(params.maxLevel * 1.2, v[0]))]
  };

  return {
    id: 'liquid-level',
    name: '液位控制',
    outputLabel: '液位',
    outputUnit: 'm',
    disturbanceUnit: 'm³/s',
    actuator: { min: 0, max: params.maxInflow, unit: 'm³/s' },
    measure: (s) => s.level,
    telemetry: (s) => ({
      level: s.level,
      outflow: params.outflowCoefficient * Math.sqrt(Math.max(0, s.level))
    }),
    clone: (s) => ({ level: s.level }),
    isFinite: (s) => Number.isFinite(s.level),
    safety: (s) => {
      if (!Number.isFinite(s.level)) {
        return { ok: false, reason: '数值异常', detail: '液位状态不是有限数值' };
      }
      if (s.level >= params.maxLevel) {
        return { ok: false, reason: '储罐溢出', detail: `液位达到安全上限 ${params.maxLevel} m` };
      }
      if (s.level <= params.minSafeLevel) {
        return { ok: false, reason: '储罐抽空', detail: `液位低于安全下限 ${params.minSafeLevel} m` };
      }
      return { ok: true };
    },
    step: (s, u, dt, d = 0) => rk4Step(space, s, clamp(u, 0, params.maxInflow), dt, 1, d),
    render: (s) => ({
      level: s.level
    })
  };
}
