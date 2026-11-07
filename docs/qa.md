# 検証記録

検証対象：合成GPXの解析、状態・速度表示、滑走選択、地図／グラフ／スライダー連動、入力エラー、レスポンシブ。

- 解析の期待値と異常系をVitestで検証。
- Next.jsの静的出力でWorkerがTypeScriptのまま配信される問題を修正。esbuildで独立したブラウザ用JSにバンドルし、バンドル自体の実行テストを追加。
- 管理環境の `sites-preview` は、Next.js向け引数を修正後も `relay could not open browser port 4173: timed out waiting for relay readiness` により接続できない。
- 生成コンセプトを参照し、実装画面との最終比較は配布版で確認する。

このファイルは最終検証後に更新します。
