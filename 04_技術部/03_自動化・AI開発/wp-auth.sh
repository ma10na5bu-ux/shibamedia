#!/bin/bash
# WordPress API認証ヘルパー
# .envから認証情報を読み込み、curlに渡す
# 使い方: source wp-auth.sh && curl -u "$WP_AUTH" "https://shiba-with.com/wp-json/wp/v2/posts"

ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.env"

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
