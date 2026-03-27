/**
 * NGワードチェッカー
 *
 * 記事生成後・ファクトチェック前に実行し、
 * 定義済みのNGパターンに一致する箇所を検出する。
 *
 * 使い方:
 *   node ng-word-checker.js <記事ファイルパス>
 *
 * 終了コード:
 *   0 = 問題なし
 *   1 = critical検出（パイプライン停止）
 *   2 = warningのみ（続行可、レポート出力）
 */

const fs = require("fs");
const path = require("path");

const RULES_PATH = path.join(__dirname, "ng-words.json");

function loadRules() {
  const data = JSON.parse(fs.readFileSync(RULES_PATH, "utf8"));
  return data.rules;
}

function checkArticle(content, rules) {
  const lines = content.split("\n");
  const hits = [];

  for (const rule of rules) {
    const regex = new RegExp(rule.pattern, "g");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;
      // 否定文脈を除外するパターン（「〜はNGです」「〜はダメ」「〜しないで」等）
      const negationPattern = /はNG|はダメ|いけません|しないで|避けて|禁止|よくない|危険/;
      while ((match = regex.exec(line)) !== null) {
        // マッチ位置の後ろ30文字を確認し、否定文脈なら安全な記述としてスキップ
        const afterMatch = line.substring(match.index + match[0].length, match.index + match[0].length + 30);
        const beforeAndMatch = line.substring(Math.max(0, match.index - 10), match.index + match[0].length + 30);
        if (negationPattern.test(afterMatch) || negationPattern.test(beforeAndMatch)) {
          continue;
        }
        hits.push({
          ruleId: rule.id,
          severity: rule.severity,
          category: rule.category,
          line: i + 1,
          matched: match[0],
          context: line.trim().substring(0, 80),
          description: rule.description,
          fix: rule.replacement_guide,
        });
      }
    }
  }

  return hits;
}

function formatReport(hits, articlePath) {
  const criticals = hits.filter((h) => h.severity === "critical");
  const warnings = hits.filter((h) => h.severity === "warning");

  let report = "";
  report += "# NGワードチェックレポート\n\n";
  report += `対象: ${path.basename(articlePath)}\n`;
  report += `日時: ${new Date().toISOString().slice(0, 19).replace("T", " ")}\n`;
  report += `結果: critical=${criticals.length} / warning=${warnings.length}\n\n`;

  if (hits.length === 0) {
    report += "✅ NGワードは検出されませんでした。\n";
    return report;
  }

  report += "---\n\n";

  if (criticals.length > 0) {
    report += "## ❌ Critical（パイプライン停止・修正必須）\n\n";
    for (const h of criticals) {
      report += `### [${h.ruleId}] ${h.category}\n`;
      report += `- **行${h.line}**: \`${h.matched}\`\n`;
      report += `- **文脈**: ${h.context}\n`;
      report += `- **問題**: ${h.description}\n`;
      report += `- **修正方針**: ${h.fix}\n\n`;
    }
  }

  if (warnings.length > 0) {
    report += "## ⚠️ Warning（要確認）\n\n";
    for (const h of warnings) {
      report += `### [${h.ruleId}] ${h.category}\n`;
      report += `- **行${h.line}**: \`${h.matched}\`\n`;
      report += `- **文脈**: ${h.context}\n`;
      report += `- **問題**: ${h.description}\n`;
      report += `- **修正方針**: ${h.fix}\n\n`;
    }
  }

  return report;
}

function main() {
  const articlePath = process.argv[2];

  if (!articlePath) {
    console.error("使い方: node ng-word-checker.js <記事ファイルパス>");
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), articlePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`エラー: ファイルが見つかりません → ${resolvedPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedPath, "utf8");
  const rules = loadRules();
  const hits = checkArticle(content, rules);
  const report = formatReport(hits, resolvedPath);

  // レポート出力
  console.log(report);

  // レポートファイル保存
  const dir = path.dirname(resolvedPath);
  const base = path.basename(resolvedPath, ".md");
  const reportPath = path.join(dir, `${base}_NGワードチェック.md`);
  fs.writeFileSync(reportPath, report, "utf8");
  console.log(`📋 レポート保存: ${reportPath}`);

  // 終了コード
  const criticals = hits.filter((h) => h.severity === "critical");
  if (criticals.length > 0) {
    console.error(
      `\n🚫 Critical ${criticals.length}件検出 → パイプライン停止。修正後に再実行してください。`
    );
    process.exit(1);
  } else if (hits.length > 0) {
    console.warn(`\n⚠️  Warning ${hits.length}件 → 確認の上、続行可能です。`);
    process.exit(2);
  } else {
    console.log("\n✅ チェック通過。ファクトチェックに進めます。");
    process.exit(0);
  }
}

main();
