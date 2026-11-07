import type { Metadata } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';
export const metadata: Metadata = {
  title: 'GPX Ski Analyzer | 滑走の記録を、読み解く。',
  description:
    'GPXの滑走記録を端末内で解析。距離、速度、標高、滑走区間を地図とグラフで振り返るオープンソースアプリ。',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
