// EPL 2026-27 시즌 프리뷰 롱폼용 데이터 빌더.
// 지난 시즌 FINISHED 로 Elo 를 만들고(승격팀은 최하위 시드), 새 시즌 SCHEDULED 380경기를
// 5,000회 몬테카를로 → 우승/Top4/강등 확률 + 예상 순위표. 여름 빅딜 4건도 함께 뽑는다.
// 출력: ~/scorebase-shorts/data/epl-preview.json + public/players/eplpv-*.png
import { PrismaClient } from "@prisma/client";
import { calcEloTable, getElo, STARTING_ELO } from "../../src/lib/predict/elo";
import { calcWinProbability } from "../../src/lib/predict/win-probability";
import { toKoreanTeamName } from "../../src/lib/team-names";
import type { PredictMatch } from "../../src/lib/predict/types";
import fs from "node:fs";
import path from "node:path";

const p = new PrismaClient();
const SHORTS = "/Users/kimss/scorebase-shorts";
const IMG_DIR = path.join(SHORTS, "public", "players");
const ITER = 5000;

// 팀 컬러 — 시즌 결산 롱폼(TEAMS20)과 동일 + 승격팀 후보들
const COLORS: Record<string, string> = {
  Arsenal: "#ef0107", "Manchester City": "#6caee0", "Manchester United": "#da291c",
  "Aston Villa": "#7b1642", Liverpool: "#00b2a9", Bournemouth: "#b50e12",
  Sunderland: "#eb172b", Brighton: "#0057b8", Brentford: "#e30613", Chelsea: "#034694",
  Fulham: "#cc9966", Newcastle: "#8d9296", Everton: "#003399", Leeds: "#ffcd00",
  "Crystal Palace": "#1b458f", "Nottingham Forest": "#dd0000", Tottenham: "#132257",
  "West Ham": "#7a263a", Burnley: "#6c1d45", Wolverhampton: "#fdb913",
  // 승격 후보권 (2025-26 챔피언십)
  Coventry: "#37b7e4", Middlesbrough: "#e21c23", "Sheffield United": "#ec2227",
  Leicester: "#003090", Ipswich: "#3a64a3", Southampton: "#d71920",
  "Sheffield Wednesday": "#0066b3", Blackburn: "#009ee0", Millwall: "#001d5e",
  Watford: "#fbee23", "West Bromwich": "#122f67", Wrexham: "#d62c2a",
  Stoke: "#e03a3e", Norwich: "#00a650", Hull: "#f5a12d",
};

