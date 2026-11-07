'use client';
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Gauge, Mountain } from 'lucide-react';
import type { Analysis, SkiState } from '../types/analysis';
import { STATE_COLORS, STATE_LABELS, clock, duration, number } from '../lib/presentation';
interface Props {
  analysis: Analysis;
  selectedRun: number | null;
  selectedPoint: number | null;
  onPoint: (index: number) => void;
}
export interface ChartRow {
  elapsed: number;
  index: number;
  time: number | null;
  speed: number | null;
  elevation: number | null;
  state: SkiState;
  [key: string]: number | string | null;
}
export function createChartRows(a: Analysis): ChartRow[] {
  const rows: ChartRow[] = [];
  const stride = Math.max(1, Math.ceil(a.edges.length / 1400));
  const boundaries = new Set(a.runs.flatMap((r) => [r.from, r.to]));
  let lastTime = -Infinity;
  const first = a.points.find((p) => p.accepted && p.elapsed != null);
  if (first?.elapsed != null) {
    const state = a.edges.find((e) => e.from === first.index)?.state ?? 'unknown';
    const row: ChartRow = {
      elapsed: first.elapsed,
      index: first.index,
      time: first.time,
      speed: null,
      elevation: first.smoothedElevation,
      state,
    };
    for (const s of Object.keys(STATE_COLORS)) {
      row[`speed_${s}`] = null;
      row[`elevation_${s}`] = s === state ? row.elevation : null;
    }
    rows.push(row);
    lastTime = first.elapsed;
  }
  for (let i = 0; i < a.edges.length; i++) {
    const e = a.edges[i],
      p = a.points[e.to],
      prev = a.points[e.from];
    if (p.elapsed == null || p.elapsed <= lastTime) continue;
    if (!e.connected && prev.elapsed != null && p.elapsed > prev.elapsed)
      rows.push({
        elapsed: (prev.elapsed + p.elapsed) / 2,
        index: e.to,
        time: null,
        speed: null,
        elevation: null,
        state: 'unknown',
      });
    const important =
      i % stride === 0 ||
      i === a.edges.length - 1 ||
      boundaries.has(e.to) ||
      boundaries.has(e.from) ||
      e.state !== a.edges[i - 1]?.state ||
      !e.connected;
    if (!important) continue;
    const row: ChartRow = {
      elapsed: p.elapsed,
      index: p.index,
      time: p.time,
      speed: e.speed == null ? null : e.speed * 3.6,
      elevation: e.connected && e.seconds != null ? p.smoothedElevation : null,
      state: e.state,
    };
    for (const s of Object.keys(STATE_COLORS)) {
      row[`speed_${s}`] = s === e.state ? row.speed : null;
      row[`elevation_${s}`] = s === e.state ? row.elevation : null;
    }
    rows.push(row);
    lastTime = p.elapsed;
  }
  return rows;
}
function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: ChartRow }[];
}) {
  const row = payload?.find((p) => p.payload?.time != null)?.payload;
  return active && row ? (
    <div className="chart-tooltip">
      <strong>
        {clock(row.time)} <span>JST</span>
      </strong>
      <p>
        {duration(row.elapsed)} · {STATE_LABELS[row.state]}
      </p>
      <p>
        {number(row.speed, 1)} km/h <span>/</span> {number(row.elevation)} m
      </p>
    </div>
  ) : null;
}
export function TimeCharts({ analysis: a, selectedRun, selectedPoint, onPoint }: Props) {
  const rows = useMemo(() => createChartRows(a), [a]);
  const selected = a.runs.find((r) => r.id === selectedRun);
  const from = selected ? a.points[selected.from].elapsed : null,
    to = selected ? a.points[selected.to].elapsed : null;
  const cursor = selectedPoint == null ? null : a.points[selectedPoint].elapsed;
  return (
    <div className="charts-stack">
      {(['speed', 'elevation'] as const).map((kind) => (
        <section
          className="panel chart-panel"
          key={kind}
          aria-label={kind === 'speed' ? '速度の時系列グラフ' : '標高の時系列グラフ'}
        >
          <div className="panel-heading">
            <h2>
              {kind === 'speed' ? <Gauge /> : <Mountain />}
              {kind === 'speed' ? '速度' : '標高'}
            </h2>
            <span className="chart-unit">
              {kind === 'speed' ? 'km/h' : 'm'} <span className="muted">/ 経過時間（分）</span>
            </span>
          </div>
          {rows.length > 0 ? (
            <div className="chart-canvas">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={{ width: 440, height: 200 }}
              >
                <LineChart
                  data={rows}
                  margin={{ top: 16, right: 18, bottom: 0, left: 0 }}
                  onMouseMove={(state) => {
                    if (
                      typeof state.activeTooltipIndex === 'number' ||
                      typeof state.activeTooltipIndex === 'string'
                    ) {
                      const row = rows[Number(state.activeTooltipIndex)];
                      if (row?.time != null) onPoint(row.index);
                    }
                  }}
                  onClick={(state) => {
                    if (state.activeTooltipIndex != null) {
                      const row = rows[Number(state.activeTooltipIndex)];
                      if (row?.time != null) onPoint(row.index);
                    }
                  }}
                >
                  <CartesianGrid stroke="#293641" strokeDasharray="3 4" vertical={false} />
                  <XAxis
                    dataKey="elapsed"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => number(v / 60, 0)}
                    tick={{ fill: '#a4b2bf', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#35434f' }}
                    minTickGap={28}
                  />
                  <YAxis
                    domain={kind === 'speed' ? [0, 'auto'] : ['auto', 'auto']}
                    tick={{ fill: '#a4b2bf', fontSize: 11 }}
                    tickFormatter={(v) => number(v)}
                    tickLine={false}
                    axisLine={false}
                    width={49}
                  />
                  {from != null && to != null && (
                    <ReferenceArea
                      x1={from}
                      x2={to}
                      fill="#73e2ce"
                      fillOpacity={0.09}
                      stroke="#73e2ce"
                      strokeOpacity={0.3}
                    />
                  )}
                  {cursor != null && (
                    <ReferenceLine x={cursor} stroke="#edf3f7" strokeDasharray="3 3" />
                  )}
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: '#a4b2bf', strokeDasharray: '3 3' }}
                  />
                  <Line
                    type="linear"
                    dataKey={kind}
                    stroke={kind === 'speed' ? '#73e2ce' : '#a6b4ff'}
                    strokeOpacity={0.3}
                    strokeWidth={1}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                  {(Object.keys(STATE_COLORS) as SkiState[]).map((state) => (
                    <Line
                      key={state}
                      type="linear"
                      dataKey={`${kind}_${state}`}
                      stroke={STATE_COLORS[state]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, stroke: '#edf3f7', strokeWidth: 2 }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="empty-message">時刻データがないため、時系列グラフは表示できません。</p>
          )}
          {kind === 'elevation' && a.quality.missingElevations === a.points.length && (
            <p className="chart-missing">標高データがありません。</p>
          )}
        </section>
      ))}
    </div>
  );
}
