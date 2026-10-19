# 验收报告

生成时间：2026-10-19（本机实测，Windows 10.0.26300 x64，Node v22.22.2，npm 10.9.7，Electron 33.4.11）

本报告只记录**实际执行过**的命令与结果。未执行的项会在最后单独列出，不会标为通过。

---

## 1. 自动化测试

```
$ npm run typecheck        # tsc --noEmit -p tsconfig.json (strict: true)
→ 通过，0 error

$ npx eslint src electron tests scripts --ext .ts,.tsx
→ 0 error / 0 warning

$ npx vitest run
→ Test Files  16 passed (16)
→ Tests       129 passed (129)
→ Duration    约 22 s（连跑 3 次均通过；1 次在构建同时运行时出现 UI 用例超时的偶发失败）
```

| 测试文件 | 覆盖内容 | 用例数 |
| --- | --- | --- |
| `tests/unit/pid.test.ts` | 离散 PID：比例/积分/微分、微分先行、设定值不冲击、限幅、条件积分、增益在线修改不重置、reset、NaN 保护 | 13 |
| `tests/unit/integrator.test.ts` | RK4 精度与 4 阶收敛、Euler 对比、子步不改变时钟、物理投影 | 5 |
| `tests/unit/tracker.test.ts` | IAE/ISE 积分、超调定义、短暂穿越不算稳定、保持时间、稳态误差、振荡（含单调斜坡不算振荡）、扰动后重置、超调冻结、目标变更重置 | 11 |
| `tests/unit/scheduler.test.ts` | 固定步长累加、倍速、节流钳制、单帧预算丢弃、stop、终态自停 | 6 |
| `tests/unit/no-leak.test.ts` | UI 不引用参考策略、挑战对象不含参考增益、导出结果无参考字段 | 3 |
| `tests/physics/temperature.test.ts` | 热时间常数、无源降温、热惯性、扰动、超温保护、PI 稳态 | 7 |
| `tests/physics/dc-motor.test.ts` | 稳态转速解析值、电气时间常数、负载压降、电压钳制、自转检查、角度积分、PI 跟踪、负载扰动 | 8 |
| `tests/physics/liquid-level.test.ts` | 流入/流出方向、平衡点、√h 出流、非负液位、空罐、溢出、PI 稳态、出流扰动 | 9 |
| `tests/physics/balancing-robot.test.ts` | 直立不稳定、指数发散、力矩方向、PD 稳定、增益不足必倒、轮子反作用、跌倒边界、饱和、无自动扶正 | 9 |
| `tests/physics/inverted-pendulum.test.ts` | 不稳定、驱动极性、支点移动方向、PD 稳定、增益不足必倒、轨道/倒下边界、无自动复位、饱和、线性化增长率 | 12 |
| `tests/simulation/engine.test.ts` | 步长严格等于 0.01 s、历史与实时视图同源、扰动只作用于窗口内、NaN 冻结、目标变更重置 | 6 |
| `tests/challenge/generator.test.ts` | 同种子可复现、不同种子不同增益、增益/目标区间、参考策略可解、初值不直接达标、不稳定对象存活、有界重试与诊断、配置携带 | 9 |
| `tests/state/session.test.ts` | ready/运行/暂停/继续/重置/下一轮、非法增益拒绝、改参数不动状态、扰动时机、成功冻结+写历史、失败冻结、移动目标不可作弊、销毁 | 13 |
| `tests/persistence/store.test.ts` | 往返、损坏 JSON、版本不符、非法条目过滤、写入失败降级、容量上限 | 6 |
| `tests/ui/components.test.tsx` | 滑块/输入同步、越界拒绝并回显、结束锁定、工具栏状态机、扰动提示、达标条件渲染、指标数值、结果页（含起始/最终增益） | 9 |
| `tests/ui/app.test.tsx` | 大厅 5 张卡片 → 进入实验室 → 生成挑战 → 开始/暂停 → 返回大厅 | 3 |

## 2. 端到端（真实 Electron 窗口）

```
$ npm run build && node tests/e2e/electron-smoke.mjs
→ ✓ E2E smoke passed
```

实际执行的步骤（全部通过）：

