import { FolderOpen } from 'lucide-react';
interface Props {
  onChoose: () => void;
  onSample: () => void;
  busy: boolean;
}
export function ImportPanel({ onChoose, onSample, busy }: Props) {
  return (
    <section className="welcome">
      <div className="welcome-heading">
        <h1>GPXの読み込み</h1>
      </div>
      <div className="import-zone">
        <FolderOpen size={32} strokeWidth={1.5} aria-hidden="true" />
        <h2>ファイルをドロップ</h2>
        <button className="button primary" onClick={onChoose} disabled={busy}>
          <FolderOpen size={18} />
          GPXを選択
        </button>
        <button className="sample-button" onClick={onSample} disabled={busy}>
          サンプルを読み込む
        </button>
        <span className="muted small">.gpx · 15MB以下</span>
      </div>
      <details className="panel quality-panel" id="how-it-works">
        <summary>解析について</summary>
        <div className="quality-content">
          <p>
            速度・標高から区間を推定します。サンプルは合成データです。GPXはブラウザ内で処理します。
          </p>
        </div>
      </details>
    </section>
  );
}
