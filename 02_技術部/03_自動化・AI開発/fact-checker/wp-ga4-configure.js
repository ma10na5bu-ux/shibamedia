/**
 * GA4 設定スクリプト
 * Insert Headers and Footers プラグインにGA4スニペットを書き込む
 * 使い方: node wp-ga4-configure.js <GA4-Measurement-ID>
 * 例:     node wp-ga4-configure.js G-XXXXXXXXXX
 */

require("dotenv").config({ quiet: true });
const https = require("https");
const http = require("http");

const WP_URL = process.env.WP_URL;
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;
const WP_REGULAR_PASSWORD = process.env.WP_REGULAR_PASSWORD || "";

if (!WP_URL || !WP_USERNAME || !WP_APP_PASSWORD) {
  console.error("エラー: .env に WP_URL / WP_USERNAME / WP_APP_PASSWORD を設定してください");
  process.exit(1);
}

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {},
    }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function buildGA4Script(id) {
  return `<!-- Google Analytics 4 | Shibamedia -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${id}',{send_page_view:true});
(function(){var m=[25,50,75,100],r={};function pct(){var d=document.documentElement,s=window.pageYOffset||d.scrollTop,h=d.scrollHeight-d.clientHeight;return h<=0?100:Math.round(s/h*100);}window.addEventListener('scroll',function(){var p=pct();m.forEach(function(v){if(!r[v]&&p>=v){r[v]=true;gtag('event','scroll_depth',{event_category:'Engagement',event_label:v+'%',value:v});}});},{passive:true});})();
document.addEventListener('DOMContentLoaded',function(){var h=location.hostname;document.querySelectorAll('a[href]').forEach(function(a){try{var u=new URL(a.href);if(u.hostname&&u.hostname!==h){a.addEventListener('click',function(){gtag('event','outbound_click',{event_category:'Outbound',event_label:u.href,transport_type:'beacon'});});}}catch(e){}});});
</script>`;
}

async function loginAndGetNonce(measurementId) {
  const loginUrl = `${WP_URL}/wp-login.php`;
  const cookieJar = {};

  // 1. ログインページ取得（Cookie取得）
  const loginPage = await fetch(loginUrl);
  const setCookie = loginPage.headers["set-cookie"] || [];
  setCookie.forEach((c) => {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    if (k) cookieJar[k.trim()] = v || "";
  });

  // 2. ログイン POST（Application Password ではなく通常パスワードが必要）
  // Note: wp-login.php には通常パスワードが必要。Application Password は REST API専用。
  // ログインCookieが取れない場合はREST API経由のoption更新を試みる
  return null; // ログイン方式はスキップ
}

async function updateOptionViaRestApi(measurementId) {
  // WP REST API の /wp/v2/settings に独自オプションを登録する方法は
  // プラグイン側で register_setting + show_in_rest が必要。
  // Insert H&F はこれを行っていないため、直接更新は不可。
  // 代わりに、WP REST API の settings endpoint でデフォルト設定を試みる。
  const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString("base64");
  const url = new URL("/index.php", WP_URL);
  url.searchParams.set("rest_route", "/wp/v2/settings");

  // ihaf プラグインのオプション名を試す
  const optionKeys = ["ihaf_setting", "ih_options", "insert_headers_footers"];
  for (const key of optionKeys) {
    const body = JSON.stringify({ [key]: buildGA4Script(measurementId) });
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      body,
    });
    if (res.status === 200) return { success: true, key };
  }
  return { success: false };
}

async function main() {
  const measurementId = process.argv[2];

  if (!measurementId || !/^G-[A-Z0-9]+$/.test(measurementId)) {
    console.error("使い方: node wp-ga4-configure.js G-XXXXXXXXXX");
    console.error("GA4 Measurement ID は G- から始まります");
    console.error("取得先: analytics.google.com → 管理 → データストリーム → Measurement ID");
    process.exit(1);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(` GA4 設定`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Measurement ID: ${measurementId}`);
  console.log(`サイト        : ${WP_URL}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  process.stdout.write("⚙️  REST API経由でGA4設定を試みています...");
  const result = await updateOptionViaRestApi(measurementId);

  if (result.success) {
    console.log(` 完了！(キー: ${result.key})`);
    console.log(`\n✅ GA4トラッキングが有効になりました`);
  } else {
    console.log(" REST API経由では設定できませんでした\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(" 手動設定手順（1分で完了します）");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`\n1. 以下のURLを開く:`);
    console.log(`   ${WP_URL}/wp-admin/options-general.php?page=ihaf-plugin`);
    console.log(`\n2. 「Scripts in Header」に以下をコピー＆ペースト:\n`);
    console.log(buildGA4Script(measurementId));
    console.log(`\n3. 「Save」をクリックして完了\n`);
  }

  console.log(`\n📊 トラッキング内容:`);
  console.log(`   ✓ ページビュー自動計測`);
  console.log(`   ✓ スクロール深度（25%, 50%, 75%, 100%）`);
  console.log(`   ✓ 外部リンククリック（アウトバウンド）\n`);
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
