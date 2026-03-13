/**
 * Pexels 画像取得・WordPress アップロードスクリプト
 * 無料・高品質・帰属表示不要（Pexels利用規約準拠）
 *
 * 使い方:
 *   node pexels-image-fetcher.js <検索キーワード> [--upload] [--set-featured <post-id>]
 *
 * 例:
 *   node pexels-image-fetcher.js "shiba inu spring"
 *   node pexels-image-fetcher.js "柴犬 花見" --upload
 *   node pexels-image-fetcher.js "shiba inu" --upload --set-featured 8
 *
 * 前提: PEXELS_API_KEY を .env に設定
 * 取得先: https://www.pexels.com/api/
 */

require("dotenv").config({ quiet: true });
const https = require("https");
const fs = require("fs");
const path = require("path");

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const WP_URL = process.env.WP_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

// ────────────────────────────────────────────
// HTTP ユーティリティ
// ────────────────────────────────────────────
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      // リダイレクト追跡
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on("error", reject);
  });
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        try { resolve({ status: res.statusCode, body: JSON.parse(buf.toString()) }); }
        catch { resolve({ status: res.statusCode, body: buf.toString() }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ────────────────────────────────────────────
// Pexels API: 画像検索
// ────────────────────────────────────────────
async function searchPexels(query, count = 5) {
  if (!PEXELS_API_KEY) {
    throw new Error("PEXELS_API_KEY が .env に設定されていません\n取得先: https://www.pexels.com/api/");
  }

  const encodedQuery = encodeURIComponent(query);
  const url = `https://api.pexels.com/v1/search?query=${encodedQuery}&per_page=${count}&orientation=landscape`;

  const res = await httpsGet(url, { Authorization: PEXELS_API_KEY });
  if (res.status !== 200) {
    throw new Error(`Pexels API エラー (HTTP ${res.status}): ${res.body.toString()}`);
  }

  const data = JSON.parse(res.body.toString());
  return data.photos || [];
}

// ────────────────────────────────────────────
// 画像ダウンロード
// ────────────────────────────────────────────
async function downloadImage(photoUrl, savePath) {
  const res = await httpsGet(photoUrl);
  if (res.status !== 200) throw new Error(`ダウンロード失敗 (HTTP ${res.status})`);
  fs.writeFileSync(savePath, res.body);
}

// ────────────────────────────────────────────
// WordPress メディアライブラリにアップロード
// ────────────────────────────────────────────
async function uploadToWordPress(imagePath, altText, caption) {
  const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString("base64");
  const imageBuffer = fs.readFileSync(imagePath);
  const filename = path.basename(imagePath);
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  const mimeType = mimeTypes[ext] || "image/jpeg";

  const url = new URL("/index.php", WP_URL);
  url.searchParams.set("rest_route", "/wp/v2/media");

  const result = await httpsRequest({
    hostname: url.hostname,
    path: url.pathname + "?" + url.searchParams.toString(),
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": mimeType,
      "Content-Length": imageBuffer.length,
    },
  }, imageBuffer);

  if (result.status !== 201) {
    throw new Error(`WP アップロード失敗 (HTTP ${result.status}): ${JSON.stringify(result.body).slice(0, 200)}`);
  }

  const mediaId = result.body.id;

  // alt・キャプション更新
  await httpsRequest({
    hostname: url.hostname,
    path: `/index.php?rest_route=/wp/v2/media/${mediaId}`,
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  }, JSON.stringify({
    alt_text: altText,
    caption: caption,
  }));

  return { id: mediaId, url: result.body.source_url, guid: result.body.guid?.rendered };
}

// ────────────────────────────────────────────
// 投稿のアイキャッチ画像を設定
// ────────────────────────────────────────────
async function setFeaturedImage(postId, mediaId) {
  const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString("base64");
  const url = new URL("/index.php", WP_URL);
  url.searchParams.set("rest_route", `/wp/v2/posts/${postId}`);

  const body = JSON.stringify({ featured_media: mediaId });
  const result = await httpsRequest({
    hostname: url.hostname,
    path: url.pathname + "?" + url.searchParams.toString(),
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  }, body);

  if (result.status !== 200) {
    throw new Error(`アイキャッチ設定失敗 (HTTP ${result.status}): ${JSON.stringify(result.body).slice(0, 200)}`);
  }
  return result.body;
}

// ────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("使い方: node pexels-image-fetcher.js <検索キーワード> [--upload] [--set-featured <post-id>]");
    process.exit(1);
  }

  const query = args[0];
  const shouldUpload = args.includes("--upload");
  const featuredIdx = args.indexOf("--set-featured");
  const featuredPostId = featuredIdx !== -1 ? args[featuredIdx + 1] : null;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(` Pexels 画像取得`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`キーワード: ${query}`);
  console.log(`アップロード: ${shouldUpload ? "する" : "しない（ローカル保存のみ）"}`);
  if (featuredPostId) console.log(`アイキャッチ設定: 投稿ID ${featuredPostId}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // 1. Pexels検索
  process.stdout.write("🔍 Pexels で画像を検索中...");
  const photos = await searchPexels(query, 5);
  if (photos.length === 0) {
    console.log("\n❌ 画像が見つかりませんでした。キーワードを変えて試してください。");
    process.exit(1);
  }
  console.log(` ${photos.length}件見つかりました\n`);

  // 最初の写真を選択（最高品質）
  const photo = photos[0];
  const imageUrl = photo.src.large2x || photo.src.large || photo.src.original;
  const photographer = photo.photographer;
  const photoPageUrl = photo.url;

  console.log(`📸 選択した写真:`);
  console.log(`   撮影者: ${photographer}`);
  console.log(`   ページ: ${photoPageUrl}`);
  console.log(`   サイズ: ${photo.width}x${photo.height}`);

  // 2. ダウンロード
  const saveDir = path.join(__dirname, "downloaded-images");
  if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

  const ext = imageUrl.includes(".webp") ? ".webp" : ".jpg";
  const safeName = query.replace(/[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9faf]/g, "-").slice(0, 40);
  const filename = `pexels-${Date.now()}-${safeName}${ext}`;
  const savePath = path.join(saveDir, filename);

  process.stdout.write("\n⬇️  画像をダウンロード中...");
  await downloadImage(imageUrl, savePath);
  console.log(` 完了 → ${filename}`);

  // 3. WordPress アップロード
  if (shouldUpload) {
    if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
      console.error("❌ .env に WP_URL / WP_USERNAME / WP_APP_PASSWORD が必要です");
      process.exit(1);
    }

    const altText = `${query} - Photo by ${photographer} on Pexels`;
    const caption = `Photo by <a href="${photoPageUrl}">${photographer}</a> on <a href="https://www.pexels.com">Pexels</a>`;

    process.stdout.write("⬆️  WordPress メディアライブラリにアップロード中...");
    const media = await uploadToWordPress(savePath, altText, caption);
    console.log(" 完了！");
    console.log(`   メディアID: ${media.id}`);
    console.log(`   URL: ${media.url}`);

    // 4. アイキャッチ設定
    if (featuredPostId) {
      process.stdout.write(`🖼️  投稿ID ${featuredPostId} のアイキャッチに設定中...`);
      await setFeaturedImage(featuredPostId, media.id);
      console.log(" 完了！");
      console.log(`\n✅ 完了！`);
      console.log(`   確認: ${WP_URL}/wp-admin/post.php?post=${featuredPostId}&action=edit`);
    }

    // ローカルファイル削除（WPに保存済みのため）
    fs.unlinkSync(savePath);
    console.log(`\n📋 Pexelsライセンス: 無料・商用利用可・帰属表示推奨`);
    console.log(`   詳細: https://www.pexels.com/license/\n`);
    return;
  }

  console.log(`\n✅ ローカル保存完了: ${savePath}`);
  console.log(`📋 Pexelsライセンス: 無料・商用利用可・帰属表示推奨`);
  console.log(`   撮影者クレジット: Photo by ${photographer} on Pexels\n`);
}

main().catch((err) => {
  console.error("\n❌ エラー:", err.message);
  process.exit(1);
});
