'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  ScaleControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { LocateFixed, MapPinned } from 'lucide-react';
import type { Analysis, AnalyzedPoint } from '../types/analysis';
import { STATE_COLORS, STATE_LABELS, SPEED_COLORS } from '../lib/presentation';
import type { LatLngTuple } from 'leaflet';
interface Props {
  analysis: Analysis;
  selectedRun: number | null;
  selectedPoint: number | null;
  onPoint: (index: number) => void;
}
const position = (p: AnalyzedPoint): LatLngTuple => [p.lat, p.lon];
function MapControl({
  analysis,
  selectedRun,
  fit,
  onPoint,
}: {
  analysis: Analysis;
  selectedRun: number | null;
  fit: number;
  onPoint: (index: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const run = analysis.runs.find((r) => r.id === selectedRun);
    const points = analysis.points.filter(
      (p) => p.accepted && (!run || (p.index >= run.from && p.index <= run.to)),
    );
    if (points.length)
      map.fitBounds(L.latLngBounds(points.map(position)), {
        padding: [30, 30],
        maxZoom: 16,
        animate: false,
      });
  }, [analysis, selectedRun, fit, map]);
  useMapEvents({
    click(event) {
      let index = 0,
        distance = Infinity;
      for (const p of analysis.points) {
        if (!p.accepted) continue;
        const d =
          (p.lat - event.latlng.lat) ** 2 +
          ((p.lon - event.latlng.lng) * Math.cos((p.lat * Math.PI) / 180)) ** 2;
        if (d < distance) {
          distance = d;
          index = p.index;
        }
      }
      onPoint(index);
    },
  });
  return null;
}
export default function TrackMap({ analysis, selectedRun, selectedPoint, onPoint }: Props) {
  const [mode, setMode] = useState<'state' | 'speed'>('state');
  const [fit, setFit] = useState(0);
  const [tileError, setTileError] = useState(false);
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const lines = useMemo(() => {
    const result: {
      key: string;
      color: string;
      positions: LatLngTuple[];
      dashed: boolean;
      muted: boolean;
    }[] = [];
    let previousTo = -1;
    for (const e of analysis.edges) {
      if (!e.connected) {
        previousTo = -1;
        continue;
      }
      const bin = e.speed == null ? -1 : Math.min(5, Math.floor((e.speed * 3.6) / 15));
      const color =
        mode === 'state'
          ? STATE_COLORS[e.state]
          : bin < 0
            ? STATE_COLORS.unknown
            : SPEED_COLORS[bin];
      const muted = selectedRun != null && e.runId !== selectedRun;
      const key = `${e.block}-${color}-${muted}-${e.state === 'unknown'}`;
      let line = result[result.length - 1];
      if (!line || line.key !== key || previousTo !== e.from) {
        line = {
          key,
          color,
          positions: [position(analysis.points[e.from])],
          dashed: e.state === 'unknown',
          muted,
        };
        result.push(line);
      }
      line.positions.push(position(analysis.points[e.to]));
      previousTo = e.to;
    }
    // Canvas + batched paths: no React component per GPS point. Thin long paths before drawing.
    for (const line of result) {
      if (line.positions.length > 1200) {
        const stride = Math.ceil(line.positions.length / 1200);
        line.positions = line.positions.filter(
          (_, i) => i % stride === 0 || i === line.positions.length - 1,
        );
      }
    }
    return result;
  }, [analysis, mode, selectedRun]);
  const first = analysis.points.find((p) => p.accepted),
    last = analysis.points.filter((p) => p.accepted).at(-1);
  const cursor = selectedPoint != null ? analysis.points[selectedPoint] : null;
  return (
    <section className="panel map-panel" aria-label="滑走マップ">
      <div className="panel-heading">
        <h2>
          <MapPinned />
          滑走マップ
        </h2>
        <div className="map-actions">
          <div className="segmented" aria-label="軌跡の表示方法">
            <button aria-pressed={mode === 'state'} onClick={() => setMode('state')}>
              状態
            </button>
            <button aria-pressed={mode === 'speed'} onClick={() => setMode('speed')}>
              速度
            </button>
          </div>
          <button
            className="icon-button"
            aria-label="軌跡全体または選択区間にフィット"
            title="軌跡にフィット"
            onClick={() => setFit((v) => v + 1)}
          >
            <LocateFixed size={19} />
          </button>
        </div>
      </div>
      <div className="map-canvas">
        <MapContainer
          center={first ? position(first) : [36, 138]}
          zoom={13}
          scrollWheelZoom={false}
          preferCanvas
          renderer={renderer}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
            eventHandlers={{ tileerror: () => setTileError(true) }}
          />
          <MapControl analysis={analysis} selectedRun={selectedRun} fit={fit} onPoint={onPoint} />
          <ScaleControl position="bottomleft" imperial={false} />
          {lines.map((line, i) => (
            <Polyline
              key={i}
              positions={line.positions}
              pathOptions={{
                color: line.color,
                weight: line.muted ? 2 : 4,
                opacity: line.muted ? 0.24 : 0.95,
                dashArray: line.dashed ? '5 7' : undefined,
                lineCap: 'round',
              }}
              smoothFactor={1.2}
            />
          ))}
          {first && (
            <CircleMarker
              center={position(first)}
              radius={6}
              pathOptions={{
                color: '#fff',
                weight: 2,
                fillColor: STATE_COLORS.downhill,
                fillOpacity: 1,
              }}
            >
              <Tooltip permanent direction="top">
                開始
              </Tooltip>
            </CircleMarker>
          )}
          {last && (
            <CircleMarker
              center={position(last)}
              radius={6}
              pathOptions={{ color: '#fff', weight: 2, fillColor: '#be123c', fillOpacity: 1 }}
            >
              <Tooltip permanent direction="bottom">
                終了
              </Tooltip>
            </CircleMarker>
          )}
          {cursor?.accepted && (
            <CircleMarker
              center={position(cursor)}
              radius={9}
              pathOptions={{
                color: '#fff',
                weight: 3,
                fillColor: STATE_COLORS.downhill,
                fillOpacity: 1,
              }}
            >
              <Tooltip direction="top">選択地点</Tooltip>
            </CircleMarker>
          )}
        </MapContainer>
        {tileError && (
          <p className="map-notice">背景地図を取得できません。軌跡は表示しています。</p>
        )}
        {selectedRun != null && (
          <div className="map-selection">{String(selectedRun).padStart(2, '0')}本目を表示</div>
        )}
      </div>
      <div className="map-legend" aria-label={mode === 'state' ? '状態の凡例' : '速度の凡例'}>
        {mode === 'state' ? (
          Object.entries(STATE_COLORS).map(([state, color]) => (
            <span key={state}>
              <i style={{ background: color }} />
              {STATE_LABELS[state as keyof typeof STATE_LABELS]}
            </span>
          ))
        ) : (
          <>
            <span className="legend-unit">km/h</span>
            {SPEED_COLORS.map((color, i) => (
              <span key={color}>
                <i style={{ background: color }} />
                {i === 5 ? '75+' : `${i * 15}–${i * 15 + 15}`}
              </span>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
