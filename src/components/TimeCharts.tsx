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
import type { Analysis, Edge, SkiState } from '../types/analysis';
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
  runId: number | null;
  liftId: number | null;
  inferredLift: boolean;
  [key: string]: number | string | boolean | null;
}
const states = Object.keys(STATE_COLORS) as SkiState[];
const elevationSeries = ['gap', ...states];

function edgeSeries(edge: Edge | undefined) {
  return edge?.connected ? edge.state : edge ? 'gap' : null;
}

export function createChartRows(a: Analysis): ChartRow[] {
  const rows: ChartRow[] = [];
  const stride = Math.max(1, Math.ceil(a.edges.length / 1600));
  const boundaries = new Set([
    ...a.runs.flatMap((r) => [r.from, r.to]),
    ...a.lifts.flatMap((l) => [l.from, l.to]),
  ]);
  const inferredLiftIds = new Set(a.lifts.filter((l) => l.inferredFromGap).map((l) => l.id));
  const vertices: { index: number; incoming?: Edge }[] = [];
  let lastElapsed = -Infinity;
  for (const p of a.points) {
    if (!p.accepted || p.elapsed == null || p.elapsed <= lastElapsed) continue;
    vertices.push({ index: p.index });
    lastElapsed = p.elapsed;
  }
  let edgeIndex = 0;
  for (let i = 1; i < vertices.length; i++) {
    const vertex = vertices[i];
    while (edgeIndex < a.edges.length && a.edges[edgeIndex].to < vertex.index) edgeIndex++;
    const edge = a.edges[edgeIndex];
    if (edge?.from === vertices[i - 1].index && edge.to === vertex.index) vertex.incoming = edge;
  }

  for (let i = 0; i < vertices.length; i++) {
    const { index, incoming } = vertices[i];
    const outgoing = vertices[i + 1]?.incoming;
    const p = a.points[index];
    const prev = vertices[i - 1] ? a.points[vertices[i - 1].index] : undefined;
    const next = vertices[i + 1] ? a.points[vertices[i + 1].index] : undefined;
    const prevEle = prev?.smoothedElevation;
    const curEle = p.smoothedElevation;
    const nextEle = next?.smoothedElevation;
    const isExtremum =
      prevEle != null &&
      curEle != null &&
      nextEle != null &&
      ((curEle > prevEle && curEle >= nextEle) || (curEle < prevEle && curEle <= nextEle));
    const inSeries = edgeSeries(incoming);
    const outSeries = edgeSeries(outgoing);
    if (
      i % stride !== 0 &&
      i !== vertices.length - 1 &&
      !boundaries.has(index) &&
      inSeries === outSeries &&
      inSeries != null &&
      inSeries !== 'gap' &&
      incoming?.speed != null &&
      outgoing?.speed != null &&
      (curEle != null || (prevEle == null && nextEle == null)) &&
      !isExtremum
    )
      continue;

    const edge = incoming ?? outgoing;
    const speed = incoming?.speed != null ? incoming.speed * 3.6 : null;
    const row: ChartRow = {
      elapsed: p.elapsed!,
      index,
      time: p.time,
      speed,
      elevation: curEle,
      elevation_gap: inSeries === 'gap' || outSeries === 'gap' ? curEle : null,
      state: edge?.state ?? 'unknown',
      runId: edge?.runId ?? null,
      liftId: edge?.liftId ?? null,
      inferredLift: edge?.liftId != null && inferredLiftIds.has(edge.liftId),
    };
    for (const state of states) {
      row[`elevation_${state}`] = state === inSeries || state === outSeries ? curEle : null;
      row[`speed_${state}`] =
        state === inSeries || (state === outSeries && outgoing?.speed != null) ? speed : null;
    }

    const prevRow = rows[rows.length - 1];
    if (prevRow) {
      // A shared vertex can belong to two series. Break any series that would
      // otherwise draw an edge between two shared vertices in the wrong state.
      const breakSeries = elevationSeries.some(
        (series) =>
          series !== inSeries &&
          ((prevRow[`elevation_${series}`] != null && row[`elevation_${series}`] != null) ||
            (prevRow[`speed_${series}`] != null && row[`speed_${series}`] != null)),
      );
      if (inSeries == null || inSeries === 'gap' || breakSeries) {
        const marker: ChartRow = {
          ...row,
          elapsed: (prevRow.elapsed + row.elapsed) / 2,
          time: null,
          speed: null,
          elevation: null,
        };
        for (const kind of ['elevation', 'speed']) {
          for (const series of elevationSeries) {
            const key = `${kind}_${series}`;
            const start = prevRow[key];
            const end = row[key];
            marker[key] =
              series === inSeries && typeof start === 'number' && typeof end === 'number'
                ? (start + end) / 2
                : null;
          }
        }
        rows.push(marker);
      }
    }
    rows.push(row);
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
  const tag =
    row?.runId != null
      ? `滑走 ${String(row.runId).padStart(2, '0')}本目`
      : row?.liftId != null
        ? `リフト ${String(row.liftId).padStart(2, '0')}回目${row.inferredLift ? '（欠損推定）' : '（推定）'}`
        : null;
  return active && row ? (
    <div className="chart-tooltip">
      <strong>
        {clock(row.time)} <span>JST</span>
      </strong>
      <p>
        {duration(row.elapsed)} · {STATE_LABELS[row.state]}
        {tag ? ` · ${tag}` : ''}
      </p>
      <p>
        {number(row.elevation)} m <span>/</span> {number(row.speed, 1)} km/h
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
  const liftBands = useMemo(
    () =>
      a.lifts
        .map((l) => ({
          id: l.id,
          x1: a.points[l.from].elapsed,
          x2: a.points[l.to].elapsed,
          inferred: l.inferredFromGap,
        }))
        .filter((b): b is { id: number; x1: number; x2: number; inferred: boolean } =>
          Boolean(b.x1 != null && b.x2 != null && b.x2 > b.x1),
        ),
    [a],
  );
  return (
    <div className="charts-stack">
      {(['elevation', 'speed'] as const).map((kind) => (
        <section
          className="panel chart-panel"
          key={kind}
          aria-label={kind === 'elevation' ? '時間と標高の時系列グラフ' : '速度の時系列グラフ'}
        >
          <div className="panel-heading">
            <h2>
              {kind === 'elevation' ? <Mountain /> : <Gauge />}
              {kind === 'elevation' ? '標高（時間×標高）' : '速度'}
            </h2>
            <span className="chart-unit">
              {kind === 'elevation' ? 'm' : 'km/h'} <span className="muted">/ 経過時間（分）</span>
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
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                  <XAxis
                    dataKey="elapsed"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => number(v / 60, 0)}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)' }}
                    minTickGap={28}
                  />
                  <YAxis
                    domain={kind === 'speed' ? [0, 'auto'] : ['auto', 'auto']}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    tickFormatter={(v) => number(v)}
                    tickLine={false}
                    axisLine={false}
                    width={49}
                  />
                  {kind === 'elevation' &&
                    liftBands.map((band) => (
                      <ReferenceArea
                        key={band.id}
                        x1={band.x1}
                        x2={band.x2}
                        fill={STATE_COLORS.uphill}
                        fillOpacity={band.inferred ? 0.04 : 0.06}
                        stroke={band.inferred ? STATE_COLORS.uphill : 'none'}
                        strokeDasharray={band.inferred ? '3 3' : undefined}
                        strokeOpacity={0.28}
                      />
                    ))}
                  {from != null && to != null && (
                    <ReferenceArea
                      x1={from}
                      x2={to}
                      fill={STATE_COLORS.downhill}
                      fillOpacity={0.1}
                      stroke={STATE_COLORS.downhill}
                      strokeOpacity={0.35}
                    />
                  )}
                  {cursor != null && (
                    <ReferenceLine x={cursor} stroke="var(--text)" strokeDasharray="3 3" />
                  )}
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }}
                  />
                  {kind === 'elevation' && (
                    <Line
                      type="linear"
                      dataKey="elevation_gap"
                      stroke="#94a3b8"
                      strokeOpacity={0.75}
                      strokeWidth={1.5}
                      strokeDasharray="4 5"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  )}
                  {states.map((state) => (
                    <Line
                      key={state}
                      type="linear"
                      dataKey={`${kind}_${state}`}
                      stroke={STATE_COLORS[state]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
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
