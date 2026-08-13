// 역대 최고 이적료 글 이미지 2종 생성 — 데이터에서 SVG 조립 후 PNG 변환.
//   node --env-file=.env.local scripts/_create-blog-transfer-fee-images.mjs
// 히어로 = 이적료 TOP 5 막대 / 본문 = 이적료 대비 현재 시장가치 회수율 (TOP 10).
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EUR_KRW = 1791.5;
const eok = (eur) => Math.round((eur * EUR_KRW) / 1e8);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const BG = "#0b1220", CY = "#06b6d4", WH = "#f8fafc", MUTED = "#94a3b8", RED = "#f87171", GRN = "#34d399";
const FONT = "'Apple SD Gothic Neo','Noto Sans KR','Helvetica Neue',sans-serif";

const tr = await prisma.footballTransfer.findMany({
  where: { transferFee: { gt: 0 } }, orderBy: { transferFee: "desc" }, take: 50,
  select: { playerId: true, transferFee: true, transferTime: true },
});
const ids = [...new Set(tr.map((t) => t.playerId))];
const players = await prisma.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameKo: true } });
const pm = new Map(players.map((p) => [p.id, p.nameKo || p.name]));
const mvs = await prisma.playerMarketValue.findMany({ where: { id: { in: ids } }, select: { id: true, currentValue: true } });
const vm = new Map(mvs.map((m) => [m.id, m.currentValue]));
await prisma.$disconnect();

const rows = tr.map((t) => ({
  ko: pm.get(t.playerId) || "선수",
  fee: t.transferFee,
  year: new Date((t.transferTime ?? 0) * 1000).getFullYear(),
  mv: vm.get(t.playerId) ?? null,
}));

// ── 히어로 1200x630
const top5 = rows.slice(0, 5);
const maxFee = top5[0].fee;
const heroBars = top5.map((r, i) => {
  const y = 250 + i * 66;
  const w = Math.round((r.fee / maxFee) * 590);
  return `    <rect x="330" y="${y}" width="${w}" height="38" rx="6" fill="${i === 0 ? CY : "#164e63"}"/>
    <text x="314" y="${y + 26}" font-family="${FONT}" font-size="21" font-weight="700" fill="${WH}" text-anchor="end">${esc(r.ko)} <tspan fill="${MUTED}" font-size="16">${r.year}</tspan></text>
    <text x="${340 + w}" y="${y + 26}" font-family="${FONT}" font-size="19" font-weight="700" fill="${i === 0 ? CY : MUTED}">€${(r.fee / 1e6).toFixed(0)}M · ${eok(r.fee).toLocaleString()}억</text>`;
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
  <text x="80" y="180" font-family="${FONT}" font-size="58" font-weight="800" fill="${WH}">역대 최고 이적료 TOP 50</text>
  <text x="80" y="224" font-family="${FONT}" font-size="25" fill="${MUTED}">2026년 여름 이적까지 반영 · 옵션 포함 집계 기준</text>
${heroBars}
  <text x="80" y="592" font-family="${FONT}" font-size="19" fill="${MUTED}">scorebase.kr · 이적료 확인 ${tr.length >= 50 ? "23,435" : tr.length}건에서 집계</text>
</svg>`;

// ── 본문 1200x700 — TOP 10 회수율
const t10 = rows.slice(0, 10).filter((r) => r.mv !== null);
const ratio = (r) => ((r.mv - r.fee) / r.fee) * 100;
const AXIS = 760; // 0% 기준선 — 왼쪽은 이름 영역(60~440), 막대는 최대 300px 씩
const bars = t10.map((r, i) => {
  const y = 210 + i * 46;
  const pct = ratio(r);
  const up = pct >= 0;
  const w = Math.max(4, Math.round((Math.min(Math.abs(pct), 100) / 100) * 300));
  return `    <text x="60" y="${y + 22}" font-family="${FONT}" font-size="19" font-weight="700" fill="${WH}">${esc(r.ko)} <tspan fill="${MUTED}" font-size="15" font-weight="400">${r.year} · €${(r.fee / 1e6).toFixed(0)}M</tspan></text>
    <rect x="${up ? AXIS : AXIS - w}" y="${y + 6}" width="${w}" height="22" rx="4" fill="${up ? GRN : RED}"/>
    <text x="${up ? AXIS + w + 10 : AXIS - w - 10}" y="${y + 23}" font-family="${FONT}" font-size="18" font-weight="800" fill="${up ? GRN : RED}" text-anchor="${up ? "start" : "end"}">${up ? "+" : ""}${Math.round(pct)}%</text>`;
}).join("\n");

const chart = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="730" viewBox="0 0 1200 730">
  <rect width="1200" height="730" fill="${BG}"/>
  <text x="60" y="76" font-family="${FONT}" font-size="42" font-weight="800" fill="${WH}">지불한 이적료, 지금도 그 값을 하나</text>
  <text x="60" y="118" font-family="${FONT}" font-size="21" fill="${MUTED}">역대 이적료 TOP 10 — 현재 시장가치가 당시 이적료보다 몇 % 높은지 · 낮은지</text>
  <line x1="${AXIS}" y1="180" x2="${AXIS}" y2="${210 + t10.length * 46 + 10}" stroke="#334155" stroke-width="2"/>
  <text x="${AXIS}" y="172" font-family="${FONT}" font-size="16" fill="${MUTED}" text-anchor="middle">이적료와 같음 (0%)</text>
${bars}
  <text x="60" y="700" font-family="${FONT}" font-size="17" fill="${MUTED}">데이터: 스코어베이스 · 시장가치는 나이·계약 잔여 기간이 반영된 추정치입니다</text>
</svg>`;

const jobs = [
  ["public/blog/transfer-fee-ranking-hero", hero, 1200, 630],
  ["public/blog/transfer-fee-ranking-recovery", chart, 1200, 730],
];
for (const [path, svg, w, h] of jobs) {
  writeFileSync(`${path}.svg`, svg);
  await sharp(Buffer.from(svg), { density: 220 }).resize(w, h, { fit: "fill" }).png({ quality: 95 }).toFile(`${path}.png`);
  console.log(`${path}.png (${w}x${h})`);
}
console.log("TOP5:", top5.map((r) => `${r.ko} ${eok(r.fee)}억`).join(", "));
console.log("TOP10 회수율:", t10.map((r) => `${r.ko} ${Math.round(ratio(r))}%`).join(", "));
