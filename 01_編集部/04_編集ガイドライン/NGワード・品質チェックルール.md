# NGワード・品質チェックルール

> 記事パイプラインの品質ゲート定義。生成→公開の間で必ず通す。

---

## パイプライン実行順序

```
1. 記事生成（Claude API）
      ↓
2. NGワードGrepチェック（ng-word-checker.js）
   - critical検出 → 停止・修正へ戻す
   - warningのみ → レポート付きで続行
      ↓
3. ファクトチェック（fact-checker.js）
   - LLMプロンプトにもNGルール組み込み済み
      ↓
4. 編集チェック（/editorial-check）
      ↓
5. WordPress公開
```

## 実行コマンド

```bash
cd 04_技術部/03_自動化・AI開発/fact-checker

# Step 1: NGワードチェック
node ng-word-checker.js <記事.md>

# Step 2: ファクトチェック（NGチェック通過後）
node fact-checker.js <記事.md>
```

---

## NGワードルール一覧

### ❌ Critical（検出=パイプライン停止）

| ID | カテゴリ | NGパターン | リスク | 置換方針 |
|---|---|---|---|---|
| HEALTH-001 | 健康リスク | 散歩を減らす/控える/やめる | 膀胱炎 | 散歩前に室内トイレへ誘導→成功後に散歩 |
| HEALTH-002 | 健康リスク | 水を減らす/制限/控える | 脱水・腎臓疾患 | 水は常に自由に飲める状態を維持 |
| HEALTH-003 | 健康リスク | 食事を抜く/あげない/絶食 | 低血糖 | 獣医師に相談を案内 |
| HEALTH-004 | 医療情報 | 薬・投薬のおすすめ/指導 | 医療行為 | 獣医師に相談を案内 |

### ⚠️ Warning（検出=要確認・続行可）

| ID | カテゴリ | NGパターン | リスク | 置換方針 |
|---|---|---|---|---|
| LOGIC-001 | AI構文 | 「直後に」+「後に褒めても」矛盾 | 論理破綻 | 「直後（1〜2秒以内）」+「時間が経過した後」 |
| LOGIC-002 | AI構文 | 叱るなと言いつつ叱る描写 | 一貫性欠如 | 「叱らない」で統一 |
| TONE-001 | トーン | 「絶対に治る」「100%効果」 | 信頼性 | 「期待できます」「役立つことが多い」 |
| YMYL-001 | YMYL | 症状→具体的対処指示 | YMYL違反 | 獣医師に相談を案内 |

---

## ルール追加方法

`ng-words.json` にルールを追加する：

```json
{
  "id": "HEALTH-005",
  "category": "健康リスク",
  "severity": "critical",
  "pattern": "正規表現パターン",
  "description": "問題の説明",
  "replacement_guide": "置換方針"
}
```

LLMプロンプト側（`fact-checker.js` の `FACT_CHECKER_SYSTEM_PROMPT` / `REVISER_SYSTEM_PROMPT`）にも同時に反映すること。
