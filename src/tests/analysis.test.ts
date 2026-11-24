import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGpx } from '../lib/gpx/parse';
import { analyzeTrack } from '../lib/analysis/analyze';
import { haversine } from '../lib/geo/haversine';
import { createChartRows } from '../components/TimeCharts';
import type { GpxPoint, GpxTrack } from '../types/analysis';
const epoch = Date.parse('2026-02-14T00:00:00Z');
function track(points: GpxPoint[]): GpxTrack {
  return { name: '合成テスト', points, trackCount: 1, segmentCount: 1, warnings: [] };
}
function slope(n = 61, dt = 5, dz = -3, step = 0.0003): GpxPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    lat: 36 + i * step,
    lon: 138,
    elevation: 1800 + i * dz,
    time: epoch + i * dt * 1000,
    segment: 1,
  }));
}
function withStop(stopSeconds: number, dt = 5): GpxPoint[] {
  const base = slope(121, dt);
  const pause = base[60];
  const steps = Math.round(stopSeconds / dt);
  return [
    ...base.slice(0, 61),
    ...Array.from({ length: steps }, (_, i) => ({
      ...pause,
      time: pause.time! + (i + 1) * dt * 1000,
    })),
    ...base.slice(61).map((v) => ({ ...v, time: v.time! + stopSeconds * 1000 })),
  ];
}
function repeated(): GpxPoint[] {
  const p = slope();
  for (let i = 1; i <= 60; i++)
    p.push({
      lat: 36 + (60 - i) * 0.0003,
      lon: 138,
      elevation: 1620 + i * 3,
      time: epoch + (60 + i) * 5000,
      segment: 1,
    });
  for (let i = 1; i <= 60; i++)
    p.push({
      lat: 36 + i * 0.0003,
      lon: 138,
      elevation: 1800 - i * 3,
      time: epoch + (120 + i) * 5000,
      segment: 1,
    });
  return p;
}
describe('GPX parser', () => {
  it('parses the real synthetic sample with 4 reproducible runs and 3 lifts', () => {
    const t = parseGpx(readFileSync('public/samples/hakuba-synthetic.gpx', 'utf8'));
    const a = analyzeTrack(t);
    expect(a.runs).toHaveLength(4);
    expect(a.lifts).toHaveLength(3);
    expect(a.stats.liftCount).toBe(3);
    expect(a.lifts.every((l) => !l.inferredFromGap)).toBe(true);
    expect(a.stats.skiDistance).toBeGreaterThan(15000);
    expect(a.stats.skiDistance).toBeLessThan(17000);
    expect(a.stats.maxSpeed).toBeLessThan(162);
    expect(a).toEqual(analyzeTrack(t));
  });
  it('reads namespaces, multiple tracks and segments without bridging', () => {
    const a = analyzeTrack(
      parseGpx(
        '<gpx:gpx xmlns:gpx="http://www.topografix.com/GPX/1/1"><gpx:trk><gpx:trkseg><gpx:trkpt lat="36" lon="138"/><gpx:trkpt lat="36.001" lon="138"/></gpx:trkseg><gpx:trkseg><gpx:trkpt lat="40" lon="140"/></gpx:trkseg></gpx:trk><gpx:trk><gpx:trkseg><gpx:trkpt lat="50" lon="150"/></gpx:trkseg></gpx:trk></gpx:gpx>',
      ),
    );
    expect(a.track.trackCount).toBe(2);
    expect(a.track.segmentCount).toBe(3);
    expect(a.stats.distance).toBeCloseTo(111.195, 1);
  });
  it.each(['hello', '<gpx>', '<foo/>', '<gpx/>', '<!DOCTYPE gpx><gpx/>'])(
    'rejects malformed/empty/unsafe input %s',
    (xml) => {
      expect(() => parseGpx(xml)).toThrow();
    },
  );
  it('does not connect across invalid coordinates', () => {
    const a = analyzeTrack(
      parseGpx(
        '<gpx><trk><trkseg><trkpt lat="36" lon="138"/><trkpt lat="91" lon="138"/><trkpt lat="36.1" lon="138"/></trkseg></trk></gpx>',
      ),
    );
    expect(a.stats.distance).toBe(0);
    expect(a.quality.warnings).toHaveLength(1);
  });
  it('rejects invalid numeric strings and timezone-less timestamps', () => {
    const t = parseGpx(
      '<gpx><trk><trkseg><trkpt lat="36" lon="138"><ele>1800abc</ele><time>2026-01-01T09:00:00</time></trkpt><trkpt lat="36.1" lon="138"/></trkseg></trk></gpx>',
    );
    expect(t.points[0].elevation).toBeNull();
    expect(t.points[0].time).toBeNull();
  });
});
describe('analysis engine', () => {
  it('uses Haversine metres', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111195.08, 1);
  });
  it('computes a 300s, 180m descent and one run', () => {
    const a = analyzeTrack(track(slope()));
    expect(a.runs).toHaveLength(1);
    expect(a.lifts).toHaveLength(0);
    expect(a.stats.skiSeconds).toBe(300);
    expect(a.stats.descent).toBeCloseTo(180, 0);
    expect(a.stats.skiDistance).toBeCloseTo(2001.51, 0);
    expect(a.stats.averageSkiSpeed).toBeCloseTo(24.018, 1);
  });
  it('missing timestamps preserve geometry but never invent speed or duration', () => {
    const a = analyzeTrack(track(slope().map((p) => ({ ...p, time: null }))));
    expect(a.stats.distance).toBeGreaterThan(2000);
    expect(a.stats.maxSpeed).toBeNull();
    expect(a.stats.skiSeconds).toBe(0);
    expect(a.runs).toHaveLength(0);
    expect(a.lifts).toHaveLength(0);
  });
  it('missing altitude preserves validated speed, marks motion unknown', () => {
    const a = analyzeTrack(track(slope().map((p) => ({ ...p, elevation: null }))));
    expect(a.stats.descent).toBeNull();
    expect(a.stats.maxSpeed).toBeGreaterThan(20);
    expect(a.runs).toHaveLength(0);
    expect(a.lifts).toHaveLength(0);
    expect(a.edges.every((e) => e.state === 'unknown')).toBe(true);
  });
  it('does not infer a descent across a missing altitude interval', () => {
    const p = slope();
    p[30].elevation = null;
    const a = analyzeTrack(track(p));
    expect(a.points[30].smoothedElevation).toBeNull();
    expect(a.edges.find((e) => e.to === 30)?.state).toBe('unknown');
  });
  it('splits at missing timestamps without converting untimed distance into skiing', () => {
    const p = slope(121);
    p[60].time = null;
    const a = analyzeTrack(track(p));
    const untimed = a.edges.filter((e) => e.seconds == null);
    expect(untimed).toHaveLength(2);
    expect(untimed.every((e) => e.connected && e.state === 'unknown' && e.runId == null)).toBe(
      true,
    );
    expect(a.runs).toHaveLength(2);
    expect(a.stats.skiSeconds).toBe(590);
    expect(a.stats.skiDistance).toBeCloseTo(
      a.stats.distance - untimed[0].distance - untimed[1].distance,
    );
  });
  it('splits on displaced duplicate or reversed times without infinite speed', () => {
    const p = slope();
    p[30].time = p[29].time;
    p[40].time = epoch;
    const a = analyzeTrack(track(p));
    expect(a.quality.invalidTimes).toBe(2);
    expect(a.edges.filter((e) => !e.connected).length).toBeGreaterThanOrEqual(2);
    expect(a.stats.maxSpeed).toBeLessThan(162);
  });
  it('drops same-position duplicate timestamps without splitting a run', () => {
    const base = slope();
    const p = [...base.slice(0, 31), { ...base[30] }, ...base.slice(31)];
    const a = analyzeTrack(track(p));
    expect(a.quality.invalidTimes).toBe(0);
    expect(a.runs).toHaveLength(1);
    expect(a.stats.skiSeconds).toBe(300);
    expect(a.stats.maxSpeed).toBeLessThan(30);
  });
  it('keeps the measured elevation when only a duplicate fix has it', () => {
    const base = slope();
    const missing = { ...base[30], elevation: null };
    const a = analyzeTrack(track([...base.slice(0, 30), missing, ...base.slice(30)]));
    expect(a.points[30].accepted).toBe(false);
    expect(a.points[31].accepted).toBe(true);
    expect(a.stats.skiSeconds).toBe(300);
  });
  it('uses actual irregular intervals rather than a fixed sampling rate', () => {
    const p = slope();
    let t = epoch;
    for (let i = 1; i < p.length; i++) {
      t += (i % 2 ? 3 : 7) * 1000;
      p[i].time = t;
    }
    const a = analyzeTrack(track(p));
    expect(a.stats.skiSeconds).toBe(300);
    expect(a.stats.averageSkiSpeed).toBeCloseTo(24.018, 1);
    expect(a.stats.maxSpeed).toBeCloseTo(40.03, 1);
  });
  it('removes an isolated GPS jump without raising maximum speed', () => {
    const p = slope();
    p[30].lat += 2;
    const a = analyzeTrack(track(p));
    expect(a.quality.rejectedPoints).toBe(1);
    expect(a.stats.distance).toBeCloseTo(2001.51, 0);
    expect(a.stats.maxSpeed).toBeLessThan(25);
  });
  it('rejects a relative speed excursion below the absolute ceiling', () => {
    const p = slope();
    p[30].lon += 0.002;
    const a = analyzeTrack(track(p));
    expect(a.quality.rejectedPoints).toBe(1);
    expect(a.stats.maxSpeed).toBeLessThan(25);
  });
  it('never bridges large gaps or segment boundaries', () => {
    const p = slope();
    for (let i = 30; i < p.length; i++) p[i].time! += 600000;
    const a = analyzeTrack(track(p));
    expect(a.quality.gaps).toBe(1);
    expect(a.edges[29].connected).toBe(false);
    expect(a.stats.unknownSeconds).toBeGreaterThanOrEqual(605);
    const b = analyzeTrack(track(slope().map((v, i) => ({ ...v, segment: i < 30 ? 1 : 2 }))));
    expect(b.edges[29].connected).toBe(false);
  });
  it('keeps a short stop within one run while counting stopped time separately', () => {
    const base = slope();
    const pause = base[30];
    const p = [
      ...base.slice(0, 31),
      ...Array.from({ length: 3 }, (_, i) => ({ ...pause, time: pause.time! + (i + 1) * 5000 })),
      ...base.slice(31).map((v) => ({ ...v, time: v.time! + 15000 })),
    ];
    const a = analyzeTrack(track(p));
    expect(a.runs).toHaveLength(1);
    expect(a.stats.stoppedSeconds).toBe(15);
    expect(a.runs[0].duration).toBe(300);
    expect(a.runs[0].elapsed).toBe(315);
  });
  it('keeps a stop up to 180s inclusive within one run and splits stops over 180s', () => {
    const atBoundary = analyzeTrack(track(withStop(180)));
    expect(atBoundary.runs).toHaveLength(1);
    expect(atBoundary.stats.stoppedSeconds).toBe(180);
    expect(atBoundary.runs[0].duration).toBe(600);
    expect(atBoundary.runs[0].elapsed).toBe(780);

    const overBoundary = analyzeTrack(track(withStop(185)));
    expect(overBoundary.runs).toHaveLength(2);
    expect(overBoundary.stats.stoppedSeconds).toBe(185);
    expect(overBoundary.stats.skiSeconds).toBe(600);

    const longRest = analyzeTrack(track(withStop(240)));
    expect(longRest.runs).toHaveLength(2);
    expect(longRest.stats.stoppedSeconds).toBe(240);
  });
  it('keeps a flat traverse and slow post-stop restart within one run', () => {
    const p: GpxPoint[] = [];
    let lat = 36;
    let ele = 1800;
    let t = epoch;
    const push = (dLat: number, dEle: number, dt = 5) => {
      lat += dLat;
      ele += dEle;
      t += dt * 1000;
      p.push({ lat, lon: 138, elevation: ele, time: t, segment: 1 });
    };
    p.push({ lat, lon: 138, elevation: ele, time: t, segment: 1 });
    for (let i = 0; i < 15; i++) push(0.0003, -4); // 75s downhill
    for (let i = 0; i < 12; i++) push(0, 0); // 60s mid-run stop
    for (let i = 0; i < 4; i++) push(0.00005, -0.5); // 20s slow restart (~1.1 m/s)
    for (let i = 0; i < 6; i++) push(0.0002, 0); // 30s flat cat-track (unknown)
    for (let i = 0; i < 15; i++) push(0.0003, -4); // 75s downhill
    const a = analyzeTrack(track(p));
    expect(a.runs).toHaveLength(1);
    expect(a.lifts).toHaveLength(0);
    expect(a.stats.stoppedSeconds).toBe(60);
  });
  it('ends a run on a long flat traverse even if skiing speed stays constant', () => {
    const p = slope(73);
    for (let i = 1; i < p.length; i++) {
      p[i].elevation = p[i - 1].elevation! - (i > 12 && i <= 60 ? 0 : 3);
    }
    const a = analyzeTrack(track(p));
    expect(a.runs).toHaveLength(2);
    expect(a.stats.unknownSeconds).toBeGreaterThan(180);
    expect(a.stats.skiSeconds).toBeLessThan(160);
  });
  it('maintains a slow traverse with sustained downhill evidence', () => {
    const p = slope(41);
    for (let i = 13; i < p.length; i++) p[i].lat = p[i - 1].lat + 0.00005;
    const a = analyzeTrack(track(p));
    expect(a.runs).toHaveLength(1);
    expect(a.stats.skiSeconds).toBe(200);
  });
  it('does not credit altitude lost during a stop to either skiing stretch', () => {
    const p = withStop(10);
    p[61].elevation! -= 5;
    for (const pt of p.slice(62)) pt.elevation! -= 10;
    const a = analyzeTrack(track(p));
    expect(a.runs).toHaveLength(1);
    expect(a.runs[0].descent).toBeCloseTo(360);
    expect(a.stats.descent).toBeCloseTo(370, -1);
  });
  it('counts repeated downhill/uphill as 2 runs and 1 lift with consistent totals', () => {
    const a = analyzeTrack(track(repeated()));
    expect(a.runs).toHaveLength(2);
    expect(a.lifts).toHaveLength(1);
    expect(a.stats.liftCount).toBe(1);
    expect(a.stats.uphillSeconds).toBeGreaterThan(250);
    expect(a.runs.reduce((s, r) => s + r.distance, 0)).toBe(a.stats.skiDistance);
    expect(a.runs.reduce((s, r) => s + r.duration, 0)).toBe(a.stats.skiSeconds);
    expect(a.stats.averageSkiSpeed).toBeCloseTo(
      (a.stats.skiDistance / a.stats.skiSeconds) * 3.6,
      8,
    );
  });
  it('detects 25 runs and 24 lifts on a noisy 1Hz track with pauses and halts', () => {
    const p: GpxPoint[] = [];
    let lat = 36.7;
    let ele = 1700;
    let t = epoch;
    let tick = 0;
    const noise = (k: number) => Math.sin(k * 0.7) * 2.5 + Math.cos(k * 1.9) * 1.2;
    const push = (dLat: number, dEle: number, dt = 1, noisy = true) => {
      lat += dLat;
      ele += dEle;
      t += dt * 1000;
      tick++;
      p.push({
        lat,
        lon: 137.8,
        elevation: ele + (noisy ? noise(tick) : 0),
        time: t,
        segment: 1,
      });
    };
    p.push({ lat, lon: 137.8, elevation: ele, time: t, segment: 1 });
    for (let lap = 0; lap < 25; lap++) {
      // 40s run (~440m, ~80m drop) with occasional 35s mid-run pause or 0m duplicate fix
      for (let s = 0; s < 20; s++) push(0.0001, -2.0);
      if (lap % 5 === 1) {
        p.push({ ...p[p.length - 1] }); // duplicate timestamp at same position
      }
      if (lap % 4 === 2) {
        for (let s = 0; s < 35; s++) push(0, 0, 1, false);
      }
      for (let s = 0; s < 20; s++) push(0.0001, -2.0);
      // 20s lift queue stop
      for (let s = 0; s < 20; s++) push(0, 0, 1, false);
      if (lap < 24) {
        // 80s lift ride (+80m) with occasional 30s lift halt and 15s flat tower span
        for (let s = 0; s < 40; s++) push(-0.00005, 1.0);
        if (lap % 3 === 0) {
          for (let s = 0; s < 30; s++) push(0, 0, 1, false);
        } else if (lap % 3 === 1) {
          for (let s = 0; s < 15; s++) push(-0.00004, 0, 1, false);
        }
        for (let s = 0; s < 40; s++) push(-0.00005, 1.0);
        // 15s summit stop
        for (let s = 0; s < 15; s++) push(0, 0, 1, false);
      }
    }
    const a = analyzeTrack(track(p));
    expect(a.runs).toHaveLength(25);
    expect(a.lifts).toHaveLength(24);
    expect(a.stats.liftCount).toBe(24);
    expect(a.lifts.every((l) => !l.inferredFromGap)).toBe(true);
  });
  it('captures a fast short 25s downhill run without dropping it', () => {
    const p = slope(6, 5, -12, 0.0006); // 25s, ~333m, 60m descent
    const a = analyzeTrack(track(p));
    expect(a.runs).toHaveLength(1);
    expect(a.runs[0].duration).toBe(25);
    expect(a.runs[0].descent).toBeCloseTo(60, 0);
  });
  it('ignores short non-lift climbs and splits runs only on climbs over 20m', () => {
    const buildWithClimb = (climbSteps: number, dzPerStep: number) => {
      const p: GpxPoint[] = [];
      let lat = 36,
        ele = 1800,
        t = epoch;
      p.push({ lat, lon: 138, elevation: ele, time: t, segment: 1 });
      for (let i = 0; i < 12; i++) {
        lat += 0.0003;
        ele -= 4;
        t += 5000;
        p.push({ lat, lon: 138, elevation: ele, time: t, segment: 1 });
      }
      for (let i = 0; i < climbSteps; i++) {
        lat -= 0.00008;
        ele += dzPerStep;
        t += 5000;
        p.push({ lat, lon: 138, elevation: ele, time: t, segment: 1 });
      }
      for (let i = 0; i < 12; i++) {
        lat += 0.0003;
        ele -= 4;
        t += 5000;
        p.push({ lat, lon: 138, elevation: ele, time: t, segment: 1 });
      }
      return analyzeTrack(track(p));
    };
    const smallSkate = buildWithClimb(4, 2.5); // 20s, +10m
    expect(smallSkate.lifts).toHaveLength(0);
    expect(smallSkate.runs).toHaveLength(1);

    const hikeSplit = buildWithClimb(7, 5); // 35s (<40s minLiftSeconds), +35m (>20m smoothed runBreakAscent)
    expect(hikeSplit.lifts).toHaveLength(0);
    expect(hikeSplit.runs).toHaveLength(2);
  });
  it('infers a lift across a GPS gap without adding gap distance or speed to stats', () => {
    const run1 = slope(21, 5, -5, 0.0003); // 100s, 1800 -> 1700m, lat 36 -> 36.006
    const run1End = run1[run1.length - 1];
    // 200s GPS dropout inside a gondola: returns to lat 36, ele 1900 (+200m, ~667m horizontal = 3.33 m/s, 1.0 m/s vertical)
    const gapEndTime = run1End.time! + 200_000;
    const run2 = Array.from({ length: 21 }, (_, i) => ({
      lat: 36 + i * 0.0003,
      lon: 138,
      elevation: 1900 - i * 5,
      time: gapEndTime + i * 5000,
      segment: 1,
    }));
    const a = analyzeTrack(track([...run1, ...run2]));
    expect(a.runs).toHaveLength(2);
    expect(a.lifts).toHaveLength(1);
    expect(a.lifts[0].inferredFromGap).toBe(true);
    expect(a.lifts[0].distance).toBe(0);
    expect(a.lifts[0].duration).toBe(0);
    expect(a.lifts[0].ascent).toBeGreaterThanOrEqual(185);
    expect(a.lifts[0].ascent).toBeLessThanOrEqual(205);
    // Gap edge must stay disconnected and contribute 0 to measured distance/ascent/speed stats
    const gapEdge = a.edges.find((e) => !e.connected);
    expect(gapEdge?.liftId).toBe(1);
    expect(gapEdge?.distance).toBe(0);
    expect(gapEdge?.speed).toBeNull();
    expect(a.stats.distance).toBeCloseTo(a.stats.skiDistance, 1);
    expect(a.stats.ascent).toBe(0);
  });
  it('merges a GPS gap lift with adjacent connected lift segments to avoid double counting', () => {
    const p: GpxPoint[] = [];
    let lat = 36,
      ele = 1400,
      t = epoch;
    p.push({ lat, lon: 138, elevation: ele, time: t, segment: 1 });
    for (let i = 0; i < 12; i++) {
      lat += 0.00015;
      ele += 5;
      t += 5000;
      p.push({ lat, lon: 138, elevation: ele, time: t, segment: 1 });
    } // 60s connected uphill (+60m)
    lat += 0.005;
    ele += 180;
    t += 180_000;
    p.push({ lat, lon: 138, elevation: ele, time: t, segment: 1 }); // 180s gap (+180m)
    for (let i = 0; i < 12; i++) {
      lat += 0.00015;
      ele += 5;
      t += 5000;
      p.push({ lat, lon: 138, elevation: ele, time: t, segment: 1 });
    } // 60s connected uphill (+60m)
    const a = analyzeTrack(track(p));
    expect(a.lifts).toHaveLength(1);
    expect(a.lifts[0].inferredFromGap).toBe(true);
    expect(a.lifts[0].ascent).toBeCloseTo(300, 0);
  });
  it('keeps inferred and measured lifts separate across a segment or clock reset', () => {
    const first = slope(2, 200, 180, 0.006);
    const second = slope(13, 5, 5, 0.00015);
    for (const resetSegment of [true, false]) {
      const p = [...first, ...second.map((pt) => ({ ...pt, segment: resetSegment ? 2 : 1 }))];
      const a = analyzeTrack(track(p));
      expect(a.lifts.map((lift) => lift.inferredFromGap)).toEqual([true, false]);
      expect(a.lifts.map((lift) => lift.elapsed)).toEqual([200, 60]);
      expect(a.edges[1]).toMatchObject({ connected: false, liftId: null });
    }
  });
  it('applies the exact GPS gap time limits and requires both endpoint elevations', () => {
    for (const [ms, connected, inferred] of [
      [120_000, true, false],
      [120_001, false, true],
      [1_200_000, false, true],
      [1_200_001, false, false],
    ] as const) {
      const p = slope(2, ms / 1000, 120, 0.01);
      const a = analyzeTrack(track(p));
      expect(a.edges[0].connected).toBe(connected);
      expect(a.lifts.some((lift) => lift.inferredFromGap)).toBe(inferred);
    }
    const p = slope(3, 5, 0, 0.001);
    p[1].time! += 200_000;
    p[2].time! += 200_000;
    p[1].elevation = null;
    p[2].elevation! += 120;
    expect(analyzeTrack(track(p)).lifts).toHaveLength(0);
  });
  it('does not let a stop dilute the average speed of a fast uphill vehicle', () => {
    const p = withStop(60).map((pt, i, rows) => ({
      ...pt,
      lat: 36 + (pt.lat - 36) * 2.4,
      elevation: 3600 - rows[i].elevation!,
    }));
    expect(analyzeTrack(track(p)).lifts).toHaveLength(0);
  });
  it('rejects a measured ascent with an implausible average vertical rate', () => {
    const a = analyzeTrack(track(slope(13, 5, 40, 0.0003)));
    expect(a.stats.uphillSeconds).toBe(60);
    expect(a.lifts).toHaveLength(0);
  });
  it('rejects false-positive gap lifts from drift, jumps, vehicles, or segments', () => {
    // 1. Stationary lodge barometric/GPS drift (+40m over 300s, 0m moved)
    const stationaryDrift = analyzeTrack(
      track([
        { lat: 36, lon: 138, elevation: 1400, time: epoch, segment: 1 },
        { lat: 36, lon: 138, elevation: 1440, time: epoch + 300_000, segment: 1 },
      ]),
    );
    expect(stationaryDrift.lifts).toHaveLength(0);

    // 2. Impossible altitude jump (+900m in 150s = 6 m/s > 5 m/s)
    const altitudeGlitch = analyzeTrack(
      track([
        { lat: 36, lon: 138, elevation: 1000, time: epoch, segment: 1 },
        { lat: 36.005, lon: 138, elevation: 1900, time: epoch + 150_000, segment: 1 },
      ]),
    );
    expect(altitudeGlitch.lifts).toHaveLength(0);

    // 3. Fast car drive uphill (4000m in 200s = 20 m/s > 15 m/s)
    const fastVehicle = analyzeTrack(
      track([
        { lat: 36, lon: 138, elevation: 1000, time: epoch, segment: 1 },
        { lat: 36.036, lon: 138, elevation: 1200, time: epoch + 200_000, segment: 1 },
      ]),
    );
    expect(fastVehicle.lifts).toHaveLength(0);

    // 4. Different trkseg boundary
    const diffSegment = analyzeTrack(
      track([
        { lat: 36, lon: 138, elevation: 1000, time: epoch, segment: 1 },
        { lat: 36.006, lon: 138, elevation: 1200, time: epoch + 200_000, segment: 2 },
      ]),
    );
    expect(diffSegment.lifts).toHaveLength(0);

    // 5. Single-point elevation spike immediately after a gap
    const endpointSpike = analyzeTrack(
      track([
        { lat: 36, lon: 138, elevation: 1400, time: epoch, segment: 1 },
        { lat: 36.006, lon: 138, elevation: 1600, time: epoch + 200_000, segment: 1 },
        { lat: 36.0061, lon: 138, elevation: 1400, time: epoch + 205_000, segment: 1 },
        { lat: 36.0062, lon: 138, elevation: 1400, time: epoch + 210_000, segment: 1 },
      ]),
    );
    expect(endpointSpike.lifts).toHaveLength(0);
  });
  it('breaks solid chart series on GPS gaps while keeping auxiliary line endpoints', () => {
    const p = slope(21, 5, -5, 0.0003);
    for (let i = 10; i < p.length; i++) p[i].time! += 300_000;
    const a = analyzeTrack(track(p));
    const rows = createChartRows(a);
    const gapRow = rows.find((r) => r.time == null);
    expect(gapRow).toBeDefined();
    expect(gapRow?.elevation).toBeNull();
    expect(gapRow?.elevation_downhill).toBeNull();
    expect(gapRow?.elevation_gap).toEqual(expect.any(Number));
    expect(gapRow?.speed_downhill).toBeNull();
    expect(rows.filter((r) => r.elevation != null).length).toBeGreaterThanOrEqual(2);
  });
  it('breaks chart traces at skipped times and restarts at the first visible fix', () => {
    const p = slope(61);
    p[15].time = null;
    p[30].time = p[29].time;
    const a = analyzeTrack(track(p));
    const rows = createChartRows(a);
    for (const to of [16, 31]) {
      const idx = rows.findIndex((row) => row.index === to && row.time != null);
      expect(rows[idx - 1]).toMatchObject({
        time: null,
        elevation_gap: null,
        speed_downhill: null,
      });
      expect(rows[idx].elevation_downhill).toEqual(expect.any(Number));
    }
  });
  it('shares state boundary vertices without drawing over a one-edge reversal', () => {
    const a = analyzeTrack(track(slope(5)));
    a.edges[0].state = 'downhill';
    a.edges[1].state = 'downhill';
    a.edges[2].state = 'uphill';
    a.edges[3].state = 'downhill';
    const rows = createChartRows(a);
    const before = rows.find((r) => r.elapsed === 10);
    const middle = rows.find((r) => r.elapsed === 12.5);
    const after = rows.find((r) => r.elapsed === 15);
    expect(before?.elevation_downhill).toBe(before?.elevation);
    expect(before?.elevation_uphill).toBe(before?.elevation);
    expect(after?.elevation_downhill).toBe(after?.elevation);
    expect(after?.elevation_uphill).toBe(after?.elevation);
    expect(middle?.elevation_downhill).toBeNull();
    expect(middle?.elevation_uphill).toBe(1792.5);
  });
  it('does not accumulate small altitude oscillations on a flat track', () => {
    const p = slope(601, 5, 0).map((v, i) => ({
      ...v,
      elevation: 1800 + [0, 2, -2, 1, -1][i % 5],
    }));
    const a = analyzeTrack(track(p));
    expect(a.stats.descent).toBe(0);
    expect(a.stats.ascent).toBe(0);
    expect(a.runs).toHaveLength(0);
    expect(a.lifts).toHaveLength(0);
  });
  it('removes isolated elevation spikes and retains a sustained 180m drop', () => {
    const p = slope();
    p[30].elevation! += 250;
    const a = analyzeTrack(track(p));
    expect(a.stats.descent).toBeGreaterThan(170);
    expect(a.stats.descent).toBeLessThanOrEqual(186);
    expect(a.stats.ascent).toBe(0);
  });
});
