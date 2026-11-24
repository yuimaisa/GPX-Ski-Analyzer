---
name: dual-cli-handoff
description: >-
  Coordinate parallel development with Git worktrees and hand off tasks cleanly
  between Codex CLI and Antigravity CLI (agy). Use when starting concurrent work
  across both CLIs, transferring an in-progress task from one CLI to the other,
  or resuming from an existing handoff note.
---

# Dual-CLI Handoff & Parallel Worktree Workflow

Codex CLI と Antigravity CLI (`agy`) の間で競合を防ぎながら並行開発・作業引き継ぎを行う手順です。

## A. 並行作業を開始するとき（Worktree 分離）

両 CLI で同時にファイルを編集する場合は、必ず専用 worktree を作成する。

```sh
bash scripts/agent-worktree.sh create codex <task-slug>
# または
bash scripts/agent-worktree.sh create agy <task-slug>
```

- 作成先: `.worktrees/<agent>-<task-slug>`
- ブランチ名: `<agent>/<task-slug>`
- worktree 内では独立した `node_modules` が必要なため、初回のみ別ターミナル等で `npm ci` を実行する。
- 作業終了後はマージを確認してから `bash scripts/agent-worktree.sh remove <agent> <task-slug>` で片付ける。

## B. 別 CLI へ引き継ぐとき

1. `git status --short` と `git diff --stat` で変更範囲を確認する。
2. 可能な範囲で `npm run verify`（最低でも `bash scripts/check-safety.sh`）を実行する。
3. 引き継ぎメモを `.agents/handoff.local.md`（git 管理外）へ以下の形式で書き出す:

   ```markdown
   # Handoff

   - From: <codex | agy>
   - Branch / Worktree: `<branch>` (`<path>`)
   - Goal: <タスクの目的>
   - Done:
     - <完了した変更と対象ファイル>
   - Verification:
     - Passed: <成功したコマンド>
     - Pending / Blocked: <未実行コマンドと理由>
   - Next Steps:
     - <引き継ぎ先で実施してほしい作業>
   - Risks / Notes:
     - <設計判断・注意点>
   ```

4. 機密情報や個人の GPX データを引き継ぎメモに含めないこと。

## C. 引き継ぎを受けて再開するとき

1. `.agents/handoff.local.md` が存在すれば読み、`git status --short` と `git log -n 5 --oneline` で現在地を照合する。
2. 引き継ぎメモと実際の git 状態に差分がある場合は、git の実状態を正として差分を確認する。
3. 作業完了後、役目を終えた `.agents/handoff.local.md` は更新または削除する。
