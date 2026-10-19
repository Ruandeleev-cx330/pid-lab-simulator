# 架构说明

## 分层

```
┌──────────────────────────────────────────────────────────────┐
│ 表现层  React 组件（Lobby / Lab / Stage / Chart / Panels）     │
│         只读 snapshot，不计算任何物理量                        │
├──────────────────────────────────────────────────────────────┤
│ 应用状态层  ChallengeSession（状态机 + 调度器 + 事件日志）      │
├──────────────────────────────────────────────────────────────┤
│ 仿真调度层  FixedStepScheduler（rAF 累加器，固定 dt=0.01 s）    │
├──────────────────────────────────────────────────────────────┤
│ 控制层  PidController（离散 PID + 微分滤波 + 条件积分）         │
├──────────────────────────────────────────────────────────────┤
│ 动力学层  PlantModel<S>（RK4 + 子步 + 物理投影 + 安全包络）     │
├──────────────────────────────────────────────────────────────┤
│ 指标层  MetricsTracker / HistoryBuffer（同一采样流）            │
└──────────────────────────────────────────────────────────────┘
```

依赖方向单向向下。`src/simulation`、`src/controllers`、`src/projects`、`src/metrics`、
`src/challenges` 全部**不依赖 React / Electron / DOM**，因此可以在 Node 里完整跑通（测试与
可解性验证就是这么做的）。

## 一个仿真步发生了什么

```
engine.step()
  ├─ disturbance = Σ(活跃扰动窗口)                 // 时间窗在仿真时钟上判断
  ├─ y      = plant.measure(state)                // 反馈量
  ├─ u      = pid.update(target, y, dt)           // 离散 PID，输出已限幅
  ├─ state  = plant.step(state, u, dt, disturbance)  // RK4（必要时子步）
  ├─ t     += dt                                  // 仿真时钟只在这里前进
  ├─ 有限性检查 → 故障则冻结
  ├─ metrics.observe(t, target, y', u, saturated, dt)
  └─ history.push(t, y', target, u)               // 环形缓冲
```

判定与 UI 都读同一份 `engine.view()`：`metrics`（误差/超调/IAE/调节时间/振荡…）、
`telemetry`（电流、出流量、角速度…）、`render`（动画所需的姿态量）。**没有任何组件自己积分或估算状态。**

## 状态机

```
loading ──► ready ──► running ⇄ paused
                │         │
                │         ├──► success（终态，冻结）
                │         └──► failed （终态，冻结）
                └──► error（生成失败，可重试）
reset():  任意状态 ──► ready（保留增益，恢复初始物理状态）
nextRound(): 任意状态 ──► loading ──► ready（新种子）
```

- 只存在一个 `status` 字段，不存在多个互相矛盾的布尔量。
- `success` / `failed` 是终态：调度器停止，`advanceForTest()` 无效，参数面板锁定。
- `start()` 幂等：`FixedStepScheduler.start()` 在已运行时直接返回，不会产生第二个循环。
- 组件卸载调用 `session.destroy()`：停止调度器、递增 generation、清空监听，旧会话不再推送。

## 调度器

`FixedStepScheduler` 用 `requestAnimationFrame` 的时间戳累加：

```
acc += (Δt_wall / 1000) * speed
due  = floor((acc + ε) / dt)          // ε 消除 0.25/0.01 = 24.999… 的浮点误差
budget = min(due, maxStepsPerFrame)   // 单帧上限 80 步
```

- 单帧墙钟增量被截断到 250 ms，避免切回窗口时爆发式补算；
- 超出预算时丢弃积压（`droppedFrames++`），而不是无限追赶；
- 渲染与物理解耦：一帧内可以跑 0…80 个物理步，`onFrame()` 只发布一次快照。

## 数据流与渲染节流

`ChallengeSession.publish()` 在每帧末尾构造**不可变快照**并通过 `useSyncExternalStore` 通知 React。
物理以 100 Hz 运行，UI 以帧率刷新（约 30–60 Hz），因此不会因为高频状态更新拖垮渲染。
曲线用 `Float64Array` 环形缓冲，绘制时按像素宽度降采样，降采样只影响显示。

## Electron 安全

`electron/main.ts`：

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`；
- `will-navigate` 只允许 `file://`（生产）或本地 dev server；
- `setWindowOpenHandler` 一律 deny，仅 https 交给系统浏览器；
- 权限请求处理器一律拒绝；
- IPC 白名单两个通道：`pidlab:app-info`（无参）、`pidlab:export-results`（校验为 ≤5 MB 的合法 JSON 字符串）；
- 渲染层 CSP（生产 `index.html`）：`default-src 'self'; script-src 'self'; object-src 'none'`。

preload 只暴露 `Object.freeze({ getAppInfo, exportResults })`，不透出 `ipcRenderer` 本身。

## 扩展一个新对象

1. 在 `src/projects/<id>/model.ts` 实现 `PlantModel<S>`（`measure/telemetry/render/step/safety`）；
2. 在 `src/projects/<id>/index.ts` 用 `defineProject` 声明难度、增益范围、达标条件；
3. 在 `registry.ts` 注册；
4. 在 `visualization/views.tsx` 加一个只读快照的 SVG 渲染器；
5. 补物理测试、注册表测试自动覆盖。

其余代码（大厅、实验室、状态机、挑战生成、指标、持久化）无需改动。
