// about-scorebase 블로그용 SVG → PNG 변환 (소셜 OG 는 SVG 미지원 → PNG 필수).
//   node scripts/_convert-about-images.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const dir = "public/images/about";
const jobs = [
  ["og-about-scorebase", 1200, 630],
  ["hero", 1200, 560],
  ["live-score", 1200, 600],
  ["simulation", 1200, 600],
];

for (const [name, w, h] of jobs) {
  const svg = readFileSync(`${dir}/${name}.svg`);
  // density 높여 래스터 후 정확 크기로 다운샘플 → 한글/곡선 안티앨리어싱 향상
  await sharp(svg, { density: 220 })
    .resize(w, h, { fit: "fill" })
    .png({ quality: 95 })
    .toFile(`${dir}/${name}.png`);
  console.log(`✅ ${name}.png (${w}x${h})`);
}
console.log("done");
