import { Info } from 'lucide-react';
import type { Analysis } from '../types/analysis';
import { duration } from '../lib/presentation';
export function QualityPanel({ analysis: a }: { analysis: Analysis }) {
  return (
    <details className="panel quality-panel" id="analysis-method">
      <summary>
        <Info size={18} />
        データ品質と解析について
        <span>
          {a.quality.rejectedPoints +
            a.quality.gaps +
            a.quality.invalidTimes +
            a.quality.missingTimes +
            a.quality.missingElevations >
          0
            ? '注意事項あり'
            : '解析方法を確認'}
        </span>
      </summary>
      <div className="quality-content">
        <dl>
          <div>
            <dt>時刻の欠損</dt>
            <dd>{a.quality.missingTimes}地点</dd>
          </div>
          <div>
            <dt>標高の欠損</dt>
            <dd>{a.quality.missingElevations}地点</dd>
          </div>
          <div>
            <dt>GPSジャンプの除外</dt>
            <dd>{a.quality.rejectedPoints}地点</dd>
          </div>
          <div>
            <dt>記録の空白・異常移動</dt>
            <dd>{a.quality.gaps}箇所</dd>
          </div>
          <div>
            <dt>重複・逆転した時刻</dt>
            <dd>{a.quality.invalidTimes}箇所</dd>
          </div>
          <div>
            <dt>判定不能な時間（空白を含む）</dt>
            <dd>{duration(a.stats.unknownSeconds)}</dd>
          </div>
        </dl>
        {a.quality.warnings.map((w) => (
          <p key={w} className="warning-text">
            {w}
          </p>
        ))}
        <p>
          滑走判定は推定です。上昇はリフト・徒歩を区別しません。25秒以内の停止は同じ滑走にまとめます。
        </p>
        <p>
          GPSジャンプと162km/hを超える速度を除外。標高は5地点の中央値と6mの変化幅で平滑化します。累積標高差は全移動、平均速度は滑走のみを集計します。
        </p>
        <p>
          時刻欠損は速度・時間を、標高欠損は滑走判定を算出できません。120秒を超える空白はつなぎません。
        </p>
        <p>
          GPXは送信しません。背景地図の取得時に表示範囲とIPアドレスがOpenStreetMapへ送信されます。
        </p>
      </div>
    </details>
  );
}
