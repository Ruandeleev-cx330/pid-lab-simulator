import { defineProject } from '../adapter';
import type { DifficultyPlan } from '../types';
import { createTemperaturePlant, TEMPERATURE_PARAMS, type TemperatureState } from './model';

const plant = createTemperaturePlant();

const beginner: DifficultyPlan = {
  label: '初级 · 无扰动升温',
  description: '把炉温从环境温度升到目标温度并稳定，允许较宽松的稳态误差。',
  targetRange: [40, 75],
  initialRange: [0, 4],
  gainSample: { kp: [8, 28], ki: [0.1, 1.0], kd: [0, 20] },
  disturbance: {
    label: '冷负载（可选）',
    unit: 'W',
    magnitude: -300,
    duration: 8,
    required: false,
    description: '可选练习：-300 W 冷负载，持续 8 s'
  },
  timeLimit: 150,
  criteria: {
    toleranceAbs: 0.8,
    toleranceRel: 0,
    holdTime: 10,
    maxOvershootPct: 14,
    maxIAE: 4000,
    maxOscillationAmp: 1.8,
    minRunTime: 25,
    requireDisturbance: false
  }
};

const intermediate: DifficultyPlan = {
  label: '中级 · 升温 + 冷负载',
  description: '升温过程中会加入冷负载扰动，要求更小的超调与更短的稳定时间。',
  targetRange: [55, 95],
  initialRange: [2, 6],
  gainSample: { kp: [12, 40], ki: [0.15, 1.6], kd: [0, 30] },
  disturbance: {
    label: '冷负载',
    unit: 'W',
    magnitude: -420,
    duration: 12,
    autoAt: 60,
    required: true,
    description: '-420 W 冷负载，持续 12 s'
  },
  timeLimit: 200,
  criteria: {
    toleranceAbs: 0.6,
    toleranceRel: 0,
    holdTime: 10,
    maxOvershootPct: 11,
    maxIAE: 7000,
    maxOscillationAmp: 1.4,
    minRunTime: 30,
    requireDisturbance: true
  }
};

const advanced: DifficultyPlan = {
  label: '高级 · 强负载 + 严格指标',
  description: '更强的冷负载与更严格的稳态误差，需要兼顾超调与抗扰恢复。',
  targetRange: [70, 110],
  initialRange: [3, 8],
  gainSample: { kp: [16, 55], ki: [0.2, 2.0], kd: [0, 40] },
  disturbance: {
    label: '冷负载',
    unit: 'W',
    magnitude: -650,
    duration: 14,
    autoAt: 70,
    required: true,
    description: '-650 W 冷负载，持续 14 s'
  },
  timeLimit: 240,
  criteria: {
    toleranceAbs: 0.5,
    toleranceRel: 0,
    holdTime: 12,
    maxOvershootPct: 8,
    maxIAE: 8000,
    maxOscillationAmp: 1.2,
    minRunTime: 30,
    requireDisturbance: true
  }
};

export const temperatureProject = defineProject<TemperatureState>({
  meta: {
    id: 'temperature',
    name: '温度控制',
    tagline: '热惯性与积分饱和的经典课堂',
    description:
      '一阶热模型：加热功率对抗热损失。热惯性大、响应慢，积分项用来消除负载带来的稳态误差。',
    outputLabel: '温度',
    outputUnit: '°C',
    controlUnit: 'W',
    outputDecimals: 2,
    modelSummary: `C·dT/dt = P − K_loss·(T − T_amb) + Q_d，C = ${TEMPERATURE_PARAMS.heatCapacity} J/K，K_loss = ${TEMPERATURE_PARAMS.lossCoefficient} W/K，环境 ${TEMPERATURE_PARAMS.ambient} °C，加热功率 0–${TEMPERATURE_PARAMS.maxPower} W`,
    controlHint: '控制量：加热功率（W）。误差单位：°C。'
  },
  gainLimits: {
    kp: { min: 0, max: 120, step: 0.5 },
    ki: { min: 0, max: 6, step: 0.05 },
    kd: { min: 0, max: 300, step: 1 },
    decimals: 2
  },
  gainHelp: {
    kp: '每 1 °C 误差对应的加热功率。过大容易超温。',
    ki: '累积历史误差，消除负载下的稳态偏差，但过大易积分饱和。',
    kd: '根据温度变化趋势提前收手，抑制超调；热系统噪声小，收益有限。'
  },
  plant,
  defaultDifficulty: 'beginner',
  plans: { beginner, intermediate, advanced },
  derivativeFilterTau: 2,
  minStep: 8,
  createState: (challenge) => ({
    temperature: TEMPERATURE_PARAMS.ambient + challenge.initialCondition
  }),
  describeState: (view) => ({
    环境温度: `${TEMPERATURE_PARAMS.ambient.toFixed(1)} °C`,
    热损失功率: `${(view.telemetry.lossPower ?? 0).toFixed(0)} W`,
    加热功率: `${view.control.toFixed(0)} W`
  })
});
