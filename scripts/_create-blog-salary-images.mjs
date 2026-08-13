// 축구선수 연봉 순위 글 이미지 2종 생성 — 데이터에서 SVG 조립 후 PNG 변환.
//   node --env-file=.env.local scripts/_create-blog-salary-images.mjs
// 히어로 = 연봉 TOP 5 막대 / 본문 = 연봉 대비 몸값 배수 (상·하위 5명).
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EUR_KRW = 1791.5;
const eok = (eur) => Math.round((eur * EUR_KRW) / 1e8);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const BG = "#0b1220", CY = "#06b6d4", WH = "#f8fafc", MUTED = "#94a3b8", RED = "#f87171";
const FONT = "'Apple SD Gothic Neo','Noto Sans KR','Helvetica Neue',sans-serif";

const raw = JSON.parse(readFileSync("data/football-wages.json", "utf8"));
const all = Object.entries(raw.players).filter(([, v]) => v.eur > 0).sort((a, b) => b[1].eur - a[1].eur);
const ids = all.slice(0, 30).map(([id]) => id);
const players = await prisma.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameKo: true } });
const pm = new Map(players.map((p) => [p.id, p.nameKo || p.name]));
const mvs = await prisma.playerMarketValue.findMany({ where: { id: { in: ids } }, select: { id: true, currentValue: true, age: true } });
const vm = new Map(mvs.map((m) => [m.id, m]));
await prisma.$disconnect();

const rows = all.slice(0, 30).map(([id, v]) => ({ id, ko: pm.get(id) || "선수", eur: v.eur, mv: vm.get(id)?.currentValue ?? null, age: vm.get(id)?.age ?? null }));

// ── 히어로 1200x630 — 연봉 TOP 5 가로 막대
const top5 = rows.slice(0, 5);
const maxEur = top5[0].eur;
const heroBars = top5.map((r, i) => {
  const y = 250 + i * 66;
  const w = Math.round((r.eur / maxEur) * 620);
  return `    <rect x="300" y="${y}" width="${w}" height="38" rx="6" fill="${i === 0 ? CY : "#164e63"}"/>
    <text x="284" y="${y + 26}" font-family="${FONT}" font-size="21" font-weight="700" fill="${WH}" text-anchor="end">${esc(r.ko)}</text>
    <text x="${310 + w}" y="${y + 26}" font-family="${FONT}" font-size="19" font-weight="700" fill="${i === 0 ? CY : MUTED}">€${(r.eur / 1e6).toFixed(1)}M · ${eok(r.eur).toLocaleString()}억</text>`;
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
  <text x="80" y="180" font-family="${FONT}" font-size="60" font-weight="800" fill="${WH}">축구선수 연봉 순위 TOP 30</text>
  <text x="80" y="224" font-family="${FONT}" font-size="25" fill="${MUTED}">유럽 빅5 리그 구단 급여 기준 · 광고 수입 제외 · 2026</text>
${heroBars}
  <text x="80" y="592" font-family="${FONT}" font-size="19" fill="${MUTED}">scorebase.kr · 빅5 리그 ${all.length.toLocaleString()}명 급여 데이터에서 집계</text>
</svg>`;

// ── 본문 1200x675 — 연봉 대비 몸값 배수 (상위 5 · 하위 5)
const withMv = rows.filter((r) => r.mv).map((r) => ({ ...r, mult: r.mv / r.eur }));
const sortedM = [...withMv].sort((a, b) => b.mult - a.mult);
const best = sortedM.slice(0, 5), worst = sortedM.slice(-5).reverse();
const maxMult = best[0].mult;

const barGroup = (list, x0, color, labelAnchor) => list.map((r, i) => {
  const y = 250 + i * 70;
  const w = Math.max(6, Math.round((r.mult / maxMult) * 330));
  return `    <rect x="${x0}" y="${y}" width="${w}" height="34" rx="5" fill="${color}"/>
    <text x="${x0}" y="${y - 8}" font-family="${FONT}" font-size="20" font-weight="700" fill="${WH}" text-anchor="${labelAnchor}">${esc(r.ko)} <tspan fill="${MUTED}" font-size="16" font-weight="400">${r.age ?? "-"}세</tspan></text>
    <text x="${x0 + w + 12}" y="${y + 24}" font-family="${FONT}" font-size="20" font-weight="800" fill="${color}">${r.mult.toFixed(1)}배</text>`;
}).join("\n");

const chart = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <rect width="1200" height="675" fill="${BG}"/>
  <text x="60" y="76" font-family="${FONT}" font-size="42" font-weight="800" fill="${WH}">연봉 대비 몸값, 누가 남는 계약인가</text>
  <text x="60" y="118" font-family="${FONT}" font-size="21" fill="${MUTED}">시장가치 ÷ 연봉 — 숫자가 클수록 받는 돈에 비해 자산 가치가 높습니다</text>
  <line x1="600" y1="170" x2="600" y2="640" stroke="#1e293b" stroke-width="2"/>
  <text x="60" y="200" font-family="${FONT}" font-size="24" font-weight="800" fill="${CY}">가장 남는 계약 TOP 5</text>
  <text x="640" y="200" font-family="${FONT}" font-size="24" font-weight="800" fill="${RED}">가장 부담스러운 계약 TOP 5</text>
${barGroup(best, 60, CY, "start")}
${barGroup(worst, 640, RED, "start")}
  <text x="60" y="655" font-family="${FONT}" font-size="17" fill="${MUTED}">데이터: 스코어베이스 · 빅5 리그 연봉 TOP 30 중 시장가치 확인 가능한 선수 기준</text>
</svg>`;

const jobs = [
  ["public/blog/football-salary-ranking-2026-hero", hero, 1200, 630],
  ["public/blog/football-salary-ranking-2026-wage-vs-value", chart, 1200, 675],
];
for (const [path, svg, w, h] of jobs) {
  writeFileSync(`${path}.svg`, svg);
  await sharp(Buffer.from(svg), { density: 220 }).resize(w, h, { fit: "fill" }).png({ quality: 95 }).toFile(`${path}.png`);
  console.log(`${path}.png (${w}x${h})`);
}
console.log("hero TOP5:", top5.map((r) => `${r.ko} ${eok(r.eur)}억`).join(", "));
console.log("best:", best.map((r) => `${r.ko} ${r.mult.toFixed(1)}배`).join(", "));
console.log("worst:", worst.map((r) => `${r.ko} ${r.mult.toFixed(1)}배`).join(", "));