async function download(url: string, filename: string): Promise<boolean> {
  const dst = path.join(IMG_DIR, filename);
  if (fs.existsSync(dst) && fs.statSync(dst).size > 500) return true;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    fs.writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const now = new Date();

  // ── 1) 지난 시즌 FINISHED → Elo + 최종 순위 ──
  const prevMatches = (await p.match.findMany({
    where: {
      league: "EPL", status: "FINISHED",
      startTime: { gte: new Date("2025-08-01"), lt: new Date("2026-07-01") },
    },
    select: { id: true, league: true, status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true },
  })) as unknown as PredictMatch[];
  console.log(`지난 시즌 FINISHED: ${prevMatches.length}경기`);
  const eloTable = calcEloTable(prevMatches);

  // 지난 시즌 최종 순위 (승점→득실차)
  const prevAgg = new Map<number, { pts: number; gd: number }>();
  for (const m of prevMatches) {
    if (m.homeScore == null || m.awayScore == null) continue;
    const h = prevAgg.get(m.homeTeamId) ?? { pts: 0, gd: 0 };
    const a = prevAgg.get(m.awayTeamId) ?? { pts: 0, gd: 0 };
    h.gd += m.homeScore - m.awayScore; a.gd += m.awayScore - m.homeScore;
    if (m.homeScore > m.awayScore) h.pts += 3;
    else if (m.homeScore < m.awayScore) a.pts += 3;
    else { h.pts += 1; a.pts += 1; }
    prevAgg.set(m.homeTeamId, h); prevAgg.set(m.awayTeamId, a);
  }
  const prevRank = new Map<number, number>();
  [...prevAgg.entries()]
    .sort((x, y) => y[1].pts - x[1].pts || y[1].gd - x[1].gd)
    .forEach(([tid], i) => prevRank.set(tid, i + 1));

  // ── 2) 새 시즌 SCHEDULED — (home,away) 쌍 dedup ──
  const schedRaw = await p.match.findMany({
    where: { league: "EPL", status: "SCHEDULED", startTime: { gte: now } },
    select: { homeTeamId: true, awayTeamId: true, startTime: true },
    orderBy: { startTime: "asc" },
  });
  const seen = new Set<string>();
  const sched = schedRaw.filter((m) => {
    const k = `${m.homeTeamId}-${m.awayTeamId}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  // 새 시즌 20팀 = 등장 빈도 상위 20
  const cnt = new Map<number, number>();
  for (const m of sched) {
    cnt.set(m.homeTeamId, (cnt.get(m.homeTeamId) ?? 0) + 1);
    cnt.set(m.awayTeamId, (cnt.get(m.awayTeamId) ?? 0) + 1);
  }
  const teamIds = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id]) => id);
  const idSet = new Set(teamIds);
  const fixtures = sched.filter((m) => idSet.has(m.homeTeamId) && idSet.has(m.awayTeamId));
  console.log(`새 시즌 fixture: raw ${schedRaw.length} → dedup ${sched.length} → 20팀 필터 ${fixtures.length} (기대 380)`);

  const teams = await p.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true, logoUrl: true } });
  const tmap = new Map(teams.map((t) => [t.id, t]));

  // 승격팀(지난 시즌 EPL 기록 없음) — Elo 시드 = 지난 시즌 최하위 Elo - 10
  const prevElos = [...prevAgg.keys()].map((tid) => getElo(eloTable, tid));
  const promoSeed = Math.min(...prevElos) - 10;
  const eloOf = (tid: number) => (prevAgg.has(tid) ? getElo(eloTable, tid) : promoSeed);
  const promoted = teamIds.filter((tid) => !prevAgg.has(tid));
  console.log(`승격팀 ${promoted.length}팀 (Elo 시드 ${promoSeed.toFixed(0)}):`, promoted.map((t) => tmap.get(t)?.name).join(", "));

  // ── 3) 5,000회 시뮬 ──
  const pending = fixtures.map((m) => {
    const wp = calcWinProbability(eloOf(m.homeTeamId), eloOf(m.awayTeamId), "EPL");
    return { h: m.homeTeamId, a: m.awayTeamId, ph: wp.home, pd: wp.draw };
  });
  const acc = new Map<number, { champ: number; top4: number; releg: number; pts: number; pos: number }>();
  for (const tid of teamIds) acc.set(tid, { champ: 0, top4: 0, releg: 0, pts: 0, pos: 0 });

  for (let it = 0; it < ITER; it++) {
    const pts = new Map<number, number>();
    for (const tid of teamIds) pts.set(tid, 0);
    for (const g of pending) {
      const r = Math.random();
      if (r < g.ph) pts.set(g.h, pts.get(g.h)! + 3);
      else if (r < g.ph + g.pd) { pts.set(g.h, pts.get(g.h)! + 1); pts.set(g.a, pts.get(g.a)! + 1); }
      else pts.set(g.a, pts.get(g.a)! + 3);
    }
    // 동점은 Elo 로 타이브레이크 (매 시뮬 GD 샘플 대신 — 영상용 단순화)
    const order = [...pts.entries()].sort((x, y) => y[1] - x[1] || eloOf(y[0]) - eloOf(x[0]));
    order.forEach(([tid, pt], i) => {
      const a = acc.get(tid)!;
      a.pts += pt; a.pos += i + 1;
      if (i === 0) a.champ++;
      if (i < 4) a.top4++;
      if (i >= 17) a.releg++;
    });
  }

  // ── 4) 팀 로고 + 표 구성 ──
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const rows = [];
  for (const tid of teamIds) {
    const t = tmap.get(tid)!;
    const a = acc.get(tid)!;
    const logo = `eplpv-${tid}.png`;
    if (t.logoUrl) await download(t.logoUrl, logo);
    const ko = toKoreanTeamName(t.name, "EPL");
    const lastPos = prevRank.get(tid) ?? null;
    const champion = (a.champ / ITER) * 100;
    const top4 = (a.top4 / ITER) * 100;
    const releg = (a.releg / ITER) * 100;
    // 한 줄 코멘트 — 데이터 기반 규칙
    let comment: string;
    if (lastPos == null) comment = "승격팀 — 1차 목표는 잔류";
    else if (champion >= 15) comment = `우승 확률 ${champion.toFixed(0)}% — 타이틀 후보`;
    else if (top4 >= 40) comment = `챔스권 확률 ${top4.toFixed(0)}%`;
    else if (releg >= 40) comment = `강등 위험 ${releg.toFixed(0)}%`;
    else comment = `지난 시즌 ${lastPos}위`;
    rows.push({
      teamId: tid, name: t.name, ko,
      color: COLORS[Object.keys(COLORS).find((k) => t.name.includes(k)) ?? ""] ?? "#64748b",
      logo, lastPos, promoted: lastPos == null,
      champion: +champion.toFixed(1), top4: +top4.toFixed(1), releg: +releg.toFixed(1),
      expPts: +(a.pts / ITER).toFixed(1), expPos: +(a.pos / ITER).toFixed(2),
      elo: Math.round(eloOf(tid)), comment,
    });
  }
  rows.sort((x, y) => x.expPos - y.expPos);
  rows.forEach((r, i) => ((r as any).pos = i + 1));

  // 상승/하락 (지난 시즌 대비, 승격팀 제외)
  const withLast = rows.filter((r) => r.lastPos != null) as (typeof rows[0] & { pos: number })[];
  const risers = [...withLast].sort((a, b) => (b.lastPos! - b.pos) - (a.lastPos! - a.pos)).slice(0, 3)
    .filter((r) => r.lastPos! - r.pos > 0);
  const fallers = [...withLast].sort((a, b) => (b.pos - b.lastPos!) - (a.pos - a.lastPos!)).slice(0, 3)
    .filter((r) => r.pos - r.lastPos! > 0);

  // ── 5) 여름 빅딜 (EPL 유입) ──
  const nameKeys = teams.map((t) => ({ id: t.id, name: t.name, key: t.name.replace(/ FC$/, "").toLowerCase() }));
  const trs = await p.footballTransfer.findMany({
    where: { transferFee: { gt: 0 }, transferTime: { gte: Math.floor(new Date("2026-06-01").getTime() / 1000) } },
    orderBy: { transferFee: "desc" }, take: 60,
    select: { playerId: true, fromTeamName: true, toTeamName: true, transferFee: true },
  });
  const deals: { name: string; from: string; to: string; toLogo: string; fee: number }[] = [];
  for (const tr of trs) {
    if (deals.length >= 4) break;
    const to = (tr.toTeamName ?? "").toLowerCase();
    const hit = nameKeys.find((k) => to.includes(k.key) || k.key.includes(to));
    if (!hit) continue;
    const pl = await p.theSportsPlayer.findUnique({ where: { id: tr.playerId }, select: { name: true, nameKo: true } });
    deals.push({
      name: pl?.nameKo || pl?.name || "?",
      from: tr.fromTeamName ?? "?", to: toKoreanTeamName(hit.name, "EPL"),
      toLogo: `eplpv-${hit.id}.png`, fee: Math.round((tr.transferFee ?? 0) / 1e6),
    });
  }
  console.log("빅딜:", deals.map((d) => `${d.name}→${d.to} €${d.fee}M`).join(" · "));

  const out = { generatedAt: now.toISOString(), season: "2026-27", opener: "2026-08-21", iterations: ITER, table: rows, risers, fallers, deals };
  fs.mkdirSync(path.join(SHORTS, "data"), { recursive: true });
  fs.writeFileSync(path.join(SHORTS, "data", "epl-preview.json"), JSON.stringify(out, null, 2));
  console.log(`✓ epl-preview.json (${rows.length}팀)`);
  console.log("예상 TOP6:", rows.slice(0, 6).map((r) => `${(r as any).pos}.${r.ko} ${r.champion}%`).join(" · "));
  console.log("강등권:", rows.slice(17).map((r) => `${(r as any).pos}.${r.ko}`).join(" · "));
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
