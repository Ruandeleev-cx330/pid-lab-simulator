# PID 算法实现

## 离散形式

```
e_k       = r_k − y_k
P_k       = Kp · e_k
I_k+1     = I_k + Ki · e_k · Δt              （条件积分，见下）
ẏ_raw,k   = (y_k − y_{k−1}) / Δt
ẏ_f,k     = α · ẏ_f,k−1 + (1 − α) · ẏ_raw,k      α = τ_f / (τ_f + Δt)
D_k       = −Kd · ẏ_f,k
u_raw,k   = P_k + I_k + D_k
u_k       = clamp(u_raw,k, u_min, u_max)
```

- **微分先行**：微分作用在测量值上而不是误差上，设定值阶跃不会产生微分冲击
  （`tests/unit/pid.test.ts` → “setpoint step does not produce a derivative kick”）；
- **一阶滤波**：τ_f 由项目配置（温度 2 s、液位 0.3 s、电机/平衡/倒立摆 0.02 s）；
- 所有计算使用统一的仿真步长 Δt = 0.01 s，不读取墙钟时间。

## 抗积分饱和：条件积分

```
previousRaw  = P + I + D
candidate    = I + Ki·e·Δt
candidateRaw = P + candidate + D

若 (previousRaw ≥ u_max 且 candidateRaw > previousRaw) 或
   (previousRaw ≤ u_min 且 candidateRaw < previousRaw)
   → 冻结积分（本步不累加）
否则 → I = candidate
```

只在“已经顶到限幅且误差还想继续把它推得更远”时冻结；误差反向（有助于退出饱和）时正常积分。
`tests/unit/pid.test.ts` 覆盖：长时间饱和后积分不累积、误差反向后数步内离开饱和。

另设数值护栏：`|I| ≤ 2·(u_max − u_min)`，积分一旦出现非有限值立即归零并置故障标记。

## 参数在线修改

`setGains()` 只替换三个增益，**不触碰**积分器、微分滤波状态与上一拍测量值。
因此运行中调参的响应是连续的（`tests/unit/pid.test.ts` → “changing gains keeps the controller state”）。

`reset(measurement)` 才会把积分、滤波状态清零，并把 `y_{k−1}` 设为当前测量值，
避免复位后的第一拍产生伪造的微分尖峰。

## 单位与量程

控制器工作在**测量量的单位**上（温度 °C、转速 rad/s、液位 m、角度 °）。
平衡小车与倒立摆以“度”为反馈单位，所以增益的量纲是 N·m/° 与 N/°。
滑块的量程、步长与显示精度按项目独立定义（`src/projects/*/index.ts`）：

| 项目 | Kp | Ki | Kd | 小数位 |
| --- | --- | --- | --- | --- |
| 温度 | 0 – 120 / 0.5 | 0 – 6 / 0.05 | 0 – 300 / 1 | 2 |
| 直流电机 | 0 – 0.3 / 0.001 | 0 – 1 / 0.002 | 0 – 0.05 / 0.0005 | 3 |
| 液位 | 0 – 0.4 / 0.001 | 0 – 0.08 / 0.0005 | 0 – 1 / 0.005 | 3 |
| 平衡小车 | 0 – 2 / 0.005 | 0 – 1 / 0.005 | 0 – 0.4 / 0.002 | 3 |
| 倒立摆 | 0 – 3 / 0.005 | 0 – 1 / 0.005 | 0 – 0.5 / 0.002 | 3 |

量程不是拍脑袋定的：每个区间的下限覆盖“明显欠调”，上限覆盖“明显过调但仍可观测”，
并通过 `scripts/tune.ts` 与 `tests/challenge/generator.test.ts` 的抽样测试确认可用。

## 数值保护清单

| 情况 | 处理 |
| --- | --- |
| NaN / Infinity 输入 | 拒绝本次更新，输出 0，置 `fault` 标记 |
| 增益为负 | 拒绝并保留上一组有效值（UI 层同时拦截） |
| 积分发散 | 归零并置故障 |
| 输出越界 | 钳制到执行器范围，`saturated=true` 供指标与 UI 使用 |
| 测量值跳变 | 微分经一阶滤波，避免尖峰直接进入执行器 |
