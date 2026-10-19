import { SimulationEngine, createPlantDriver } from '../../src/simulation/engine';
import type { PlantModel } from '../../src/simulation/types';
import { SIM_DT } from '../../src/simulation/types';
import { getProject } from '../../src/projects/registry';
import { generateChallenge } from '../../src/challenges/generator';

/** Minimal first order plant: dy/dt = -y + u. */
function createTestPlant(): PlantModel<{ y: number }> {
  return {
    id: 'test',
    name: 'test',
    outputLabel: 'y',
    outputUnit: 'u',
    disturbanceUnit: 'u',
    actuator: { min: -10, max: 10, unit: 'u' },
    measure: (s) => s.y,
    telemetry: (s) => ({ y: s.y }),
    clone: (s) => ({ ...s }),
    isFinite: (s) => Number.isFinite(s.y),
    safety: (s) => ({ ok: Number.isFinite(s.y) }),
    step: (s, u, dt, d = 0) => {
      const k1 = -s.y + u + d;
      return { y: s.y + k1 * dt };
    },
    render: (s) => ({ y: s.y })
  };
}

function makeEngine(plant = createTestPlant()) {
  return new SimulationEngine(createPlantDriver(plant, { y: 0 }), {
    gains: { kp: 1, ki: 0, kd: 0 },
    target: 1,
    actuator: { min: -10, max: 10 },
    derivativeFilterTau: 0.02,
    metrics: { toleranceAbs: 0.05, holdTime: 1 },
    dt: SIM_DT
  });
}

describe('SimulationEngine', () => {
  test('each step advances the simulation clock by exactly one fixed step', () => {
    const engine = makeEngine();
    for (let i = 0; i < 37; i += 1) engine.step();
    expect(engine.getTime()).toBeCloseTo(0.37, 9);
  });

  test('the history sample and the live view share one timestamp and value', () => {
    const engine = makeEngine();
    engine.runFor(2);
    const view = engine.view();
    const last = engine.history.last();
    expect(last).not.toBeNull();
    expect(last!.t).toBeCloseTo(view.time, 9);
    expect(last!.y).toBeCloseTo(view.measurement, 9);
    expect(last!.r).toBeCloseTo(view.target, 9);
    expect(view.metrics.time).toBeCloseTo(view.time, 9);
    expect(view.metrics.measurement).toBeCloseTo(view.measurement, 9);
  });

  test('a disturbance changes the trajectory of the model, not just the drawing', () => {
    const base = makeEngine();
    base.runFor(3);
    const disturbed = makeEngine();
    disturbed.runFor(1);
    disturbed.addDisturbance('test', 5, 1, 'u');
    disturbed.runFor(2);
    expect(disturbed.view().measurement).toBeGreaterThan(base.view().measurement + 0.1);
  });

  test('a disturbance only acts inside its time window', () => {
    const engine = makeEngine();
    engine.addDisturbance('pulse', 5, 0.5, 'u');
    expect(engine.activeDisturbance()).toBe(5);
    engine.runFor(0.6);
    expect(engine.activeDisturbance()).toBe(0);
  });

  test('a non-finite plant state stops the simulation with a fault', () => {
    const bad: PlantModel<{ y: number }> = {
      ...createTestPlant(),
      step: () => ({ y: Number.NaN })
    };
    const engine = makeEngine(bad);
    engine.step();
    expect(engine.getFault()).not.toBeNull();
    const time = engine.getTime();
    engine.step();
    expect(engine.getTime()).toBe(time);
  });

  test('setpoint changes re-baseline the settling window and keep the state', () => {
    const project = getProject('dc-motor');
    const challenge = generateChallenge(project, 'beginner', 5, { validate: false });
    const engine = project.createEngine(challenge, { kp: 0.08, ki: 0.3, kd: 0 });
    engine.runFor(4);
    const value = engine.view().measurement;
    engine.setTarget(challenge.target + 20);
    const after = engine.view();
    expect(after.measurement).toBeCloseTo(value, 9);
    expect(after.metrics.settleTime).toBeNull();
    expect(after.target).toBeCloseTo(challenge.target + 20, 9);
  });
});
