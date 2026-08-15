// 2026 여름 EPL 이적료 글 이미지 2종 생성 — 데이터에서 SVG 조립 후 PNG 변환.
//   npx tsx --env-file=.env.local scripts/_create-blog-epl-summer-transfers-images.ts
// 히어로 = 이적료 TOP 5 막대 / 본문 = TOP 20 이적료의 출처(잉글랜드 1부 vs 해외) 분해.
// 이름 해석은 발행 스크립트와 동일 경로(수동 사전 우선 → ts 자동 음역)를 쓴다.
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";

const EUR_KRW = 1791.5;
const SUMMER_START = Math.floor(new Date("2026-06-01T00:00:00Z").getTime() / 1000);
const N = 20;

const eok = (eur: number) => Math.round((eur * EUR_KRW) / 1e8);
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const BG = "#0b1220", CY = "#06b6d4", WH = "#f8fafc", MUTED = "#94a3b8", AMB = "#fbbf24";
const FONT = "'Apple SD Gothic Neo','Noto Sans KR','Helvetica Neue',sans-serif";

/** 2025-26 EPL 소속이었다가 강등된 3팀 — "잉글랜드 1부 출신" 에 포함. */
const RELEGATED = new Set(["웨스트햄", "번리", "울버햄프턴"]);

