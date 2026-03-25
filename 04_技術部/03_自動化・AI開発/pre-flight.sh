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

# 4. Notionネタ帳「✅ 採用」一覧
echo "--- 4. Notionネタ帳：次の執筆候補（✅ 採用） ---"
NOTION_API_KEY=$(grep '^NOTION_API_KEY=' "$PROJECT_DIR/.env" 2>/dev/null | cut -d'=' -f2 || true)
NOTION_DB_ID="21411cb92f5d47bd8ea0bde2fd3fd217"

if [ -n "$NOTION_API_KEY" ]; then
  NOTION_RESPONSE=$(curl -s -X POST \
    "https://api.notion.com/v1/databases/$NOTION_DB_ID/query" \
    -H "Authorization: Bearer $NOTION_API_KEY" \
    -H "Notion-Version: 2022-06-28" \
    -H "Content-Type: application/json" \
    -d '{
      "filter": {
        "property": "ステータス",
        "select": {
          "equals": "✅ 採用"
        }
      },
      "sorts": [
        {
          "property": "追加日",
          "direction": "ascending"
        }
      ]
    }' 2>/dev/null)

  # レスポンスからネタ一覧を抽出
  NETA_LIST=$(echo "$NOTION_RESPONSE" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    results = data.get('results', [])
    if not results:
        print('  （✅ 採用のネタはありません）')
    else:
        for i, r in enumerate(results, 1):
            props = r.get('properties', {})
            # タイトル
            title_arr = props.get('ネタ', {}).get('title', [])
            title = title_arr[0]['plain_text'] if title_arr else '（無題）'
            # カテゴリ
            cat_obj = props.get('カテゴリ', {}).get('select')
            cat = cat_obj['name'] if cat_obj else '-'
            # コンテンツ方針
            cp_obj = props.get('コンテンツ方針', {}).get('select')
            cp = cp_obj['name'] if cp_obj else '-'
            # メモ
            memo_arr = props.get('メモ', {}).get('rich_text', [])
            memo = memo_arr[0]['plain_text'][:40] if memo_arr else ''
            # ページID（ステータス更新用）
            page_id = r.get('id', '')
            print(f'  {i}. {title}')
            print(f'     カテゴリ: {cat} | 方針: {cp}')
            if memo:
                print(f'     メモ: {memo}')
            print(f'     ID: {page_id}')
except Exception as e:
    print(f'  ⚠️ パースエラー: {e}')
" 2>/dev/null)

  if echo "$NOTION_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if 'results' in d else 1)" 2>/dev/null; then
    NETA_COUNT=$(echo "$NOTION_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('results',[])))" 2>/dev/null)
    echo "✅ 採用ネタ: ${NETA_COUNT}件"
    echo "$NETA_LIST"
  else
    echo "❌ Notion API: クエリ失敗"
    echo "   レスポンス: $(echo "$NOTION_RESPONSE" | head -c 200)"
  fi
else
  echo "⚠️ NOTION_API_KEY が .env に未設定"
  echo "   設定手順: https://www.notion.so/my-integrations でIntegration作成"
  echo "   → .env に NOTION_API_KEY=secret_xxxx を追加"
  echo "   → ネタ帳DBにIntegrationを接続（Share → Invite）"
  echo ""
  echo "   代替: Notion上の「✅ 採用ネタ（次の執筆候補）」ビューを直接確認"
  echo "   https://www.notion.so/21411cb92f5d47bd8ea0bde2fd3fd217?v=32ea1da6edc381718ed6000cdaf17f7f"
fi
echo ""

# 5. Gemini MCP接続テスト（簡易）
echo "--- 5. Gemini API疎通テスト ---"
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
