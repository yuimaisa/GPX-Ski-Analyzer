---
name: verify-change
description: >-
  Run the full verification suite for GPX-Ski-Analyzer (safety check, TypeScript
  typecheck, ESLint, Prettier format check, Vitest unit and worker tests, Next.js
  static export build, and optional Cloudflare dry-run / npm audit). Use before
  completing any implementation task, before handing off between Codex CLI and
  agy CLI, or before opening a pull request.
---

# Verify Change

GPX-Ski-Analyzer の変更を CI と同等の基準で検証する手順です。

## 手順

1. まず機密情報・非許可 GPX・OpenNext 混入チェックを実行する:

   ```sh
   npm run check:safety
   ```

2. ローカル一括検証を実行する:

   ```sh
   npm run verify
   ```

   実行内容:
   - `npm run check:safety`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run format:check`
   - `npm test`
   - `npm run build`（`prebuild` で `public/analysis-worker.js` を再生成し、`out/` へ静的出力）

3. フォーマット違反がある場合は `npm run format` で修正し、`npm run verify` を再実行する。

4. `wrangler.jsonc`・`next.config.ts`・ビルド設定・依存関係を変更した場合は、次も実行する:

   ```sh
   npm audit --audit-level=moderate
   npm run deploy -- --dry-run
   ```

   `package.json` を変更した場合は、`package-lock.json` が Node.js 22 / npm 10 の `npm ci` と整合していることも確認する。

5. `git status --short` と `git diff --stat` を確認し、不要な生成物や個人用ファイルが含まれていないことを確認する。

## Sandbox 制限時の扱い

Sandbox 内でネットワークまたは `node` / `npm` が利用できない場合は、無理に制限を回避しない。実行できた項目（`bash scripts/check-safety.sh`、`git diff --stat` 等）の結果を明記し、未実行コマンドをユーザーが別ターミナルでそのまま実行できる形式で提示する。
