---
name: algorithm-update
description: >-
  Guide safe modifications to GPX parsing, Haversine geometry, or ski-run
  analysis logic in src/lib/gpx/, src/lib/geo/, or src/lib/analysis/. Use
  whenever changing thresholds, run detection, elevation smoothing, outlier
  filtering, or Web Worker messaging.
---

# Algorithm & GPX Parser Update

GPX パースやスキー滑走解析ロジックを変更するときの標準手順です。

## 変更前チェック

1. 現在の仕様と既知の制約を確認する:
   - [docs/algorithm.md](../../../docs/algorithm.md)
   - [src/lib/analysis/config.ts](../../../src/lib/analysis/config.ts)
   - [src/lib/analysis/analyze.ts](../../../src/lib/analysis/analyze.ts)

## 実装ルール

1. **純粋関数の維持**: `src/lib/analysis/` は React・DOM・現在時刻・乱数に依存させない。同一入力・同一設定で常に同一結果を返すこと。
2. **しきい値の集約**: 新しい定数やしきい値は `src/lib/analysis/config.ts` の `ANALYSIS_CONFIG` に理由コメント付きで追加し、`analyzeTrack(track, overrides)` から上書き可能にする。
3. **集計整合性の保持**:
   - 全体の滑走距離・滑走時間 = 採用された滑走別の厳密な合計
   - 平均滑走速度 = 全滑走距離 / 全滑走時間（滑走別速度の単純平均にしない）
   - 欠損値（時刻・標高なし）を推測補完しない。タイムゾーンなし時刻は欠損扱い。
4. **入力境界の維持**: `src/lib/gpx/parse.ts` の DOCTYPE/ENTITY 拒否、15MB・15万地点制限、座標範囲検証を弱めない。

## テストとドキュメント更新

1. 合成データによる単体テストを `src/tests/analysis.test.ts` に追加・更新する（実走行 GPX は使わない）。
2. Worker の入出力や異常系が変わる場合は `src/tests/worker.test.ts` も更新する。
3. しきい値・判定条件・制約が変わった場合は `docs/algorithm.md` を必ず同期更新する。

## 検証

```sh
npm run verify
```

`npm run build` の `prebuild` で `public/analysis-worker.js` が再バンドルされること、および `src/tests/worker.test.ts` が通ることを確認する。
