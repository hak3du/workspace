"use client";

import { useMemo } from "react";
import { priceLabel, timeAgo } from "@/lib/format";
import type { TradeDTO } from "@/lib/types";

interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
  endLabel: string;
}

const VIEW_W = 600;
const VIEW_H = 240;
const PAD_L = 68; // room for y-axis price labels
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 22; // room for x-axis time labels

function toCandles(trades: TradeDTO[]): Candle[] {
  const asc = [...trades]
    .map((t) => ({ t, ts: Date.parse(t.createdAt) }))
    .sort((a, b) => a.ts - b.ts)
    .map((x) => x.t)
    .slice(-40);
  if (asc.length < 2) return [];
  const bucketCount = Math.min(14, asc.length);
  const per = Math.ceil(asc.length / bucketCount);
  const out: Candle[] = [];
  for (let i = 0; i < asc.length; i += per) {
    const slice = asc.slice(i, i + per);
    const prices = slice.map((t) => t.priceAfter);
    out.push({
      open: prices[0],
      close: prices[prices.length - 1],
      high: Math.max(...prices),
      low: Math.min(...prices),
      endLabel: timeAgo(slice[slice.length - 1].createdAt),
    });
  }
  return out;
}

/**
 * Lightweight candlestick chart rendered as plain SVG (no chart libraries).
 * Buckets the latest ~40 trades into ~14 candles using priceAfter values.
 */
export function PriceChart({ trades }: { trades: TradeDTO[] }) {
  const candles = useMemo(() => toCandles(trades), [trades]);

  const n = candles.length;
  const plotW = VIEW_W - PAD_L - PAD_R;
  const plotH = VIEW_H - PAD_T - PAD_B;
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const span = hi - lo || hi * 0.01 || 1;
  const yMin = lo - span * 0.06;
  const yMax = hi + span * 0.06;
  const y = (p: number) => PAD_T + (1 - (p - yMin) / (yMax - yMin)) * plotH;
  const slot = plotW / n;
  const bodyW = Math.max(3, slot * 0.55);

  const yTicks = [0, 1 / 3, 2 / 3, 1].map((f) => yMin + f * (yMax - yMin));
  const xLabelIdx = Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1]));

  if (n < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] px-4 text-center text-sm text-muted-foreground">
        Not enough trades to draw a chart yet. Place the first trade to light up the curve.
      </div>
    );
  }

  return (
    <div className="relative h-64 w-full">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-[240px] w-full" role="img" aria-label="Price chart from recent trades">
        {/* grid */}
        {yTicks.map((p, i) => (
          <line key={`grid-${i}`} x1={PAD_L} x2={VIEW_W - PAD_R} y1={y(p)} y2={y(p)} className="stroke-white/5" strokeWidth={1} />
        ))}

        {/* y-axis labels */}
        {yTicks.map((p, i) => (
          <text
            key={`ylab-${i}`}
            x={PAD_L - 6}
            y={y(p)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={10}
            className="fill-muted-foreground"
          >
            {priceLabel(p)}
          </text>
        ))}

        {/* candles */}
        {candles.map((c, i) => {
          const cx = PAD_L + i * slot + slot / 2;
          const up = c.close >= c.open;
          const cls = up ? "up" : "down";
          const top = y(Math.max(c.open, c.close));
          const bottom = y(Math.min(c.open, c.close));
          const bodyH = Math.max(1.5, bottom - top);
          return (
            <g key={i}>
              <title>
                {`${up ? "Up" : "Down"} candle · O ${priceLabel(c.open)} · C ${priceLabel(c.close)} · H ${priceLabel(c.high)} · L ${priceLabel(c.low)} · ${c.endLabel}`}
              </title>
              <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke="currentColor" strokeWidth={1} className={cls} opacity={0.85} />
              <rect x={cx - bodyW / 2} y={top} width={bodyW} height={bodyH} rx={1} fill="currentColor" className={cls} />
              {/* invisible hit area so the tooltip is easy to trigger */}
              <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={plotH} fill="transparent" />
            </g>
          );
        })}

        {/* x-axis time labels */}
        {xLabelIdx.map((i) => (
          <text
            key={`xlab-${i}`}
            x={PAD_L + i * slot + slot / 2}
            y={VIEW_H - 6}
            textAnchor="middle"
            fontSize={10}
            className="fill-muted-foreground"
          >
            {candles[i].endLabel}
          </text>
        ))}
      </svg>
    </div>
  );
}
