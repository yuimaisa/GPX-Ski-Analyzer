# GPX Ski Analyzer — 共通エージェントルール (`AGENTS.md`)

このファイルは **Codex CLI** と **Antigravity CLI (`agy`)** の両方が自動で読み込む共通の開発ルール（Single Source of Truth）です。`GEMINI.md` 等へ重複コピーは作成しないでください。個人環境固有の上書きは git 管理外の `AGENTS.override.md`（Codex）や各ユーザーのグローバル設定で行います。

## プロジェクト概要と技術構成

- ブラウザ内完結の GPX スキー滑走解析 Web アプリ（バックエンド・DB・認証・外部解析 API なし）
- 技術スタック: Next.js 16 (App Router / `output: 'export'`), React 19, TypeScript (`strict`), Tailwind CSS v4, Leaflet + OpenStreetMap, Recharts 3, fast-xml-parser, esbuild (Web Worker), Vitest 4, ESLint 9, Prettier 3, Wrangler 4
- 配信先: Cloudflare Workers Static Assets (`wrangler.jsonc` が `out/` を配信) および GitHub Pages (`NEXT_PUBLIC_BASE_PATH`)
- Node.js 要件: `>=22.12`（CI は Node.js 22 / npm 10）

## ディレクトリ構成と責務境界

- `src/app/` — Next.js エントリ・共通スタイル
- `src/components/` — UI コンポーネント（入力・統計・地図・グラフ・滑走一覧・品質情報）
- `src/hooks/useAnalyzer.ts` — File API 読込と Web Worker 実行管理
- `src/lib/gpx/` — XML 構文検証と GPX 正規化（DOCTYPE/ENTITY 拒否、15MB・15万地点上限）
- `src/lib/geo/` — Haversine 水平距離
- `src/lib/analysis/` — **React・DOM・現在時刻・乱数に依存しない純粋 TypeScript**（`analyzeTrack(track, overrides)`、`config.ts`、`worker.ts`）
- `src/types/` — データモデル定義
- `src/tests/` — 合成データによる単体テスト（`analysis.test.ts`, `worker.test.ts`）
- `scripts/` — 開発サーバー (`dev.mjs`)、Worker バンドル (`build-worker.mjs`, `worker-config.mjs`)、並行開発・安全点検スクリプト
- `public/samples/hakuba-synthetic.gpx` — 公開許可済みの唯一の合成サンプル GPX
- `public/analysis-worker.js` — `scripts/build-worker.mjs` による生成物（git 管理外、手動編集禁止）

## 必須の制約と不変条件

### 1. プライバシーとセキュリティ

- **個人の GPX ファイルを絶対にコミット・掲載しない**。公開・テスト・スクリーンショットは合成データ（`public/samples/hakuba-synthetic.gpx` またはテスト内生成データ）のみを使用する。
- `.env*`（`.env.example` を除く）、`.dev.vars*`（`.dev.vars.example` を除く）、API トークン、秘密鍵、ローカル設定ファイル（`AGENTS.override.md`, `GEMINI.local.md`, `.codex/*.local.toml`, `.agents/handoff.local.md`）をコミットしない。
- GPX の外部送信・永続保存・アクセス解析を追加してはならない（要件として明示された場合はプライバシー影響と `README.md` / `CONTRIBUTING.md` の更新案を同時に提示する）。

### 2. デザインと UI（[design.md](design.md) 準拠）

- OS のテーマ設定にかかわらず**ライトモード固定**（背景 `#ffffff`、補助面 `#f5f7f9`、境界 `#dbe3e9`、滑走 `#0f766e`、上昇 `#4f46e5`、停止 `#9a6700`、不明 `#64748b`）。
- 地図は OpenStreetMap 標準色を使用し、色反転フィルターを掛けない。
- 文言は日本語で簡潔に統一する（初期操作は「GPXを選択」「サンプルを読み込む」、読込後見出しは「解析結果」）。すべての時刻は日本時間（JST）で表示し、欠損は「—」とする。
- 装飾写真、偽の比較／保存ボタン、詩的・宣伝調コピーを追加しない。
- 幅 320 / 390 / 768 / 1440px でページ全体の横はみ出しを発生させない（横スクロールは滑走一覧表のみ許可）。

### 3. 解析ロジック・ドキュメント・ビルドの整合性

- `src/lib/analysis/` または `src/lib/gpx/` を変更したら、以下を必ず同時に更新する:
  1. `src/tests/analysis.test.ts` および必要に応じ `src/tests/worker.test.ts` の回帰テスト
  2. `docs/algorithm.md` の仕様・しきい値記述
- `next.config.ts` の `output: 'export'` と `wrangler.jsonc` の `assets.directory = "./out"` を維持する。`@opennextjs/cloudflare` や `open-next.config.ts` は導入しない。
- 依存関係を変更する場合は `package-lock.json` も更新し、CI と同じ Node.js 22 / npm 10 環境で `npm ci` が成功することを確認する。

## 標準の検証コマンド

変更完了前・引き継ぎ前・PR 作成前に以下を実行する。

```sh
npm run verify
```

`npm run verify` は次を順に実行する:

1. `npm run check:safety`（機密ファイル・非許可 GPX・OpenNext 混入チェック）
2. `npm run typecheck` (`tsc --noEmit`)
3. `npm run lint` (`eslint .`)
4. `npm run format:check` (`prettier --check .`)
5. `npm test` (`vitest run`)
6. `npm run build` (`prebuild` による Worker ビルド + `next build`)

CI 相当の追加確認（必要に応じて実行）:

```sh
npm audit --audit-level=moderate
npm run deploy -- --dry-run
```

## Codex CLI と Antigravity CLI (`agy`) の併用ルール

- **共通スキル**: `.agents/skills/<skill-name>/SKILL.md` を両 CLI で共有する（`verify-change`, `dual-cli-handoff`, `cross-cli-review`, `algorithm-update`）。
- **並行作業の隔離**: 両 CLI を同時に起動して編集する場合は、同一作業ツリーを触らず、必ず `scripts/agent-worktree.sh` で専用 worktree（`.worktrees/<agent>-<task>`）とブランチ（`codex/<task>` または `agy/<task>`）を分ける。
- **役割分担の目安**:
  - 実装担当 CLI: 機能実装・テスト追加・`npm run verify` 実行
  - レビュー／検証担当 CLI: `cross-cli-review` スキルで差分レビュー、エッジケース検証、Playwright による UI 確認
- **引き継ぎ**: 作業を別 CLI へ渡す際は `dual-cli-handoff` スキルに従い、変更ファイル・検証結果・未完了事項を `.agents/handoff.local.md`（git 管理外）またはコミットメッセージに記録する。
- **Sandbox の尊重**: Sandbox の制限によりネットワークやホスト上のツール（`npm ci`, `npm audit`, `wrangler deploy --dry-run`, `codex` 等）を実行できない場合は、制限を回避せず、ユーザーが別ターミナルで実行できる正確なコマンドを提示して報告する。

詳細なセットアップと運用手順は [docs/dual-cli.md](docs/dual-cli.md) を参照してください。
