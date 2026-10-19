/**
 * Runtime performance metrics.
 *
 * Every number here is derived from the same fixed-step sample stream that the
 * animation and the chart consume. Nothing is computed from wall clock time.
 */

export interface MetricsConfig {
  /** Absolute tolerance band around the target (project units). */
  toleranceAbs: number;
  /** Relative tolerance, used as max(toleranceAbs, |target| * toleranceRel). */
  toleranceRel?: number;
  /** Time the system must stay inside the band before it counts as settled. */
  holdTime: number;
  /** Averaging window for the steady state error (seconds). */
  steadyWindow?: number;
  /** Window used for the oscillation detector (seconds). */
  oscillationWindow?: number;
}

export interface MetricsSnapshot {
  time: number;
  target: number;
  measurement: number;
  error: number;
  absError: number;
  control: number;
  saturated: boolean;
  band: number;
  peakOvershoot: number;
  overshootPct: number;
  iae: number;
  ise: number;
  settleTime: number | null;
  dwellTime: number;
  steadyStateError: number;
  oscillationAmplitude: number;
  oscillationCrossings: number;
  disturbanceCount: number;
  timeSinceDisturbance: number | null;
  insideBand: boolean;
}

const WINDOW_SAMPLES = 512;

export class MetricsTracker {
  private readonly cfg: Required<MetricsConfig>;
  private time = 0;
  private target = 0;
  private measurement = 0;
  private control = 0;
  private saturated = false;
  private referenceMeasurement = 0;
  private direction = 1;
  private iae = 0;
  private ise = 0;
  private peakDeviation = 0;
  /**
   * Overshoot is a property of the setpoint step response. Once a disturbance is
   * injected the "step" is over, so the peak deviation stops accumulating and the
   * recovery is judged by settling time / IAE / oscillation instead.
   */
  private peakFrozen = false;
  private bandEntry: number | null = null;
  private settleTime: number | null = null;
  private disturbanceCount = 0;
  private lastDisturbance: number | null = null;

  private readonly windowY = new Float64Array(WINDOW_SAMPLES);
  private readonly windowE = new Float64Array(WINDOW_SAMPLES);
  private readonly windowT = new Float64Array(WINDOW_SAMPLES);
  private windowHead = 0;
  private windowLength = 0;

  constructor(config: MetricsConfig) {
    this.cfg = {
      toleranceAbs: config.toleranceAbs,
      toleranceRel: config.toleranceRel ?? 0,
      holdTime: config.holdTime,
      steadyWindow: config.steadyWindow ?? 2,
      oscillationWindow: config.oscillationWindow ?? 1.5
    };
  }

  get config(): Required<MetricsConfig> {
    return this.cfg;
  }

  /**
   * Restart the metric window. `measurement` and `target` define the step
   * reference used by the overshoot calculation.
   */
  reset(measurement: number, target: number): void {
    this.time = 0;
    this.target = target;
    this.measurement = measurement;
    this.control = 0;
    this.saturated = false;
    this.referenceMeasurement = measurement;
    const delta = target - measurement;
    this.direction = delta >= 0 ? 1 : -1;
    this.iae = 0;
    this.ise = 0;
    this.peakDeviation = 0;
    this.peakFrozen = false;
    this.bandEntry = null;
    this.settleTime = null;
    this.disturbanceCount = 0;
    this.lastDisturbance = null;
    this.windowHead = 0;
    this.windowLength = 0;
  }

  /** Called when the setpoint changes at runtime: re-baselines overshoot. */
  markSetpointChange(t: number, measurement: number, target: number): void {
    void t;
    this.target = target;
    this.referenceMeasurement = measurement;
    const delta = target - measurement;
    this.direction = delta >= 0 ? 1 : -1;
    this.peakDeviation = 0;
    this.peakFrozen = false;
    // The previous in-band history does not apply to the new target, so the
    // settling window restarts. A setpoint change is NOT a disturbance.
    this.bandEntry = null;
    this.settleTime = null;
  }

  /**
   * A disturbance invalidates the current "settled" verdict: the system has to
   * hold the band again afterwards.
   */
  markDisturbance(t: number, freezeOvershoot = true): void {
    this.lastDisturbance = t;
    this.disturbanceCount += 1;
    this.bandEntry = null;
    this.settleTime = null;
    if (freezeOvershoot) this.peakFrozen = true;
  }

