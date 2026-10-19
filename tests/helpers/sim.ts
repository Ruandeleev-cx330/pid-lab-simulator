import { PidController, type PidGains } from '../../src/controllers/pid-controller';
import type { PlantModel } from '../../src/simulation/types';

const DT = 0.01;

export interface Sample {
  t: number;
  y: number;
}

export function openLoop<S>(
  plant: PlantModel<S>,
  initial: S,
  u: number,
  seconds: number,
  disturbance = 0
): { state: S; samples: Sample[] } {
  let state = plant.clone(initial);
  const samples: Sample[] = [{ t: 0, y: plant.measure(state) }];
  const steps = Math.round(seconds / DT);
  for (let i = 1; i <= steps; i += 1) {
    state = plant.step(state, u, DT, disturbance);
    samples.push({ t: i * DT, y: plant.measure(state) });
    if (!plant.isFinite(state)) break;
  }
  return { state, samples };
}

export function closedLoop<S>(
  plant: PlantModel<S>,
  initial: S,
  gains: PidGains,
  target: number,
  seconds: number,
  options: { filterTau?: number; disturbance?: (t: number) => number } = {}
): { state: S; samples: Sample[]; control: number[]; stopped?: string } {
  const pid = new PidController({
    gains,
    outputMin: plant.actuator.min,
    outputMax: plant.actuator.max,
    derivativeFilterTau: options.filterTau ?? 0.02
  });
  let state = plant.clone(initial);
  pid.reset(plant.measure(state));
  const samples: Sample[] = [{ t: 0, y: plant.measure(state) }];
  const control: number[] = [0];
  const steps = Math.round(seconds / DT);

  for (let i = 1; i <= steps; i += 1) {
    const t = i * DT;
    const y = plant.measure(state);
    const u = pid.update(target, y, DT).output;
    const d = options.disturbance ? options.disturbance(t) : 0;
    state = plant.step(state, u, DT, d);
    control.push(u);
    samples.push({ t, y: plant.measure(state) });
    if (!plant.isFinite(state)) return { state, samples, control, stopped: 'non-finite' };
    const safety = plant.safety(state);
    if (!safety.ok) return { state, samples, control, stopped: safety.reason };
  }
  return { state, samples, control };
}

export function valueAt(samples: Sample[], t: number): number {
  const idx = Math.min(samples.length - 1, Math.round(t / DT));
  return samples[idx].y;
}

export function peak(samples: Sample[]): number {
  return samples.reduce((acc, s) => Math.max(acc, s.y), Number.NEGATIVE_INFINITY);
}

export function min(samples: Sample[]): number {
  return samples.reduce((acc, s) => Math.min(acc, s.y), Number.POSITIVE_INFINITY);
}
