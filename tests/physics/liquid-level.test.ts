import {
  createLiquidLevelPlant,
  LIQUID_LEVEL_PARAMS,
  type LiquidLevelState
} from '../../src/projects/liquid-level/model';
import { closedLoop, openLoop, valueAt } from '../helpers/sim';

const plant = createLiquidLevelPlant();
const { outflowCoefficient: k, area: A, maxInflow } = LIQUID_LEVEL_PARAMS;

/** Equilibrium level for a constant inflow. */
const equilibrium = (q: number) => (q / k) ** 2;

describe('liquid level plant', () => {
  test('inflow above the outflow raises the level', () => {
    const { state } = openLoop<LiquidLevelState>(plant, { level: 0.4 }, 0.03, 5);
    expect(state.level).toBeGreaterThan(0.4);
  });

  test('inflow below the outflow drains the tank', () => {
    const { state } = openLoop<LiquidLevelState>(plant, { level: 1.0 }, 0.005, 10);
    expect(state.level).toBeLessThan(1.0);
  });

  test('the tank settles at the analytic equilibrium for a constant inflow', () => {
    const q = 0.02;
    const { state } = openLoop<LiquidLevelState>(plant, { level: 0.2 }, q, 120);
    expect(state.level).toBeCloseTo(equilibrium(q), 2);
  });

  test('the outflow follows the square root law', () => {
    const outflow = (h: number) => k * Math.sqrt(h);
    const { samples } = openLoop<LiquidLevelState>(plant, { level: 1 }, 0, 0.02);
    const drop = valueAt(samples, 0) - valueAt(samples, 0.02);
    expect(drop).toBeCloseTo((outflow(1) / A) * 0.02, 4);
  });

  test('the level never becomes negative', () => {
    const { state } = openLoop<LiquidLevelState>(plant, { level: 0.01 }, 0, 30);
    expect(state.level).toBeGreaterThanOrEqual(0);
    expect(state.level).toBe(0);
  });

  test('an empty tank with inflow starts filling immediately', () => {
    const { state } = openLoop<LiquidLevelState>(plant, { level: 0 }, 0.02, 1);
    expect(state.level).toBeGreaterThan(0);
  });

  test('overflow trips the safety envelope', () => {
    const { state } = openLoop<LiquidLevelState>(plant, { level: 1.45 }, maxInflow, 5);
    const safety = plant.safety(state);
    expect(safety.ok).toBe(false);
    expect(safety.reason).toBe('储罐溢出');
  });

  test('a PI controller holds the target level', () => {
    const { state, samples } = closedLoop<LiquidLevelState>(
      plant,
      { level: 0.2 },
      { kp: 0.03, ki: 0.0034, kd: 0.02 },
      0.8,
      80
    );
    expect(state.level).toBeCloseTo(0.8, 2);
    expect(valueAt(samples, 80)).toBeGreaterThan(0.79);
  });

  test('the controller rejects an extra outflow disturbance', () => {
    const { state } = closedLoop<LiquidLevelState>(
      plant,
      { level: 0.2 },
      { kp: 0.03, ki: 0.0034, kd: 0.02 },
      0.8,
      120,
      { disturbance: (t) => (t > 40 && t < 52 ? 0.012 : 0) }
    );
    expect(state.level).toBeCloseTo(0.8, 2);
  });
});