1. 启动打包后的渲染层，大厅渲染出 5 张项目卡片；
2. 进入直流电机 / 初级，挑战生成完成、开始按钮可用；
3. 开始后仿真时间推进到 1.53 s；
4. 暂停后 700 ms 内仿真时间完全不变（1.56 → 1.56）；
5. 继续后时间推进到 2.47 s；
6. 在 Kp 输入框输入 0.05 并回车，值被接受；
7. 输入 -5 被拒绝并回退为 0.050；
8. 运行满最短时间后施加扰动，事件日志出现“负载转矩”；
9. 返回大厅并进入倒立摆 / 高级，无残留会话错误；
10. 进入平衡小车 / 初级，把 Kp 设为 0.02（低于重力项）→ 车身在 2.5 s 内倾倒 →
    仿真冻结、弹出结果面板，原因为“车身倾倒 · 倾角超过 40° 的可恢复边界”，并列出起始/最终增益；
11. 进入直流电机 / 初级，通过输入框设定一组可用增益并切到 5× 倍速 → 5.0 s 后弹出“本轮达标”，
    稳态误差 0.000、超调 2.8%、调节时间 1.0 s、IAE 39.4，并显示起始→最终增益对比；
12. 点击“再来一轮”→ 新挑战生成、仿真时间归零、开始按钮重新可用；
13. 全程收集渲染进程 console error / pageerror：**0 条**。

截图产物：`artifacts/01-lobby.png`、`02-lab-ready.png`、`03-lab-running.png`、`04-pendulum.png`、`05-packaged.png`、`06-result-failure.png`、`07-result-success.png`。

## 3. 打包

```
$ npx electron-builder --dir
→ release/win-unpacked/                        （免安装目录，约 5 MB asar + Electron 运行时）

$ npx electron-builder --win nsis -c.directories.output=release-installer
→ release-installer/PID Lab Simulator Setup 1.0.0.exe   （79 MB，未签名，当前最新产物）
→ release-installer/win-unpacked/PID Lab Simulator.exe  （已用 Playwright 启动验证）
```

打包后的可执行文件已用 Playwright 直接启动验证：窗口标题 `PID Lab Simulator`，大厅渲染 5 张卡片
（`artifacts/05-packaged.png`）。已验证开发模式（Vite dev server + Electron）同样可以加载 5 张卡片。

## 4. 性能实测

```
$ npx vite-node scripts/perf-check.ts
temperature        1.73 us/step   5793x 实时
dc-motor           1.79 us/step   5601x 实时
liquid-level       0.73 us/step  13652x 实时
balancing-robot    0.89 us/step  11214x 实时
inverted-pendulum  1.13 us/step   8813x 实时
heapUsed 26.0 MB
```

100 Hz 控制周期只占用约 0.02% 的单核时间，因此 UI 刷新、Canvas 重绘与 React 渲染都不会与物理计算竞争。

**10 分钟仿真时长浸泡测试**（`npx vite-node scripts/soak-check.ts`，温度项目/高级）：

```
history capacity = 24200 samples (756.25 KB)
sim t= 300s  history=24200/24200  heap=34.7MB  rss=94.1MB
sim t= 480s  history=24200/24200  heap=30.2MB  rss=97.3MB
sim t= 600s  history=24200/24200  heap=21.9MB  rss=104.2MB
wall time for 600 s of simulation: 59 ms
```

环形缓冲在 242 s 后封顶（不再增长），堆在 22–35 MB 之间呈 GC 锯齿、无单调增长；
RSS 由 90 MB 缓慢升至 104 MB（V8 堆预留与 JIT），未发现泄漏型增长。

## 5. 需求清单对照

### A. 工程交付

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 干净目录安装并启动 | ✅ | `npm install` + `npm run dev/build`，Electron 窗口实际启动 |
| README | ✅ | `README.md` |
| 模块化架构 | ✅ | `docs/architecture.md`，仿真/控制/模型/指标/挑战与 UI 分层，领域层不依赖 React |
| 严格 TS | ✅ | `strict: true`，`tsc --noEmit` 无错误 |
| 自动化测试 | ✅ | 129 个用例，16 个文件 |
| 桌面打包配置 | ✅ | electron-builder，已产出 NSIS 安装包与免安装目录 |
| Electron 安全 | ✅ | `contextIsolation` / `nodeIntegration:false` / `sandbox` / CSP / 导航与权限拦截 / 2 条白名单 IPC |
| 离线运行 | ✅ | 无任何网络请求；CSP `connect-src 'self'` |

