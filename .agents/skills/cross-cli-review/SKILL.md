---
name: cross-cli-review
description: >-
  Perform a structured peer code review of changes authored by the other AI CLI
  (Codex CLI reviewing agy CLI changes, or agy CLI reviewing Codex CLI changes)
  against GPX-Ski-Analyzer invariants. Use when asked to review a branch, diff,
  or worktree produced by another agent.
---

# Cross-CLI Mutual Review

もう一方の CLI（Codex CLI ⇄ Antigravity CLI）が作成した変更を独立した視点でレビューする手順です。

## 1. 差分の取得

対象ブランチまたは作業ツリーの差分を確認する:

```sh
git status --short
git diff --stat
git diff
# ブランチ比較の場合
git diff main...HEAD
```

## 2. プロジェクト固有の重点チェック項目

1. **プライバシー・セキュリティ**
   - 個人 GPX・秘密鍵・`.env`・`.dev.vars`・ローカル設定ファイルが混入していないか
   - GPX の外部送信や永続保存が意図せず追加されていないか
2. **解析ロジックの純粋性と整合性**（`src/lib/analysis/`, `src/lib/gpx/`, `src/lib/geo/` 変更時）
   - React / DOM / `Date.now()` / `Math.random()` への依存がないか
   - 全体滑走距離・滑走時間が滑走別集計の厳密な合計と一致するか
   - 合成データによる回帰テスト（`src/tests/`）と `docs/algorithm.md` が更新されているか
3. **UI・デザイン方針**（`src/components/`, `src/app/` 変更時）
   - [design.md](../../../design.md) のライトモード固定・配色・JST 表示・日本語文言に合致するか
   - 320 / 390 / 768 / 1440px で横はみ出しがないか、アクセシビリティ（focus-visible、キーボード操作、色＋文字表示）を損ねていないか
4. **静的ビルドとデプロイ互換性**
   - `next.config.ts` の `output: 'export'` と `wrangler.jsonc` の静的配信設定が保たれているか
   - `public/analysis-worker.js` を誤ってコミット対象にしていないか
   - `package.json` 変更時に `package-lock.json` の Node 22 / npm 10 互換性が保たれているか

## 3. レビュー結果の報告形式

指摘は以下の重要度順に、**ファイルパス・行番号・根拠・修正案**を簡潔にまとめる:

- **Blocker**: セキュリティ・プライバシー違反、データ不整合、ビルド／CI 破壊
- **Major**: バグ、要件逸脱、エッジケース未処理、テスト不足
- **Minor**: 可読性、軽微なリファクタ、ドキュメント表現の改善

指摘がない場合も、確認した範囲と未検証項目（例: ブラウザ実機確認、Sandbox 外のコマンド）を明示する。
