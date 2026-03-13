#!/usr/bin/env node
/**
 * SWELL WordPress 最適化設定チェック＆実行スクリプト
 * 参考: https://webnote-plus.com/swell-default-settings/
 *
 * 使い方:
 *   node swell-optimize.js           # チェックリスト表示
 *   node swell-optimize.js --apply   # 自動設定可能な項目を適用
 */

require('dotenv').config({ path: '../../../.env' });

const WP_URL = process.env.WP_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

const credentials = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
const authHeader = `Basic ${credentials}`;

async function wpRequest(path, method = 'GET', body = null) {
  const url = `${WP_URL}/index.php?rest_route=${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

async function checkBasicSettings() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 WordPress 基本設定チェック');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const settings = await wpRequest('/wp/v2/settings');

  console.log(`サイト名    : ${settings.title || '未設定'}`);
  console.log(`キャッチフレーズ: ${settings.description || '未設定（要設定）'}`);
  console.log(`サイトURL   : ${settings.url}`);
  console.log(`タイムゾーン: ${settings.timezone_string || settings.gmt_offset}`);
  console.log(`投稿フォーマット: ${settings.default_post_format || 'standard'}`);
  console.log('');
}

async function checkPlugins() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔌 推奨プラグイン チェックリスト（手動確認）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const recommended = [
    { name: 'SEO SIMPLE PACK', slug: 'seo-simple-pack', reason: 'SWELL公式推奨SEOプラグイン' },
    { name: 'Contact Form 7', slug: 'contact-form-7', reason: 'お問い合わせフォーム' },
    { name: 'XML Sitemap & Google News', slug: 'xml-sitemap-feed', reason: 'サイトマップ自動生成' },
    { name: 'Akismet Anti-Spam', slug: 'akismet', reason: 'スパムコメント対策' },
    { name: 'Insert Headers and Footers', slug: 'insert-headers-and-footers', reason: 'GA4/サチコタグ設置' },
    { name: 'WebP Express', slug: 'webp-express', reason: '画像をWebP変換して高速化' },
    { name: 'WP Fastest Cache', slug: 'wp-fastest-cache', reason: 'キャッシュによる高速化' },
    { name: 'Broken Link Checker', slug: 'broken-link-checker', reason: 'リンク切れ検出' },
  ];

  recommended.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name}`);
    console.log(`   理由: ${p.reason}`);
    console.log(`   インストール: ${WP_URL}/wp-admin/plugin-install.php?s=${p.slug}&tab=search&type=term`);
    console.log('');
  });
}

function showSwellSettings() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚙️  SWELL 初期設定チェックリスト');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const swellAdmin = `${WP_URL}/wp-admin/admin.php?page=swell_settings`;

  const settings = [
    {
      category: '🎨 サイト基本',
      url: `${WP_URL}/wp-admin/customize.php`,
      items: [
        'サイトのタイトル・キャッチフレーズを設定',
        'ファビコン（32×32px）を設定',
        'OGP画像（1200×630px）を設定',
        'サイトロゴを設定',
      ],
    },
    {
      category: '📊 ツール・解析',
      url: `${swellAdmin}&tab=tool`,
      items: [
        `Googleアナリティクス ID: G-56CEBR8HLZ を入力`,
        'Search Console の認証コードを入力',
        'Googleタグマネージャー IDを入力（使う場合）',
      ],
    },
    {
      category: '🔍 SEO設定（SEO SIMPLE PACK）',
      url: `${WP_URL}/wp-admin/admin.php?page=ssp_settings`,
      items: [
        'トップページのtitle・meta descriptionを設定',
        'OGP設定を有効化',
        'Twitter Card タイプを設定（summary_large_image）',
        'noindex 設定（タグページ・作者ページ）',
        'パンくずリストを有効化',
      ],
    },
    {
      category: '⚡ 表示高速化',
      url: `${swellAdmin}&tab=performance`,
      items: [
        'LazyLoad（画像の遅延読み込み）を有効化',
        'CSSの結合・最小化を有効化',
        'JSの遅延読み込みを有効化',
        'WebPキャッシュを有効化（WebP Expressプラグイン）',
        'キャッシュプラグインを設定（WP Fastest Cache）',
      ],
    },
    {
      category: '🔒 セキュリティ・その他',
      url: `${WP_URL}/wp-admin/options-general.php`,
      items: [
        'WordPressアドレスとサイトアドレスをhttpsで統一',
        'コメント設定（スパム対策・Akismet連携）',
        'ユーザー名をメールアドレス以外に変更',
        'ログインURL変更（WPS Hide Login等）',
      ],
    },
    {
      category: '🗺️ サイトマップ',
      url: `${WP_URL}/wp-sitemap.xml`,
      items: [
        'WordPress標準サイトマップを確認',
        'Search Consoleにサイトマップを送信',
        `送信URL: ${WP_URL}/wp-sitemap.xml`,
      ],
    },
    {
      category: '📱 SNS連携',
      url: `${swellAdmin}&tab=sns`,
      items: [
        'X（Twitter）URLを設定',
        'Instagramアカウントを設定',
        'シェアボタンの表示設定',
        'フォローボタンの表示設定',
      ],
    },
  ];

  settings.forEach(section => {
    console.log(`\n${section.category}`);
    console.log(`管理画面: ${section.url}`);
    section.items.forEach(item => {
      console.log(`  □ ${item}`);
    });
  });

  console.log('');
}

async function applyBasicSettings() {
  console.log('\n🔧 自動設定を適用中...');

  // タイムゾーンをAsia/Tokyoに設定
  try {
    const res = await wpRequest('/wp/v2/settings', 'POST', {
      timezone_string: 'Asia/Tokyo',
      date_format: 'Y年n月j日',
      time_format: 'H:i',
      start_of_week: 1, // 月曜日始まり
      default_comment_status: 'closed', // デフォルトでコメント無効
      default_ping_status: 'closed',
    });

    if (res.timezone_string === 'Asia/Tokyo') {
      console.log('✅ タイムゾーン: Asia/Tokyo');
    }
    if (res.default_comment_status === 'closed') {
      console.log('✅ デフォルトコメント: 無効化');
    }
    console.log('✅ 日付フォーマット: Y年n月j日');
    console.log('✅ 週の開始日: 月曜日');
  } catch (err) {
    console.log('⚠️  基本設定の自動適用に失敗:', err.message);
  }
}

async function main() {
  const applyMode = process.argv.includes('--apply');

  console.log('');
  console.log('🐕 Shibamedia WordPress / SWELL 最適化ツール');
  console.log(`対象: ${WP_URL}`);

  await checkBasicSettings();
  showSwellSettings();
  await checkPlugins();

  if (applyMode && WP_USERNAME && WP_APP_PASSWORD) {
    await applyBasicSettings();
  } else if (applyMode) {
    console.log('⚠️  .env に WP_USERNAME と WP_APP_PASSWORD を設定してください');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 自動適用: node swell-optimize.js --apply');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error);
