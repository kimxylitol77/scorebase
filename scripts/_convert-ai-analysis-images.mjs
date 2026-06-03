// ai-sports-analysis 블로그용 SVG → PNG 변환 (소셜 OG 는 SVG 미지원 → PNG 필수).
//   node scripts/_convert-ai-analysis-images.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const jobs = [
  ["public/og/ai-sports-analysis", 1200, 630],
  ["public/images/ai-analysis/three-steps", 1200, 500],
];

for (const [path, w, h] of jobs) {
  const svg = readFileSync(`${path}.svg`);
  // density 높여 래스터 후 정확 크기로 다운샘플 → 한글/곡선 안티앨리어싱 향상
  await sharp(svg, { density: 220 })
    .resize(w, h, { fit: "fill" })
    .png({ quality: 95 })
    .toFile(`${path}.png`);
  console.log(`✅ ${path}.png (${w}x${h})`);
}
console.log("done");
