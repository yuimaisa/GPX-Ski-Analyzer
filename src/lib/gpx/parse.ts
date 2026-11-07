import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { GpxPoint, GpxTrack } from '../../types/analysis';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_POINTS = 150_000;
type XmlNode = Record<string, unknown>;
const node = (v: unknown): XmlNode => (v && typeof v === 'object' ? (v as XmlNode) : {});
const list = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
function numeric(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function parseGpx(xml: string, filename = '名称未設定'): GpxTrack {
  if (new TextEncoder().encode(xml).length > MAX_FILE_BYTES)
    throw new Error('ファイルは15MB以下にしてください。');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('外部定義を含むGPXは読み込めません。');
  if (XMLValidator.validate(xml) !== true)
    throw new Error('XML形式が正しくありません。GPXファイルを確認してください。');
  const parsed = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    processEntities: false,
  }).parse(xml);
  if (!Object.prototype.hasOwnProperty.call(parsed, 'gpx'))
    throw new Error('GPX形式ではありません。.gpxファイルを選択してください。');
  const root = node(parsed.gpx);
  const points: GpxPoint[] = [];
  let segment = 0;
  let invalid = 0;
  let trackCount = 0;
  let segmentCount = 0;
  const tracks = list(root.trk);
  for (const t of tracks) {
    trackCount++;
    for (const s of list(node(t).trkseg)) {
      segmentCount++;
      segment++;
      for (const p of list(node(s).trkpt)) {
        const v = node(p);
        const lat = numeric(v['@_lat']);
        const lon = numeric(v['@_lon']);
        if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          invalid++;
          segment++; // Never bridge an invalid coordinate.
          continue;
        }
        const time =
          typeof v.time === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(v.time)
            ? Date.parse(v.time)
            : NaN;
        points.push({
          lat,
          lon,
          elevation: numeric(v.ele),
          time: Number.isFinite(time) ? time : null,
          segment,
        });
        if (points.length > MAX_POINTS)
          throw new Error('15万地点を超えています。GPXを分割してください。');
      }
    }
  }
  if (points.length < 2)
    throw new Error(
      '有効なトラック地点が2つ以上必要です。trk / trkseg / trkpt を含むGPXを選択してください。',
    );
  return {
    name: String(node(tracks[0]).name || node(root.metadata).name || filename),
    points,
    trackCount,
    segmentCount,
    warnings: invalid ? [`座標が不正な${invalid}地点を除外し、軌跡を分割しました。`] : [],
  };
}
