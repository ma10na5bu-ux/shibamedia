#!/bin/bash
# wp-publish.sh — WordPress記事投稿スクリプト
# スラッグ重複チェック＋Python経由のJSON構築で安全に投稿
#
# 使い方:
#   bash wp-publish.sh <記事MDファイルパス> [-m MEDIA_ID] [-d|--draft]
#
# MDファイルのメタデータ形式（どちらでも対応）:
#   HTMLコメント形式:
#     <!--
#     title: 記事タイトル
#     slug: english-slug
#     categories: 17
#     meta_description: メタディスクリプション
#     -->
#
#   YAML frontmatter形式:
#     ---
#     title: "記事タイトル"
#     slug: english-slug
#     categories: [17]
#     description: メタディスクリプション
#     ---

set -euo pipefail

# --- 引数解析 ---
MD_FILE=""
MEDIA_ID=""
POST_STATUS="publish"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m)
      MEDIA_ID="$2"
      shift 2
      ;;
    -d|--draft)
      POST_STATUS="draft"
      shift
      ;;
    -*)
      echo "ERROR: 不明なオプション: $1" >&2
      exit 1
      ;;
    *)
      MD_FILE="$1"
      shift
      ;;
  esac
done

if [ -z "$MD_FILE" ]; then
  echo "使い方: bash wp-publish.sh <記事MDファイルパス> [-m MEDIA_ID]" >&2
  exit 1
fi

if [ ! -f "$MD_FILE" ]; then
  echo "ERROR: ファイルが見つかりません: $MD_FILE" >&2
  exit 1
fi

# --- WP認証読み込み ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/wp-auth.sh"

# --- メタデータ抽出（Python） ---
META_JSON=$(MD_FILE="$MD_FILE" python3 << 'PYEOF'
import os, re, json

md_path = os.environ["MD_FILE"]
with open(md_path, "r", encoding="utf-8") as f:
    content = f.read()

meta = {"title": "", "slug": "", "categories": "", "meta_description": ""}

# HTMLコメント形式: <!-- ... -->
html_match = re.search(r'<!--\s*\n(.*?)\n\s*-->', content, re.DOTALL)
if html_match:
    block = html_match.group(1)
    for line in block.strip().split("\n"):
        line = line.strip()
        if ":" in line:
            key, val = line.split(":", 1)
            key = key.strip().lower()
            val = val.strip()
            if key == "title":
                meta["title"] = val
            elif key == "slug":
                meta["slug"] = val
            elif key == "categories":
                meta["categories"] = val
            elif key in ("meta_description", "description"):
                meta["meta_description"] = val

# YAML frontmatter形式（HTMLコメントでslugが見つからなかった場合のみ）
yaml_match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
if yaml_match and not meta["slug"]:
    block = yaml_match.group(1)
    for line in block.strip().split("\n"):
        line = line.strip()
        if ":" in line:
            key, val = line.split(":", 1)
            key = key.strip().lower()
            val = val.strip().strip('"').strip("'")
            if key == "title":
                meta["title"] = val
            elif key == "slug":
                meta["slug"] = val
            elif key == "categories":
                nums = re.findall(r'\d+', val)
                meta["categories"] = ",".join(nums) if nums else val
            elif key in ("meta_description", "description"):
                meta["meta_description"] = val

print(json.dumps(meta, ensure_ascii=False))
PYEOF
)

TITLE=$(echo "$META_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['title'])")
SLUG=$(echo "$META_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['slug'])")
CATEGORIES=$(echo "$META_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['categories'])")
META_DESC=$(echo "$META_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['meta_description'])")

# バリデーション
if [ -z "$TITLE" ]; then
  echo "ERROR: titleが見つかりません。MDファイルのメタデータを確認してください。" >&2
  exit 1
fi
if [ -z "$SLUG" ]; then
  echo "ERROR: slugが見つかりません。MDファイルのメタデータを確認してください。" >&2
  exit 1
fi

echo "=== メタデータ確認 ==="
echo "  title: $TITLE"
echo "  slug: $SLUG"
echo "  categories: $CATEGORIES"
echo "  meta_description: ${META_DESC:0:60}..."
echo ""

