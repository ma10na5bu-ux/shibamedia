/**
 * Gemini 2.5 Flash Image — 画像生成スクリプト
 *
 * 使い方:
 *   node 04_技術部/03_自動化・AI開発/generate-image.js "プロンプト" [出力ファイル名] [アスペクト比]
 *
 * 例:
 *   node 04_技術部/03_自動化・AI開発/generate-image.js "赤柴のプレイバウ" playbow.png 16:9
 *
 * アスペクト比: 1:1, 3:4, 4:3, 9:16, 16:9（デフォルト: 16:9）
 * APIキー: 環境変数 GEMINI_API_KEY から取得
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

async function generateImage(prompt, outputFile, aspectRatio) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("エラー: 環境変数 GEMINI_API_KEY が設定されていません");
    process.exit(1);
  }

  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({
    model: "gemini-2.5-flash-image",
  });

  console.log(`モデル: gemini-2.5-flash (image generation)`);
  console.log(`プロンプト: ${prompt}`);
  console.log(`アスペクト比: ${aspectRatio}`);
  console.log(`出力先: ${outputFile}`);
  console.log("生成中...");

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["image", "text"],
    },
  });

  const response = result.response;
  const parts = response.candidates[0].content.parts;

  let saved = false;
  for (const part of parts) {
    if (part.inlineData) {
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const buffer = Buffer.from(part.inlineData.data, "base64");
      fs.writeFileSync(outputFile, buffer);
      console.log(`画像を保存しました: ${outputFile} (${(buffer.length / 1024).toFixed(0)} KB)`);
      saved = true;
      break;
    }
  }

  if (!saved) {
    console.error("エラー: 画像データが応答に含まれていませんでした");
    console.log("応答:", JSON.stringify(parts.map(p => Object.keys(p)), null, 2));
    process.exit(1);
  }
}

// CLI引数の処理
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("使い方: node generate-image.js \"プロンプト\" [出力ファイル名] [アスペクト比]");
  console.log("例:     node generate-image.js \"赤柴のプレイバウ\" playbow.png 16:9");
  process.exit(0);
}

const prompt = args[0];
const outputFile = args[1] || path.join("01_編集部", "03_画像・素材", `generated_${Date.now()}.png`);
const aspectRatio = args[2] || "16:9";

generateImage(prompt, outputFile, aspectRatio).catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
