import { clamp, rk4Step, type VectorSpace } from '../../simulation/numerical-integrators';
import type { PlantModel } from '../../simulation/types';

/**
 * First order thermal model.
 *
 *   C * dT/dt = P_h - K_loss * (T - T_ambient) + Q_disturbance
 *
 * Units: T [degC], C [J/K], P [W], K_loss [W/K], Q [W].
 * The heater is unidirectional (a heating element cannot cool), which is why the
 * actuator range starts at 0 W.
 */
export interface TemperatureState {
  temperature: number;
}

export interface TemperatureParams {
  heatCapacity: number;
  lossCoefficient: number;
  ambient: number;
  maxPower: number;
  overTempLimit: number;
  underTempLimit: number;
}

export const TEMPERATURE_PARAMS: TemperatureParams = {
  heatCapacity: 120,
  lossCoefficient: 12,
  ambient: 20,
  maxPower: 1200,
  overTempLimit: 160,
  underTempLimit: -5
};

export type TemperatureModel = PlantModel<TemperatureState>;

export function createTemperaturePlant(params: TemperatureParams = TEMPERATURE_PARAMS): TemperatureModel {
  const space: VectorSpace<TemperatureState> = {
    encode: (s) => [s.temperature],
    decode: (v) => ({ temperature: v[0] }),
    derivative: (v, u, d = 0) => [(u - params.lossCoefficient * (v[0] - params.ambient) + d) / params.heatCapacity]
  };

  return {
    id: 'temperature',
    name: '温度控制',
    outputLabel: '温度',
    outputUnit: '°C',
    disturbanceUnit: 'W',
    actuator: { min: 0, max: params.maxPower, unit: 'W' },
    measure: (s) => s.temperature,
    telemetry: (s) => ({
      temperature: s.temperature,
      lossPower: params.lossCoefficient * (s.temperature - params.ambient)
    }),
    clone: (s) => ({ temperature: s.temperature }),
    isFinite: (s) => Number.isFinite(s.temperature),
    safety: (s) => {
      if (!Number.isFinite(s.temperature)) {
        return { ok: false, reason: '数值异常', detail: '温度状态不是有限数值' };
      }
      if (s.temperature > params.overTempLimit) {
        return { ok: false, reason: '超温', detail: `温度超过安全上限 ${params.overTempLimit} °C` };
      }
      if (s.temperature < params.underTempLimit) {
        return { ok: false, reason: '低于安全温度', detail: `温度低于 ${params.underTempLimit} °C` };
      }
      return { ok: true };
    },
    step: (s, u, dt, d = 0) => rk4Step(space, s, clamp(u, 0, params.maxPower), dt, 1, d),
    render: (s) => ({
      temperature: s.temperature,
      glow: clamp((s.temperature - params.ambient) / 100, 0, 1)
    })
  };
}
