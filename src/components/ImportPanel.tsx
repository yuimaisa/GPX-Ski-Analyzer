import { FolderOpen, ShieldCheck, ArrowRight } from 'lucide-react';
interface Props {
  onChoose: () => void;
  onSample: () => void;
  busy: boolean;
}
export function ImportPanel({ onChoose, onSample, busy }: Props) {
  return (
    <section className="welcome">
      <div className="welcome-heading">
        <h1>滑走の記録を、読み解く。</h1>
        <p>GPXから、あなたの一日を振り返る。</p>
      </div>
      <div className="import-zone">
        <FolderOpen size={42} strokeWidth={1.5} aria-hidden="true" />
        <h2>GPXファイルをドロップ</h2>
        <button className="button primary" onClick={onChoose} disabled={busy}>
          <FolderOpen size={18} />
          GPXファイルを選択
        </button>
        <button className="sample-button" onClick={onSample} disabled={busy}>
          サンプルで試す <ArrowRight size={16} />
        </button>
        <span className="muted small">15MBまで・GPX形式</span>
      </div>
      <p className="privacy">
        <ShieldCheck size={16} />
        GPXは端末内で処理。外部へ送信しません。
      </p>
      <details className="panel quality-panel" id="how-it-works">
        <summary>解析について</summary>
        <div className="quality-content">
          <p>
            速度と標高の変化から滑走・上昇・停止を推定します。GPS誤差を考慮した参考値です。サンプルは架空の合成データです。
          </p>
        </div>
      </details>
    </section>
  );
}
