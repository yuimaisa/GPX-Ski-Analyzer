# Codex CLI・Antigravity CLI (`agy`) 併用開発ガイド

このリポジトリでは、**Codex CLI** と **Antigravity CLI (`agy`)** を重複や競合なく併用できるように設定を統一しています。

## 1. 設定ファイルの構成と役割

### 両 CLI で共有（リポジトリ管理）

- [AGENTS.md](../AGENTS.md) — 両 CLI が自動読込する共通開発ルール（Single Source of Truth）。`GEMINI.md` への重複コピーは置かない。
- `.agents/skills/*/SKILL.md` — 両 CLI が自動検出する共通スキル:
  - `verify-change`: 安全点検・型・Lint・整形・テスト・ビルドの一括検証手順
  - `dual-cli-handoff`: Git worktree 作成と CLI 間の引き継ぎ手順
  - `cross-cli-review`: 別 CLI が作成した差分の相互レビュー手順
  - `algorithm-update`: GPX パース・解析ロジック変更時の純粋性・テスト・ドキュメント同期手順
- `scripts/check-safety.sh` — 機密情報・非許可 GPX・OpenNext 混入の検査スクリプト
- `scripts/agent-worktree.sh` — 並行開発用 Git worktree 管理スクリプト
- `.vscode/extensions.json`, `.vscode/settings.json` — Prettier / ESLint / TypeScript / Tailwind CSS v4 / Vitest / TOML の推奨設定

### CLI 固有設定（リポジトリ管理）

- `.codex/config.toml` — Codex CLI 向けプロジェクト設定（Sandbox、承認ポリシー、MCP サーバー）。個人固有の `model` 指定や API キーは書かず、`~/.codex/config.toml` に置く。
- `.agents/plugins/gpx-ski-mcp/` — Antigravity CLI (`agy`) 向けワークスペースプラグイン（`plugin.json` と `mcp_config.json`）。ルールやスキルは重複させず、MCP サーバー定義のみを格納する。

### ローカル専用（`.gitignore` 対象・コミット禁止）

- `AGENTS.override.md` — Codex CLI のローカル上書き指示
- `GEMINI.local.md` — ローカル用メモ・ルール
- `.codex/*.local.toml` — ローカル用 Codex 設定
- `.agents/handoff.local.md` — CLI 間の引き継ぎ用メモ
- `.worktrees/` — 並行作業用の Git worktree ディレクトリ

## 2. 初回セットアップ手順

Node.js 22.12 以上・npm 10 以上が利用できる通常のシェルで実行します。

> **WSL 環境の注意**: `which node` / `which npm` が `/mnt/c/...`（Windows 版）を指していると、`cmd.exe` が UNC パス（`\\wsl.localhost\...`）を扱えず `npm ci` や `npm run verify` が失敗します。WSL 側（Linux）に Node.js 22 以上をインストールし、`which node` が Linux パスを指す状態で実行してください（例: `nvm` や `fnm` で Node.js 22 を導入）。

```sh
# 1. 依存関係のクリーンインストール
npm ci

# 2. インストール確認
which node npm
node -v
npm -v
agy --version
codex --version
```

`codex` が未導入の場合は、公式手順でインストールして認証します（例: `npm install -g @openai/codex` 後、`codex login`）。

### Codex CLI のプロジェクト信頼設定

Codex CLI は信頼済み（Trusted）のリポジトリでのみ `.codex/config.toml` を読み込みます。初回起動時にプロジェクトルートで `codex` を実行し、このリポジトリを Trusted として承認してください。

### Antigravity CLI (`agy`) の確認

プロジェクトルートで `agy` を起動すると、以下が自動検出されます:

- ルール: `AGENTS.md`
- スキル: `.agents/skills/*`
- ワークスペースプラグイン（MCP）: `.agents/plugins/gpx-ski-mcp`

オフライン環境等で MCP プラグインを一時無効化する場合は次を実行します。

```sh
agy plugin disable gpx-ski-mcp
# 再有効化
agy plugin enable gpx-ski-mcp
```

### VS Code のセットアップ

リポジトリを VS Code で開き、推奨拡張機能通知から一括インストールします。保存時の Prettier 整形と ESLint 自動修正、Tailwind CSS v4 の `@` ルール警告抑止、`.worktrees/` の監視除外が自動で適用されます。

## 3. 採用した MCP サーバー

API キーをリポジトリに含めずに利用でき、このプロジェクトの技術構成に直結する 3 つの MCP サーバーを両 CLI で共通設定しています。

