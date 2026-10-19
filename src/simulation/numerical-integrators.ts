/**
 * Numerical integration helpers.
 *
 * Every plant provides a vector space mapping (encode/decode/derivative) so the
 * integrator can stay completely generic and independently testable.
 */

export interface VectorSpace<S> {
  encode(state: S): number[];
  decode(vector: number[]): S;
  /**
   * d(state)/dt for a zero-order-hold actuator command `u` and an optional
   * external disturbance `d` expressed in the plant's disturbance unit.
   */
  derivative(vector: number[], u: number, d: number): number[];
  /**
   * Optional physical projection applied after every sub-step
   * (e.g. tank level cannot become negative).
   */
  project?(vector: number[]): number[];
}

function addScaled(a: number[], b: number[], h: number): number[] {
  const out = new Array<number>(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] + b[i] * h;
  return out;
}

/**
 * Classical 4th order Runge-Kutta for one fixed step.
 *
 * `substeps` exists for stiff plants (the DC motor electrical time constant is
 * ~5 ms, i.e. smaller than the 10 ms control period). Sub-stepping changes only
 * the internal integration resolution: the controller still runs at SIM_DT and
 * the simulation clock advances by exactly `dt`.
 */
export function rk4Step<S>(
  space: VectorSpace<S>,
  state: S,
  u: number,
  dt: number,
  substeps = 1,
  disturbance = 0
): S {
  const n = Math.max(1, Math.floor(substeps));
  const h = dt / n;
  let v = space.encode(state);

  for (let s = 0; s < n; s += 1) {
    const k1 = space.derivative(v, u, disturbance);
    const k2 = space.derivative(addScaled(v, k1, h / 2), u, disturbance);
    const k3 = space.derivative(addScaled(v, k2, h / 2), u, disturbance);
    const k4 = space.derivative(addScaled(v, k3, h), u, disturbance);

    const next = new Array<number>(v.length);
    for (let i = 0; i < v.length; i += 1) {
      next[i] = v[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    v = space.project ? space.project(next) : next;
  }

  return space.decode(v);
}

/** Explicit Euler, only used by tests to demonstrate step-size sensitivity. */
export function eulerStep<S>(space: VectorSpace<S>, state: S, u: number, dt: number, disturbance = 0): S {
  const v = space.encode(state);
  const d = space.derivative(v, u, disturbance);
  let next = new Array<number>(v.length);
  for (let i = 0; i < v.length; i += 1) next[i] = v[i] + d[i] * dt;
  if (space.project) next = space.project(next);
  return space.decode(next);
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
