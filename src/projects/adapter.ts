import { createPlantDriver, SimulationEngine, type EngineView } from '../simulation/engine';
import type { SafetyEnvelope } from '../simulation/types';
import { SIM_DT } from '../simulation/types';
import type { ChallengeInstance, ProjectAdapter, ProjectSpec, SuccessCriteria, Verdict } from './types';

export const CONFIG_VERSION = '1.0.0';

/** Verdict reason used when the round ran out of time (not an unrecoverable fault). */
export const TIMEOUT_REASON = '超过挑战时限';

const fail = (reason: string, detail: string): Verdict => ({ status: 'failed', reason, detail });
const running = (reason: string, detail: string, permanent = false): Verdict => ({
  status: 'running',
  reason,
  detail,
  permanent
});

/**
 * Shared success logic. Project specific gates are appended through `extraCheck`
 * (e.g. "angular rate must also be small" for the inverted pendulum).
 */
export function evaluateVerdict(
  view: EngineView,
  safety: SafetyEnvelope<unknown>,
  criteria: SuccessCriteria,
  timeLimit: number,
  extraCheck?: (view: EngineView) => string | null
): Verdict {
  if (!safety.ok) {
    return fail(safety.reason ?? '安全边界越界', safety.detail ?? '被控对象进入不可恢复状态');
  }
  if (view.fault) {
    return fail('数值故障', view.fault.message);
  }

  const m = view.metrics;

  if (m.time > timeLimit) {
    const blocker =
      criteria.useOvershootGate !== false && m.overshootPct > criteria.maxOvershootPct
        ? '超调超限'
        : m.iae > criteria.maxIAE
          ? '累计误差超限'
          : criteria.requireDisturbance && m.disturbanceCount === 0
            ? '没有施加扰动'
            : m.dwellTime < criteria.holdTime
              ? '未在时限内稳定'
              : '状态条件未满足';
    return fail(TIMEOUT_REASON, `仿真时间超过 ${timeLimit.toFixed(0)} s 仍未达标（${blocker}）`);
  }

  if (m.time < criteria.minRunTime) {
    return running('观察期', `需要至少运行 ${criteria.minRunTime.toFixed(0)} s 才能判定`);
  }

  // Overshoot and IAE are monotonic: once the budget is exhausted this round can
  // no longer succeed. The simulation keeps running so the user can see what is
  // happening, but the verdict carries `permanent`.
  if (criteria.useOvershootGate !== false && m.overshootPct > criteria.maxOvershootPct) {
    return running(
      '超调超限',
      `超调 ${m.overshootPct.toFixed(1)}% 超过上限 ${criteria.maxOvershootPct.toFixed(0)}%，本轮已无法达标，可重置后调整参数`,
      true
    );
  }
  if (m.iae > criteria.maxIAE) {
    return running(
      '累计误差超限',
      `IAE ${m.iae.toFixed(1)} 超过上限 ${criteria.maxIAE.toFixed(0)}，本轮已无法达标，可重置后调整参数`,
      true
    );
  }
  if (m.dwellTime < criteria.holdTime) {
    return running(
      '稳定性观察中',
      `当前误差 ${m.absError.toFixed(3)}，需在容差 ±${m.band.toFixed(3)} 内保持 ${criteria.holdTime.toFixed(1)} s（已保持 ${m.dwellTime.toFixed(1)} s）`
    );
  }
  if (criteria.requireDisturbance) {
    if (m.disturbanceCount === 0) {
      return running('等待扰动测试', '本难度要求施加一次扰动，并在扰动后重新稳定');
    }
    if (m.timeSinceDisturbance === null || m.timeSinceDisturbance < criteria.holdTime) {
      return running(
        '扰动后恢复观察中',
        `扰动后需重新保持 ${criteria.holdTime.toFixed(1)} s（已保持 ${(m.timeSinceDisturbance ?? 0).toFixed(1)} s）`
      );
    }
  }
  if (m.oscillationAmplitude > criteria.maxOscillationAmp) {
    return running(
      '振荡幅度偏大',
      `最近窗口内峰峰值 ${m.oscillationAmplitude.toFixed(3)} 超过允许值 ${criteria.maxOscillationAmp.toFixed(3)}`
    );
  }
  if (criteria.rateLimit !== undefined && criteria.rateTelemetryKey) {
    const rate = Math.abs(view.telemetry[criteria.rateTelemetryKey] ?? 0);
    if (rate > criteria.rateLimit) {
      return running('角速度过大', `|ω| = ${rate.toFixed(2)} rad/s，需小于 ${criteria.rateLimit} rad/s`);
    }
  }
  if (extraCheck) {
    const reason = extraCheck(view);
    if (reason) return running('状态条件未满足', reason);
  }

  return {
    status: 'success',
    reason: '达标',
    detail: `稳态误差 ${m.steadyStateError.toFixed(3)}，超调 ${m.overshootPct.toFixed(1)}%，调节时间 ${
      m.settleTime === null ? '—' : `${m.settleTime.toFixed(1)} s`
    }`
  };
}

export interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  /** Live value / requirement text. */
  detail: string;
  /** Optional: a gate that can no longer be met in this round. */
  blocked?: boolean;
}

/**
 * Live rendering of the success conditions. The UI shows exactly the gates that
 * `evaluateVerdict` enforces, so the user can see what is still missing.
 */
export function buildChecklist(
  view: EngineView,
  criteria: SuccessCriteria,
  requireDisturbance: boolean,
  extraCheck?: (view: EngineView) => string | null
): ChecklistItem[] {
  const m = view.metrics;
  const items: ChecklistItem[] = [
    {
      key: 'time',
      label: '运行时间',
      ok: m.time >= criteria.minRunTime,
      detail: `${m.time.toFixed(1)} / ${criteria.minRunTime.toFixed(0)} s`
    },
    {
      key: 'band',
      label: '误差范围',
      ok: m.absError <= m.band,
      detail: `|e| = ${m.absError.toFixed(3)} / ±${m.band.toFixed(3)}`
    },
    {
      key: 'hold',
      label: '保持时间',
      ok: m.dwellTime >= criteria.holdTime,
      detail: `${m.dwellTime.toFixed(1)} / ${criteria.holdTime.toFixed(1)} s`
    },
    ...(criteria.useOvershootGate === false
      ? []
      : [
          {
            key: 'overshoot',
            label: '超调',
            ok: m.overshootPct <= criteria.maxOvershootPct,
            blocked: m.overshootPct > criteria.maxOvershootPct,
            detail: `${m.overshootPct.toFixed(1)}% / ≤${criteria.maxOvershootPct.toFixed(0)}%`
          }
        ]),
    {
      key: 'iae',
      label: 'IAE',
      ok: m.iae <= criteria.maxIAE,
      blocked: m.iae > criteria.maxIAE,
      detail: `${m.iae.toFixed(1)} / ≤${criteria.maxIAE.toFixed(0)}`
    },
    {
      key: 'oscillation',
      label: '振荡',
      ok: m.oscillationAmplitude <= criteria.maxOscillationAmp,
      detail: `${m.oscillationAmplitude.toFixed(3)} / ≤${criteria.maxOscillationAmp.toFixed(3)}`
    }
  ];

  if (criteria.rateLimit !== undefined && criteria.rateTelemetryKey) {
    const rate = Math.abs(view.telemetry[criteria.rateTelemetryKey] ?? 0);
    items.push({
      key: 'rate',
      label: '角速度',
      ok: rate <= criteria.rateLimit,
      detail: `${rate.toFixed(2)} / ≤${criteria.rateLimit} rad/s`
    });
  }

  if (requireDisturbance) {
    items.push({
      key: 'disturbance',
      label: '扰动恢复',
      ok: m.disturbanceCount > 0 && (m.timeSinceDisturbance ?? 0) >= criteria.holdTime,
      detail:
        m.disturbanceCount === 0
          ? '尚未施加扰动'
          : `${(m.timeSinceDisturbance ?? 0).toFixed(1)} / ${criteria.holdTime.toFixed(1)} s`
    });
  }

  if (extraCheck) {
    const reason = extraCheck(view);
    items.push({
      key: 'extra',
      label: '状态条件',
      ok: reason === null,
      detail: reason ?? '满足'
    });
  }

  return items;
}

/** Build the erased project adapter from a typed project specification. */
export function defineProject<S>(spec: ProjectSpec<S>): ProjectAdapter {
  return {
    meta: spec.meta,
    gainLimits: spec.gainLimits,
    gainHelp: spec.gainHelp,
    plans: spec.plans,
    defaultDifficulty: spec.defaultDifficulty,
    minSurvivalTime: spec.minSurvivalTime ?? 0,
    minStep: spec.minStep ?? 0,
    createEngine(challenge: ChallengeInstance, gains) {
      const state = spec.createState(challenge);
      const driver = createPlantDriver(spec.plant, state);
      return new SimulationEngine(driver, {
        gains,
        target: challenge.target,
        actuator: { min: spec.plant.actuator.min, max: spec.plant.actuator.max },
        derivativeFilterTau: spec.derivativeFilterTau,
        metrics: {
          toleranceAbs: challenge.criteria.toleranceAbs,
          toleranceRel: challenge.criteria.toleranceRel,
          holdTime: challenge.criteria.holdTime
        },
        // Keep the whole round so the chart can show the full response, not just
        // a rolling tail. 4 arrays * 8 bytes * 24k samples ~= 0.8 MB.
        historyCapacity: Math.ceil(challenge.timeLimit / SIM_DT) + 200,
        dt: SIM_DT
      });
    },
    evaluate(view, safety, challenge) {
      return evaluateVerdict(view, safety, challenge.criteria, challenge.timeLimit, spec.extraSuccessCheck);
    },
    describeState: spec.describeState,
    checklist(view, challenge) {
      return buildChecklist(view, challenge.criteria, challenge.criteria.requireDisturbance, spec.extraSuccessCheck);
    }
  };
}
