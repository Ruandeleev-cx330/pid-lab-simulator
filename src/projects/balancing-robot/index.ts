import { defineProject } from '../adapter';
import type { DifficultyPlan } from '../types';
import { BALANCING_ROBOT_PARAMS, createBalancingRobotPlant, initialBalancingState, type BalancingRobotState } from './model';

const plant = createBalancingRobotPlant();

const sampleCommon = { kp: [0.13, 0.3] as [number, number], ki: [0, 0.05] as [number, number], kd: [0.006, 0.02] as [number, number] };

const beginner: DifficultyPlan = {
  label: '初级 · 小角度恢复',
  description: '从 2–3.5° 的初始倾角恢复直立并保持稳定。',
  targetRange: [0, 0],
  initialRange: [2, 3.5],
  gainSample: sampleCommon,
  disturbance: {
    label: '侧向推力',
    unit: 'N·m',
    magnitude: 0.6,
    duration: 0.5,
    autoAt: 8,
    required: true,
    description: '+0.6 N·m 侧向推力，第 12 s 自动施加，持续 0.5 s'
  },
  timeLimit: 22,
  criteria: {
    toleranceAbs: 0.8,
    toleranceRel: 0,
    holdTime: 3,
    maxOvershootPct: 50,
    maxIAE: 25,
    maxOscillationAmp: 1.6,
    minRunTime: 5,
    requireDisturbance: true,
    rateLimit: 1.5,
    rateTelemetryKey: 'omega',
    useOvershootGate: false
  }
};

const intermediate: DifficultyPlan = {
  label: '中级 · 侧向推力扰动',
  description: '恢复直立后需要抵抗一次短促的外力扰动。',
  targetRange: [0, 0],
  initialRange: [2.5, 4.5],
  gainSample: { kp: [0.14, 0.34], ki: [0, 0.06], kd: [0.006, 0.022] },
  disturbance: {
    label: '侧向推力',
    unit: 'N·m',
    magnitude: 1.1,
    duration: 0.8,
    autoAt: 14,
    required: true,
    description: '+1.1 N·m 外力矩，持续 0.8 s'
  },
  timeLimit: 24,
  criteria: {
    toleranceAbs: 0.7,
    toleranceRel: 0,
    holdTime: 3,
    maxOvershootPct: 55,
    maxIAE: 30,
    maxOscillationAmp: 1.4,
    minRunTime: 5,
    requireDisturbance: true,
    rateLimit: 1.4,
    rateTelemetryKey: 'omega',
    useOvershootGate: false
  }
};

const advanced: DifficultyPlan = {
  label: '高级 · 大角度 + 强扰动',
  description: '更大的初始倾角与更强的推力，恢复窗口更短。',
  targetRange: [0, 0],
  initialRange: [3, 6],
  gainSample: { kp: [0.15, 0.38], ki: [0, 0.07], kd: [0.007, 0.024] },
  disturbance: {
    label: '侧向推力',
    unit: 'N·m',
    magnitude: 1.6,
    duration: 0.9,
    autoAt: 14,
    required: true,
    description: '+1.6 N·m 外力矩，持续 0.9 s'
  },
  timeLimit: 24,
  criteria: {
    toleranceAbs: 0.6,
    toleranceRel: 0,
    holdTime: 3,
    maxOvershootPct: 60,
    maxIAE: 35,
    maxOscillationAmp: 1.2,
    minRunTime: 5,
    requireDisturbance: true,
    rateLimit: 1.2,
    rateTelemetryKey: 'omega',
    useOvershootGate: false
  }
};

export const balancingRobotProject = defineProject<BalancingRobotState>({
  meta: {
    id: 'balancing-robot',
    name: '二轮平衡小车',
    tagline: '不稳定的倒立摆缩比模型',
    description:
      '车身俯仰角是唯一被控量，重力在直立点附近产生不稳定的正反馈。控制器通过车轮驱动车身反向力矩把车拉回直立。',
    outputLabel: '车身倾角',
    outputUnit: '°',
    controlUnit: 'N·m',
    outputDecimals: 2,
    modelSummary: `J·dω/dt = m·g·l·sinθ − b·ω + u + τ_ext；m = ${BALANCING_ROBOT_PARAMS.bodyMass} kg，l = ${BALANCING_ROBOT_PARAMS.comHeight} m，J = ${BALANCING_ROBOT_PARAMS.inertia} kg·m²，输出力矩 ±${BALANCING_ROBOT_PARAMS.maxTorque} N·m`,
    controlHint: '控制量：驱动系统作用在车身上的反作用力矩（N·m），正值使车身向 +θ 方向倾倒。'
  },
  gainLimits: {
    kp: { min: 0, max: 2, step: 0.005 },
    ki: { min: 0, max: 1, step: 0.005 },
    kd: { min: 0, max: 0.4, step: 0.002 },
    decimals: 3
  },
  gainHelp: {
    kp: '每 1° 倾角对应的恢复力矩。低于重力项（约 0.09 N·m/°）时无法站住。',
    ki: '消除持续偏置力矩造成的角度偏差，过大会引入低频摆动。',
    kd: '提供阻尼，抑制车身的来回摆动，是平衡控制中最关键的项。'
  },
  plant,
  defaultDifficulty: 'beginner',
  plans: { beginner, intermediate, advanced },
  derivativeFilterTau: 0.02,
  minSurvivalTime: 8,
  createState: (challenge) => initialBalancingState(challenge.initialCondition),
  describeState: (view) => ({
    角速度: `${(view.telemetry.omega ?? 0).toFixed(3)} rad/s`,
    车轮转速: `${(view.telemetry.wheelSpeed ?? 0).toFixed(2)} rad/s`,
    控制力矩: `${view.control.toFixed(3)} N·m`
  })
});
