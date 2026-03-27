---
name: GeminiレビューのモデルとAPI呼び出し方法
description: Geminiレビューはcurl直接呼び出しでgemini-2.5-flashを使う。MCP経由・gemini-2.0-flashは使わない
type: feedback
---

## ルール

GeminiレビューはMCP経由ではなく **curl直接呼び出し** で実行する。

```bash
export $(grep GEMINI_API_KEY .env | xargs)
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg text "$PROMPT" '{"contents":[{"parts":[{"text":$text}]}]}')" \
  | jq -r '.candidates[0].content.parts[0].text'
```

### モデル選択
- **使う**: `gemini-2.5-flash`（安定・高品質・無料枠あり）
- **使わない**: `gemini-2.0-flash`（2026-03-28時点で無料枠クォータ0に到達、429エラー頻発）
- **使わない**: Gemini MCP（`gemini-query`等）— MCP接続が不安定でツール検出に時間がかかる

## 理由（2026-03-28更新）

- gemini-2.0-flashの無料枠が枯渇し429エラーが頻発。gemini-2.5-flashは同日正常に動作
- Gemini MCPはツール検出（ToolSearch）で見つからないケースがあり、curl直接の方が確実
- curl直接なら認証・モデル指定・エラーハンドリングが1コマンドで完結する
