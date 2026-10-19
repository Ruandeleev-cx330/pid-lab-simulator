import { eulerStep, rk4Step, type VectorSpace } from '../../src/simulation/numerical-integrators';

interface Decay {
  y: number;
}

const decay: VectorSpace<Decay> = {
  encode: (s) => [s.y],
  decode: (v) => ({ y: v[0] }),
  derivative: (v) => [-v[0]]
};

describe('numerical integrators', () => {
  test('RK4 matches the analytic solution of dy/dt = -y', () => {
    let state: Decay = { y: 1 };
    for (let i = 0; i < 100; i += 1) state = rk4Step(decay, state, 0, 0.01);
    expect(state.y).toBeCloseTo(Math.exp(-1), 8);
  });

  test('RK4 converges with 4th order when the step is halved', () => {
    const integrate = (dt: number) => {
      let state: Decay = { y: 1 };
      const steps = Math.round(1 / dt);
      for (let i = 0; i < steps; i += 1) state = rk4Step(decay, state, 0, dt);
      return Math.abs(state.y - Math.exp(-1));
    };
    const coarse = integrate(0.05);
    const fine = integrate(0.025);
    const ratio = coarse / fine;
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(20);
  });

  test('Euler is less accurate than RK4 at the same step', () => {
    let euler: Decay = { y: 1 };
    let rk: Decay = { y: 1 };
    for (let i = 0; i < 100; i += 1) {
      euler = eulerStep(decay, euler, 0, 0.01);
      rk = rk4Step(decay, rk, 0, 0.01);
    }
    const analytic = Math.exp(-1);
    expect(Math.abs(euler.y - analytic)).toBeGreaterThan(Math.abs(rk.y - analytic) * 10);
  });

  test('sub-stepping does not change the simulation clock', () => {
    let single: Decay = { y: 1 };
    let sub: Decay = { y: 1 };
    single = rk4Step(decay, single, 0, 0.1, 1);
    sub = rk4Step(decay, sub, 0, 0.1, 8);
    expect(sub.y).toBeCloseTo(Math.exp(-0.1), 10);
    expect(single.y).toBeCloseTo(Math.exp(-0.1), 6);
  });

  test('projection keeps the state physically valid', () => {
    const tank: VectorSpace<Decay> = {
      encode: (s) => [s.y],
      decode: (v) => ({ y: v[0] }),
      derivative: () => [-1],
      project: (v) => [Math.max(0, v[0])]
    };
    let state: Decay = { y: 0.005 };
    for (let i = 0; i < 100; i += 1) state = rk4Step(tank, state, 0, 0.01);
    expect(state.y).toBe(0);
  });
});
