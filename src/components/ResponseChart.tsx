import { useEffect, useRef } from 'react';
import type { DisturbanceEvent } from '../simulation/engine';
import type { HistoryBuffer } from '../metrics/history';

interface Props {
  history: HistoryBuffer | null;
  version: number;
  target: number;
  unit: string;
  decimals: number;
  disturbances: DisturbanceEvent[];
  showControl: boolean;
  controlUnit: string;
}

const COLOR_TARGET = '#1f6feb';
const COLOR_MEASURED = '#0f766e';
const COLOR_CONTROL = '#e8590c';
const GRID = '#e6ecf3';
const AXIS = '#8b9aab';
const TEXT = '#3d4c5c';

const niceStep = (span: number, targetTicks: number): number => {
  const rough = span / Math.max(1, targetTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-9))));
  const norm = rough / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
};

export function ResponseChart({
  history,
  version,
  target,
  unit,
  decimals,
  disturbances,
  showControl,
  controlUnit
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      if (width <= 0 || height <= 0) return;
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      const padLeft = 46;
      const padRight = showControl ? 44 : 14;
      const padTop = 18;
      const padBottom = 22;
      const plotW = Math.max(10, width - padLeft - padRight);
      const plotH = Math.max(10, height - padTop - padBottom);

      const count = history?.size ?? 0;
      const lastT = count > 0 ? (history?.at(count - 1).t ?? 0) : 0;
      const tMin = 0;
      const tMax = Math.max(10, lastT);

      // --- value range -----------------------------------------------------
      let vMin = Number.POSITIVE_INFINITY;
      let vMax = Number.NEGATIVE_INFINITY;
      const stride = Math.max(1, Math.ceil(count / 1400));
      if (count > 0 && history) {
        for (let i = 0; i < count; i += stride) {
          const s = history.at(i);
          if (s.y < vMin) vMin = s.y;
          if (s.y > vMax) vMax = s.y;
        }
        const last = history.at(count - 1);
        vMin = Math.min(vMin, last.y);
        vMax = Math.max(vMax, last.y);
      }
      if (!Number.isFinite(vMin)) {
        const pad = Math.max(1, Math.abs(target) * 0.3);
        vMin = target - pad;
        vMax = target + pad;
      }
      vMin = Math.min(vMin, target);
      vMax = Math.max(vMax, target);
      const rawSpan = vMax - vMin;
      const span = rawSpan < 1e-6 ? Math.max(Math.abs(target) * 0.2, 1) : rawSpan;
      const margin = span * 0.12;
      const lo = vMin - margin;
      const hi = vMax + margin;

      let cMin = 0;
      let cMax = 1;
      if (showControl && count > 0 && history) {
        cMin = Number.POSITIVE_INFINITY;
        cMax = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < count; i += stride) {
          const s = history.at(i);
          if (s.u < cMin) cMin = s.u;
          if (s.u > cMax) cMax = s.u;
        }
        if (!Number.isFinite(cMin)) {
          cMin = 0;
          cMax = 1;
        }
        if (cMax - cMin < 1e-9) {
          cMax += 1;
          cMin -= 1;
        }
        const cm = (cMax - cMin) * 0.1;
        cMin -= cm;
        cMax += cm;
      }

      const xOf = (t: number) => padLeft + ((t - tMin) / (tMax - tMin)) * plotW;
      const yOf = (v: number) => padTop + plotH - ((v - lo) / (hi - lo)) * plotH;
      const yc = (v: number) => padTop + plotH - ((v - cMin) / (cMax - cMin)) * plotH;

      // --- disturbance bands ----------------------------------------------
      for (const d of disturbances) {
        const x0 = xOf(Math.max(0, d.startTime));
        const x1 = xOf(Math.min(tMax, d.endTime));
        if (x1 <= padLeft || x0 >= padLeft + plotW) continue;
        ctx.fillStyle = 'rgba(232, 89, 12, 0.07)';
        ctx.fillRect(Math.max(padLeft, x0), padTop, Math.max(1, x1 - Math.max(padLeft, x0)), plotH);
        ctx.strokeStyle = 'rgba(232, 89, 12, 0.35)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.max(padLeft, x0), padTop);
        ctx.lineTo(Math.max(padLeft, x0), padTop + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // --- grid -------------------------------------------------------------
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = AXIS;
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      const yStep = niceStep(hi - lo, 4);
      const yStart = Math.ceil(lo / yStep) * yStep;
      for (let v = yStart; v <= hi + 1e-9; v += yStep) {
        const y = Math.round(yOf(v)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + plotW, y);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(v.toFixed(Math.max(0, Math.min(3, decimals))), padLeft - 6, y + 3);
      }
      const xStep = niceStep(tMax - tMin, 6);
      for (let t = 0; t <= tMax + 1e-9; t += xStep) {
        const x = Math.round(xOf(t)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, padTop + plotH);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(`${t.toFixed(0)}`, x, padTop + plotH + 14);
      }

      // axis frame
      ctx.strokeStyle = '#c2cedc';
      ctx.beginPath();
      ctx.moveTo(padLeft + 0.5, padTop);
      ctx.lineTo(padLeft + 0.5, padTop + plotH + 0.5);
      ctx.lineTo(padLeft + plotW, padTop + plotH + 0.5);
      ctx.stroke();

      ctx.fillStyle = TEXT;
      ctx.textAlign = 'left';
      ctx.font = '10px "Segoe UI", sans-serif';
      ctx.fillText(unit, 6, 11);
      ctx.textAlign = 'right';
      ctx.fillText('t / s', padLeft + plotW, height - 4);

      // --- target -----------------------------------------------------------
      ctx.strokeStyle = COLOR_TARGET;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(padLeft, yOf(target));
      ctx.lineTo(padLeft + plotW, yOf(target));
      ctx.stroke();
      ctx.setLineDash([]);

      // --- control (secondary axis) -----------------------------------------
      if (showControl && count > 0 && history) {
        ctx.strokeStyle = COLOR_CONTROL;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < count; i += stride) {
          const s = history.at(i);
          const x = xOf(s.t);
          const y = yc(s.u);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = COLOR_CONTROL;
        ctx.textAlign = 'left';
        ctx.font = '9.5px ui-monospace, monospace';
        ctx.fillText(cMax.toFixed(2), padLeft + plotW + 4, padTop + 8);
        ctx.fillText(cMin.toFixed(2), padLeft + plotW + 4, padTop + plotH);
        ctx.save();
        ctx.translate(width - 4, padTop + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.font = '9.5px "Segoe UI", sans-serif';
        ctx.fillText(controlUnit, 0, 0);
        ctx.restore();
      }

      // --- measured ---------------------------------------------------------
      if (count > 1 && history) {
        ctx.strokeStyle = COLOR_MEASURED;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < count; i += stride) {
          const s = history.at(i);
          const x = xOf(s.t);
          const y = yOf(s.y);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        const last = history.at(count - 1);
        ctx.lineTo(xOf(last.t), yOf(last.y));
        ctx.stroke();

        // current value marker
        ctx.fillStyle = COLOR_MEASURED;
        ctx.beginPath();
        ctx.arc(xOf(last.t), yOf(last.y), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => draw()) : null;
    if (observer && wrapRef.current) observer.observe(wrapRef.current);
    return () => {
      observer?.disconnect();
    };
  }, [history, version, target, unit, decimals, disturbances, showControl, controlUnit]);

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="chart-canvas" data-testid="response-chart" />
    </div>
  );
}
