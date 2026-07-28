// 앱 아이콘 생성 — 헤더 로고 마크(막대 4개)를 PWA·애플 아이콘 세트로 렌더.
// 사용: node scripts/build-app-icons.mjs  (public/ + src/app/ 아이콘 6종 갱신)
import sharp from "sharp";
import { writeFileSync } from "node:fs";

// 로고 Mark(src/components/Logo.tsx)와 동일 지오메트리. 배경=다크 네이비(사이트 다크 톤),
// 앱 아이콘은 OS 가 모서리를 깎으므로 풀블리드 정사각. 마스커블은 안전영역(중앙 60%)에 마크 배치.
function iconSvg(size, pad) {
  const inner = size - pad * 2; // 마크가 차지할 영역
  const s = inner / 32; // Mark viewBox 32 기준 스케일
  const bar = (x, y, h, opacity) =>
    `<rect x="${pad + x * s}" y="${pad + y * s}" width="${5 * s}" height="${h * s}" rx="${1.5 * s}" fill="url(#g)" ${opacity < 1 ? `opacity="${opacity}"` : ""}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="${size}" x2="${size}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="#0d1526"/>
  ${bar(3, 20, 9, 0.55)}
  ${bar(11, 14, 15, 0.75)}
  ${bar(19, 8, 21, 0.9)}
  ${bar(27, 3, 26, 1)}
</svg>`;
}

async function render(size, pad, out) {
  const png = await sharp(Buffer.from(iconSvg(size, pad))).png().toBuffer();
  writeFileSync(out, png);
  console.log(out, `${size}x${size}`);
}

// 일반 아이콘: 여백 18% (마크가 시원하게 차게). 마스커블: 여백 20%+ (안전영역).
await render(512, Math.round(512 * 0.18), "public/icon-512.png");
await render(192, Math.round(192 * 0.18), "public/icon-192.png");
await render(512, Math.round(512 * 0.22), "public/icon-maskable-512.png");
await render(180, Math.round(180 * 0.18), "public/apple-touch-icon.png");
await render(192, Math.round(192 * 0.18), "src/app/icon.png");
await render(180, Math.round(180 * 0.18), "src/app/apple-icon.png");
