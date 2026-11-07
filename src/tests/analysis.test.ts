import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGpx } from '../lib/gpx/parse';
import { analyzeTrack } from '../lib/analysis/analyze';
import { haversine } from '../lib/geo/haversine';
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
  it('parses the real synthetic sample with 4 reproducible runs', () => {
    const t = parseGpx(readFileSync('public/samples/hakuba-synthetic.gpx', 'utf8'));
    const a = analyzeTrack(t);
    expect(a.runs).toHaveLength(4);
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
  });
  it('missing altitude preserves validated speed, marks motion unknown', () => {
    const a = analyzeTrack(track(slope().map((p) => ({ ...p, elevation: null }))));
    expect(a.stats.descent).toBeNull();
    expect(a.stats.maxSpeed).toBeGreaterThan(20);
    expect(a.runs).toHaveLength(0);
    expect(a.edges.every((e) => e.state === 'unknown')).toBe(true);
  });
  it('does not infer a descent across a missing altitude interval', () => {
    const p = slope();
    p[30].elevation = null;
    const a = analyzeTrack(track(p));
    expect(a.points[30].smoothedElevation).toBeNull();
    expect(a.edges.find((e) => e.to === 30)?.state).toBe('unknown');
  });
  it('duplicate or reversed times split the track and never produce infinite speed', () => {
    const p = slope();
    p[30].time = p[29].time;
    p[40].time = epoch;
    const a = analyzeTrack(track(p));
    expect(a.quality.invalidTimes).toBe(2);
    expect(a.edges.filter((e) => !e.connected).length).toBeGreaterThanOrEqual(2);
    expect(a.stats.maxSpeed).toBeLessThan(162);
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
  it('splits at a sustained stop', () => {
    const base = slope(121);
    const pause = base[60];
    const p = [
      ...base.slice(0, 61),
      ...Array.from({ length: 12 }, (_, i) => ({ ...pause, time: pause.time! + (i + 1) * 5000 })),
      ...base.slice(61).map((v) => ({ ...v, time: v.time! + 60000 })),
    ];
    const a = analyzeTrack(track(p));
    expect(a.runs).toHaveLength(2);
    expect(a.stats.stoppedSeconds).toBe(60);
  });
  it('counts repeated downhill/uphill as 2 runs with consistent totals', () => {
    const a = analyzeTrack(track(repeated()));
    expect(a.runs).toHaveLength(2);
    expect(a.stats.uphillSeconds).toBeGreaterThan(250);
    expect(a.runs.reduce((s, r) => s + r.distance, 0)).toBe(a.stats.skiDistance);
    expect(a.runs.reduce((s, r) => s + r.duration, 0)).toBe(a.stats.skiSeconds);
    expect(a.stats.averageSkiSpeed).toBeCloseTo(
      (a.stats.skiDistance / a.stats.skiSeconds) * 3.6,
      8,
    );
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
