import { defineProject } from '../adapter';
import type { DifficultyPlan } from '../types';
import { createLiquidLevelPlant, LIQUID_LEVEL_PARAMS, type LiquidLevelState } from './model';

const plant = createLiquidLevelPlant();

const beginner: DifficultyPlan = {
  label: '初级 · 定点液位',
  description: '把液位稳定到目标高度，出流随液位非线性变化。',
  targetRange: [0.3, 0.7],
  initialRange: [0.1, 0.3],
  gainSample: { kp: [0.008, 0.03], ki: [0.0005, 0.0026], kd: [0, 0.06] },
  disturbance: {
    label: '额外出流（可选）',
    unit: 'm³/s',
    magnitude: 0.008,
    duration: 8,
    required: false,
    description: '可选练习：+0.008 m³/s 额外出流，持续 8 s'
  },
  timeLimit: 120,
  criteria: {
    toleranceAbs: 0.02,
    toleranceRel: 0,
    holdTime: 5,
    maxOvershootPct: 15,
    maxIAE: 9,
    maxOscillationAmp: 0.035,
    minRunTime: 8,
    requireDisturbance: false
  }
};

const intermediate: DifficultyPlan = {
  label: '中级 · 出流扰动',
  description: '运行中额外打开一条出流支路，需要重新建立流量平衡。',
  targetRange: [0.4, 1.0],
  initialRange: [0.15, 0.4],
  gainSample: { kp: [0.012, 0.036], ki: [0.0008, 0.003], kd: [0, 0.085] },
  disturbance: {
    label: '额外出流',
    unit: 'm³/s',
    magnitude: 0.012,
    duration: 12,
    autoAt: 60,
    required: true,
    description: '+0.012 m³/s 额外出流，持续 12 s'
  },
  timeLimit: 190,
  criteria: {
    toleranceAbs: 0.015,
    toleranceRel: 0,
    holdTime: 5,
    maxOvershootPct: 12,
    maxIAE: 14,
    maxOscillationAmp: 0.028,
    minRunTime: 8,
    requireDisturbance: true
  }
};

const advanced: DifficultyPlan = {
  label: '高级 · 大出流 + 严格液位',
  description: '更大的出流扰动和更严格的液位带，泵流量接近上限。',
  targetRange: [0.5, 1.2],
  initialRange: [0.2, 0.45],
  gainSample: { kp: [0.015, 0.042], ki: [0.001, 0.0036], kd: [0, 0.1] },
  disturbance: {
    label: '额外出流',
    unit: 'm³/s',
    magnitude: 0.018,
    duration: 14,
    autoAt: 70,
    required: true,
    description: '+0.018 m³/s 额外出流，持续 14 s'
  },
  timeLimit: 210,
  criteria: {
    toleranceAbs: 0.012,
    toleranceRel: 0,
    holdTime: 6,
    maxOvershootPct: 10,
    maxIAE: 18,
    maxOscillationAmp: 0.022,
    minRunTime: 8,
    requireDisturbance: true
  }
};

export const liquidLevelProject = defineProject<LiquidLevelState>({
  meta: {
    id: 'liquid-level',
    name: '液位控制',
    tagline: '非线性出流下的流量平衡',
    description:
      '按质量守恒建模的储罐：进水由泵控制，出流与液位的平方根成正比。液位越高，同样的进水增量带来的液位变化越小。',
    outputLabel: '液位',
    outputUnit: 'm',
    controlUnit: 'm³/s',
    outputDecimals: 3,
    modelSummary: `A·dh/dt = q_in − k_o·√h − q_leak；A = ${LIQUID_LEVEL_PARAMS.area} m²，k_o = ${LIQUID_LEVEL_PARAMS.outflowCoefficient}，泵流量 0–${LIQUID_LEVEL_PARAMS.maxInflow} m³/s，罐高 ${LIQUID_LEVEL_PARAMS.maxLevel} m`,
    controlHint: '控制量：进水流量（m³/s）。误差单位：m。'
  },
  gainLimits: {
    kp: { min: 0, max: 0.4, step: 0.001 },
    ki: { min: 0, max: 0.08, step: 0.0005 },
    kd: { min: 0, max: 1, step: 0.005 },
    decimals: 3
  },
  gainHelp: {
    kp: '每 1 m 液位误差对应的进水流量增量。',
    ki: '消除持续出流造成的稳态液位偏差。',
    kd: '按液位变化速度提前减小进水，抑制超调。'
  },
  plant,
  defaultDifficulty: 'beginner',
  plans: { beginner, intermediate, advanced },
  derivativeFilterTau: 0.3,
  minStep: 0.15,
  createState: (challenge) => ({ level: challenge.initialCondition }),
  describeState: (view) => ({
    出流量: `${(view.telemetry.outflow ?? 0).toFixed(4)} m³/s`,
    进水流量: `${view.control.toFixed(4)} m³/s`,
    安全上限: `${LIQUID_LEVEL_PARAMS.maxLevel} m`
  })
});
