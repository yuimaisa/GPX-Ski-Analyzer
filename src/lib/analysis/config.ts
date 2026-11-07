/** Heuristics for recreational skiing, not calibrated medical/sport measurements. SI units. */
export const ANALYSIS_CONFIG = {
  maxSpeed: 45, // 162 km/h: conservative ceiling; rejects GPS teleports, can exclude race speeds.
  spikeFloor: 25, // Only reject relative spikes above 90 km/h to preserve ordinary acceleration.
  spikeRatio: 3, // A one-point excursion must also exceed 3× the local median speed.
  maxGapSeconds: 120, // Beyond 2 minutes the path and activity are not reliably observed.
  maxUntimedStep: 500, // Untimed jumps over 500m cannot be validated; break the path.
  elevationMedianRadius: 2, // Five-point median removes isolated altitude glitches.
  elevationDeadband: 6, // Six metres suppresses small barometric/GPS oscillations in totals.
  trendWindowSeconds: 20, // Local ±20s trend is less sensitive than individual altitude deltas.
  stopSpeed: 0.7, // Under 2.5 km/h is stationary/drifting at typical GPS precision.
  downhillSpeed: 2, // 7.2 km/h avoids classifying stationary altitude drift as skiing.
  downhillExitSpeed: 0.9, // Retain an established descent through slow hairpin turns (3.2 km/h).
  verticalRate: 0.08, // ~5m/min sustained ascent/descent separates flat motion from slopes.
  transitionSeconds: 15, // Ignore brief uphill/downhill reversals surrounded by the same state.
  bridgeStopSeconds: 25, // A brief pause within a descent keeps the same run number.
  minRunSeconds: 30, // Suppress very short slope fragments at lift stations.
  minRunDistance: 100, // And require 100m of verified downhill travel.
  minRunDescent: 8, // Also require a meaningful drop rather than flat transit.
} as const;
export type AnalysisConfig = { [K in keyof typeof ANALYSIS_CONFIG]: number };
