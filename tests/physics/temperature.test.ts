import {
  createTemperaturePlant,
  TEMPERATURE_PARAMS,
  type TemperatureState
} from '../../src/projects/temperature/model';
import { closedLoop, openLoop, valueAt } from '../helpers/sim';

const plant = createTemperaturePlant();
const ambient = TEMPERATURE_PARAMS.ambient;
const tau = TEMPERATURE_PARAMS.heatCapacity / TEMPERATURE_PARAMS.lossCoefficient;

describe('temperature plant', () => {
  test('a hot object cools towards ambient with no heating', () => {
    const { state } = openLoop<TemperatureState>(plant, { temperature: 80 }, 0, 60);
    const expected = ambient + (80 - ambient) * Math.exp(-60 / tau);
    expect(state.temperature).toBeCloseTo(expected, 1);
    expect(state.temperature).toBeGreaterThan(ambient);
  });

  test('heating raises the temperature with the correct time constant', () => {
    const power = 600;
    const steady = ambient + power / TEMPERATURE_PARAMS.lossCoefficient;
    const { samples, state } = openLoop<TemperatureState>(plant, { temperature: ambient }, power, 60);
    // 63.2% of the way after one thermal time constant
    const atTau = valueAt(samples, tau);
    expect(atTau).toBeCloseTo(ambient + (steady - ambient) * (1 - Math.exp(-1)), 1);
    expect(state.temperature).toBeCloseTo(steady, 0);
  });

  test('thermal inertia prevents instant jumps', () => {
    const { samples } = openLoop<TemperatureState>(plant, { temperature: ambient }, 1200, 1);
    const maxStep = samples.reduce((acc, s, i) => (i === 0 ? 0 : Math.max(acc, s.y - samples[i - 1].y)), 0);
    // dT per 10 ms cannot exceed P_max/C * dt
    expect(maxStep).toBeLessThanOrEqual((TEMPERATURE_PARAMS.maxPower / TEMPERATURE_PARAMS.heatCapacity) * 0.01 + 1e-6);
  });

  test('a negative heat disturbance actually removes energy', () => {
    const withDist = openLoop<TemperatureState>(plant, { temperature: 90 }, 400, 20, -700).state.temperature;
    const without = openLoop<TemperatureState>(plant, { temperature: 90 }, 400, 20, 0).state.temperature;
    expect(withDist).toBeLessThan(without);
  });

  test('over temperature trips the safety envelope', () => {
    const result = openLoop<TemperatureState>(plant, { temperature: 200 }, 0, 0.1);
    const safety = plant.safety(result.state);
    expect(safety.ok).toBe(false);
    expect(safety.reason).toContain('超温');
  });

  test('a PI controller reaches the target without a steady state error', () => {
    const { state, samples } = closedLoop<TemperatureState>(
      plant,
      { temperature: ambient },
      { kp: 34, ki: 1.6, kd: 12 },
      80,
      120
    );
    expect(valueAt(samples, 120)).toBeCloseTo(80, 0);
    expect(state.temperature).toBeGreaterThan(79);
    expect(state.temperature).toBeLessThan(81);
  });

  test('the actuator range rejects negative heating power', () => {
    const { state } = openLoop<TemperatureState>(plant, { temperature: 100 }, -500, 1);
    // Negative power is clamped to 0 W, so the block simply cools towards ambient.
    const expected = ambient + (100 - ambient) * Math.exp(-1 / tau);
    expect(state.temperature).toBeCloseTo(expected, 2);
  });
});
