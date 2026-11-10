# GPX Ski Analyzer

GPXのスキー記録から滑走区間・距離・速度・標高を解析するWebアプリ。GPXはブラウザ内で処理し、送信・保存しません。

## 主な機能

- GPXのドラッグ＆ドロップ／ファイル選択。複数トラック・セグメントに対応
- 距離、滑走本数・時間、検証済み速度、累積標高差、上昇・停止時間を集計
- 滑走・上昇・停止・不明を推定。短い停止による過剰な滑走分割を抑制
- Leaflet地図の状態／速度切替、開始・終了、滑走選択、範囲フィット
- 速度・標高グラフと地図の地点連動。キーボード操作可能な地点スライダー
- ノイズ、欠損、重複時刻、記録切断の処理と品質情報
- 架空の合成サンプル、白基調のUI、スマートフォン対応

## 起動

Node.js 22.12以上とnpmを使用します。
APIキーや環境変数の設定は不要です。

```sh
git clone https://github.com/yuimaisa/GPX-Ski-Analyzer.git
cd GPX-Ski-Analyzer
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開き、「サンプルを読み込む」またはGPXを選択します。ファイルは15MB・15万地点まで。GPXの `trk / trkseg / trkpt` を対象とし、ルート／ウェイポイントのみのGPXは対象外です。すべての時刻は日本時間（JST）で表示します。

## 開発と検証

```sh
npm run typecheck
npm audit --audit-level=moderate
npm run lint
npm test
npm run format:check
npm run build
```

`npm run format` で整形。`npm run test:watch` で監視。CIは依存関係の脆弱性監査・型・Lint・整形・テスト・ビルドとCloudflareデプロイ設定のdry runを実行します。本番出力は静的ファイルの `out/`。`output: 'export'` のため `next start` は使用せず、任意の静的HTTPサーバーで `out/` を配信してください。

## 技術構成

Next.js App Router / React / TypeScript / Tailwind CSS v4 / Leaflet + OpenStreetMap / Recharts / fast-xml-parser / Vitest / ESLint / Prettier。バックエンド・データベース・認証・外部解析APIはありません。

```text
src/
  app/          Next.jsエントリ・共通スタイル
  components/   入力、統計、地図、グラフ、滑走一覧
  hooks/        Workerの実行とファイル読込
  lib/
    gpx/        XML検証・GPX正規化
    geo/        Haversine距離
    analysis/   純粋TypeScriptの解析・設定・Worker
  types/        データモデル
  tests/        合成データによる単体テスト
public/samples/ 架空のサンプルGPX
```

解析はUIから独立した `analyzeTrack(track, overrides)`。将来の比較・保存・手動編集・エクスポートはこのモデルを基に追加できます。

## 精度とプライバシー

解析値はGPSに基づく推定です。競技計測、コース案内、安全判断には使用しないでください。水平距離を使い、斜面距離ではありません。最高速度にもGPS誤差は残ります。リフトと徒歩は区別しません。低速・緩斜面・短い滑走は検出しない場合があります。

時刻なしの部分は速度・時間を算出しません。標高なしの移動は原則不明。標高平滑化は小さな起伏を過小評価し、長期ドリフトを完全には除去しません。全体の累積上下は全状態、滑走別統計は滑走のみが対象です。

GPXと解析値はメモリ内だけで保持され、再読み込みで消えます。背景地図の取得時は表示範囲とIPアドレスがOpenStreetMapへ送られます。地図の取得にはネット接続が必要ですが、取得失敗時も軌跡と解析は使えます。タイルを大量取得・事前保存する機能はありません。

詳しいしきい値、根拠、集計範囲、制約は [解析アルゴリズム](docs/algorithm.md) を参照してください。

## デプロイ

### Cloudflare Workers

WorkersのGit連携では次を設定します。

| 項目                         | 値                                                     |
| ---------------------------- | ------------------------------------------------------ |
| ビルドコマンド               | `npm run build`                                        |
| 本番のデプロイコマンド       | `npx wrangler deploy` または `npm run deploy`          |
| プレビューのデプロイコマンド | `npx wrangler preview` または `npm run deploy:preview` |
| ルートディレクトリ           | リポジトリのルート                                     |
| 本番ブランチ                 | `main`                                                 |

ブランチプレビューは `wrangler.jsonc` の `previews: {}` で有効化します。静的アセットと互換設定はトップレベルから継承します。

`wrangler.jsonc` が `out/` を静的アセットとして配信します。`NEXT_PUBLIC_BASE_PATH` は未設定または空にしてください。Next.jsのサーバー機能は使用しないため、OpenNextアダプターは不要です。

ローカルでデプロイ前の検証を行う場合：

```sh
npm run build
npm run deploy -- --dry-run
```

Cloudflareにログイン済みの環境では `npm run deploy` で公開できます。静的ファイルの生成先は `.next/` ではなく `out/` です。

`pages-manifest.json` が見つからないOpenNextのエラーが出る場合は、この設定を含むコミットがデプロイ対象か確認してください。自動移行で追加された `@opennextjs/cloudflare`、`open-next.config.ts`、`next.config.ts` のOpenNext初期化がある場合は取り除き、元の `output: 'export'` 設定を使用してください。ビルドキャッシュに自動移行の変更が残る場合は、Cloudflareのキャッシュをクリアして再実行します。

### GitHub Pages

GitHubリポジトリの **Settings → Pages → Source: GitHub Actions** を選択し、Actionsの **Deploy GitHub Pages** を手動実行します。リポジトリ名を `NEXT_PUBLIC_BASE_PATH` に設定してビルドし、`out/` を配信します。

ルートドメイン／独自ドメインに配信する場合は `NEXT_PUBLIC_BASE_PATH` を空にして `npm run build`。サブパスに配信する場合は、例として次を実行します。

```sh
NEXT_PUBLIC_BASE_PATH=/GPX-Ski-Analyzer npm run build
```

生成された `out/` を静的ホストへ配置してください。`basePath` はビルド時に埋め込まれるため、変更時は再ビルドが必要です。`analysis-worker.js`、`_next/`、`samples/` を含む `out/` 全体を配信してください。

## デザイン・画面確認

[design.md](design.md) に方針、[docs/qa.md](docs/qa.md) に検証結果を記録します。実装スクリーンショットの掲載先は `docs/screenshots/` です。合成データを使用し、個人の滑走履歴を掲載しないでください。

## コントリビューション・セキュリティ

不具合報告や変更提案は [Issues](https://github.com/yuimaisa/GPX-Ski-Analyzer/issues) へ。開発手順とデータの扱いは [CONTRIBUTING.md](CONTRIBUTING.md)、脆弱性の報告方法は [SECURITY.md](SECURITY.md) を参照してください。公開するGPXは同梱の合成サンプルだけです。個人の記録、認証情報、環境固有のホスティング設定はコミットしないでください。

`package.json` の `private: true` はnpmへの誤公開を防ぐ設定です。GitHubリポジトリの公開範囲には影響しません。

## ライセンス

[MIT](LICENSE)。地図データは © OpenStreetMap contributors（ODbL）。各依存ライブラリのライセンスは各配布元を参照してください。
