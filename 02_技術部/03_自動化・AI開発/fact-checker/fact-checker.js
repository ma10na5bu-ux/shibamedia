/**
 * Shibamedia株式会社 ファクトチェックパイプライン
 *
 * フロー: ファクトチェック → 修正 → 再確認 → 公開判定
 *
 * 使い方:
 *   node fact-checker.js <記事ファイルパス>
 *
 * 例:
 *   node fact-checker.js "../../../01_編集部/02_執筆・原稿/2026-03-10_春の柴犬散歩.md"
 */

require("dotenv").config();
const Anthropic = require("anthropic");
const fs = require("fs");
const path = require("path");

const client = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ────────────────────────────────────────────
// システムプロンプト: プロのコンテンツライター兼ファクトチェッカー
// ────────────────────────────────────────────
const FACT_CHECKER_SYSTEM_PROMPT = `
あなたは「柴犬といっしょ」メディア専属の、プロのコンテンツライター兼ファクトチェッカーです。
獣医師監修の知識と、ペットメディア編集10年以上の経験を持ちます。

## あなたの役割
- 記事の事実情報を厳しく精査し、根拠のない主張・誤情報・誇張を見抜く
- 柴犬・犬の健康管理に関する医学的・科学的正確性を確認する
- 読者（柴犬オーナー）が実行に移したとき安全かどうかを最優先で判断する
- SEO・トーン・構成の品質も同時に評価する
- 以下のNGワードルールに違反する箇所を必ず検出し、❌重大な誤りとして報告する

## NGワード・絶対禁止ルール（違反=不合格）
1. 散歩の頻度を「減らす・控える・やめる」→ 膀胱炎リスク。代替：散歩前に室内トイレへ誘導する流れを提案
2. 水分摂取を「減らす・制限・控える」→ 脱水・腎臓疾患リスク。代替：常に自由に摂取できる状態を維持
3. 食事を「抜く・あげない・絶食」→ 低血糖リスク。代替：獣医師に相談を案内
4. 具体的な投薬・服用の指導 → 医療行為。代替：獣医師に相談を案内
5. 「絶対に治る」「100%効果がある」→ 断言禁止。代替：「期待できます」「役立つことが多いです」
6. 症状への具体的対処指示 → YMYL領域。代替：獣医師に相談を案内

## 論理矛盾チェック（AI特有のエラー）
- 「直後にXせよ」と「後にXしても」が同一文脈で共存 → 矛盾する自問自答構文
- 「叱ってはいけない」と言いつつ叱る場面を描写 → 一貫性欠如
- 上記パターンを発見した場合は ⚠️要修正 として報告する

## ファクトチェックの厳しさレベル
- 健康・医療情報：最高レベル（誤情報は命に関わる）
- 植物・食品の毒性情報：最高レベル
- 行動・しつけ情報：高レベル
- 商品・サービス情報：中レベル
- 一般的なお出かけ情報：標準レベル

## 出力フォーマット（ファクトチェック）
必ず以下の構造で出力してください：

### 総合判定
[合格 / 要修正 / 不合格]

### リスクレベル
[高 / 中 / 低]

### ファクトチェック結果

#### ✅ 正確な情報（根拠あり）
（正確と判断した箇所を列挙）

#### ⚠️ 要確認・要修正（根拠が薄い・誇張・不正確）
（問題箇所を列挙。行番号または引用文 → 問題点 → 推奨修正内容）

#### ❌ 重大な誤り・危険な情報
（重大問題があれば列挙。なければ「なし」）

### SEO・品質チェック
- タイトル文字数：
- 構成：
- トーン：
- 内部リンク：

### 修正優先度リスト
（修正すべき箇所を優先度順に箇条書き）
`.trim();

const REVISER_SYSTEM_PROMPT = `
あなたは「柴犬といっしょ」メディア専属のプロのコンテンツライターです。
ファクトチェッカーから指摘を受けた記事を修正するのがあなたの仕事です。

## 修正方針
- ファクトチェックレポートの指摘を全て反映する
- 元の文体・トーン（温かみ・ユーモア・実用性）を壊さない
- 修正によって新たな誤情報が入り込まないよう注意する
- 削除が必要な箇所は削除し、補足が必要な箇所は補足する

## 絶対置換ルール（修正時に必ず適用）
- 「散歩を減らす/控える」→「散歩前に室内トイレへ誘導し、成功したら散歩に出発する」
- 「水を減らす/制限する」→ 削除し「水は常に自由に飲める状態にしてください」に置換
- 「排泄が終わった後に褒めても」→「排泄から時間が経過した後に褒めても」
- 症状への対処指示 →「気になる場合はかかりつけの獣医師に相談してください」
- 「絶対に〜する/治る」→「〜が期待できます」「〜に役立つことが多いです」

## 出力フォーマット
まず「## 修正サマリー」として何を修正したかを箇条書きで説明し、
その後に「---」を挟んで修正済みの記事全文をMarkdown形式で出力してください。
`.trim();

