'use client';
import dynamic from 'next/dynamic';
import { useMemo, useRef, useState } from 'react';
import {
  FolderOpen,
  MountainSnow,
  Info,
  LoaderCircle,
  AlertCircle,
  FileText,
  Crosshair,
} from 'lucide-react';
import { useAnalyzer } from '../hooks/useAnalyzer';
import { ImportPanel } from './ImportPanel';
import { Stats } from './Stats';
import { TimeCharts } from './TimeCharts';
import { RunTable } from './RunTable';
import { QualityPanel } from './QualityPanel';
import { clock, day, number, STATE_LABELS, STATE_COLORS } from '../lib/presentation';
import type { Analysis } from '../types/analysis';
const TrackMap = dynamic(() => import('./TrackMap'), {
  ssr: false,
  loading: () => (
    <div className="panel map-loading">
      <LoaderCircle className="spin" />
      地図を準備しています…
    </div>
  ),
});
function AnalysisView({
  analysis: a,
  filename,
  sample,
}: {
  analysis: Analysis;
  filename: string;
  sample: boolean;
}) {
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const accepted = useMemo(() => a.points.filter((p) => p.accepted), [a]);
  const edgeByTo = useMemo(() => new Map(a.edges.map((e) => [e.to, e])), [a]);
  const point = selectedPoint == null ? null : a.points[selectedPoint];
  const edge = selectedPoint == null ? null : edgeByTo.get(selectedPoint);
  const cursorPosition = point ? accepted.findIndex((p) => p.index === point.index) : 0;
  return (
    <>
      <section className="record-heading">
        <div>
          <h1>解析結果</h1>
          <p className="record-name" title={filename}>
            <FileText size={16} />
            {filename}
          </p>
        </div>
        <div className="record-meta">
          <p>
            {day(a.stats.start)} <span> / </span> {clock(a.stats.start)}–{clock(a.stats.end)}{' '}
            <span>JST</span>
          </p>
          <p>
            {a.track.trackCount}トラック · {a.track.segmentCount}セグメント ·{' '}
            {number(a.points.length)}地点
          </p>
        </div>
      </section>
      {sample && (
        <p className="synthetic-note">
          <Info size={15} />
          白馬エリア・合成サンプル（実際の滑走・コース情報ではありません）
        </p>
      )}
      <Stats analysis={a} />
      <div className="analysis-grid">
        <TrackMap
          analysis={a}
          selectedRun={selectedRun}
          selectedPoint={selectedPoint}
          onPoint={setSelectedPoint}
        />
        <TimeCharts
          analysis={a}
          selectedRun={selectedRun}
          selectedPoint={selectedPoint}
          onPoint={setSelectedPoint}
        />
      </div>
      <div className="point-inspector">
        <div className="point-readout">
          <Crosshair size={17} />
          <strong>{point ? clock(point.time) : '地点を選択'}</strong>
          {point && (
            <>
              <span>JST</span>
              <span style={{ color: STATE_COLORS[edge?.state ?? 'unknown'] }}>
                {STATE_LABELS[edge?.state ?? 'unknown']}
              </span>
              <span>{number(edge?.speed == null ? null : edge.speed * 3.6, 1)} km/h</span>
              <span>{number(point.smoothedElevation)} m</span>
            </>
          )}
          <span className="inspector-help">地図・グラフで地点を選択</span>
        </div>
        <label className="point-slider">
          <span className="sr-only">軌跡上の地点を選択</span>
          <input
            type="range"
            min={0}
            max={accepted.length - 1}
            value={cursorPosition < 0 ? 0 : cursorPosition}
            onChange={(e) => setSelectedPoint(accepted[Number(e.target.value)].index)}
            aria-valuetext={
              point
                ? `${clock(point.time)}、標高${number(point.smoothedElevation)}メートル`
                : '地点未選択'
            }
          />
        </label>
      </div>
      <RunTable runs={a.runs} selected={selectedRun} onSelect={setSelectedRun} />
      <QualityPanel analysis={a} />
    </>
  );
}
export function Analyzer() {
  const { analysis, filename, sample, busy, error, load, resultId } = useAnalyzer();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const choose = () => input.current?.click();
  return (
    <div
      className={`app-shell ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = e.dataTransfer.files;
        if (files.length > 0) void load(files[0]);
      }}
    >
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href={process.env.NEXT_PUBLIC_BASE_PATH || '/'}>
            <MountainSnow strokeWidth={1.5} />
            <span>GPX Ski Analyzer</span>
          </a>
          <div className="header-actions">
            {analysis && (
              <a className="method-link" href="#analysis-method">
                <Info size={17} />
                解析方法
              </a>
            )}
            <button className="button outline" onClick={choose} disabled={busy}>
              <FolderOpen size={18} />
              <span>GPXを選択</span>
            </button>
          </div>
        </div>
      </header>
      <input
        ref={input}
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept=".gpx,application/gpx+xml"
        aria-label="GPXファイルを選択"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void load(file);
          e.target.value = '';
        }}
      />
      <main className="main-content" aria-busy={busy}>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={20} />
            <div>
              <strong>読み込めませんでした</strong>
              <p>{error}</p>
            </div>
            <button className="text-button" onClick={choose}>
              再選択
            </button>
          </div>
        )}
        {busy && (
          <div className="loading-banner" role="status">
            <LoaderCircle className="spin" size={18} />
            解析中…
          </div>
        )}
        {analysis ? (
          <AnalysisView key={resultId} analysis={analysis} filename={filename} sample={sample} />
        ) : (
          <ImportPanel onChoose={choose} onSample={() => void load()} busy={busy} />
        )}
      </main>
      <footer className="app-footer">
        <a href="https://github.com/yuimaisa/GPX-Ski-Analyzer" target="_blank" rel="noreferrer">
          ソースコード · MIT
        </a>
      </footer>
      {dragging && (
        <div className="drop-overlay">
          <FolderOpen size={48} />
          <strong>ここにGPXをドロップ</strong>
        </div>
      )}
    </div>
  );
}