async function main() {
  const teams = await prisma.team.findMany({ where: { league: "EPL" }, select: { name: true } });
  const EPL20 = new Set(teams.map((t) => toKoreanTeamName(t.name, "EPL")));

  const tr = await prisma.footballTransfer.findMany({
    where: { league: "EPL", transferTime: { gte: SUMMER_START }, transferFee: { gt: 0 } },
    orderBy: { transferFee: "desc" },
    select: { playerId: true, fromTeamName: true, toTeamName: true, transferFee: true },
  });
  const inbound = tr.filter((t) => t.toTeamName && EPL20.has(toKoreanTeamName(t.toTeamName, "EPL"))).slice(0, N);
  const players = await prisma.theSportsPlayer.findMany({
    where: { id: { in: inbound.map((t) => t.playerId) } },
    select: { id: true, name: true, nameKo: true },
  });
  const pm = new Map(players.map((p) => [p.id, p]));

  const rows = inbound.map((t) => {
    const p = pm.get(t.playerId);
    const en = p?.name ?? "";
    const dict = toKoreanPlayerName(en);
    const fromKo = toKoreanTeamName(t.fromTeamName ?? "", "");
    return {
      ko: en && dict !== en ? dict : (p?.nameKo ?? en ?? "선수"),
      fee: t.transferFee!,
      from: fromKo || "—",
      to: toKoreanTeamName(t.toTeamName!, "EPL"),
      home: EPL20.has(fromKo) || RELEGATED.has(fromKo),
    };
  });

  // ── 히어로 1200x630 — TOP 5 막대
  const top5 = rows.slice(0, 5);
  const maxFee = top5[0].fee;
  const heroBars = top5.map((r, i) => {
    const y = 250 + i * 66;
    const w = Math.round((r.fee / maxFee) * 500);
    return `    <rect x="420" y="${y}" width="${w}" height="38" rx="6" fill="${i === 0 ? CY : "#164e63"}"/>
    <text x="404" y="${y + 26}" font-family="${FONT}" font-size="21" font-weight="700" fill="${WH}" text-anchor="end">${esc(r.ko)} <tspan fill="${MUTED}" font-size="15">${esc(r.to)}</tspan></text>
    <text x="${430 + w}" y="${y + 26}" font-family="${FONT}" font-size="19" font-weight="700" fill="${i === 0 ? CY : MUTED}">€${(r.fee / 1e6).toFixed(0)}M · ${eok(r.fee).toLocaleString()}억</text>`;
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
  <text x="80" y="180" font-family="${FONT}" font-size="56" font-weight="800" fill="${WH}">2026 여름 EPL 이적료 TOP 5</text>
  <text x="80" y="224" font-family="${FONT}" font-size="25" fill="${MUTED}">6월 1일 ~ 8월 15일 · 프리미어리그 20개 구단 영입 · 옵션 포함 집계 기준</text>
${heroBars}
  <text x="80" y="592" font-family="${FONT}" font-size="19" fill="${MUTED}">scorebase.kr · 이적료가 확인되는 영입에서 집계</text>
</svg>`;

  // ── 본문 1200x680 — 이적료 출처 분해
  const sumFee = rows.reduce((s, r) => s + r.fee, 0);
  const homeRows = rows.filter((r) => r.home);
  const homeFee = homeRows.reduce((s, r) => s + r.fee, 0);
  const awayFee = sumFee - homeFee;
  const homePct = Math.round((homeFee / sumFee) * 100);

  const BAR_X = 80, BAR_W = 1040, BAR_Y = 250, BAR_H = 86;
  const homeW = Math.round((homeFee / sumFee) * BAR_W);

  const homeTop = homeRows.slice(0, 5).map((r, i) => {
    const y = 484 + i * 40;
    return `    <text x="80" y="${y}" font-family="${FONT}" font-size="20" fill="${WH}">${esc(r.from)} <tspan fill="${MUTED}">→</tspan> ${esc(r.to)}</text>
    <text x="1120" y="${y}" font-family="${FONT}" font-size="20" font-weight="700" fill="${CY}" text-anchor="end">€${(r.fee / 1e6).toFixed(0)}M</text>`;
  }).join("\n");

  const chart = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
  <rect width="1200" height="720" fill="${BG}"/>
  <text x="80" y="86" font-family="${FONT}" font-size="42" font-weight="800" fill="${WH}">큰돈은 리그 밖으로 나가지 않았다</text>
  <text x="80" y="128" font-family="${FONT}" font-size="21" fill="${MUTED}">2026 여름 EPL 이적료 TOP ${N} 합계 €${(sumFee / 1e6).toFixed(1)}M 을 직전 소속 기준으로 나눈 결과</text>

  <rect x="${BAR_X}" y="${BAR_Y}" width="${homeW}" height="${BAR_H}" rx="8" fill="${CY}"/>
  <rect x="${BAR_X + homeW}" y="${BAR_Y}" width="${BAR_W - homeW}" height="${BAR_H}" rx="8" fill="#334155"/>
  <text x="${BAR_X + 24}" y="${BAR_Y + 36}" font-family="${FONT}" font-size="23" font-weight="800" fill="#062c33">잉글랜드 1부 출신</text>
  <text x="${BAR_X + 24}" y="${BAR_Y + 68}" font-family="${FONT}" font-size="27" font-weight="800" fill="#062c33">${homePct}% · €${(homeFee / 1e6).toFixed(1)}M</text>
  <text x="${BAR_X + homeW + 24}" y="${BAR_Y + 36}" font-family="${FONT}" font-size="23" font-weight="800" fill="${WH}">해외</text>
  <text x="${BAR_X + homeW + 24}" y="${BAR_Y + 68}" font-family="${FONT}" font-size="27" font-weight="800" fill="${MUTED}">${100 - homePct}% · €${(awayFee / 1e6).toFixed(1)}M</text>

  <text x="80" y="390" font-family="${FONT}" font-size="22" font-weight="700" fill="${AMB}">${homeRows.length}건 / ${N}건이 지난 시즌 프리미어리그 구단에서 온 선수</text>
  <text x="80" y="442" font-family="${FONT}" font-size="19" fill="${MUTED}">리그 안에서 오간 상위 거래</text>
${homeTop}
  <text x="80" y="696" font-family="${FONT}" font-size="17" fill="${MUTED}">데이터: 스코어베이스 · 강등 3팀(웨스트햄·번리·울버햄프턴)도 지난 시즌 1부 소속으로 포함</text>
</svg>`;

  const jobs: [string, string, number, number][] = [
    ["public/blog/epl-summer-transfers-2026-hero", hero, 1200, 630],
    ["public/blog/epl-summer-transfers-2026-origin", chart, 1200, 720],
  ];
  for (const [path, svg, w, h] of jobs) {
    writeFileSync(`${path}.svg`, svg);
    await sharp(Buffer.from(svg), { density: 220 }).resize(w, h, { fit: "fill" }).png({ quality: 95 }).toFile(`${path}.png`);
    console.log(`WROTE ${path}.png (${w}x${h})`);
  }
  console.log(`합계 €${(sumFee / 1e6).toFixed(0)}M · 잉글랜드 ${homeRows.length}건 ${homePct}% · 해외 ${rows.length - homeRows.length}건`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
