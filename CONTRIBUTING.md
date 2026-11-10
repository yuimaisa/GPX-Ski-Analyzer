# コントリビューション

不具合報告、解析方法の改善、ドキュメントの修正を歓迎します。まず既存のIssue・Pull Requestを確認し、変更の目的と再現方法を共有してください。

## 開発

Node.js 22.12以上とnpmを使用します。APIキーや外部サービスのアカウントは不要です。

```sh
npm ci
npm run dev
```

変更後は次を実行してください。

```sh
npm run typecheck
npm audit --audit-level=moderate
npm run lint
npm run format:check
npm test
npm run build
npm run deploy -- --dry-run
```

整形は `npm run format`。依存関係を変更した場合は `package-lock.json` も更新してください。解析ロジックを変更する場合は合成データによる回帰テストと [解析アルゴリズム](docs/algorithm.md) も更新します。UIを変更する場合はPCとスマートフォンで確認し、合成サンプルの画面を添えてください。

## 個人情報・認証情報

- 実際のGPXには行動履歴が含まれます。Issue、Pull Request、スクリーンショットには個人の座標・日時・ファイル名を掲載せず、合成データで再現してください。
- GPXは原則 `.gitignore` で除外し、同梱の `public/samples/hakuba-synthetic.gpx` だけを例外にしています。新しい公開サンプルは、架空のデータであることを明記し、内容を確認してから追加してください。
- `.env`、Cloudflareの `.dev.vars`、APIトークン、秘密鍵、環境固有の設定はコミットしないでください。`NEXT_PUBLIC_` で始まる値はブラウザへ公開されます。
- GPXのアップロード、永続保存、アクセス解析を追加する場合は、プライバシーへの影響と説明文の変更を提案に含めてください。

脆弱性は公開Issueに書かず、[SECURITY.md](SECURITY.md) の手順で報告してください。コントリビューションにはリポジトリの [MITライセンス](LICENSE) が適用されます。
