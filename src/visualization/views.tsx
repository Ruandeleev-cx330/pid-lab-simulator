import type { SessionSnapshot } from '../state/session';

/**
 * All animations are pure functions of the simulation state. No CSS loops, no
 * timers, no tweening: if the physics does not move, neither does the drawing.
 */

export interface ViewProps {
  snapshot: SessionSnapshot;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const DEG = 180 / Math.PI;

function hueForTemperature(t: number): string {
  // 20 C -> cool grey-blue, 60 -> amber, 120 -> deep orange
  const k = clamp01((t - 20) / 100);
  const cold = [214, 226, 238];
  const warm = [240, 140, 0];
  const hot = [214, 72, 15];
  const mix = (a: number[], b: number[], f: number) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
  const rgb = k < 0.5 ? mix(cold, warm, k * 2) : mix(warm, hot, (k - 0.5) * 2);
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

const AXIS = '#8b9aab';
const INK = '#131c26';
const PANEL = '#f5f8fb';

function Legend({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text x={x} y={y} fontSize={10.5} fill={AXIS} fontFamily="ui-monospace, monospace">
      {text}
    </text>
  );
}

/* ------------------------------------------------------------------- motor */
export function MotorView({ snapshot }: ViewProps) {
  const angle = (snapshot.render.angle ?? 0) * DEG;
  const speed = snapshot.measurement;
  const target = snapshot.target;
  const max = 500;
  const voltage = snapshot.control;

  const cx = 140;
  const cy = 120;
  const blades = Array.from({ length: 7 }, (_, i) => i * (360 / 7));

  const gauge = { cx: 470, cy: 150, r: 66 };
  const toAngle = (v: number) => 180 + 180 * clamp01(v / max);
  const point = (a: number, r: number) => ({
    x: gauge.cx + r * Math.cos((a * Math.PI) / 180),
    y: gauge.cy + r * Math.sin((a * Math.PI) / 180)
  });
  const a0 = toAngle(0);
  const a1 = toAngle(max);
  const p0 = point(a0, gauge.r);
  const p1 = point(a1, gauge.r);
  const needle = point(toAngle(speed), gauge.r - 12);
  const targetPt = point(toAngle(target), gauge.r);
  const targetPtInner = point(toAngle(target), gauge.r - 10);

  return (
    <svg viewBox="0 0 640 238" preserveAspectRatio="xMidYMid meet" role="img" aria-label="电机转速动画">
      <defs>
        <linearGradient id="motorBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e6edf5" />
        </linearGradient>
      </defs>

      {/* base */}
      <rect x={48} y={182} width={210} height={8} rx={4} fill="#cfd9e6" />

      {/* motor housing */}
      <rect x={48} y={62} width={196} height={120} rx={10} fill="url(#motorBody)" stroke="#c2cedc" />
      <rect x={48} y={62} width={196} height={16} rx={8} fill="#eef3f8" stroke="#d3dbe5" />

      {/* stator */}
      <circle cx={cx} cy={cy} r={58} fill={PANEL} stroke="#c2cedc" />
      <circle cx={cx} cy={cy} r={50} fill="none" stroke="#dbe4ee" strokeWidth={6} />

      {/* rotor */}
      <g transform={`rotate(${angle % 360} ${cx} ${cy})`}>
        {blades.map((b) => (
          <rect
            key={b}
            x={cx - 5}
            y={cy - 44}
            width={10}
            height={34}
            rx={4}
            fill="#5b6b7d"
            transform={`rotate(${b} ${cx} ${cy})`}
          />
        ))}
        <circle cx={cx} cy={cy} r={11} fill="#1f6feb" />
        <circle cx={cx} cy={cy} r={4} fill="#fff" />
      </g>

      {/* shaft */}
      <rect x={244} y={116} width={52} height={8} rx={4} fill="#9aa9b9" />
      <circle cx={300} cy={120} r={14} fill="none" stroke="#9aa9b9" strokeWidth={4} strokeDasharray="4 5" />

      {/* gauge */}
      <path
        d={`M ${p0.x} ${p0.y} A ${gauge.r} ${gauge.r} 0 0 1 ${p1.x} ${p1.y}`}
        fill="none"
        stroke="#dbe4ee"
        strokeWidth={8}
        strokeLinecap="round"
      />
      <path
        d={`M ${point(a0, gauge.r).x} ${point(a0, gauge.r).y} A ${gauge.r} ${gauge.r} 0 0 1 ${point(
          toAngle(speed),
          gauge.r
        ).x} ${point(toAngle(speed), gauge.r).y}`}
        fill="none"
        stroke="#0f766e"
        strokeWidth={8}
        strokeLinecap="round"
        opacity={0.85}
      />
      <line
        x1={targetPt.x}
        y1={targetPt.y}
        x2={targetPtInner.x}
        y2={targetPtInner.y}
        stroke="#1f6feb"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <line
        x1={gauge.cx}
        y1={gauge.cy}
        x2={needle.x}
        y2={needle.y}
        stroke={INK}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <circle cx={gauge.cx} cy={gauge.cy} r={5} fill={INK} />
      <text x={gauge.cx} y={gauge.cy - 20} textAnchor="middle" fontSize={26} fontWeight={600} fill={INK} fontFamily="ui-monospace, monospace">
        {speed.toFixed(0)}
      </text>
      <text x={gauge.cx} y={gauge.cy - 4} textAnchor="middle" fontSize={10} fill={AXIS}>
        rad/s
      </text>
      <Legend x={gauge.cx - gauge.r} y={gauge.cy + 22} text="0" />
      <Legend x={gauge.cx + gauge.r - 22} y={gauge.cy + 22} text={`${max}`} />

      {/* voltage bar */}
      <rect x={48} y={200} width={196} height={10} rx={5} fill="#e2e9f1" />
      <rect x={48} y={200} width={196 * clamp01(voltage / 24)} height={10} rx={5} fill="#1f6feb" opacity={0.75} />
      <text x={48} y={222} fontSize={10} fill={AXIS}>
        电枢电压 {voltage.toFixed(1)} V / 24 V
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------- temperature */
export function TemperatureView({ snapshot }: ViewProps) {
  const t = snapshot.measurement;
  const target = snapshot.target;
  const fill = clamp01((t - 0) / 160);
  const targetFill = clamp01((target - 0) / 160);
  const tubeBottom = 196;
  const tubeTop = 44;
  const tubeH = tubeBottom - tubeTop;
  const color = hueForTemperature(t);
  const heater = clamp01(snapshot.control / 1200);

  return (
    <svg viewBox="0 0 640 238" preserveAspectRatio="xMidYMid meet" role="img" aria-label="温度控制动画">
      <defs>
        <linearGradient id="heatGlow" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#f08c00" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#f08c00" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* heat glow under the block */}
      <rect x={90} y={150} width={230} height={70} fill="url(#heatGlow)" opacity={heater} />

      {/* heated block */}
      <rect x={96} y={52} width={218} height={128} rx={10} fill="#eef3f8" stroke="#c2cedc" />
      <rect x={106} y={62} width={198} height={108} rx={7} fill={color} opacity={0.85} />
      <text x={205} y={112} textAnchor="middle" fontSize={30} fontWeight={700} fill="#fff" fontFamily="ui-monospace, monospace">
        {t.toFixed(1)}
      </text>
      <text x={205} y={132} textAnchor="middle" fontSize={11} fill="#ffffff" opacity={0.9}>
        °C
      </text>

      {/* heating element */}
      <rect x={96} y={180} width={218} height={10} rx={5} fill="#d3dbe5" />
      <rect x={96} y={180} width={218 * heater} height={10} rx={5} fill="#e8590c" />
      <text x={96} y={208} fontSize={10} fill={AXIS}>
        加热功率 {(snapshot.control / 1000).toFixed(2)} kW
      </text>

      {/* thermometer */}
      <rect x={456} y={tubeTop} width={22} height={tubeH} rx={11} fill="#eef3f8" stroke="#c2cedc" />
      <rect
        x={460}
        y={tubeBottom - fill * 6 - (tubeH - 6) * fill}
        width={14}
        height={Math.max(4, (tubeH - 6) * fill)}
        rx={7}
        fill={color}
      />
      <circle cx={467} cy={tubeBottom + 8} r={16} fill={color} stroke="#c2cedc" />

      {/* target marker */}
      <line
        x1={438}
        y1={tubeBottom - (tubeH - 6) * targetFill - 3}
        x2={500}
        y2={tubeBottom - (tubeH - 6) * targetFill - 3}
        stroke="#1f6feb"
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      <text x={504} y={tubeBottom - (tubeH - 6) * targetFill + 1} fontSize={10.5} fill="#1f6feb">
        目标 {target.toFixed(1)}
      </text>

      {[0, 40, 80, 120, 160].map((tick) => {
        const y = tubeBottom - (tubeH - 6) * clamp01(tick / 160) - 3;
        return (
          <g key={tick}>
            <line x1={478} y1={y} x2={486} y2={y} stroke="#c2cedc" />
            <text x={490} y={y + 3} fontSize={9} fill={AXIS}>
              {tick}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------ liquid level */
export function LiquidView({ snapshot }: ViewProps) {
  const level = snapshot.measurement;
  const target = snapshot.target;
  const maxLevel = 1.5;
  const tank = { x: 210, y: 34, w: 216, h: 168 };
  const fillH = clamp01(level / maxLevel) * (tank.h - 6);
  const targetY = tank.y + tank.h - (target / maxLevel) * (tank.h - 6);
  const inflow = clamp01(snapshot.control / 0.05);
  const outflow = snapshot.telemetry.outflow ?? 0;

  return (
    <svg viewBox="0 0 640 238" preserveAspectRatio="xMidYMid meet" role="img" aria-label="液位控制动画">
      <defs>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4dabf7" stopOpacity={0.85} />
          <stop offset="100%" stopColor="#1c7ed6" stopOpacity={0.95} />
        </linearGradient>
        <clipPath id="tankClip">
          <rect x={tank.x + 3} y={tank.y + 3} width={tank.w - 6} height={tank.h - 6} rx={6} />
        </clipPath>
      </defs>

      {/* inlet pipe */}
      <path d={`M 96 70 H ${tank.x}`} stroke="#9aa9b9" strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d={`M 96 70 H ${tank.x}`} stroke="#4dabf7" strokeWidth={4} fill="none" strokeDasharray="10 8" strokeDashoffset={-snapshot.time * 90 * inflow} />
      <circle cx={86} cy={70} r={20} fill="#eef3f8" stroke="#c2cedc" />
      <text x={86} y={66} textAnchor="middle" fontSize={8.5} fill={AXIS}>
        泵
      </text>
      <text x={86} y={78} textAnchor="middle" fontSize={9} fill={INK} fontFamily="ui-monospace, monospace">
        {snapshot.control.toFixed(3)}
      </text>

      {/* tank */}
      <rect x={tank.x} y={tank.y} width={tank.w} height={tank.h} rx={8} fill="#fbfdff" stroke="#b9c4d2" strokeWidth={2} />
      <g clipPath="url(#tankClip)">
        <rect x={tank.x} y={tank.y + tank.h - fillH} width={tank.w} height={fillH} fill="url(#water)" />
        <rect
          x={tank.x}
          y={tank.y + tank.h - fillH}
          width={tank.w}
          height={3}
          fill="#91d5ff"
          opacity={0.9}
        />
      </g>

      {/* target line */}
      <line x1={tank.x - 16} y1={targetY} x2={tank.x + tank.w + 16} y2={targetY} stroke="#1f6feb" strokeWidth={2} strokeDasharray="6 4" />
      <text x={tank.x + tank.w + 20} y={targetY + 3.5} fontSize={10.5} fill="#1f6feb">
        目标 {target.toFixed(3)} m
      </text>

      {/* outlet */}
      <path
        d={`M ${tank.x + tank.w} ${tank.y + tank.h - 12} h 30 v 26`}
        stroke="#9aa9b9"
        strokeWidth={9}
        fill="none"
        strokeLinecap="round"
      />
      <path d={`M ${tank.x + tank.w} ${tank.y + tank.h - 12} h 30 v 26`} stroke="#4dabf7" strokeWidth={3.5} fill="none" strokeDasharray="7 7" strokeDashoffset={-snapshot.time * 70 * clamp01(outflow / 0.03)} />

      <text x={tank.x} y={230} fontSize={10} fill={AXIS}>
        进水 {snapshot.control.toFixed(4)} · 出流 {outflow.toFixed(4)} m³/s
      </text>
      <line x1={tank.x} y1={218} x2={tank.x + tank.w} y2={218} stroke="#c2cedc" />
    </svg>
  );
}

/* --------------------------------------------------------- balancing robot */
export function RobotView({ snapshot }: ViewProps) {
  const theta = snapshot.render.thetaDeg ?? 0;
  const wheel = (snapshot.render.wheelAngle ?? 0) * DEG;
  const drift = snapshot.render.drift ?? 0;
  const offset = (-drift * 120) % 40;
  const axleX = 330;
  const axleY = 186;

  return (
    <svg viewBox="0 0 640 238" preserveAspectRatio="xMidYMid meet" role="img" aria-label="平衡小车动画">
      <defs>
        <linearGradient id="robotBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d4c5c" />
          <stop offset="100%" stopColor="#25313d" />
        </linearGradient>
      </defs>

      {/* floor */}
      <rect x={0} y={206} width={640} height={32} fill="#eef2f7" />
      <line x1={0} y1={206} x2={640} y2={206} stroke="#b9c4d2" />
      {Array.from({ length: 18 }, (_, i) => (
        <line
          key={i}
          x1={i * 40 + 20 + offset}
          y1={206}
          x2={i * 40 + 8 + offset}
          y2={238}
          stroke="#d3dbe5"
          strokeWidth={2}
        />
      ))}

      {/* upright reference */}
      <line x1={axleX} y1={axleY - 140} x2={axleX} y2={axleY} stroke="#c2cedc" strokeDasharray="4 5" />
      <text x={axleX + 4} y={axleY - 144} fontSize={9.5} fill={AXIS}>
        0° 参考
      </text>

      {/* wheels */}
      {[axleX - 26, axleX + 26].map((wx) => (
        <g key={wx}>
          <circle cx={wx} cy={axleY} r={20} fill="#eef3f8" stroke="#5b6b7d" strokeWidth={4} />
          <g transform={`rotate(${wheel % 360} ${wx} ${axleY})`}>
            {[0, 60, 120].map((a) => (
              <line
                key={a}
                x1={wx - 13}
                y1={axleY}
                x2={wx + 13}
                y2={axleY}
                stroke="#9aa9b9"
                strokeWidth={2.5}
                transform={`rotate(${a} ${wx} ${axleY})`}
              />
            ))}
          </g>
          <circle cx={wx} cy={axleY} r={4} fill="#5b6b7d" />
        </g>
      ))}

      {/* body */}
      <g transform={`rotate(${theta} ${axleX} ${axleY})`}>
        <rect x={axleX - 26} y={axleY - 108} width={52} height={104} rx={10} fill="url(#robotBody)" />
        <rect x={axleX - 10} y={axleY - 100} width={20} height={26} rx={4} fill="#4dabf7" opacity={0.9} />
        <circle cx={axleX} cy={axleY - 128} r={9} fill="#5b6b7d" />
        <line x1={axleX} y1={axleY - 119} x2={axleX} y2={axleY - 108} stroke="#5b6b7d" strokeWidth={4} />
        <line x1={axleX} y1={axleY} x2={axleX} y2={axleY - 100} stroke="#9aa9b9" strokeWidth={3} strokeDasharray="3 4" />
      </g>

      {/* angle arc */}
      <path d={`M ${axleX} ${axleY - 70} A 70 70 0 0 1 ${axleX + 70 * Math.sin((theta * Math.PI) / 180)} ${axleY - 70 * Math.cos((theta * Math.PI) / 180)}`} fill="none" stroke={Math.abs(theta) > 5 ? '#cf222e' : '#1f6feb'} strokeWidth={2.5} opacity={0.6} />

      <text x={20} y={224} fontSize={10} fill={AXIS}>
        角速度 {(snapshot.telemetry.omega ?? 0).toFixed(2)} rad/s
      </text>
      <text x={620} y={224} textAnchor="end" fontSize={10} fill={AXIS}>
        车轮 {(snapshot.telemetry.wheelSpeed ?? 0).toFixed(1)} rad/s
      </text>
    </svg>
  );
}

/* ------------------------------------------------------- inverted pendulum */
export function PendulumView({ snapshot }: ViewProps) {
  const x = snapshot.render.x ?? 0;
  const theta = snapshot.render.thetaDeg ?? 0;
  const railY = 204;
  const cartX = 320 + x * 90;
  const pivotY = railY - 30;
  const rodLen = 152;
  const tipX = cartX + rodLen * Math.sin((theta * Math.PI) / 180);
  const tipY = pivotY - rodLen * Math.cos((theta * Math.PI) / 180);
  const danger = Math.abs(theta) > 12;

  return (
    <svg viewBox="0 0 640 238" preserveAspectRatio="xMidYMid meet" role="img" aria-label="倒立摆动画">
      {/* rail */}
      <line x1={96} y1={railY} x2={544} y2={railY} stroke="#9aa9b9" strokeWidth={5} strokeLinecap="round" />
      {[96, 544].map((stop) => (
        <g key={stop}>
          <rect x={stop - 4} y={railY - 14} width={8} height={22} rx={3} fill="#5b6b7d" />
        </g>
      ))}

      {/* upright reference */}
      <line x1={cartX} y1={pivotY} x2={cartX} y2={pivotY - rodLen - 14} stroke="#c2cedc" strokeDasharray="4 5" />

      {/* cart */}
      <rect x={cartX - 34} y={railY - 28} width={68} height={26} rx={6} fill="#eef3f8" stroke="#5b6b7d" strokeWidth={2} />
      {[cartX - 20, cartX + 20].map((wx) => (
        <circle key={wx} cx={wx} cy={railY - 2} r={8} fill="#9aa9b9" stroke="#5b6b7d" strokeWidth={2} />
      ))}

      {/* rod */}
      <line x1={cartX} y1={pivotY} x2={tipX} y2={tipY} stroke={danger ? '#cf222e' : '#25313d'} strokeWidth={7} strokeLinecap="round" />
      <circle cx={cartX} cy={pivotY} r={6} fill="#1f6feb" />
      <circle cx={tipX} cy={tipY} r={12} fill={danger ? '#cf222e' : '#0f766e'} />
      <circle cx={tipX} cy={tipY} r={4} fill="#fff" opacity={0.8} />

      {/* force arrow */}
      {Math.abs(snapshot.control) > 0.08 && (
        <g opacity={0.9}>
          <line
            x1={cartX}
            y1={railY + 34}
            x2={cartX - Math.sign(snapshot.control) * Math.min(60, Math.abs(snapshot.control) * 5)}
            y2={railY + 34}
            stroke="#1f6feb"
            strokeWidth={3}
            markerEnd="url(#arrowHead)"
          />
          <text x={cartX} y={railY + 50} textAnchor="middle" fontSize={9.5} fill="#1f6feb">
            驱动力 {Math.abs(snapshot.control).toFixed(1)} N
          </text>
        </g>
      )}
      <defs>
        <marker id="arrowHead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="#1f6feb" />
        </marker>
      </defs>

      <text x={20} y={224} fontSize={10} fill={AXIS}>
        角速度 {(snapshot.telemetry.thetaDot ?? 0).toFixed(2)} rad/s
      </text>
      <text x={620} y={224} textAnchor="end" fontSize={10} fill={AXIS}>
        小车 {(snapshot.telemetry.cartSpeed ?? 0).toFixed(2)} m/s
      </text>
    </svg>
  );
}

export const VIEW_REGISTRY: Record<string, (props: ViewProps) => JSX.Element> = {
  'dc-motor': MotorView,
  temperature: TemperatureView,
  'liquid-level': LiquidView,
  'balancing-robot': RobotView,
  'inverted-pendulum': PendulumView
};
