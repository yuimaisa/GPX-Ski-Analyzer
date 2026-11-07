import type {
  Analysis,
  AnalyzedPoint,
  Edge,
  GpxTrack,
  SkiRun,
  SkiState,
} from '../../types/analysis';
import { haversine } from '../geo/haversine';
import { ANALYSIS_CONFIG, type AnalysisConfig } from './config';
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const sum = (edges: Edge[], key: 'distance' | 'ascent' | 'descent') =>
  edges.reduce((s, e) => s + e[key], 0);

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
  const rawSpeeds = points.map((p, i) => {
    const prev = points[i - 1];
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
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      p = points[i],
      b = points[i + 1];
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
    for (let j = 0; j < ids.length; j++) {
      const p = points[ids[j]];
      if (p.elevation == null) continue;
      // Preserve ends; reject altitude spikes with a median within known neighboring values.
      const window = ids
        .slice(Math.max(0, j - c.elevationMedianRadius), j + c.elevationMedianRadius + 1)
        .map((id) => points[id].elevation)
        .filter((v): v is number => v != null);
      p.smoothedElevation = j === 0 || j === ids.length - 1 ? p.elevation : median(window);
    }
    let anchor: number | null = points[ids[0]].smoothedElevation;
    let prevState: SkiState = 'unknown';
    let left = 0,
      right = 0;
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
      if (e.speed == null || e.seconds == null) {
        prevState = 'unknown';
        continue;
      }
      if (e.speed < c.stopSpeed) {
        e.state = 'stopped';
        prevState = e.state;
        continue;
      }
      if (
        a.time == null ||
        b.time == null ||
        a.smoothedElevation == null ||
        b.smoothedElevation == null
      ) {
        prevState = 'unknown';
        continue;
      }
      while (
        left < j &&
        (a.time - (points[group[left].from].time ?? a.time)) / 1000 > c.trendWindowSeconds
      )
        left++;
      if (right < j) right = j;
      while (
        right + 1 < group.length &&
        points[group[right + 1].to].time != null &&
        ((points[group[right + 1].to].time ?? b.time) - b.time) / 1000 <= c.trendWindowSeconds
      )
        right++;
      const lo = points[group[left].from],
        hi = points[group[right].to];
      // Missing or nonmonotonic time inside a trend window cannot support a slope estimate.
      const dt = lo.time != null && hi.time != null ? (hi.time - lo.time) / 1000 : 0;
      const rate =
        dt > 0 && lo.smoothedElevation != null && hi.smoothedElevation != null
          ? (hi.smoothedElevation - lo.smoothedElevation) / dt
          : null;
      if (rate != null && rate >= c.verticalRate) e.state = 'uphill';
      else if (
        rate != null &&
        ((e.speed >= c.downhillSpeed && rate <= -c.verticalRate) ||
          (prevState === 'downhill' && e.speed >= c.downhillExitSpeed && rate < 0.02))
      )
        e.state = 'downhill';
      prevState = e.state;
    }
  }
  // A brief direction reversal surrounded by the same state is likely altitude noise.
  const chunks: Edge[][] = [];
  for (const e of edges) {
    const last = chunks[chunks.length - 1];
    if (!last || last[0].state !== e.state || last[0].block !== e.block || !e.connected)
      chunks.push([e]);
    else last.push(e);
  }
  for (let i = 1; i < chunks.length - 1; i++) {
    const chunk = chunks[i],
      before = chunks[i - 1],
      after = chunks[i + 1];
    if (
      (chunk[0].state === 'uphill' || chunk[0].state === 'downhill') &&
      chunk.reduce((s, e) => s + (e.seconds ?? 0), 0) < c.transitionSeconds &&
      before[0].state === after[0].state &&
      before[0].block === after[0].block &&
      before[0].state !== 'unknown'
    )
      chunk.forEach((e) => {
        e.state = before[0].state;
      });
  }
  const candidates: Edge[][] = [];
  let active: Edge[] = [];
  let pause: Edge[] = [];
  const finish = () => {
    if (active.length) candidates.push(active);
    active = [];
    pause = [];
  };
  for (const e of edges) {
    if (!e.connected || (active.length && e.block !== active[0].block)) {
      finish();
    }
    if (e.state === 'downhill') {
      if (pause.reduce((s, p) => s + (p.seconds ?? 0), 0) > c.bridgeStopSeconds) finish();
      active.push(...pause, e);
      pause = [];
    } else if (e.state === 'stopped' && active.length) pause.push(e);
    else finish();
  }
  finish();
  const runs: SkiRun[] = [];
  for (const candidate of candidates) {
    const skiing = candidate.filter((e) => e.state === 'downhill');
    const duration = skiing.reduce((s, e) => s + (e.seconds ?? 0), 0),
      distance = sum(skiing, 'distance'),
      descent = sum(skiing, 'descent');
    if (duration < c.minRunSeconds || distance < c.minRunDistance || descent < c.minRunDescent) {
      skiing.forEach((e) => {
        e.state = 'unknown';
      });
      continue;
    }
    const id = runs.length + 1,
      from = candidate[0].from,
      to = candidate[candidate.length - 1].to;
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
    quality,
    stats: {
      distance: sum(edges, 'distance'),
      skiDistance,
      skiSeconds,
      uphillSeconds: secondsFor('uphill'),
      stoppedSeconds: secondsFor('stopped'),
      unknownSeconds: secondsFor('unknown'),
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
