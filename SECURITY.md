# セキュリティ

セキュリティ修正は `main` ブランチの最新コードを対象とします。過去のバージョンへの修正提供は保証しません。

## 脆弱性の報告

個人のGPX、認証情報、悪用可能な詳細を公開IssueやPull Requestへ投稿しないでください。

GitHubの [Security → Advisories](https://github.com/yuimaisa/GPX-Ski-Analyzer/security/advisories) に **Report a vulnerability** が表示される場合は、非公開レポートを作成してください。表示されない場合は、機密情報を含めず、非公開の報告窓口の案内を求めるIssueを作成してください。

再現に必要なバージョン、環境、手順、想定される影響を記載し、GPXは最小限の合成データに置き換えてください。回答期限や報奨金は定めていません。

## データと外部通信

GPXの解析はWeb Workerを使ってブラウザ内で行い、ファイルや解析結果をサーバーに送信・永続保存しません。背景地図の取得では表示範囲とIPアドレスがOpenStreetMapへ送られます。詳細は [README](README.md#精度とプライバシー) を参照してください。

## リポジトリ所有者向け

公開前にGitHubのセキュリティ設定で **Private vulnerability reporting**、**Dependabot alerts**、利用可能な **Secret scanning / Push protection** を有効にしてください。設定ファイルだけではこれらのGitHub設定は有効になりません。

認証情報を誤ってコミットした場合は、ファイル削除だけで済ませず、発行元で失効・再発行してください。過去のコミットにも情報が残るため、公開前にはGit履歴も確認します。
