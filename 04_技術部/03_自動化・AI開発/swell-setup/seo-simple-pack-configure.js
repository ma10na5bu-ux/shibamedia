#!/usr/bin/env node
/**
 * SEO SIMPLE PACK 初期設定スクリプト
 * 参考: https://sb-wegazine.net/seosimplepack-wpplugin/
 *
 * 使い方:
 *   node seo-simple-pack-configure.js           # 設定ガイドを表示
 *   node seo-simple-pack-configure.js --check   # 現在の設定を確認
 *   node seo-simple-pack-configure.js --apply   # 自動設定を適用
 */

require('dotenv').config({ path: '../../../.env' });

const WP_URL = process.env.WP_URL || 'https://shiba-with.com';
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;
const GA4_ID = process.env.GA4_MEASUREMENT_ID;

const credentials = WP_USERNAME && WP_APP_PASSWORD
  ? Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64')
  : null;
const authHeader = credentials ? `Basic ${credentials}` : null;

async function wpRequest(path, method = 'GET', body = null) {
  if (!authHeader) throw new Error('認証情報が未設定です（.envを確認）');
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
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

// ─────────────────────────────────────────────
// SEO SIMPLE PACK 推奨設定値
// ─────────────────────────────────────────────
const SSP_RECOMMENDED = {
  // 全体設定
  general: {
    title_separate:            ' | ',     // タイトル区切り文字
    noindex_archive_author:    '1',       // 著者アーカイブをnoindex
    noindex_archive_date:      '1',       // 日付アーカイブをnoindex
    noindex_search_result:     '1',       // 検索結果ページをnoindex
    noindex_404:               '0',       // 404はnoindexしない（任意）
    do_ogp:                    '1',       // OGP有効化
    ogp_card_type:             'summary_large_image', // Xカードタイプ
    ogp_default_img:           '',        // デフォルトOGP画像URL（要設定）
    google_analytics_id:       GA4_ID || '', // GA4 Measurement ID
    google_verification:       '',        // Search Console認証コード（要設定）
  },
  // ホームページSEO
  home: {
    title:       '柴犬といっしょ｜柴犬オーナーのためのメディア',
    description: '柴犬オーナーのためのメディア「柴犬といっしょ」。しつけ・健康・お散歩・グッズ情報を柴犬目線でお届けします。',
    noindex:     '0',
  },
};

// ─────────────────────────────────────────────
// 現在の設定確認
// ─────────────────────────────────────────────
async function checkCurrentSettings() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 SEO SIMPLE PACK 現在の設定確認');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const settings = await wpRequest('/wp/v2/settings');

    // SEO SIMPLE PACKのオプションキー（プラグインがREST公開している場合）
    const sspKeys = Object.keys(settings).filter(k => k.startsWith('ssp_'));

    if (sspKeys.length > 0) {
      console.log('\n✅ SEO SIMPLE PACK の設定（REST API経由）:');
      sspKeys.forEach(k => console.log(`  ${k}: ${JSON.stringify(settings[k])}`));
    } else {
      console.log('\n⚠️  SEO SIMPLE PACK の設定はREST APIで公開されていません');
      console.log('   → 手動設定が必要です（後述のガイドを参照）');
    }

    console.log('\n📋 WordPress基本設定:');
    console.log(`  サイト名: ${settings.title}`);
    console.log(`  キャッチフレーズ: ${settings.description || '（未設定）'}`);
    console.log(`  URL: ${settings.url}`);
  } catch (err) {
    console.log(`❌ 設定確認に失敗: ${err.message}`);
    if (!authHeader) {
      console.log('   → .env に WP_USERNAME と WP_APP_PASSWORD を設定してください');
    }
  }
}

// ─────────────────────────────────────────────
// 自動設定（REST API対応部分のみ）
// ─────────────────────────────────────────────
async function applySettings() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 自動設定を適用中...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // SEO SIMPLE PACKがREST APIにオプションを登録している場合のみ有効
  const payload = {};

  // GA4 IDが設定されている場合
  if (GA4_ID) {
    payload['ssp_settings_general'] = {
      ...SSP_RECOMMENDED.general,
      google_analytics_id: GA4_ID,
    };
  }

  try {
    if (Object.keys(payload).length > 0) {
      const res = await wpRequest('/wp/v2/settings', 'POST', payload);
      console.log('✅ 設定を送信しました');
      const sspKeys = Object.keys(res).filter(k => k.startsWith('ssp_'));
      if (sspKeys.length === 0) {
        console.log('⚠️  SEO SIMPLE PACK の設定はREST API経由では変更できませんでした');
        console.log('   → 下記の手動設定ガイドに従って設定してください');
      } else {
        console.log('✅ SEO SIMPLE PACK 設定を更新しました');
      }
    } else {
      console.log('ℹ️  自動適用できる設定がありません（手動設定ガイドを参照）');
    }
  } catch (err) {
    console.log(`❌ 自動設定に失敗: ${err.message}`);
  }
}

