#!/bin/bash
# 記事作成パイプライン プリフライトチェック
# 記事執筆前に実行し、必要な情報を事前取得する
# 使い方: bash pre-flight.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== プリフライトチェック ==="
echo ""

# 1. WP認証テスト
echo "--- 1. WordPress API認証テスト ---"
source "$SCRIPT_DIR/wp-auth.sh"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u "$WP_AUTH" "$WP_URL/wp-json/wp/v2/posts?per_page=1&_fields=id")
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ WordPress API: 接続OK"
else
  echo "❌ WordPress API: 認証失敗 (HTTP $HTTP_CODE)"
  echo "   .envのWP_USERNAME / WP_APP_PASSWORDを確認してください"
fi
echo ""

# 2. 公開済み記事一覧（内部リンク候補）
echo "--- 2. 公開済み記事一覧（内部リンク候補） ---"
LINK_CANDIDATES=$(curl -s -u "$WP_AUTH" "$WP_URL/wp-json/wp/v2/posts?per_page=100&status=publish&_fields=slug,title" | \
  python3 -c "import json,sys; posts=json.load(sys.stdin); [print(f'  /{p[\"slug\"]}/  {p[\"title\"][\"rendered\"]}') for p in posts]" 2>/dev/null)

if [ -n "$LINK_CANDIDATES" ]; then
  LINK_COUNT=$(echo "$LINK_CANDIDATES" | wc -l | tr -d ' ')
  echo "✅ 公開済み記事: ${LINK_COUNT}本"
  echo "$LINK_CANDIDATES"
else
  echo "⚠️ 記事一覧の取得に失敗"
fi
echo ""

# 3. カテゴリ一覧
echo "--- 3. WordPressカテゴリ一覧 ---"
curl -s -u "$WP_AUTH" "$WP_URL/wp-json/wp/v2/categories?per_page=50&_fields=id,name" | \
  python3 -c "import json,sys; cats=json.load(sys.stdin); [print(f'  ID:{c[\"id\"]:3d}  {c[\"name\"]}') for c in cats]" 2>/dev/null
echo ""

# 4. Gemini MCP接続テスト（簡易）
echo "--- 4. Gemini API疎通テスト ---"
GEMINI_KEY=$(grep '^GEMINI_API_KEY=' "$PROJECT_DIR/.env" | cut -d'=' -f2)
if [ -n "$GEMINI_KEY" ]; then
  GEMINI_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_KEY" 2>/dev/null)
  if [ "$GEMINI_CODE" = "200" ]; then
    echo "✅ Gemini API: 接続OK（キー有効）"
  else
    echo "❌ Gemini API: 接続失敗 (HTTP $GEMINI_CODE)"
    echo "   .envのGEMINI_API_KEYを確認してください"
  fi
else
  echo "⚠️ GEMINI_API_KEY が .env に未設定"
fi
echo ""

echo "=== プリフライトチェック完了 ==="
