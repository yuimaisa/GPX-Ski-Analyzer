import type { Metadata } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';
export const metadata: Metadata = {
  title: 'GPX Ski Analyzer',
  description: 'GPXファイルの滑走区間、距離、速度、標高を解析。',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