// ─────────────────────────────────────────────
// 手動設定ガイド（メイン）
// ─────────────────────────────────────────────
function showManualGuide() {
  const SSP_URL = `${WP_URL}/wp-admin/admin.php?page=ssp_settings`;

  console.log('\n');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│        SEO SIMPLE PACK 初期設定ガイド（初級編）         │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log(`\n管理画面: ${SSP_URL}\n`);

  const sections = [
    {
      step: 'STEP 1',
      title: '全体設定（一般）',
      url: `${SSP_URL}&tab=general`,
      icon: '⚙️',
      items: [
        { label: 'タイトルの区切り文字', value: ' | ', note: 'サイト名と記事タイトルの間の記号' },
        { label: 'デフォルトOGP画像', value: '1200×630pxの画像URL', note: 'SNSシェア時のサムネイル' },
        { label: 'Googleアナリティクス ID', value: GA4_ID || 'G-XXXXXXXXXX', note: '.envのGA4_MEASUREMENT_IDを使用' },
        { label: 'Google Search Console 認証コード', value: 'HTMLタグのcontent="..."の値', note: 'サーチコンソールで取得' },
      ],
    },
    {
      step: 'STEP 2',
      title: 'noindex 設定（重要）',
      url: `${SSP_URL}&tab=general`,
      icon: '🚫',
      items: [
        { label: '著者アーカイブ', value: 'noindex ON', note: '個人ブログには不要なため' },
        { label: '日付アーカイブ', value: 'noindex ON', note: '重複コンテンツ対策' },
        { label: '検索結果ページ', value: 'noindex ON', note: '重複コンテンツ対策' },
        { label: 'カテゴリー・タグ', value: '任意（コンテンツ充実後にindex推奨）', note: '' },
      ],
    },
    {
      step: 'STEP 3',
      title: 'OGP / SNS設定',
      url: `${SSP_URL}&tab=ogp`,
      icon: '📱',
      items: [
        { label: 'OGP設定', value: '有効にする ✅', note: 'FacebookやXでのシェア品質向上' },
        { label: 'Twitterカードタイプ', value: 'summary_large_image', note: '大きい画像付きカードで表示' },
        { label: 'Facebook App ID', value: '（取得している場合のみ）', note: '' },
      ],
    },
    {
      step: 'STEP 4',
      title: 'トップページのSEO設定',
      url: `${SSP_URL}&tab=home`,
      icon: '🏠',
      items: [
        { label: 'title（タイトルタグ）', value: SSP_RECOMMENDED.home.title, note: '32文字以内' },
        { label: 'meta description', value: SSP_RECOMMENDED.home.description, note: '80〜120文字' },
        { label: 'noindex', value: 'OFF（インデックスさせる）', note: '' },
      ],
    },
    {
      step: 'STEP 5',
      title: '投稿・固定ページの設定',
      url: `${SSP_URL}&tab=post_types`,
      icon: '📝',
      items: [
        { label: '投稿(post) title形式', value: '%title% | 柴犬といっしょ', note: '' },
        { label: '投稿 description形式', value: '%description%（自動抜粋）', note: '' },
        { label: '固定ページ title形式', value: '%title% | 柴犬といっしょ', note: '' },
        { label: 'カテゴリー title形式', value: '%term_title%の記事一覧 | 柴犬といっしょ', note: '' },
      ],
    },
    {
      step: 'STEP 6',
      title: 'サイトマップの確認',
      url: `${WP_URL}/wp-sitemap.xml`,
      icon: '🗺️',
      items: [
        { label: 'WordPress標準サイトマップ', value: `${WP_URL}/wp-sitemap.xml`, note: 'アクセスして確認' },
        { label: 'Search Consoleへ送信', value: 'https://search.google.com/search-console/', note: 'サイトマップ → URLを追加' },
      ],
    },
  ];

  sections.forEach(section => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`${section.icon} ${section.step}: ${section.title}`);
    console.log(`   📌 ${section.url}`);
    console.log('');
    section.items.forEach(item => {
      console.log(`   ▶ ${item.label}`);
      console.log(`     設定値: ${item.value}`);
      if (item.note) console.log(`     補足:   ${item.note}`);
    });
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 設定完了後のチェックリスト');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`□ トップページのtitle/descriptionをブラウザで確認`);
  console.log(`  → ${WP_URL} を開いて <title> タグを確認`);
  console.log(`□ OGPをデバッグツールで確認`);
  console.log(`  → https://developers.facebook.com/tools/debug/`);
  console.log(`  → https://cards-dev.twitter.com/validator`);
  console.log(`□ サイトマップを Search Console に送信`);
  console.log(`  → ${WP_URL}/wp-sitemap.xml`);
  console.log(`□ noindexページがインデックスされていないか確認`);
  console.log(`  → Search Console → URL検査ツール`);
  console.log('');
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const isApply = args.includes('--apply');

  console.log('');
  console.log('🐕 Shibamedia SEO SIMPLE PACK 設定ツール');
  console.log(`対象: ${WP_URL}`);

  if (isCheck) {
    await checkCurrentSettings();
  } else if (isApply) {
    if (!authHeader) {
      console.log('\n❌ .env に WP_USERNAME と WP_APP_PASSWORD を設定してください');
      process.exit(1);
    }
    await applySettings();
    showManualGuide();
  } else {
    showManualGuide();
  }
}

main().catch(console.error);
