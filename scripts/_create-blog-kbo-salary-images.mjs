// KBO 연봉 순위 글 이미지 2종 생성 — 데이터에서 SVG 조립 후 PNG 변환.
//   node scripts/_create-blog-kbo-salary-images.mjs   (DB 불필요 — kbo-salaries.json 만 사용)
// 히어로 = 연봉 TOP 5 막대 / 본문 = 구단별 연봉 총액 + 샐러리캡 기준선.
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const BG = "#0b1220", CY = "#06b6d4", WH = "#f8fafc", MUTED = "#94a3b8", AMB = "#fbbf24";
const FONT = "'Apple SD Gothic Neo','Noto Sans KR','Helvetica Neue',sans-serif";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CAP_2026 = 143.9723; // KBO 2026 경쟁균형세 상한액(억) — 참고선

const raw = JSON.parse(readFileSync("data/kbo-salaries.json", "utf8"));
const dom = raw.players;
const sorted = [...dom].sort((a, b) => b.salary - a.salary);
const eok = (m) => m / 10000;

// ── 히어로 1200x630 — 연봉 TOP 5
const top5 = sorted.slice(0, 5);
const maxSal = top5[0].salary;
const heroBars = top5.map((r, i) => {
  const y = 250 + i * 66;
  const w = Math.round((r.salary / maxSal) * 600);
  return `    <rect x="320" y="${y}" width="${w}" height="38" rx="6" fill="${i === 0 ? CY : "#164e63"}"/>
    <text x="304" y="${y + 26}" font-family="${FONT}" font-size="21" font-weight="700" fill="${WH}" text-anchor="end">${esc(r.playerName)} <tspan fill="${MUTED}" font-size="16">${esc(r.teamName)}</tspan></text>
    <text x="${330 + w}" y="${y + 26}" font-family="${FONT}" font-size="20" font-weight="700" fill="${i === 0 ? CY : MUTED}">${eok(r.salary).toFixed(0)}억</text>`;
}).join("\n");

const hero = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${BG}"/>
  <g>
    <rect x="80" y="66" width="8" height="30" rx="2" fill="${CY}"/>
    <rect x="94" y="76" width="8" height="20" rx="2" fill="${CY}" opacity="0.75"/>
    <rect x="108" y="60" width="8" height="36" rx="2" fill="${CY}" opacity="0.55"/>
    <rect x="122" y="82" width="8" height="14" rx="2" fill="${CY}" opacity="0.4"/>
    <text x="146" y="94" font-family="${FONT}" font-size="26" font-weight="800" fill="${WH}">스코어베이스</text>
  </g>
  <text x="80" y="180" font-family="${FONT}" font-size="60" font-weight="800" fill="${WH}">KBO 연봉 순위 2026 TOP 30</text>
  <text x="80" y="224" font-family="${FONT}" font-size="25" fill="${MUTED}">국내 선수 ${dom.length}명 공시 연봉 기준 · 외국인 제외</text>
${heroBars}
  <text x="80" y="592" font-family="${FONT}" font-size="19" fill="${MUTED}">scorebase.kr · 연봉 총액 ${eok(dom.reduce((s, d) => s + d.salary, 0)).toFixed(0)}억 원 중 상위 30명이 ${((sorted.slice(0, 30).reduce((s, d) => s + d.salary, 0) / dom.reduce((s, d) => s + d.salary, 0)) * 100).toFixed(0)}%</text>
</svg>`;

// ── 본문 1200x760 — 구단별 총액 + 샐러리캡 기준선
const agg = {};
for (const d of dom) { agg[d.teamName] ??= { sum: 0, n: 0 }; agg[d.teamName].sum += d.salary; agg[d.teamName].n++; }
const teams = Object.entries(agg).sort((a, b) => b[1].sum - a[1].sum);
const X0 = 200, WMAX = 760;
const scaleMax = Math.max(CAP_2026, eok(teams[0][1].sum)) * 1.02;
const capX = X0 + Math.round((CAP_2026 / scaleMax) * WMAX);

const teamBars = teams.map(([t, v], i) => {
  const y = 226 + i * 48;
  const val = eok(v.sum);
  const w = Math.round((val / scaleMax) * WMAX);
  return `    <text x="${X0 - 16}" y="${y + 24}" font-family="${FONT}" font-size="20" font-weight="700" fill="${WH}" text-anchor="end">${esc(t)}</text>
    <rect x="${X0}" y="${y + 4}" width="${w}" height="30" rx="5" fill="${i === 0 ? CY : "#155e75"}"/>
    <text x="${X0 + w + 12}" y="${y + 26}" font-family="${FONT}" font-size="19" font-weight="800" fill="${i === 0 ? CY : MUTED}">${val.toFixed(1)}억</text>`;
}).join("\n");

const chart = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
  <rect width="1200" height="760" fill="${BG}"/>
  <text x="60" y="76" font-family="${FONT}" font-size="42" font-weight="800" fill="${WH}">KBO 구단별 연봉 총액 2026</text>
  <text x="60" y="118" font-family="${FONT}" font-size="21" fill="${MUTED}">국내 선수 공시 연봉 단순 합계 · 외국인·FA 계약금·옵션 제외</text>
  <line x1="${capX}" y1="176" x2="${capX}" y2="${226 + teams.length * 48 + 4}" stroke="${AMB}" stroke-width="2" stroke-dasharray="6 5"/>
  <text x="${capX}" y="168" font-family="${FONT}" font-size="17" font-weight="700" fill="${AMB}" text-anchor="middle">경쟁균형세 상한 ${CAP_2026.toFixed(1)}억</text>
${teamBars}
  <text x="60" y="734" font-family="${FONT}" font-size="17" fill="${MUTED}">데이터: 스코어베이스 · 경쟁균형세 산정액은 FA 계약금 분할분과 옵션이 더해져 이 막대보다 큽니다</text>
</svg>`;

const jobs = [
  ["public/blog/kbo-salary-ranking-2026-hero", hero, 1200, 630],
  ["public/blog/kbo-salary-ranking-2026-team-total", chart, 1200, 760],
];
for (const [path, svg, w, h] of jobs) {
  writeFileSync(`${path}.svg`, svg);
  await sharp(Buffer.from(svg), { density: 220 }).resize(w, h, { fit: "fill" }).png({ quality: 95 }).toFile(`${path}.png`);
  console.log(`${path}.png (${w}x${h})`);
}
console.log("TOP5:", top5.map((r) => `${r.playerName} ${eok(r.salary).toFixed(0)}억`).join(", "));
console.log("구단:", teams.map(([t, v]) => `${t} ${eok(v.sum).toFixed(1)}`).join(" · "));
