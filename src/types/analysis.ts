export type SkiState = 'downhill' | 'uphill' | 'stopped' | 'unknown';
export interface GpxPoint {
  lat: number;
  lon: number;
  elevation: number | null;
  time: number | null;
  segment: number;
}
export interface GpxTrack {
  name: string;
  points: GpxPoint[];
  trackCount: number;
  segmentCount: number;
  warnings: string[];
}
export interface AnalyzedPoint extends GpxPoint {
  index: number;
  smoothedElevation: number | null;
  elapsed: number | null;
  accepted: boolean;
}
export interface Edge {
  from: number;
  to: number;
  block: number;
  distance: number;
  seconds: number | null;
  speed: number | null;
  state: SkiState;
  ascent: number;
  descent: number;
  runId: number | null;
  connected: boolean;
}
export interface SkiRun {
  id: number;
  from: number;
  to: number;
  start: number | null;
  end: number | null;
  duration: number;
  elapsed: number;
  distance: number;
  descent: number;
  averageSpeed: number;
  maxSpeed: number;
}
export interface Analysis {
  track: GpxTrack;
  points: AnalyzedPoint[];
  edges: Edge[];
  runs: SkiRun[];
  stats: {
    distance: number;
    skiDistance: number;
    skiSeconds: number;
    uphillSeconds: number;
    stoppedSeconds: number;
    unknownSeconds: number;
    ascent: number | null;
    descent: number | null;
    maxSpeed: number | null;
    averageSkiSpeed: number | null;
    minElevation: number | null;
    maxElevation: number | null;
    start: number | null;
    end: number | null;
  };
  quality: {
    rejectedPoints: number;
    gaps: number;
    invalidTimes: number;
    missingTimes: number;
    missingElevations: number;
    warnings: string[];
  };
}
