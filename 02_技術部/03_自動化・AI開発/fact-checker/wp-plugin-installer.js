/**
 * WordPress プラグインインストーラー
 * WP.orgのプラグインをスラッグ指定でインストール・有効化する
 * 使い方: node wp-plugin-installer.js <slug>
 * 例:     node wp-plugin-installer.js insert-headers-and-footers
 */

require("dotenv").config({ quiet: true });
const fs = require("fs");
const https = require("https");

const WP_URL = process.env.WP_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  console.error("エラー: .env に WP_URL / WP_USERNAME / WP_APP_PASSWORD を設定してください");
  process.exit(1);
}

function wpRequest(method, restPath, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString("base64");
    const data = body ? JSON.stringify(body) : null;

    const url = new URL("/index.php", WP_URL);
    url.searchParams.set("rest_route", restPath);

    const options = {
      hostname: url.hostname,
      path: url.pathname + "?" + url.searchParams.toString(),
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("使い方: node wp-plugin-installer.js <slug>");
    process.exit(1);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(` WordPress プラグインインストール`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`スラッグ: ${slug}`);
  console.log(`投稿先  : ${WP_URL}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Step 1: インストール
  process.stdout.write("⬆️  インストール中...");
  const install = await wpRequest("POST", "/wp/v2/plugins", { slug, status: "active" });

  if (install.status === 201) {
    console.log(" 完了（インストール＋有効化）");
    console.log(`\n🎉 ${slug} が有効化されました`);
    console.log(`   管理画面: ${WP_URL}/wp-admin/plugins.php\n`);
    return;
  }

  if (install.status === 200) {
    console.log(" すでにインストール済み、有効化済み");
    return;
  }

  // すでに存在する場合は有効化だけ試みる
  const msg = install.body?.message || "";
  if (install.status === 400 && (msg.includes("already") || msg.includes("exist"))) {
    console.log(" すでにインストール済み");
  } else {
    console.error(`\n❌ インストール失敗 (HTTP ${install.status}): ${msg}`);
    process.exit(1);
  }

  // Step 2: 有効化
  process.stdout.write("✅ 有効化中...");
  const activate = await wpRequest("PUT", `/wp/v2/plugins/${slug}/${slug}`, { status: "active" });

  if (activate.status === 200) {
    console.log(" 完了！");
    console.log(`\n🎉 ${slug} が有効化されました`);
  } else {
    const m = activate.body?.message || JSON.stringify(activate.body).slice(0, 200);
    console.error(`\n❌ 有効化失敗 (HTTP ${activate.status}): ${m}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
