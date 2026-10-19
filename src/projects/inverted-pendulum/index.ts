import { defineProject } from '../adapter';
import type { DifficultyPlan } from '../types';
import {
  createInvertedPendulumPlant,
  INVERTED_PENDULUM_PARAMS,
  initialPendulumState,
  type InvertedPendulumState
} from './model';

const plant = createInvertedPendulumPlant();

const beginner: DifficultyPlan = {
  label: '初级 · 小偏角扶正',
  description: '摆杆从 2–3.5° 的小偏角开始，用小车水平力把它扶回直立。',
  targetRange: [0, 0],
  initialRange: [2, 3.5],
  gainSample: { kp: [0.1, 0.42], ki: [0, 0.08], kd: [0.008, 0.05] },
  disturbance: null,
  timeLimit: 35,
  criteria: {
    toleranceAbs: 0.8,
    toleranceRel: 0,
    holdTime: 3,
    maxOvershootPct: 50,
    maxIAE: 9,
    maxOscillationAmp: 1.6,
    minRunTime: 5,
    requireDisturbance: false,
    rateLimit: 1.2,
    rateTelemetryKey: 'thetaDot'
  }
};

const intermediate: DifficultyPlan = {
  label: '中级 · 水平冲击',
  description: '扶正后施加一次短促的水平冲量，同时小车不能越界。',
  targetRange: [0, 0],
  initialRange: [2.5, 4.5],
  gainSample: { kp: [0.12, 0.55], ki: [0, 0.12], kd: [0.01, 0.06] },
  disturbance: {
    label: '水平冲击',
    unit: 'N',
    magnitude: 3.2,
    duration: 0.28,
    autoAt: 14,
    required: true,
    description: '+3.2 N 水平冲量，持续 0.28 s'
  },
  timeLimit: 40,
  criteria: {
    toleranceAbs: 0.7,
    toleranceRel: 0,
    holdTime: 3,
    maxOvershootPct: 55,
    maxIAE: 11,
    maxOscillationAmp: 1.4,
    minRunTime: 5,
    requireDisturbance: true,
    rateLimit: 1.1,
    rateTelemetryKey: 'thetaDot'
  }
};

const advanced: DifficultyPlan = {
  label: '高级 · 大偏角 + 强冲击',
  description: '更大的初始偏角与更强的冲击，轨道余量更紧张。',
  targetRange: [0, 0],
  initialRange: [3, 6],
  gainSample: { kp: [0.14, 0.65], ki: [0, 0.16], kd: [0.012, 0.075] },
  disturbance: {
    label: '水平冲击',
    unit: 'N',
    magnitude: 4.5,
    duration: 0.32,
    autoAt: 14,
    required: true,
    description: '+4.5 N 水平冲量，持续 0.32 s'
  },
  timeLimit: 40,
  criteria: {
    toleranceAbs: 0.6,
    toleranceRel: 0,
    holdTime: 3,
    maxOvershootPct: 60,
    maxIAE: 13,
    maxOscillationAmp: 1.2,
    minRunTime: 5,
    requireDisturbance: true,
    rateLimit: 1,
    rateTelemetryKey: 'thetaDot'
  }
};

export const invertedPendulumProject = defineProject<InvertedPendulumState>({
  meta: {
    id: 'inverted-pendulum',
    name: '倒立摆',
    tagline: '小车-摆杆的欠驱动平衡',
    description:
      '非线性小车倒立摆：只能推小车，靠小车的加减速把摆杆顶住。这是单回路角度 PID 教学实验，不是完整的状态反馈控制器。',
    outputLabel: '摆杆倾角',
    outputUnit: '°',
    controlUnit: 'N',
    outputDecimals: 2,
    modelSummary: `(M+m)·ẍ + m·l·cosθ·θ̈ − m·l·sinθ·θ̇² = F，m·l·cosθ·ẍ + m·l²·θ̈ − m·g·l·sinθ = 0；M = ${INVERTED_PENDULUM_PARAMS.cartMass} kg，m = ${INVERTED_PENDULUM_PARAMS.bobMass} kg，l = ${INVERTED_PENDULUM_PARAMS.length} m，轨道 ±${INVERTED_PENDULUM_PARAMS.railLimit} m，推力 ±${INVERTED_PENDULUM_PARAMS.maxForce} N`,
    controlHint: '控制量：小车水平驱动力指令（N）。驱动极性为负：正指令使小车向 −x 加速。'
  },
  gainLimits: {
    kp: { min: 0, max: 3, step: 0.005 },
    ki: { min: 0, max: 1, step: 0.005 },
    kd: { min: 0, max: 0.5, step: 0.002 },
    decimals: 3
  },
  gainHelp: {
    kp: '每 1° 摆角对应的水平驱动力。低于重力项时摆杆必然倒下。',
    ki: '补偿持续偏置力，注意小车位置会随积分缓慢漂移。',
    kd: '提供阻尼，抑制摆杆摆动；不足时摆杆会来回甩动。'
  },
  plant,
  defaultDifficulty: 'beginner',
  plans: { beginner, intermediate, advanced },
  derivativeFilterTau: 0.02,
  minSurvivalTime: 9,
  createState: (challenge) => initialPendulumState(challenge.initialCondition),
  describeState: (view) => ({
    小车位置: `${(view.telemetry.cartPosition ?? 0).toFixed(3)} m`,
    小车速度: `${(view.telemetry.cartSpeed ?? 0).toFixed(3)} m/s`,
    控制力指令: `${view.control.toFixed(2)} N`
  })
});
