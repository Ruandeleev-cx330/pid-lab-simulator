import { defineProject } from '../adapter';
import type { DifficultyPlan } from '../types';
import { createDcMotorPlant, DC_MOTOR_PARAMS, type DcMotorState } from './model';

const plant = createDcMotorPlant();

const beginner: DifficultyPlan = {
  label: '初级 · 空载阶跃',
  description: '空载条件下把转速稳定到目标值，观察比例与积分的作用。',
  targetRange: [120, 220],
  initialRange: [0, 0],
  gainSample: { kp: [0.01, 0.06], ki: [0.02, 0.3], kd: [0, 0.004] },
  disturbance: {
    label: '负载转矩',
    unit: 'N·m',
    magnitude: 0.015,
    duration: 3,
    autoAt: 12,
    required: true,
    description: '+0.015 N·m 负载转矩，第 12 s 自动施加，持续 3 s'
  },
  timeLimit: 22,
  criteria: {
    toleranceAbs: 5,
    toleranceRel: 0,
    holdTime: 3,
    maxOvershootPct: 12,
    maxIAE: 800,
    maxOscillationAmp: 7,
    minRunTime: 5,
    requireDisturbance: true
  }
};

const intermediate: DifficultyPlan = {
  label: '中级 · 负载转矩扰动',
  description: '目标转速更高，并在运行中施加负载转矩，需要积分项消除稳态跌落。',
  targetRange: [150, 320],
  initialRange: [0, 20],
  gainSample: { kp: [0.015, 0.08], ki: [0.03, 0.4], kd: [0, 0.006] },
  disturbance: {
    label: '负载转矩',
    unit: 'N·m',
    magnitude: 0.018,
    duration: 8,
    autoAt: 25,
    required: true,
    description: '+0.018 N·m 负载转矩，持续 8 s'
  },
  timeLimit: 30,
  criteria: {
    toleranceAbs: 4,
    toleranceRel: 0,
    holdTime: 3,
    maxOvershootPct: 10,
    maxIAE: 800,
    maxOscillationAmp: 5,
    minRunTime: 6,
    requireDisturbance: true
  }
};

const advanced: DifficultyPlan = {
  label: '高级 · 高转速 + 强负载',
  description: '接近电压上限的高转速目标，叠加更大的负载扰动，电压饱和余量很小。',
  targetRange: [220, 400],
  initialRange: [0, 30],
  gainSample: { kp: [0.02, 0.1], ki: [0.05, 0.5], kd: [0, 0.008] },
  disturbance: {
    label: '负载转矩',
    unit: 'N·m',
    magnitude: 0.026,
    duration: 10,
    autoAt: 30,
    required: true,
    description: '+0.026 N·m 负载转矩，持续 10 s'
  },
  timeLimit: 38,
  criteria: {
    toleranceAbs: 3,
    toleranceRel: 0,
    holdTime: 4,
    maxOvershootPct: 8,
    maxIAE: 700,
    maxOscillationAmp: 4,
    minRunTime: 6,
    requireDisturbance: true
  }
};

export const dcMotorProject = defineProject<DcMotorState>({
  meta: {
    id: 'dc-motor',
    name: '直流电机转速',
    tagline: '电枢电压 → 转速的快速响应回路',
    description:
      '含电枢电流动态的二阶电机模型。电压受限时会出现饱和，负载转矩会拉低转速，需要用积分项补偿。',
    outputLabel: '转速',
    outputUnit: 'rad/s',
    controlUnit: 'V',
    outputDecimals: 1,
    modelSummary: `J·dω/dt = Kt·i − b·ω − τ_L，L·di/dt = V − R·i − Ke·ω；J = ${DC_MOTOR_PARAMS.inertia} kg·m²，R = ${DC_MOTOR_PARAMS.resistance} Ω，L = ${DC_MOTOR_PARAMS.inductance} H，Kt = Ke = ${DC_MOTOR_PARAMS.torqueConstant}，电压 0–${DC_MOTOR_PARAMS.maxVoltage} V`,
    controlHint: '控制量：电枢电压（V）。误差单位：rad/s。'
  },
  gainLimits: {
    kp: { min: 0, max: 0.3, step: 0.001 },
    ki: { min: 0, max: 1, step: 0.002 },
    kd: { min: 0, max: 0.05, step: 0.0005 },
    decimals: 3
  },
  gainHelp: {
    kp: '每 1 rad/s 误差对应的电压。过大会引起电流冲击与超调。',
    ki: '补偿负载转矩造成的稳态转速跌落，过大易在饱和时积分饱和。',
    kd: '抑制转速快速上升时的超调，对测量噪声敏感，需配合滤波。'
  },
  plant,
  defaultDifficulty: 'beginner',
  plans: { beginner, intermediate, advanced },
  derivativeFilterTau: 0.02,
  minStep: 50,
  createState: (challenge) => ({
    omega: challenge.initialCondition,
    current: 0,
    angle: 0
  }),
  describeState: (view) => ({
    电枢电流: `${(view.telemetry.current ?? 0).toFixed(2)} A`,
    电压: `${view.control.toFixed(2)} V`,
    电压上限: `${DC_MOTOR_PARAMS.maxVoltage} V`
  })
});
