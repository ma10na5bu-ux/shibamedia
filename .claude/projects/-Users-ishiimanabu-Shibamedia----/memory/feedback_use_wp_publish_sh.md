---
name: WordPress投稿はwp-publish.shを使う
description: 記事のWordPress投稿時は必ずwp-publish.shを使う。手動HTML変換は本文消失事故の原因になる
type: feedback
---

## ルール

WordPress記事投稿は **必ず `wp-publish.sh` を使う**。手動でMarkdown→HTML変換してcurlで投稿しない。

```bash
bash 04_技術部/03_自動化・AI開発/wp-publish.sh "記事ファイル.md" -m メディアID
```

### wp-publish.shがやってくれること
- フロントマター（YAML/HTMLコメント）からメタデータ自動抽出
- スラッグ重複チェック
- Markdown→HTML変換（テーブル・リスト・見出し・インライン書式すべて対応）
- WP認証の読み込み（wp-auth.sh経由）
- API投稿＋結果表示

### 画像アップロード・アイキャッチ設定は別途curlで実行
wp-publish.shは `-m MEDIA_ID` でアイキャッチを設定できるが、画像のアップロード自体は事前にcurlで行う。

## 理由（2026-03-28）

手動でPython使ってMarkdown→HTMLを変換したところ、変換ロジックのバグで記事本文が参考文献のみになり、空の記事が公開されてしまった。wp-publish.shの変換ロジックは検証済みで安全。