const FINAL_CHECK_SYSTEM_PROMPT = `
あなたは「柴犬といっしょ」メディアの編集長です。
修正済み記事と初回ファクトチェックレポートを照合し、最終判定を行います。

## 最終確認のポイント
- 初回ファクトチェックの全指摘が修正されているか
- 修正によって新たな問題が発生していないか
- 公開できるクオリティに達しているか

## 出力フォーマット

### 最終判定
[公開OK / 再修正が必要]

### 修正確認結果
（初回指摘に対して修正されたか一覧）

### 残課題
（あれば記載。なければ「なし」）

### 編集長コメント
（一言コメント）
`.trim();

// ────────────────────────────────────────────
// ユーティリティ
// ────────────────────────────────────────────
function printSection(title) {
  const line = "═".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(`${line}\n`);
}

function printStream(prefix) {
  process.stdout.write(prefix);
}

async function streamAndCollect(params) {
  let result = "";
  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    ...params,
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      process.stdout.write(event.delta.text);
      result += event.delta.text;
    }
  }
  console.log("\n");
  return result;
}

// ────────────────────────────────────────────
// Step 1: ファクトチェック
// ────────────────────────────────────────────
async function runFactCheck(articleContent) {
  printSection("STEP 1 / 3 ｜ 厳格ファクトチェック（プロのコンテンツライター視点）");

  const report = await streamAndCollect({
    system: FACT_CHECKER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `以下の記事をファクトチェックしてください。健康・医療情報は特に厳しく精査してください。\n\n---\n\n${articleContent}`,
      },
    ],
  });

  return report;
}

// ────────────────────────────────────────────
// Step 2: 修正
// ────────────────────────────────────────────
async function runRevision(articleContent, factCheckReport) {
  printSection("STEP 2 / 3 ｜ 記事修正（指摘反映）");

  const revised = await streamAndCollect({
    system: REVISER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `【ファクトチェックレポート】\n${factCheckReport}\n\n【修正前の記事】\n---\n${articleContent}`,
      },
    ],
  });

  return revised;
}

// ────────────────────────────────────────────
// Step 3: 再確認・公開判定
// ────────────────────────────────────────────
async function runFinalCheck(revisedContent, factCheckReport) {
  printSection("STEP 3 / 3 ｜ 最終確認・公開判定（編集長レビュー）");

  const finalJudgment = await streamAndCollect({
    system: FINAL_CHECK_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `【初回ファクトチェックレポート】\n${factCheckReport}\n\n【修正済み記事】\n---\n${revisedContent}`,
      },
    ],
  });

  return finalJudgment;
}

// ────────────────────────────────────────────
// 結果保存
// ────────────────────────────────────────────
function saveResults(articlePath, factCheckReport, revisedContent, finalJudgment) {
  const dir = path.dirname(articlePath);
  const base = path.basename(articlePath, ".md");
  const timestamp = new Date().toISOString().slice(0, 10);

  // ファクトチェックレポート
  const reportPath = path.join(dir, `${base}_ファクトチェックレポート_${timestamp}.md`);
  const reportContent = `# ファクトチェックレポート\n\n対象記事: ${path.basename(articlePath)}\nチェック日: ${timestamp}\n\n---\n\n## STEP 1: 初回ファクトチェック\n\n${factCheckReport}\n\n---\n\n## STEP 3: 最終確認・公開判定\n\n${finalJudgment}\n`;
  fs.writeFileSync(reportPath, reportContent, "utf8");

  // 修正済み記事（サマリーを除いた本文のみを抽出）
  const revisedArticlePath = path.join(dir, `${base}_修正済み_${timestamp}.md`);
  const articleOnly = revisedContent.split("---").slice(1).join("---").trim();
  fs.writeFileSync(revisedArticlePath, articleOnly || revisedContent, "utf8");

  return { reportPath, revisedArticlePath };
}

// ────────────────────────────────────────────
// メイン
// ────────────────────────────────────────────
async function main() {
  const articlePath = process.argv[2];

  if (!articlePath) {
    console.error("使い方: node fact-checker.js <記事ファイルパス>");
    console.error("例: node fact-checker.js '../../../01_編集部/02_執筆・原稿/2026-03-10_春の柴犬散歩.md'");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), articlePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`エラー: ファイルが見つかりません → ${resolvedPath}`);
    process.exit(1);
  }

  const articleContent = fs.readFileSync(resolvedPath, "utf8");

  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   Shibamedia ファクトチェックパイプライン                    ║");
  console.log("║   ファクトチェック → 修正 → 再確認 → 公開判定               ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n対象記事: ${path.basename(resolvedPath)}\n`);

  // Step 1
  const factCheckReport = await runFactCheck(articleContent);

  // Step 2
  const revisedContent = await runRevision(articleContent, factCheckReport);

  // Step 3
  const finalJudgment = await runFinalCheck(revisedContent, factCheckReport);

  // 結果保存
  const { reportPath, revisedArticlePath } = saveResults(
    resolvedPath,
    factCheckReport,
    revisedContent,
    finalJudgment
  );

  printSection("✅ 完了 ｜ 出力ファイル");
  console.log(`📋 ファクトチェックレポート:\n   ${reportPath}\n`);
  console.log(`📝 修正済み記事:\n   ${revisedArticlePath}\n`);
  console.log("公開前に修正済み記事をご確認ください。\n");
}

main().catch((err) => {
  console.error("エラーが発生しました:", err.message);
  process.exit(1);
});
