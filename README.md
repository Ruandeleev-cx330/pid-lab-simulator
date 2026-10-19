# PID Lab Simulator

一个**真正运行离散时间控制回路**的 PID 调参训练桌面应用。不是演示动画，也不是假曲线：
设定值 → 误差 → PID（含微分滤波与抗积分饱和）→ 执行器限幅 → 被控对象 ODE → 测量反馈，
全部在同一个固定步长仿真时钟上运行，动画、曲线、指标与达标判定共享同一份状态。

- 5 个被控对象：温度、直流电机转速、液位、二轮平衡小车、倒立摆
- 每个对象 3 个难度；每轮随机生成**可解但尚未达标**的初始 Kp/Ki/Kd
- 每轮生成前用真实仿真做**可解性验证**（内部参考策略必须能达标）
- 达标条件全部公开、由实时数据计算，不提供唯一“标准答案”

技术栈：Electron + React 18 + TypeScript（strict）+ Vite + Vitest + Playwright(_electron)。

---

## 快速开始

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（Vite + Electron 热更新）
npm test             # 115 个单元 / 物理 / 集成 / 组件测试
npm run typecheck    # tsc --noEmit（strict）
npm run build        # 生产构建（渲染层 + 主进程）
npm run test:e2e     # 构建后驱动真实 Electron 窗口做端到端冒烟
npm run dist         # electron-builder 打包（当前平台）
# 已产出：release-installer/PID Lab Simulator Setup 1.0.0.exe（79 MB，未签名）
```

> **受限环境说明**：部分虚拟化 / 无 GPU 的 Windows 会话无法启动 Chromium 子进程，窗口会空白。
> 应用会检测到渲染进程异常后自动以兼容模式重启一次（`--safe-mode --no-sandbox`）。
> 也可手动执行 `npx electron . --safe-mode`。该模式不改变 `contextIsolation` / `nodeIntegration` 配置。

## 目录

```
electron/           主进程与 preload（contextIsolation + 白名单 IPC）
src/simulation/     固定步长引擎、RK4、调度器、通用类型
src/controllers/    离散 PID（微分先行 + 条件积分抗饱和）
src/projects/       5 个被控对象模型 + 项目配置 + 注册表 + 达标判定
src/metrics/        指标追踪器、环形历史缓冲
src/challenges/     种子随机、挑战生成、可解性验证、内部参考策略
src/state/          ChallengeSession（状态机 + 调度 + 事件日志）
src/components/     PID 面板、工具栏、指标条、达标条件条、曲线、结果页
src/visualization/  5 个由状态驱动的 SVG 动画
src/persistence/    版本化本地存储（localStorage，损坏自动降级）
docs/               架构、物理模型、PID、挑战生成、验收报告
```

## 操作要点

| 操作 | 行为 |
| --- | --- |
| 开始 / 暂停 / 继续 | 物理时间与曲线同步停止；暂停期间参数仍可修改，但不会暗中推进仿真 |
| 重置实验 | 回到本轮**初始物理状态**，**保留当前 PID 参数**（便于“改完再试”） |
| 下一轮挑战 | 新种子 → 新目标/初值/初始增益，挑战 ID 变化；物理参数不变 |
| 施加扰动 | 真正叠加到动力学方程（负载转矩 / 冷负载 / 额外出流 / 外力矩 / 水平力） |
| 目标值 | 仅在难度允许的范围内可改；改动会重置评价基准，避免最后时刻“移动球门” |
| 倍速 | 0.5× / 1× / 2× / 5×，只改变每帧执行的仿真步数，不改变积分步长 |

## 文档

- [架构说明](docs/architecture.md)
- [物理模型与假设](docs/physics-models.md)
- [PID 算法实现](docs/pid-controller.md)
- [随机挑战与可解性验证](docs/challenge-generation.md)
- [验收报告与测试清单](docs/acceptance-tests.md)

## 已知限制

- 单回路 PID 只能控制一个被测量：倒立摆 / 平衡小车只稳定角度，**不控制小车位置**，
  长时间运行会出现位置漂移（这是单回路教学实验的固有局限，文档中已说明）。
- 平衡小车与倒立摆的初始倾角随机区间较小（2–6°），因为更大的初始偏差在给定力矩下不可恢复。
- 端到端测试依赖真实 Electron 窗口，在 CI 无显示环境下需要 xvfb 或等价方案。
- 未在 macOS / Linux 上实机验证（构建配置已提供）。
