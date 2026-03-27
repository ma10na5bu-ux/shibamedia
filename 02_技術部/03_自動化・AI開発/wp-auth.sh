#!/bin/bash
# WordPress API認証ヘルパー
# .envから認証情報を読み込み、curlに渡す
# 使い方: source wp-auth.sh && curl -u "$WP_AUTH" "https://shiba-with.com/wp-json/wp/v2/posts"

# プロジェクトルートを特定（BASH_SOURCEが効かない環境向けにフォールバック）
_SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  _SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [ -n "$_SCRIPT_DIR" ]; then
  PROJECT_ROOT="$(cd "$_SCRIPT_DIR/../.." && pwd)"
else
  # フォールバック: 絶対パスで指定
  PROJECT_ROOT="/Users/ishiimanabu/Shibamedia株式会社"
fi
unset _SCRIPT_DIR

ENV_FILE="$PROJECT_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  return 1 2>/dev/null || exit 1
fi

WP_USERNAME=$(grep '^WP_USERNAME=' "$ENV_FILE" | cut -d'=' -f2)
WP_APP_PASSWORD=$(grep '^WP_APP_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2)

if [ -z "$WP_USERNAME" ] || [ -z "$WP_APP_PASSWORD" ]; then
  echo "ERROR: WP_USERNAME or WP_APP_PASSWORD not set in .env" >&2
  return 1 2>/dev/null || exit 1
fi

export WP_AUTH="$WP_USERNAME:$WP_APP_PASSWORD"
export WP_URL="https://shiba-with.com"
