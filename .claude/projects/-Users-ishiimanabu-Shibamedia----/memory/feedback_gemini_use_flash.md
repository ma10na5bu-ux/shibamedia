---
name: Geminiレビューは必ずFlashモデルを使う
description: Gemini MCPでレビュー実行時、gemini-analyze-textではなくgemini-query(model:flash)を使う。Pro模型は無料枠レート制限に頻繁に引っかかるため
type: feedback
---

## ルール

GeminiレビューをMCP経由で実行するとき：

- **使うツール**: `gemini-query`（model: `flash`、thinkingLevel: `low`）
- **使わない**: `gemini-analyze-text`（デフォルトがProモデルで無料枠レート制限に引っかかる）

## 理由

`gemini-analyze-text` はProモデルがデフォルトで、無料枠の日次制限（0トークン）に達してエラーになる。毎回リトライが発生して社長を待たせていた。`gemini-query` でFlash指定すれば無料枠250リクエスト/日で十分足りる。
