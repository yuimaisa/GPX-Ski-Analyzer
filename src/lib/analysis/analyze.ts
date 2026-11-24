import type {
  Analysis,
  AnalyzedPoint,
  Edge,
  GpxTrack,
  LiftRide,
  SkiRun,
  SkiState,
} from '../../types/analysis';
import { haversine } from '../geo/haversine';
import { ANALYSIS_CONFIG, type AnalysisConfig } from './config';

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const sum = (edges: Edge[], key: 'distance' | 'ascent' | 'descent') =>
  edges.reduce((s, e) => s + e[key], 0);

function boundaryElevation(
  points: AnalyzedPoint[],
  edges: Edge[],
  edgeIndex: number,
  side: 'before' | 'after',
  c: AnalysisConfig,
): number {
  const edge = edges[edgeIndex];
  const anchorIndex = side === 'before' ? edge.from : edge.to;
  const anchor = points[anchorIndex];
  const values = [anchor.smoothedElevation!];
  const step = side === 'before' ? -1 : 1;
  let idx = edgeIndex + step;
  while (idx >= 0 && idx < edges.length && values.length < c.gapElevationSamples) {
    const neighbor = edges[idx];
    if (!neighbor.connected || neighbor.seconds == null) break;
    const pt = points[side === 'before' ? neighbor.from : neighbor.to];
    if (pt.time == null || Math.abs(pt.time - anchor.time!) / 1000 > c.gapElevationWindowSeconds)
      break;
    if (pt.smoothedElevation != null) values.push(pt.smoothedElevation);
    idx += step;
  }
  return median(values);
}

function skiDescent(points: AnalyzedPoint[], edges: Edge[], deadband: number): number {
  let start: number | null = null;
  let anchor: number | null = null;
  let end: number | null = null;
  let descent = 0;
  let total = 0;
  const finishStretch = () => {
    if (start != null && end != null) total += Math.max(descent, start - end);
    start = anchor = end = null;
    descent = 0;
  };
  for (const edge of edges) {
    if (edge.state !== 'downhill') {
      finishStretch();
      continue;
    }
    start ??= points[edge.from].smoothedElevation!;
    anchor ??= start;
    end = points[edge.to].smoothedElevation!;
    const drop = anchor - end;
    if (Math.abs(drop) >= deadband) {
      descent += Math.max(0, drop);
      anchor = end;
    }
  }
  finishStretch();
  return total;
}

