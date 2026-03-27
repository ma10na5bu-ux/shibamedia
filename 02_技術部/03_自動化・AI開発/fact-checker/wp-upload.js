/**
 * Shibamedia WordPress 記事アップロードスクリプト
 * 使い方: node wp-upload.js <記事Markdownファイルパス>
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");
const { marked } = require("marked");

const WP_URL = process.env.WP_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  console.error("エラー: .env に WP_URL / WP_USERNAME / WP_APP_PASSWORD を設定してください");
  process.exit(1);
}

// ────────────────────────────────────────────
// Markdown前処理
// ────────────────────────────────────────────
function processMarkdown(raw) {
  let content = raw;

  // メタディスクリプション行を除去（WordPress本文には不要）
  content = content.replace(/^\*\*メタディスクリプション：\*\*.*\n\n---\n/m, "");

  // 画像プレースホルダーコメントを除去
  content = content.replace(/<!-- baoyu-.*?-->\n?/g, "");

  // 画像タグ（まだ存在しないもの）を除去
  content = content.replace(/!\[.*?\]\(imgs\/.*?\)\n?/g, "");

  // 公開日・カテゴリ行（フッター）を除去
  content = content.replace(/\*公開日:.*\*\n?/, "");

  return content.trim();
}

// ────────────────────────────────────────────
// タイトル抽出
// ────────────────────────────────────────────
function extractTitle(raw) {
  const match = raw.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "無題";
}

// ────────────────────────────────────────────
// タグ抽出
// ────────────────────────────────────────────
function extractTags(raw) {
  const match = raw.match(/タグ:\s*(.+)$/m);
  if (!match) return [];
  return match[1].split(",").map((t) => t.trim()).filter(Boolean);
}

// ────────────────────────────────────────────
// WordPress REST API POST
// ────────────────────────────────────────────
function wpPost(endpoint, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString("base64");
    const data = JSON.stringify(body);
    // パーマリンクが「基本」の場合 /wp-json/ が404になるため index.php?rest_route= を使用
    const url = new URL(endpoint);
    const restRoute = url.pathname.replace(/^\/wp-json/, "");
    url.pathname = "/index.php";
    url.searchParams.set("rest_route", restRoute);

    const options = {
      hostname: url.hostname,
      path: url.pathname + "?" + url.searchParams.toString(),
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────
async function main() {
  const filePath = process.argv[2];
  const updateId = process.argv[3]; // 既存投稿IDを指定すると更新モード

  if (!filePath) {
    console.error("使い方: node wp-upload.js <記事ファイルパス> [投稿ID（更新時）]");
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`エラー: ファイルが見つかりません → ${resolved}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(resolved, "utf8");
  const title = extractTitle(raw);
  const tags = extractTags(raw);
  const processed = processMarkdown(raw);
  const html = marked(processed);

  const isUpdate = !!updateId;
  const endpoint = isUpdate
    ? `${WP_URL}/wp-json/wp/v2/posts/${updateId}`
    : `${WP_URL}/wp-json/wp/v2/posts`;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(isUpdate ? " WordPress 記事更新" : " WordPress アップロード");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`タイトル : ${title}`);
  console.log(`タグ     : ${tags.join(", ") || "なし"}`);
  console.log(`投稿先   : ${WP_URL}`);
  if (isUpdate) console.log(`更新対象 : 投稿ID ${updateId}`);
  console.log(`ステータス: draft（下書き）`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const result = await wpPost(endpoint, {
    title,
    content: html,
    status: "draft",
  });

  const ok = isUpdate ? result.status === 200 : result.status === 201;
  if (ok) {
    const post = result.body;
    console.log(isUpdate ? "✅ 更新成功！" : "✅ アップロード成功！");
    console.log(`   投稿ID   : ${post.id}`);
    console.log(`   下書きURL: ${post.link}`);
    console.log(`   編集URL  : ${WP_URL}/wp-admin/post.php?post=${post.id}&action=edit`);
    console.log("\n⚠️  ステータスは「下書き」です。確認後に手動で公開してください。\n");
  } else {
    console.error(`❌ 失敗 (HTTP ${result.status})`);
    const msg = result.body?.message || JSON.stringify(result.body).slice(0, 200);
    console.error(`   エラー: ${msg}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
