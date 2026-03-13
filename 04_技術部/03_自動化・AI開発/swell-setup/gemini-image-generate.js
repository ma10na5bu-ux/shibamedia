#!/usr/bin/env node
/**
 * Gemini Imagen 4 で柴犬記事用アイキャッチ画像を生成し
 * WordPressにアップロードするスクリプト
 *
 * 使い方:
 *   node gemini-image-generate.js "春の柴犬散歩"
 *   node gemini-image-generate.js "春の柴犬散歩" --post-id=8
 */

require('dotenv').config({ path: '../../../.env' });

const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const WP_URL = process.env.WP_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

const articleTitle = process.argv[2];
const postIdArg = process.argv.find(a => a.startsWith('--post-id='));
const postId = postIdArg ? postIdArg.split('=')[1] : null;

if (!articleTitle) {
  console.error('使い方: node gemini-image-generate.js "記事タイトル" [--post-id=ID]');
  process.exit(1);
}

// 記事タイトルから英語プロンプトを生成
function buildPrompt(title) {
  return `A high-quality, warm and heartwarming photograph of a beautiful Shiba Inu dog in a Japanese setting.
Context: ${title}
Style: Natural photography, soft lighting, vibrant colors, 16:9 aspect ratio.
The Shiba Inu should look happy and healthy. Japanese scenery or elements in the background.
No text, no watermarks. Professional blog header image quality.`;
}

async function generateImage(title) {
  console.log(`\n🎨 画像生成中: "${title}"`);

  const prompt = buildPrompt(title);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Gemini API エラー: ${JSON.stringify(data)}`);
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  const b64 = imgPart?.inlineData?.data;
  if (!b64) throw new Error('画像データが取得できませんでした');

  // 一時ファイルに保存
  const tmpPath = path.join('/tmp', `shiba-${Date.now()}.png`);
  fs.writeFileSync(tmpPath, Buffer.from(b64, 'base64'));
  console.log(`✅ 画像生成完了: ${tmpPath}`);
  return tmpPath;
}

async function uploadToWordPress(imagePath, title) {
  if (!WP_USERNAME || !WP_APP_PASSWORD) {
    console.log('⚠️  WP認証情報未設定 → 画像ファイルのみ保存しました');
    console.log(`   保存先: ${imagePath}`);
    return null;
  }

  console.log('📤 WordPressにアップロード中...');
  const credentials = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');

  const imageBuffer = fs.readFileSync(imagePath);
  const filename = `shiba-${title.replace(/[^a-zA-Z0-9ぁ-ん一-龯]/g, '-')}-${Date.now()}.png`;

  const res = await fetch(`${WP_URL}/index.php?rest_route=/wp/v2/media`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'image/png',
    },
    body: imageBuffer,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`WPアップロードエラー: ${JSON.stringify(data)}`);

  console.log(`✅ アップロード完了: ${data.source_url}`);
  return data;
}

async function setFeaturedImage(postId, mediaId) {
  const credentials = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');

  const res = await fetch(`${WP_URL}/index.php?rest_route=/wp/v2/posts/${postId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ featured_media: mediaId }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`アイキャッチ設定エラー: ${JSON.stringify(data)}`);
  console.log(`✅ アイキャッチ画像を設定しました（投稿ID: ${postId}）`);
}

async function main() {
  try {
    const imagePath = await generateImage(articleTitle);
    const media = await uploadToWordPress(imagePath, articleTitle);

    if (media && postId) {
      await setFeaturedImage(postId, media.id);
    } else if (media) {
      console.log(`\n💡 アイキャッチに設定する場合:`);
      console.log(`   node gemini-image-generate.js "${articleTitle}" --post-id=<投稿ID>`);
      console.log(`   メディアID: ${media.id}`);
      console.log(`   URL: ${media.source_url}`);
    }

    // 一時ファイル削除
    fs.unlinkSync(imagePath);
  } catch (err) {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  }
}

main();