# --- スラッグ重複チェック ---
echo "=== スラッグ重複チェック ==="
EXISTING=$(curl -s -u "$WP_AUTH" \
  "${WP_URL}/wp-json/wp/v2/posts?slug=${SLUG}&status=publish,draft,pending,private,future" \
  -H "Content-Type: application/json")

EXISTING_COUNT=$(echo "$EXISTING" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        print(len(data))
    else:
        print(0)
except:
    print(0)
")

if [ "$EXISTING_COUNT" -gt 0 ]; then
  EXISTING_INFO=$(echo "$EXISTING" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data:
    print(f\"  ID: {p['id']} | status: {p['status']} | slug: {p['slug']} | title: {p['title']['rendered']}\")
")
  echo "ERROR: スラッグ「${SLUG}」は既に使用されています！" >&2
  echo "" >&2
  echo "既存記事:" >&2
  echo "$EXISTING_INFO" >&2
  echo "" >&2
  echo "対応方法:" >&2
  echo "  1. スラッグを変更する" >&2
  echo "  2. 既存記事を削除/更新する" >&2
  exit 1
fi

echo "  OK: スラッグ「${SLUG}」は使用可能です。"
echo ""

# --- Markdown→HTML変換 & JSON構築 & 投稿（Python一括処理） ---
echo "=== WordPress投稿中 ==="

RESULT=$(MD_FILE="$MD_FILE" WP_URL="$WP_URL" WP_AUTH="$WP_AUTH" \
  PUB_TITLE="$TITLE" PUB_SLUG="$SLUG" PUB_CATEGORIES="$CATEGORIES" \
  PUB_META_DESC="$META_DESC" PUB_MEDIA_ID="$MEDIA_ID" \
  PUB_STATUS="$POST_STATUS" \
  python3 << 'PYEOF'
import sys, re, json, urllib.request, urllib.error, base64, os

md_path = os.environ["MD_FILE"]
wp_url = os.environ["WP_URL"]
wp_auth = os.environ["WP_AUTH"]
title = os.environ["PUB_TITLE"]
slug = os.environ["PUB_SLUG"]
categories_str = os.environ.get("PUB_CATEGORIES", "")
meta_desc = os.environ.get("PUB_META_DESC", "")
media_id = os.environ.get("PUB_MEDIA_ID", "")
post_status = os.environ.get("PUB_STATUS", "publish")

# --- MDファイル読み込み（メタデータ部分を除去） ---
with open(md_path, "r", encoding="utf-8") as f:
    content = f.read()

# HTMLコメント除去
content = re.sub(r'<!--\s*\n.*?\n\s*-->', '', content, count=1, flags=re.DOTALL).strip()
# YAML frontmatter除去
content = re.sub(r'^---\s*\n.*?\n---', '', content, count=1, flags=re.DOTALL).strip()

# --- Markdown → HTML 変換 ---
def md_to_html(md_text):
    lines = md_text.split('\n')
    html_lines = []
    in_table = False
    table_rows = []
    in_ul = False
    in_ol = False

    def flush_table():
        nonlocal table_rows, in_table
        if not table_rows:
            return ""
        result = '<figure class="wp-block-table"><table><thead><tr>'
        headers = table_rows[0]
        for h in headers:
            result += f'<th>{h.strip()}</th>'
        result += '</tr></thead><tbody>'
        # セパレータ行（index 1）をスキップ
        for row in table_rows[2:]:
            result += '<tr>'
            for cell in row:
                result += f'<td>{cell.strip()}</td>'
            result += '</tr>'
        result += '</tbody></table></figure>'
        table_rows = []
        in_table = False
        return result

    def flush_list():
        nonlocal in_ul, in_ol
        tag = ""
        if in_ul:
            tag = "</ul>"
            in_ul = False
        elif in_ol:
            tag = "</ol>"
            in_ol = False
        return tag

    def inline_format(text):
        # 太字 **text**
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        # 斜体 *text* （太字マーカーと衝突しないよう）
        text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<em>\1</em>', text)
        # リンク [text](url)
        text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
        # インラインコード `code`
        text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
        return text

    for i, line in enumerate(lines):
        stripped = line.strip()

        # テーブル行
        if stripped.startswith('|') and stripped.endswith('|'):
            if not in_table:
                close = flush_list()
                if close:
                    html_lines.append(close)
                in_table = True
            cells = [c.strip() for c in stripped.strip('|').split('|')]
            table_rows.append(cells)
            continue
        elif in_table:
            html_lines.append(flush_table())

        # 空行
        if not stripped:
            close = flush_list()
            if close:
                html_lines.append(close)
            html_lines.append('')
            continue

        # 見出し（H2〜H6。H1は含めない — SWELLが自動表示）
        heading_match = re.match(r'^(#{2,6})\s+(.+)$', stripped)
        if heading_match:
            close = flush_list()
            if close:
                html_lines.append(close)
            level = len(heading_match.group(1))
            text = inline_format(heading_match.group(2))
            html_lines.append(f'<h{level}>{text}</h{level}>')
            continue

        # 箇条書き（- item / * item）
        ul_match = re.match(r'^[-*]\s+(.+)$', stripped)
        if ul_match:
            if not in_ul:
                close = flush_list()
                if close:
                    html_lines.append(close)
                html_lines.append('<ul>')
                in_ul = True
            html_lines.append(f'<li>{inline_format(ul_match.group(1))}</li>')
            continue

        # 番号付きリスト
        ol_match = re.match(r'^\d+\.\s+(.+)$', stripped)
        if ol_match:
            if not in_ol:
                close = flush_list()
                if close:
                    html_lines.append(close)
                html_lines.append('<ol>')
                in_ol = True
            html_lines.append(f'<li>{inline_format(ol_match.group(1))}</li>')
            continue

        # リスト外の行 → リストを閉じる
        close = flush_list()
        if close:
            html_lines.append(close)

        # 通常の段落
        html_lines.append(f'<p>{inline_format(stripped)}</p>')

    # 末尾のテーブル/リストを閉じる
    if in_table:
        html_lines.append(flush_table())
    close = flush_list()
    if close:
        html_lines.append(close)

    return '\n'.join(html_lines)

html_content = md_to_html(content)

# --- JSON構築 ---
post_data = {
    "title": title,
    "slug": slug,
    "content": html_content,
    "status": post_status,
}

if categories_str:
    cat_ids = [int(c.strip()) for c in categories_str.split(",") if c.strip().isdigit()]
    if cat_ids:
        post_data["categories"] = cat_ids

if meta_desc:
    post_data["meta"] = {"meta_description": meta_desc}

if media_id:
    post_data["featured_media"] = int(media_id)

# --- API投稿 ---
json_bytes = json.dumps(post_data, ensure_ascii=False).encode("utf-8")
auth_b64 = base64.b64encode(wp_auth.encode()).decode()

req = urllib.request.Request(
    f"{wp_url}/wp-json/wp/v2/posts",
    data=json_bytes,
    headers={
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": f"Basic {auth_b64}",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        output = {
            "success": True,
            "id": result["id"],
            "slug": result["slug"],
            "status": result["status"],
            "link": result["link"],
            "title": result["title"]["rendered"],
        }
        print(json.dumps(output, ensure_ascii=False))
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8", errors="replace")
    output = {
        "success": False,
        "status_code": e.code,
        "error": body,
    }
    print(json.dumps(output, ensure_ascii=False))
    sys.exit(1)
PYEOF
)

# --- 結果表示 ---
SUCCESS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success', False))")

if [ "$SUCCESS" = "True" ]; then
  POST_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  POST_SLUG=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['slug'])")
  POST_LINK=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['link'])")
  POST_TITLE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['title'])")

  echo ""
  echo "=== 投稿成功 ==="
  echo "  ID: $POST_ID"
  echo "  タイトル: $POST_TITLE"
  echo "  スラッグ: $POST_SLUG"
  POST_STATUS_RESULT=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  echo "  ステータス: $POST_STATUS_RESULT"
  echo "  URL: $POST_LINK"
  echo ""
  echo "公開するには:"
  echo "  curl -s -u \"\$WP_AUTH\" -X POST \"${WP_URL}/wp-json/wp/v2/posts/${POST_ID}\" -H 'Content-Type: application/json' -d '{\"status\":\"publish\"}'"
else
  echo ""
  echo "=== 投稿失敗 ==="
  echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"  HTTPステータス: {d.get('status_code', 'unknown')}\")
print(f\"  エラー: {d.get('error', 'unknown')}\")
"
  exit 1
fi
