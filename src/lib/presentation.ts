import type { SkiState } from '../types/analysis';
export const STATE_LABELS: Record<SkiState, string> = {
  downhill: '滑走',
  uphill: '上昇',
  stopped: '停止',
  unknown: '不明',
};
export const STATE_COLORS: Record<SkiState, string> = {
  downhill: '#0f766e',
  uphill: '#4f46e5',
  stopped: '#9a6700',
  unknown: '#64748b',
};
export const SPEED_COLORS = ['#2563eb', '#0891b2', '#15803d', '#a16207', '#c2410c', '#be123c'];
export const number = (v: number | null, digits = 0) =>
  v == null
    ? '—'
    : v.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const km = (v: number) => number(v / 1000, 2);
export function duration(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
}
export const clock = (time: number | null) =>
  time == null
    ? '時刻不明'
    : new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(time);
export const day = (time: number | null) =>
  time == null
    ? '日時不明'
    : new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(time);