  observe(t: number, target: number, measurement: number, control: number, saturated: boolean, dt: number): void {
    this.time = t;
    this.target = target;
    this.measurement = measurement;
    this.control = control;
    this.saturated = saturated;

    const error = target - measurement;
    this.iae += Math.abs(error) * dt;
    this.ise += error * error * dt;

    if (!this.peakFrozen) {
      const deviation = this.direction * (measurement - target);
      if (deviation > this.peakDeviation) this.peakDeviation = deviation;
    }

    const band = this.band;
    if (Math.abs(error) <= band) {
      if (this.bandEntry === null) this.bandEntry = t;
      const dwell = t - this.bandEntry + dt;
      if (this.settleTime === null && dwell >= this.cfg.holdTime) {
        this.settleTime = this.bandEntry;
      }
    } else {
      this.bandEntry = null;
    }

    this.windowY[this.windowHead] = measurement;
    this.windowE[this.windowHead] = error;
    this.windowT[this.windowHead] = t;
    this.windowHead = (this.windowHead + 1) % WINDOW_SAMPLES;
    if (this.windowLength < WINDOW_SAMPLES) this.windowLength += 1;
  }

  get band(): number {
    return Math.max(this.cfg.toleranceAbs, Math.abs(this.target) * this.cfg.toleranceRel);
  }

  get dwellTime(): number {
    if (this.bandEntry === null) return 0;
    return this.time - this.bandEntry;
  }

  private windowIterate(cb: (t: number, y: number, e: number) => void): void {
    const start = (this.windowHead - this.windowLength + WINDOW_SAMPLES) % WINDOW_SAMPLES;
    for (let i = 0; i < this.windowLength; i += 1) {
      const idx = (start + i) % WINDOW_SAMPLES;
      cb(this.windowT[idx], this.windowY[idx], this.windowE[idx]);
    }
  }

  private computeSteadyStateError(): number {
    const cutoff = this.time - this.cfg.steadyWindow;
    let sum = 0;
    let count = 0;
    this.windowIterate((t, _y, e) => {
      if (t >= cutoff) {
        sum += e;
        count += 1;
      }
    });
    if (count === 0) return this.target - this.measurement;
    return sum / count;
  }

  private computeOscillation(): { amplitude: number; crossings: number } {
    const cutoff = this.time - this.cfg.oscillationWindow;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let crossings = 0;
    let prevDelta = 0;
    let prevY = Number.NaN;
    let count = 0;
    this.windowIterate((t, y) => {
      if (t < cutoff) return;
      if (y < min) min = y;
      if (y > max) max = y;
      if (Number.isFinite(prevY)) {
        const delta = y - prevY;
        const sign = delta > 1e-12 ? 1 : delta < -1e-12 ? -1 : 0;
        if (sign !== 0) {
          if (prevDelta !== 0 && sign !== prevDelta) crossings += 1;
          prevDelta = sign;
        }
      }
      prevY = y;
      count += 1;
    });
    if (count < 3 || crossings < 2) return { amplitude: 0, crossings };
    // A monotonic ramp is not an oscillation: only report the peak-to-peak swing
    // once the signal has actually reversed direction twice in the window.
    return { amplitude: max - min, crossings };
  }

  get overshootPct(): number {
    const stepSize = Math.abs(this.target - this.referenceMeasurement);
    const denominator = Math.max(stepSize, this.cfg.toleranceAbs * 2, 1e-9);
    return Math.max(0, this.peakDeviation) / denominator * 100;
  }

  snapshot(): MetricsSnapshot {
    const osc = this.computeOscillation();
    return {
      time: this.time,
      target: this.target,
      measurement: this.measurement,
      error: this.target - this.measurement,
      absError: Math.abs(this.target - this.measurement),
      control: this.control,
      saturated: this.saturated,
      band: this.band,
      peakOvershoot: this.peakDeviation,
      overshootPct: this.overshootPct,
      iae: this.iae,
      ise: this.ise,
      settleTime: this.settleTime,
      dwellTime: this.dwellTime,
      steadyStateError: this.computeSteadyStateError(),
      oscillationAmplitude: osc.amplitude,
      oscillationCrossings: osc.crossings,
      disturbanceCount: this.disturbanceCount,
      timeSinceDisturbance: this.lastDisturbance === null ? null : this.time - this.lastDisturbance,
      insideBand: Math.abs(this.target - this.measurement) <= this.band
    };
  }

  getTime(): number {
    return this.time;
  }
}