export function analyzeTrack(track: GpxTrack, overrides: Partial<AnalysisConfig> = {}): Analysis {
  const c = { ...ANALYSIS_CONFIG, ...overrides };
  const times = track.points.flatMap((p) => (p.time == null ? [] : [p.time]));
  let earliest: number | null = null;
  let latest: number | null = null;
  for (const t of times) {
    earliest = earliest == null ? t : Math.min(earliest, t);
    latest = latest == null ? t : Math.max(latest, t);
  }
  const points: AnalyzedPoint[] = track.points.map((p, index) => ({
    ...p,
    index,
    smoothedElevation: p.elevation,
    elapsed: p.time == null || earliest == null ? null : (p.time - earliest) / 1000,
    accepted: true,
  }));
  const quality = {
    rejectedPoints: 0,
    gaps: 0,
    invalidTimes: 0,
    missingTimes: points.filter((p) => p.time == null).length,
    missingElevations: points.filter((p) => p.elevation == null).length,
    warnings: [...track.warnings],
  };

  // Drop redundant near-identical fixes that share the exact same timestamp without splitting blocks.
  let prevUnique: AnalyzedPoint | undefined;
  for (const p of points) {
    if (
      prevUnique &&
      p.segment === prevUnique.segment &&
      p.time != null &&
      prevUnique.time != null &&
      p.time === prevUnique.time &&
      haversine(prevUnique, p) <= c.duplicateDistance
    ) {
      // If only one fix has an altitude, retain that actual fix.
      if (prevUnique.elevation == null && p.elevation != null) {
        prevUnique.accepted = false;
        prevUnique = p;
      } else {
        p.accepted = false;
      }
      continue;
    }
    prevUnique = p;
  }

  const activePoints = points.filter((p) => p.accepted);
  const rawSpeeds = activePoints.map((p, i) => {
    const prev = activePoints[i - 1];
    if (
      !prev ||
      p.segment !== prev.segment ||
      p.time == null ||
      prev.time == null ||
      p.time <= prev.time
    )
      return null;
    const dt = (p.time - prev.time) / 1000;
    return dt <= c.maxGapSeconds ? haversine(prev, p) / dt : null;
  });

  // Remove an isolated excursion only when the direct bypass is plausible.
  for (let i = 1; i < activePoints.length - 1; i++) {
    const a = activePoints[i - 1],
      p = activePoints[i],
      b = activePoints[i + 1];
    if (
      !a.accepted ||
      a.segment !== p.segment ||
      b.segment !== p.segment ||
      a.time == null ||
      p.time == null ||
      b.time == null ||
      p.time <= a.time ||
      b.time <= p.time
    )
      continue;
    const before = rawSpeeds[i],
      after = rawSpeeds[i + 1];
    const neighbors = rawSpeeds
      .slice(Math.max(1, i - 4), i)
      .concat(rawSpeeds.slice(i + 2, i + 6))
      .filter((v): v is number => v != null);
    const local = neighbors.length ? median(neighbors) : c.maxSpeed;
    const threshold = Math.min(c.maxSpeed, Math.max(c.spikeFloor, local * c.spikeRatio));
    if (
      before != null &&
      after != null &&
      before > threshold &&
      after > threshold &&
      (b.time - a.time) / 1000 <= c.maxGapSeconds &&
      haversine(a, b) / ((b.time - a.time) / 1000) <= c.maxSpeed
    ) {
      p.accepted = false;
      quality.rejectedPoints++;
    }
  }

  const edges: Edge[] = [];
  let previous: AnalyzedPoint | undefined;
  let block = 0;
  for (const p of points) {
    if (!p.accepted) continue;
    if (!previous) {
      previous = p;
      continue;
    }
    const seconds =
      p.time != null && previous.time != null ? (p.time - previous.time) / 1000 : null;
    const d = haversine(previous, p);
    const speed = seconds != null && seconds > 0 ? d / seconds : null;
    const different = p.segment !== previous.segment;
    const invalid = seconds != null && seconds <= 0;
    const gap = seconds != null && seconds > c.maxGapSeconds;
    const jump = (speed != null && speed > c.maxSpeed) || (seconds == null && d > c.maxUntimedStep);
    const connected = !different && !invalid && !gap && !jump;
    if (!connected) block++;
    if (!different && invalid) quality.invalidTimes++;
    if (!different && (gap || jump)) quality.gaps++;
    edges.push({
      from: previous.index,
      to: p.index,
      block,
      distance: connected ? d : 0,
      seconds: !different && seconds != null && seconds > 0 ? seconds : null,
      speed: connected ? speed : null,
      state: 'unknown',
      ascent: 0,
      descent: 0,
      runId: null,
      liftId: null,
      connected,
    });
    previous = p;
  }

  // Smoothing stays inside a continuous geometric block and never fills missing elevation.
  const groups: Edge[][] = [];
  for (const e of edges) {
    if (!e.connected) continue;
    const last = groups[groups.length - 1];
    if (!last || last[0].block !== e.block) groups.push([e]);
    else last.push(e);
  }

  for (const group of groups) {
    const ids = [group[0].from, ...group.map((e) => e.to)];
    const elevations = ids.map((id) => points[id].elevation);
    let timedStart = 0;
    let wLeft = 0;
    let wRight = 0;
    for (let j = 0; j < ids.length; j++) {
      const p = points[ids[j]];
      if (p.time == null) {
        timedStart = j + 1;
        wLeft = timedStart;
      }
      if (elevations[j] == null || j === 0 || j === ids.length - 1) continue;
      let loIdx: number;
      let hiIdx: number;
      if (p.time != null) {
        while (
          wLeft < j &&
          (points[ids[wLeft]].time == null ||
            (p.time - (points[ids[wLeft]].time ?? p.time)) / 1000 > c.elevationSmoothWindowSeconds)
        )
          wLeft++;
        if (wRight < j) wRight = j;
        while (
          wRight + 1 < ids.length &&
          points[ids[wRight + 1]].time != null &&
          ((points[ids[wRight + 1]].time ?? p.time) - p.time) / 1000 <=
            c.elevationSmoothWindowSeconds
        )
          wRight++;
        loIdx = Math.min(wLeft, Math.max(timedStart, j - 1));
        hiIdx = points[ids[j + 1]].time == null ? j : Math.max(wRight, j + 1);
      } else {
        loIdx = Math.max(0, j - c.elevationMedianRadius);
        hiIdx = Math.min(ids.length - 1, j + c.elevationMedianRadius);
      }
      const span = hiIdx - loIdx + 1;
      const stride = Math.max(1, Math.ceil(span / c.maxWindowSamples));
      const window: number[] = [];
      for (let k = loIdx; k <= hiIdx; k += stride) {
        const el = elevations[k];
        if (el != null) window.push(el);
      }
      p.smoothedElevation = window.length ? median(window) : elevations[j];
    }

    // Pass 1: deadband elevation totals and stop classification.
    const isStopped = new Array<boolean>(group.length).fill(false);
    let anchor: number | null = points[ids[0]].smoothedElevation;
    for (let j = 0; j < group.length; j++) {
      const e = group[j],
        a = points[e.from],
        b = points[e.to];
      if (a.smoothedElevation == null || b.smoothedElevation == null) anchor = null;
      else {
        if (anchor == null) anchor = a.smoothedElevation;
        const delta = b.smoothedElevation - anchor;
        if (Math.abs(delta) >= c.elevationDeadband) {
          if (delta > 0) e.ascent = delta;
          else e.descent = -delta;
          anchor = b.smoothedElevation;
        }
      }
      if (e.speed != null && e.seconds != null && e.speed < c.stopSpeed) {
        e.state = 'stopped';
        isStopped[j] = true;
      }
    }

    // Pass 2: local linear-regression vertical rate (bounded by stops) with dual hysteresis.
    let lastMovingState: 'downhill' | 'uphill' | 'unknown' = 'unknown';
    let hysteresisSeconds = 0;
    let stoppedStreak = 0;
    let moveEnd = -1;
    let left = 0;
    let right = 0;
    for (let j = 0; j < group.length; j++) {
      const e = group[j],
        a = points[e.from],
        b = points[e.to];
      if (e.speed == null || e.seconds == null) {
        lastMovingState = 'unknown';
        hysteresisSeconds = 0;
        stoppedStreak = 0;
        continue;
      }
      if (isStopped[j]) {
        stoppedStreak += e.seconds;
        if (stoppedStreak > c.maxRunBreakSeconds) lastMovingState = 'unknown';
        continue;
      }
      const resumedFromStop = stoppedStreak > 0;
      const stoppedBeforeMove = stoppedStreak;
      stoppedStreak = 0;
      if (
        a.time == null ||
        b.time == null ||
        a.smoothedElevation == null ||
        b.smoothedElevation == null
      ) {
        lastMovingState = 'unknown';
        hysteresisSeconds = 0;
        continue;
      }
      if (j > moveEnd) {
        left = j;
        moveEnd = j;
        while (
          moveEnd + 1 < group.length &&
          !isStopped[moveEnd + 1] &&
          group[moveEnd + 1].speed != null
        )
          moveEnd++;
      }
      while (left < j && (a.time - points[group[left].from].time!) / 1000 > c.trendWindowSeconds)
        left++;
      right = Math.max(right, j);
      while (
        right < moveEnd &&
        points[group[right + 1].to].time != null &&
        ((points[group[right + 1].to].time ?? b.time) - b.time) / 1000 <= c.trendWindowSeconds
      )
        right++;

      let n = 0;
      let sumT = 0;
      let sumZ = 0;
      let sumT2 = 0;
      let sumTZ = 0;
      const t0 = a.time;
      const z0 = a.smoothedElevation;
      const stride = Math.max(1, Math.ceil((right - left + 2) / c.maxWindowSamples));
      const sample = (k: number) => {
        const pk = points[ids[k]];
        if (pk.time == null || pk.smoothedElevation == null) return;
        const dt = (pk.time - t0) / 1000;
        const dz = pk.smoothedElevation - z0;
        n++;
        sumT += dt;
        sumZ += dz;
        sumT2 += dt * dt;
        sumTZ += dt * dz;
      };
      for (let k = left; k <= right + 1; k += stride) sample(k);
      if ((j - left) % stride !== 0) sample(j);
      if ((j + 1 - left) % stride !== 0) sample(j + 1);
      const denom = n * sumT2 - sumT * sumT;
      const rate = n >= 2 && denom > 0 ? (n * sumTZ - sumT * sumZ) / denom : null;

      const canKeepUphill =
        lastMovingState === 'uphill' && stoppedBeforeMove <= c.liftBridgeStopSeconds;
      const canKeepDownhill =
        lastMovingState === 'downhill' && stoppedBeforeMove <= c.maxRunBreakSeconds;
      const uphillKeepRate = resumedFromStop ? 0 : -c.hysteresisRate;
      const downhillKeepRate = resumedFromStop ? 0 : c.hysteresisRate;

      if (rate != null && rate >= c.verticalRate) {
        e.state = 'uphill';
        hysteresisSeconds = 0;
      } else if (
        rate != null &&
        rate <= -c.verticalRate &&
        (e.speed >= c.downhillSpeed || (canKeepDownhill && e.speed >= c.downhillExitSpeed))
      ) {
        e.state = 'downhill';
        hysteresisSeconds = 0;
      } else if (rate != null && hysteresisSeconds + e.seconds <= c.maxHysteresisSeconds) {
        if (canKeepUphill && rate > uphillKeepRate) e.state = 'uphill';
        if (canKeepDownhill && e.speed >= c.downhillExitSpeed && rate < downhillKeepRate)
          e.state = 'downhill';
        hysteresisSeconds += e.seconds;
      }
      lastMovingState = e.state === 'downhill' || e.state === 'uphill' ? e.state : 'unknown';
    }
  }

  // Suppress brief direction reversals or elevation-valid unknown blips surrounded by the same state.
  const chunks: Edge[][] = [];
  for (const e of edges) {
    const last = chunks[chunks.length - 1];
    if (
      !last ||
      last[0].state !== e.state ||
      last[0].block !== e.block ||
      !e.connected ||
      !last[0].connected
    )
      chunks.push([e]);
    else last.push(e);
  }
  for (let i = 1; i < chunks.length - 1; i++) {
    const chunk = chunks[i],
      before = chunks[i - 1],
      after = chunks[i + 1];
    const target = before[0].state;
    const isEligibleState =
      chunk[0].state === 'uphill' ||
      chunk[0].state === 'downhill' ||
      (chunk[0].state === 'unknown' &&
        chunk.every(
          (e) =>
            e.seconds != null &&
            points[e.from].smoothedElevation != null &&
            points[e.to].smoothedElevation != null,
        ));
    const start = points[chunk[0].from].smoothedElevation;
    const end = points[chunk[chunk.length - 1].to].smoothedElevation;
    const significantReversal =
      start != null &&
      end != null &&
      (target === 'downhill' ? end - start > c.runBreakAscent : start - end >= c.minRunDescent);
    if (
      isEligibleState &&
      !significantReversal &&
      chunk.reduce((s, e) => s + (e.seconds ?? 0), 0) < c.transitionSeconds &&
      target === after[0].state &&
      before[0].block === after[0].block &&
      (target === 'downhill' || target === 'uphill')
    ) {
      chunk.forEach((e) => {
        e.state = target;
      });
    }
  }

  // Stage 1: Detect significant ascent rides (lifts), including optional gap-inferred gondola rides.
  interface RawLift {
    firstEdge: number;
    lastEdge: number;
    startElevation: number;
    endElevation: number;
    duration: number;
    elapsed: number;
    distance: number;
    ascent: number;
    inferredFromGap: boolean;
  }
  const rawLifts: RawLift[] = [];

  let liftStart = -1;
  let liftEnd = -1;
  let pendingLiftStop = 0;
  let pendingLiftUnknown = 0;
  const finishLift = () => {
    if (liftStart >= 0) {
      const firstEdge = liftStart;
      const lastEdge = liftEnd;
      const candidateEdges = edges.slice(firstEdge, lastEdge + 1);
      const uphillEdges = candidateEdges.filter((e) => e.state === 'uphill');
      const duration = uphillEdges.reduce((s, e) => s + (e.seconds ?? 0), 0);
      const elapsed = candidateEdges.reduce((s, e) => s + (e.seconds ?? 0), 0);
      const moving = candidateEdges.filter((e) => e.state !== 'stopped');
      const distance = sum(moving, 'distance');
      const movingSeconds = moving.reduce((s, e) => s + e.seconds!, 0);
      const startElevation = points[edges[firstEdge].from].smoothedElevation!;
      const endElevation = points[edges[lastEdge].to].smoothedElevation!;
      const netAscent = endElevation - startElevation;
      if (
        duration >= c.minLiftSeconds &&
        distance >= c.minLiftDistance &&
        netAscent >= c.minLiftAscent &&
        distance / movingSeconds <= c.maxLiftHorizontalSpeed &&
        netAscent / movingSeconds <= c.maxLiftVerticalRate
      ) {
        rawLifts.push({
          firstEdge,
          lastEdge,
          startElevation,
          endElevation,
          duration,
          elapsed,
          distance,
          ascent: netAscent,
          inferredFromGap: false,
        });
      }
    }
    liftStart = liftEnd = -1;
    pendingLiftStop = 0;
    pendingLiftUnknown = 0;
  };

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (
      !e.connected ||
      e.seconds == null ||
      points[e.from].smoothedElevation == null ||
      points[e.to].smoothedElevation == null
    ) {
      finishLift();
      continue;
    }
    if (e.state === 'uphill') {
      if (liftStart < 0) liftStart = i;
      liftEnd = i;
      pendingLiftStop = 0;
      pendingLiftUnknown = 0;
    } else if (e.state === 'stopped' && liftStart >= 0) {
      pendingLiftStop += e.seconds;
      if (pendingLiftStop > c.liftBridgeStopSeconds) finishLift();
    } else if (e.state === 'unknown' && liftStart >= 0) {
      pendingLiftUnknown += e.seconds;
      if (pendingLiftUnknown > c.liftBridgeUnknownSeconds) finishLift();
    } else {
      finishLift();
    }
  }
  finishLift();

  // Infer lift rides across GPS-dropout gaps (e.g. inside enclosed gondolas) without adding gap distance/speed to stats.
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (e.connected || e.seconds == null) continue;
    const a = points[e.from];
    const b = points[e.to];
    if (a.segment !== b.segment) continue;
    if (e.seconds <= c.maxGapSeconds || e.seconds > c.maxGapLiftSeconds) continue;
    if (a.smoothedElevation == null || b.smoothedElevation == null) continue;
    const aEle = boundaryElevation(points, edges, i, 'before', c);
    const bEle = boundaryElevation(points, edges, i, 'after', c);
    const netAscent = bEle - aEle;
    if (netAscent < c.minLiftAscent) continue;
    const straightDistance = haversine(a, b);
    const horizSpeed = straightDistance / e.seconds;
    const vertRate = netAscent / e.seconds;
    if (
      straightDistance >= c.minLiftDistance &&
      horizSpeed >= c.stopSpeed &&
      horizSpeed <= c.maxLiftHorizontalSpeed &&
      vertRate >= c.verticalRate &&
      vertRate <= c.maxLiftVerticalRate
    ) {
      rawLifts.push({
        firstEdge: i,
        lastEdge: i,
        startElevation: aEle,
        endElevation: bEle,
        duration: 0,
        elapsed: e.seconds,
        distance: 0,
        ascent: netAscent,
        inferredFromGap: true,
      });
    }
  }

  rawLifts.sort((a, b) => a.firstEdge - b.firstEdge);

  // Merge a gap-inferred lift with immediately adjacent connected lifts when there is no intervening downhill.
  const mergedLifts: RawLift[] = [];
  for (const lift of rawLifts) {
    const prev = mergedLifts[mergedLifts.length - 1];
    if (prev && (prev.inferredFromGap || lift.inferredFromGap)) {
      let betweenSeconds = 0;
      let betweenDistance = 0;
      let betweenUphillSeconds = 0;
      let peakElevation = points[edges[prev.lastEdge].to].smoothedElevation!;
      let merge = true;
      for (let i = prev.lastEdge + 1; i < lift.firstEdge; i++) {
        const edge = edges[i];
        const elevation = points[edge.to].smoothedElevation;
        if (
          !edge.connected ||
          edge.seconds == null ||
          edge.state === 'downhill' ||
          elevation == null
        ) {
          merge = false;
          break;
        }
        betweenSeconds += edge.seconds;
        if (edge.state !== 'stopped') betweenDistance += edge.distance;
        if (edge.state === 'uphill') betweenUphillSeconds += edge.seconds;
        peakElevation = Math.max(peakElevation, elevation);
        if (
          betweenSeconds > c.liftBridgeStopSeconds ||
          peakElevation - elevation >= c.minRunDescent
        ) {
          merge = false;
          break;
        }
      }
      const combinedAscent = lift.endElevation - prev.startElevation;
      if (merge && combinedAscent >= c.minLiftAscent) {
        prev.lastEdge = lift.lastEdge;
        prev.endElevation = lift.endElevation;
        prev.duration += betweenUphillSeconds + lift.duration;
        prev.distance += betweenDistance + lift.distance;
        prev.ascent = combinedAscent;
        prev.elapsed += betweenSeconds + lift.elapsed;
        prev.inferredFromGap = true;
        continue;
      }
    }
    mergedLifts.push(lift);
  }

  const lifts: LiftRide[] = mergedLifts.map((lift, index) => {
    const id = index + 1;
    for (let i = lift.firstEdge; i <= lift.lastEdge; i++) edges[i].liftId = id;
    const from = edges[lift.firstEdge].from;
    const to = edges[lift.lastEdge].to;
    return {
      id,
      from,
      to,
      start: points[from].time,
      end: points[to].time,
      duration: lift.duration,
      elapsed: lift.elapsed,
      distance: lift.distance,
      ascent: lift.ascent,
      inferredFromGap: lift.inferredFromGap,
    };
  });

  // Stage 2: Detect ski runs bounded by lifts, long breaks (>180s), significant climbs, or gaps.
  const candidates: Edge[][] = [];
  let active: Edge[] = [];
  let pending: Edge[] = [];
  let breakSeconds = 0;
  let breakMinElevation: number | null = null;
  const finishRun = () => {
    if (active.length) candidates.push(active);
    active = [];
    pending = [];
    breakSeconds = 0;
    breakMinElevation = null;
  };

  for (const e of edges) {
    if (!e.connected || e.seconds == null || e.liftId != null) {
      finishRun();
      continue;
    }
    if (e.state === 'downhill') {
      for (const edge of pending) active.push(edge);
      active.push(e);
      pending = [];
      breakSeconds = 0;
      breakMinElevation = null;
    } else if (active.length) {
      pending.push(e);
      breakSeconds += e.seconds;
      const start = points[e.from].smoothedElevation;
      const end = points[e.to].smoothedElevation;
      let climb = 0;
      if (start == null || end == null) breakMinElevation = null;
      else {
        breakMinElevation = Math.min(breakMinElevation ?? start, start, end);
        climb = end - breakMinElevation;
      }
      if (breakSeconds > c.maxRunBreakSeconds || climb > c.runBreakAscent) finishRun();
    }
  }
  finishRun();

  const runs: SkiRun[] = [];
  for (const candidate of candidates) {
    const skiing = candidate.filter((e) => e.state === 'downhill');
    const duration = skiing.reduce((s, e) => s + (e.seconds ?? 0), 0);
    const distance = sum(skiing, 'distance');
    const from = candidate[0].from;
    const to = candidate[candidate.length - 1].to;
    const descent = skiDescent(points, candidate, c.elevationDeadband);
    if (duration < c.minRunSeconds || distance < c.minRunDistance || descent < c.minRunDescent) {
      skiing.forEach((e) => {
        e.state = 'unknown';
      });
      continue;
    }
    const id = runs.length + 1;
    candidate.forEach((e) => {
      e.runId = id;
    });
    runs.push({
      id,
      from,
      to,
      start: points[from].time,
      end: points[to].time,
      duration,
      elapsed: candidate.reduce((s, e) => s + (e.seconds ?? 0), 0),
      distance,
      descent,
      averageSpeed: (distance / duration) * 3.6,
      maxSpeed: skiing.reduce((m, e) => Math.max(m, (e.speed ?? 0) * 3.6), 0),
    });
  }

  const skiDistance = runs.reduce((s, r) => s + r.distance, 0),
    skiSeconds = runs.reduce((s, r) => s + r.duration, 0);
  const elevations = points
    .filter((p) => p.accepted)
    .flatMap((p) => (p.smoothedElevation == null ? [] : [p.smoothedElevation]));
  let minElevation: number | null = null,
    maxElevation: number | null = null,
    maxSpeed: number | null = null;
  for (const el of elevations) {
    minElevation = minElevation == null ? el : Math.min(minElevation, el);
    maxElevation = maxElevation == null ? el : Math.max(maxElevation, el);
  }
  for (const e of edges) {
    if (e.speed != null) maxSpeed = Math.max(maxSpeed ?? 0, e.speed * 3.6);
  }
  const hasElevationPairs = edges.some(
    (e) =>
      e.connected &&
      points[e.from].smoothedElevation != null &&
      points[e.to].smoothedElevation != null,
  );
  const secondsFor = (state: SkiState) =>
    edges.filter((e) => e.state === state).reduce((s, e) => s + (e.seconds ?? 0), 0);

  return {
    track,
    points,
    edges,
    runs,
    lifts,
    quality,
    stats: {
      distance: sum(edges, 'distance'),
      skiDistance,
      skiSeconds,
      uphillSeconds: secondsFor('uphill'),
      stoppedSeconds: secondsFor('stopped'),
      unknownSeconds: secondsFor('unknown'),
      liftCount: lifts.length,
      ascent: hasElevationPairs ? sum(edges, 'ascent') : null,
      descent: hasElevationPairs ? sum(edges, 'descent') : null,
      maxSpeed,
      averageSkiSpeed: skiSeconds > 0 ? (skiDistance / skiSeconds) * 3.6 : null,
      minElevation,
      maxElevation,
      start: earliest,
      end: latest,
    },
  };
}
