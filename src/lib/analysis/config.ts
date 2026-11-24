/** Heuristics for recreational skiing, not calibrated medical/sport measurements. SI units. */
export const ANALYSIS_CONFIG = {
  maxSpeed: 45, // 162 km/h: conservative ceiling; rejects GPS teleports, can exclude race speeds.
  spikeFloor: 25, // Only reject relative spikes above 90 km/h to preserve ordinary acceleration.
  spikeRatio: 3, // A one-point excursion must also exceed 3× the local median speed.
  duplicateDistance: 2, // Same-timestamp points within 2m are redundant fixes; drop without splitting blocks.
  maxGapSeconds: 120, // Beyond 2 minutes the path and speed are not reliably measured.
  maxUntimedStep: 500, // Untimed jumps over 500m cannot be validated; break the path.
  elevationMedianRadius: 2, // Fallback five-point median radius when timestamps are unavailable.
  elevationSmoothWindowSeconds: 6, // Time-based ±6s median removes 1Hz/5s altitude jitter consistently.
  elevationDeadband: 6, // Six metres suppresses small barometric/GPS oscillations in totals.
  trendWindowSeconds: 10, // Local ±10s regression window avoids smearing short runs at turnarounds.
  maxWindowSamples: 61, // Bound smoothing and regression work for unusually dense timestamp windows.
  stopSpeed: 0.7, // Under 2.5 km/h is stationary/drifting at typical GPS precision.
  downhillSpeed: 1.5, // 5.4 km/h entry captures gentle beginner slopes and slow turns.
  downhillExitSpeed: 0.7, // Match stopSpeed to eliminate the 0.7–0.9 m/s unknown deadzone.
  verticalRate: 0.06, // ~3.6m/min sustained ascent/descent separates flat motion from slopes.
  hysteresisRate: 0.025, // Keep established downhill/uphill through brief flat traverses or lift towers.
  maxHysteresisSeconds: 15, // Require renewed directional evidence before counting a long flat traverse.
  transitionSeconds: 15, // Ignore brief reversals or unknown noise surrounded by the same state.
  liftBridgeStopSeconds: 75, // Brief lift halts/slowdowns remain within the same lift ride.
  liftBridgeUnknownSeconds: 45, // Flat tower spans or brief signal wobble stay in the same lift ride.
  minLiftSeconds: 40, // Exclude short stairs/skating while keeping short pair lifts.
  minLiftDistance: 60, // Require meaningful horizontal travel to reject stationary altitude drift.
  minLiftAscent: 25, // Require meaningful net vertical gain to count as a lift ride.
  maxGapLiftSeconds: 1200, // Allow gap-inferred lift rides up to 20 minutes (e.g. inside gondolas).
  gapElevationWindowSeconds: 15, // Keep representative elevations local to the gap endpoints.
  gapElevationSamples: 3, // A short median reduces the impact of an isolated endpoint spike.
  maxLiftHorizontalSpeed: 15, // 54 km/h upper bound filters high-speed vehicle travel.
  maxLiftVerticalRate: 5, // 300 m/min upper bound filters large altitude glitches.
  maxRunBreakSeconds: 180, // Stops or flat traverses up to 3 minutes remain within the same run.
  runBreakAscent: 20, // Significant non-lift climb (>20m) splits adjacent downhill runs.
  minRunSeconds: 20, // Keep fast short courses (e.g. 350m in 25s) while filtering lift-exit jitter.
  minRunDistance: 80, // Require 80m of verified downhill travel.
  minRunDescent: 8, // Require a meaningful drop rather than flat transit.
} as const;
export type AnalysisConfig = { [K in keyof typeof ANALYSIS_CONFIG]: number };