- **`context7`** (`https://mcp.context7.com/mcp`, Streamable HTTP): Next.js 16 / React 19 / Tailwind CSS v4 / Leaflet / Recharts 3 / Vitest 4 の最新ドキュメント参照用。より高いレート上限が必要な場合は、個人のグローバル設定にのみ API キーを追加する。
- **`cloudflare-docs`** / **`cloudflare_docs`** (`https://docs.mcp.cloudflare.com/mcp`, Streamable HTTP): Cloudflare Workers Static Assets・Wrangler・ブランチプレビューの公式ドキュメント参照用。
- **`playwright`** (`npx -y @playwright/mcp@latest --headless`, Stdio): [design.md](../design.md) および [docs/qa.md](qa.md) で求める 320 / 390 / 768 / 1440px の表示・ライトモード固定・合成サンプルの UI 検証用。

GitHub MCP や認証付き外部 MCP が必要な場合は、認証情報をリポジトリへ書かず、各自のグローバル設定（`~/.codex/config.toml` または `~/.gemini/config/mcp_config.json`）へ登録してください。

## 4. Git worktree による並行開発

Codex CLI と `agy` CLI を同じディレクトリで同時に動かすと、編集衝突や `.next/`・`out/`・`public/analysis-worker.js` の競合が起きます。並行作業時は必ず worktree を分離します。

```sh
# Codex CLI 用の作業ツリーとブランチ (codex/<task>) を作成
bash scripts/agent-worktree.sh create codex refine-run-detection

# Antigravity CLI 用の作業ツリーとブランチ (agy/<task>) を作成
bash scripts/agent-worktree.sh create agy ui-responsive-check main

# 現在の worktree 一覧を確認
bash scripts/agent-worktree.sh list
```

作成した worktree は `.worktrees/<agent>-<task>` に配置されます。初回のみ各 worktree 内で `npm ci` を実行してからそれぞれの CLI を起動してください。

```sh
cd .worktrees/codex-refine-run-detection
npm ci
codex
```

作業が完了してマージした後は worktree を削除します。

```sh
bash scripts/agent-worktree.sh remove codex refine-run-detection
git branch -d codex/refine-run-detection
```

## 5. 作業分担・引き継ぎ・相互レビュー手順

### 推奨の作業分担パターン

- **実装とレビューの分離**: 一方の CLI（例: Codex CLI）で実装とテスト作成を行い、もう一方の CLI（例: `agy` CLI）で `cross-cli-review` スキルを使って差分レビューと UI 検証を行う。
- **独立タスクの並行処理**: 例として `codex/<task>` で `src/lib/analysis/` と単体テストを進め、`agy/<task>` で `src/components/` やドキュメントを進める。同じファイルを触らないよう事前に責務を分ける。

### 引き継ぎ手順

1. 引き継ぎ元の CLI で `npm run verify`（または実行可能な検査）を完了し、`git status --short` を確認する。
2. `.agents/handoff.local.md` に目的・完了内容・検証結果（未実行コマンド含む）・次の作業・注意点を記録する（`dual-cli-handoff` スキルにテンプレートあり）。
3. 引き継ぎ先の CLI で `.agents/handoff.local.md` と `git diff` を確認して作業を再開する。

### 相互レビュー手順

レビュー担当 CLI には次のように指示します:

- `cross-cli-review` スキルを使い、対象ブランチ（例: `git diff main...codex/<task>`）を Blocker / Major / Minor でレビューさせる。
- 特にプライバシー（個人 GPX 非混入）、解析の純粋性と合計整合性、ライトモード固定、静的出力（`output: 'export'`）維持を重点確認させる。

## 6. 品質検証コマンド

```sh
# 機密情報・GPX・OpenNext 混入チェック
npm run check:safety

# ローカル一括検証（safety / typecheck / lint / format:check / test / build）
npm run verify

# CI 追加確認（依存脆弱性監査・Cloudflare 設定の dry-run）
npm audit --audit-level=moderate
npm run deploy -- --dry-run
```

自動整形は `npm run format` を実行します。

## 7. 機密情報保護と Sandbox 安全性

- **Codex CLI**: `.codex/config.toml` で `sandbox_mode = "workspace-write"`、`approval_policy = "on-request"`、`network_access = false` を既定にしています。
- **Antigravity CLI (`agy`)**: 標準 Sandbox モード（ネットワーク遮断・ワークスペース外アクセス制限）を既定のまま運用します。
- **Sandbox 制限時の運用**: Sandbox 内で実行できないコマンド（`npm ci`、`npm audit`、Wrangler のリモート確認、Playwright ブラウザ取得等）は制限を回避せず、別ターミナルで人間が実行します。
- **コミット前の安全確認**: `npm run check:safety` により、許可済みの `public/samples/hakuba-synthetic.gpx` 以外の `.gpx`、`.env*`、`.dev.vars*`、秘密鍵、ローカル専用エージェントファイル、`public/analysis-worker.js`、OpenNext 関連ファイルの混入を検出します。
