import { Info } from 'lucide-react';
import type { Analysis } from '../types/analysis';
import { duration } from '../lib/presentation';
export function QualityPanel({ analysis: a }: { analysis: Analysis }) {
  const gapLifts = a.lifts.filter((l) => l.inferredFromGap).length;
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
            a.quality.missingElevations +
            gapLifts >
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
          {gapLifts > 0 && (
            <div>
              <dt>GPS欠損から推定したリフト</dt>
              <dd>{gapLifts}回</dd>
            </div>
          )}
        </dl>
        {a.quality.warnings.map((w) => (
          <p key={w} className="warning-text">
            {w}
          </p>
        ))}
        <p>
          滑走・リフト判定は推定です。有意な上昇区間（標高差25m以上・上昇40秒以上・移動60m以上など）には、徒歩での登りも含まれます。
        </p>
        <p>
          滑走はリフト乗車・180秒を超える休憩・20m超の登り返し・記録空白で区切り、180秒以内の途中停止や平坦連絡路は同じ滑走にまとめます。時刻の欠損がある箇所でも滑走を区切ります。
        </p>
        <p>
          ゴンドラ内などでGPSが120秒超途切れた同一セグメントの空白は、前後の標高差と妥当な移動速度からリフト回数のみ推定します。推定区間の距離・速度・累積標高差は統計値に加算せず、地図と標高グラフでは破線の補助線で実測区間と区別します。
        </p>
        <p>
          GPSジャンプと162km/hを超える速度を除外。標高は前後6秒の中央値で平滑化し、累積標高差は6m以上の変化を集計します。
        </p>
        <p>
          GPXは送信しません。背景地図の取得時に表示範囲とIPアドレスがOpenStreetMapへ送信されます。
        </p>
      </div>
    </details>
  );
}