### B. 核心仿真

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 5 个真实对象模型 | ✅ | 二阶电机、一阶热、√h 液位、平衡车、非线性小车倒立摆 |
| 离散时间 PID | ✅ | `src/controllers/pid-controller.ts`，Δt=0.01 |
| 抗积分饱和 | ✅ | 条件积分 + 单测“长时间饱和后积分不累积” |
| 微分滤波 | ✅ | 一阶滤波 + 微分先行 + 单测“无微分冲击” |
| 执行器限幅 | ✅ | PID 输出端 + 模型入口双重钳制 |
| 改参数影响后续响应 | ✅ | 在线 `setGains` 不重置状态，会话测试验证 |
| 暂停/继续 | ✅ | 会话测试 + E2E 实测时间冻结 |
| 扰动作用于模型 | ✅ | 引擎测试对比轨迹差异；物理测试对比有无扰动 |
| 动画/曲线同源 | ✅ | 所有视图只读 `snapshot.render/measurement`；引擎测试验证历史末点与实时视图一致 |

### C. 挑战机制

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 5 项目 × 3 难度 | ✅ | 注册表 15 组配置 |
| 每轮生成有效初始参数 | ✅ | 15 组 × 7 种子全部生成成功（`npm run calibrate:gen`） |
| 下一轮新参数 | ✅ | 会话测试对比 challengeId / seed / gains |
| 物理参数不随轮次变化 | ✅ | 模型参数为模块常量，`nextRound` 只重抽样 |
| 可解性自动化验证 | ✅ | 每个候选都用内部参考策略真跑一遍，失败即换种子 |
| 不会因随机参数不可恢复 | ✅ | 不稳定对象额外做 8–9 s 生存检查；稳定对象偏差仅影响性能 |
| 参考参数不泄露 | ✅ | `no-leak` 静态扫描 + 运行时断言 |

### D. 成功与失败

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 每项目独立评价配置 | ✅ | 容差/保持时间/超调/IAE/振荡/角速度/时限均按项目与难度区分 |
| 由实时数据判定 | ✅ | `evaluateVerdict` 只读 `EngineView` |
| 需要稳态与保持 | ✅ | 容差带 + `holdTime` 连续驻留 |
| 超调/振荡/安全受约束 | ✅ | 超调与 IAE 超限标记“本轮已无法达标”；安全包络立即失败 |
| 失败冻结并说明原因 | ✅ | 终态 + 结果面板显示具体原因 |
| 成功展示真实性能 | ✅ | 结果面板：用时/稳态误差/超调/调节时间/IAE/扰动次数 + 起始与最终增益 |
| 下一轮正确重置 | ✅ | 曲线清空、指标重置、新挑战 ID |

### E. 数据与交互

| 项 | 状态 | 证据 |
| --- | --- | --- |
| 滑块与数值输入同步 | ✅ | 组件测试 |
| 无未处理错误 | ✅ | E2E 收集 console/page error = 0 |
| 图表时间与数值一致 | ✅ | 引擎测试：历史末点 == 视图测量值/目标/时间 |
| 暂停/继续/重置/扰动 | ✅ | E2E + 会话测试 |
| 无重复仿真循环 | ✅ | 调度器 `start()` 幂等；会话 `start()` 状态守卫 |
| 持久化经测试 | ✅ | `store.test.ts` 6 个用例（含损坏数据与写入失败） |
| 异常操作不破坏状态 | ✅ | 非法增益、越界目标、暂停时扰动、终态改参数均被拒绝并提示 |

## 6. 已知限制与未验证项

**已实现但未充分验证**

- 引擎层 10 分钟仿真（600 s）已做浸泡测量（见第 4 节），但**渲染层**以 60 fps 连续运行 10 分钟的逐帧内存曲线未测量。
- 多显示器 / 高 DPI 缩放只在本机 1366×768@125% 下验证过；布局有 1180px 与 800px 高度的断点，但其他分辨率未逐一实测。
- 倒立摆长时间运行会出现小车位置漂移（单回路角度 PID 的固有特性），轨道越界判失败；未提供级联位置控制。

**未实现 / 未验证**

- macOS、Linux 未实机验证（`electron-builder` 配置已提供，但未在本机构建）。
- 安装包未做代码签名（无证书），Windows SmartScreen 可能提示未知发布者。
- 默认（非兼容）模式在本机受限会话中无法启动 Chromium 渲染进程，因此**所有 E2E 均在 `--safe-mode` 下执行**；
  正常的桌面会话应使用默认模式（GPU 独立进程 + 沙箱）。
- 未接入 CI；所有验证均为本机手动触发。

**环境适配说明**

- `electron-builder` 在本机受限会话下无法解压 `winCodeSign`（创建符号链接需要管理员权限），
  因此 `win.signAndEditExecutable: false`，安装包 exe 不含自定义图标/版本资源。
- 打包前若输出目录已存在，沙箱会拦截删除；使用新的输出目录可正常构建（见第 3 节命令）。
