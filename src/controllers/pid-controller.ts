/**
 * Discrete-time PID controller.
 *
 *   P_k   = Kp * e_k
 *   I_k+1 = I_k + Ki * e_k * dt                (conditional integration)
 *   D_k   = -Kd * ydot_f,k                     (derivative on measurement)
 *   ydot_f,k = a * ydot_f,k-1 + (1-a) * (y_k - y_k-1) / dt
 *   a     = tf / (tf + dt)
 *   u_k   = clamp(P + I + D, u_min, u_max)
 *
 * Design notes:
 *  - The derivative acts on the *measurement*, so a setpoint step never causes
 *    a derivative kick.
 *  - Anti-windup is conditional integration: while the actuator is saturated and
 *    the error would push it further into saturation, the integral is frozen.
 *  - Changing gains never resets the internal state (integral / filter), so live
 *    tuning produces a continuous response.
 */

export interface PidGains {
  kp: number;
  ki: number;
  kd: number;
}

export interface PidConfig {
  gains: PidGains;
  /** Actuator limits applied to the output. */
  outputMin: number;
  outputMax: number;
  /** Derivative filter time constant in seconds. */
  derivativeFilterTau: number;
  /** Numerical guard for the integral term. Defaults to 2x the actuator span. */
  integralLimit?: number;
}

export interface PidStepResult {
  /** Clamped actuator command. */
  output: number;
  /** Unclamped controller output, useful for diagnostics. */
  rawOutput: number;
  p: number;
  i: number;
  d: number;
  error: number;
  saturated: boolean;
}

export class PidController {
  private kp: number;
  private ki: number;
  private kd: number;
  private readonly outputMin: number;
  private readonly outputMax: number;
  private readonly tau: number;
  private readonly integralLimit: number;

  private integral = 0;
  private filteredDerivative = 0;
  private previousMeasurement = 0;
  private initialized = false;
  private fault: string | null = null;

  constructor(config: PidConfig) {
    this.kp = config.gains.kp;
    this.ki = config.gains.ki;
    this.kd = config.gains.kd;
    this.outputMin = config.outputMin;
    this.outputMax = config.outputMax;
    this.tau = Math.max(0, config.derivativeFilterTau);
    this.integralLimit = config.integralLimit ?? Math.max(1, (config.outputMax - config.outputMin) * 2);
    this.validateGains();
  }

  getGains(): PidGains {
    return { kp: this.kp, ki: this.ki, kd: this.kd };
  }

  /**
   * Live gain update. Internal state is deliberately preserved so the running
   * response stays continuous.
   */
  setGains(gains: PidGains): void {
    if (!Number.isFinite(gains.kp) || !Number.isFinite(gains.ki) || !Number.isFinite(gains.kd)) {
      this.fault = 'PID 参数包含非法数值（NaN/Infinity）';
      return;
    }
    this.kp = gains.kp;
    this.ki = gains.ki;
    this.kd = gains.kd;
    this.validateGains();
  }

  getIntegral(): number {
    return this.integral;
  }

  getFilteredDerivative(): number {
    return this.filteredDerivative;
  }

  getFault(): string | null {
    return this.fault;
  }

  /** Full reset: integral, derivative filter and previous measurement. */
  reset(measurement: number): void {
    this.integral = 0;
    this.filteredDerivative = 0;
    this.previousMeasurement = Number.isFinite(measurement) ? measurement : 0;
    this.initialized = true;
    this.fault = null;
  }

  update(target: number, measurement: number, dt: number): PidStepResult {
    if (!Number.isFinite(target) || !Number.isFinite(measurement) || !Number.isFinite(dt) || dt <= 0) {
      this.fault = 'PID 输入非法（目标值/测量值/步长）';
      return {
        output: 0,
        rawOutput: 0,
        p: 0,
        i: 0,
        d: 0,
        error: 0,
        saturated: false
      };
    }

    if (!this.initialized) {
      this.previousMeasurement = measurement;
      this.initialized = true;
    }

    const error = target - measurement;
    const p = this.kp * error;

    // --- derivative on measurement, first order filtered -------------------
    const rawDerivative = (measurement - this.previousMeasurement) / dt;
    const alpha = this.tau / (this.tau + dt);
    this.filteredDerivative = alpha * this.filteredDerivative + (1 - alpha) * rawDerivative;
    const d = -this.kd * this.filteredDerivative;
    this.previousMeasurement = measurement;

    // --- conditional integration (anti-windup) -----------------------------
    const previousRaw = p + this.integral + d;
    const candidateIntegral = this.integral + this.ki * error * dt;
    const candidateRaw = p + candidateIntegral + d;

    const pushingUp = previousRaw >= this.outputMax && candidateRaw > previousRaw;
    const pushingDown = previousRaw <= this.outputMin && candidateRaw < previousRaw;

    if (!pushingUp && !pushingDown) {
      this.integral = candidateIntegral;
    }
    if (!Number.isFinite(this.integral)) {
      this.integral = 0;
      this.fault = '积分项发散（数值保护已复位积分器）';
    }
    this.integral = Math.max(-this.integralLimit, Math.min(this.integralLimit, this.integral));

    const rawOutput = p + this.integral + d;
    const output = Math.min(this.outputMax, Math.max(this.outputMin, rawOutput));
    const saturated = rawOutput > this.outputMax + 1e-9 || rawOutput < this.outputMin - 1e-9;

    if (!Number.isFinite(output)) {
      this.fault = 'PID 输出非法（数值发散）';
      return { output: 0, rawOutput: 0, p, i: this.integral, d, error, saturated: false };
    }

    return { output, rawOutput, p, i: this.integral, d, error, saturated };
  }

  private validateGains(): void {
    // Negative gains are physically meaningless for the plants shipped here and
    // are rejected by the UI long before reaching the controller.
    if (this.kp < 0 || this.ki < 0 || this.kd < 0) {
      this.fault = 'PID 增益不能为负值';
    }
  }
}
