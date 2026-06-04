// Dixon-Coles vs Elo 백테스트 (walk-forward, out-of-sample).
//   npx tsx --env-file=.env.local scripts/_backtest-dixon-coles.ts
//
// 각 매치마다: 그 매치 "이전" 경기만으로 Elo / DC / 블렌드(0.5·0.5) 학습 → 예측 →
// 실제 결과와 비교. 1X2 적중률 + 로그손실(낮을수록 좋음) + DC 오버언더 적중률.
// 블렌드가 단일모델보다 좋으면 = 스태킹(Phase 2) 가치 입증.

import { prisma } from "@/lib/db";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcWinProbability } from "@/lib/predict/win-probability";
import { fitDixonColes, predictDixonColes, type DcMatch } from "@/lib/predict/dixon-coles";
import type { PredictMatch } from "@/lib/predict/types";

const LEAGUES = ["EPL", "LALIGA", "SERIE_A", "BUNDESLIGA", "LIGUE_1", "MLS"];

type Row = {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  startTime: Date;
};

function actual(h: number, a: number): "H" | "D" | "A" {
  return h > a ? "H" : h < a ? "A" : "D";
}
function argmax3(ph: number, pd: number, pa: number): "H" | "D" | "A" {
  if (ph >= pd && ph >= pa) return "H";
  if (pa >= pd && pa >= ph) return "A";
  return "D";
}
function clamp(p: number) {
  return Math.max(1e-6, Math.min(1, p));
}
function norm(h: number, d: number, a: number) {
  const s = h + d + a || 1;
  return { h: h / s, d: d / s, a: a / s };
}

interface Acc {
  n: number;
  eloHit: number;
  dcHit: number;
  blendHit: number;
  eloLL: number;
  dcLL: number;
  blendLL: number;
  ouN: number;
  ouHit: number;
}
function newAcc(): Acc {
  return { n: 0, eloHit: 0, dcHit: 0, blendHit: 0, eloLL: 0, dcLL: 0, blendLL: 0, ouN: 0, ouHit: 0 };
}

async function runLeague(league: string, agg: Acc): Promise<Acc | null> {
  const rows = (await prisma.match.findMany({
    where: { league, status: "FINISHED", homeScore: { not: null }, awayScore: { not: null } },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true },
    orderBy: { startTime: "asc" },
  })) as Row[];

  if (rows.length < 120) return null;
  const warmup = Math.max(60, Math.floor(rows.length * 0.25));
  const acc = newAcc();

  for (let k = warmup; k < rows.length; k++) {
    const m = rows[k];
    const prior = rows.slice(0, k);

    // Elo
    const eloTable = calcEloTable(prior as unknown as PredictMatch[]);
    const eh = getElo(eloTable, m.homeTeamId);
    const ea = getElo(eloTable, m.awayTeamId);
    const ew = calcWinProbability(eh, ea, league);
    const elo = norm(ew.home, ew.draw, ew.away);

    // DC
    const s = fitDixonColes(prior as DcMatch[], m.startTime);
    const dcp = predictDixonColes(s, m.homeTeamId, m.awayTeamId);
    const dc = norm(dcp.probHome, dcp.probDraw, dcp.probAway);

    // Blend 50/50
    const bl = norm((elo.h + dc.h) / 2, (elo.d + dc.d) / 2, (elo.a + dc.a) / 2);

    const act = actual(m.homeScore, m.awayScore);
    acc.n++;
    if (argmax3(elo.h, elo.d, elo.a) === act) acc.eloHit++;
    if (argmax3(dc.h, dc.d, dc.a) === act) acc.dcHit++;
    if (argmax3(bl.h, bl.d, bl.a) === act) acc.blendHit++;
    const pick = (p: { h: number; d: number; a: number }) => (act === "H" ? p.h : act === "D" ? p.d : p.a);
    acc.eloLL += -Math.log(clamp(pick(elo)));
    acc.dcLL += -Math.log(clamp(pick(dc)));
    acc.blendLL += -Math.log(clamp(pick(bl)));

    // DC 오버언더 2.5
    const total = m.homeScore + m.awayScore;
    const ouPickOver = dcp.probOver25 >= 0.5;
    const ouActualOver = total >= 3;
    acc.ouN++;
    if (ouPickOver === ouActualOver) acc.ouHit++;
  }

  // 전체 누적
  agg.n += acc.n;
  agg.eloHit += acc.eloHit;
  agg.dcHit += acc.dcHit;
  agg.blendHit += acc.blendHit;
  agg.eloLL += acc.eloLL;
  agg.dcLL += acc.dcLL;
  agg.blendLL += acc.blendLL;
  agg.ouN += acc.ouN;
  agg.ouHit += acc.ouHit;
  return acc;
}

function pct(hit: number, n: number) {
  return n > 0 ? ((hit / n) * 100).toFixed(1) + "%" : "-";
}
function ll(sum: number, n: number) {
  return n > 0 ? (sum / n).toFixed(4) : "-";
}
function report(label: string, a: Acc) {
  console.log(
    `${label.padEnd(12)} n=${String(a.n).padStart(4)} | 1X2 적중  Elo ${pct(a.eloHit, a.n)}  DC ${pct(a.dcHit, a.n)}  Blend ${pct(a.blendHit, a.n)}` +
      ` | 로그손실  Elo ${ll(a.eloLL, a.n)}  DC ${ll(a.dcLL, a.n)}  Blend ${ll(a.blendLL, a.n)}` +
      ` | DC O/U ${pct(a.ouHit, a.ouN)}`,
  );
}

async function main() {
  console.log("=== Dixon-Coles 백테스트 (walk-forward, out-of-sample) ===");
  console.log("적중률 ↑ 좋음 · 로그손실 ↓ 좋음\n");
  const agg = newAcc();
  for (const lg of LEAGUES) {
    const a = await runLeague(lg, agg);
    if (a) report(lg, a);
    else console.log(`${lg.padEnd(12)} (데이터 부족 skip)`);
  }
  console.log("");
  report("── 전체 ──", agg);
  // 블렌드 우위 요약
  const d1 = ((agg.blendHit - agg.eloHit) / agg.n) * 100;
  const dll = (agg.eloLL - agg.blendLL) / agg.n;
  console.log(
    `\n블렌드 vs Elo: 1X2 적중 ${d1 >= 0 ? "+" : ""}${d1.toFixed(1)}%p, 로그손실 ${dll >= 0 ? "-" : "+"}${Math.abs(dll).toFixed(4)} (양수=블렌드 우위)`,
  );
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
