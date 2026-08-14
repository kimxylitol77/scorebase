// 핸디캡 모델에 선발 투수를 넣을지 결정하는 백테스트.
//
// 배경. 1X2 와 오버언더는 선발을 쓰는데 핸디캡만 안 써서, 같은 팀 3연전이면 선발이 누구든
// 확률이 소수점까지 같았다(2026-08-14 실측). 채점 2,155경기에서 픽 방향이 선발 우위와
// 같으면 67.0%, 반대면 58.6% — 모델이 안 쓰는 정보가 결과를 8.4%p 가르고 있었다.
//
// 이 스크립트는 predictHandicapMarket 의 starterWeight 를 스윕해 실제 코드 경로로 재채점한다.
// 누수는 없다 — teamGoalAverages 가 asOf 이전 FINISHED 경기만 쓴다.
//
// ⚠️ 채택 판단은 전체 수치가 아니라 시간 분할(전반/후반)이 같은 방향인지로 한다.
//    전체만 보고 최적 k 를 고르면 과적합이다.
//
//   npx tsx --env-file=.env.local scripts/backtest-handicap-starter.ts
//   npx tsx --env-file=.env.local scripts/backtest-handicap-starter.ts --league=MLB
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import { predictHandicapMarket, handicapCorrect } from "../src/lib/predict/markets";
import type { PredictMatch } from "../src/lib/predict/types";

const prisma = new PrismaClient();
const LEAGUES = ["MLB", "KBO", "NPB"];
const WEIGHTS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5];
const STRONG = 0.65; // /picks/strong 핸디 임계

interface Bucket { n: number; hit: number; strongN: number; strongHit: number; flipped: number }
const B = (): Bucket => ({ n: 0, hit: 0, strongN: 0, strongHit: 0, flipped: 0 });
const pct = (h: number, n: number) => (n ? ((h / n) * 100).toFixed(1) : "-");
const era = (s: string | null): number | null => {
  try {
    const v = JSON.parse(s ?? "null")?.era;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
};

async function run(league: string) {
  const rows = await prisma.match.findMany({
    where: { league },
    select: {
      id: true, league: true, status: true, homeTeamId: true, awayTeamId: true,
      homeScore: true, awayScore: true, startTime: true, homeStarter: true, awayStarter: true,
    },
    orderBy: { startTime: "asc" },
  });
  const all: PredictMatch[] = rows.map((r) => ({
    id: r.id, league: r.league, status: r.status, homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId, homeScore: r.homeScore, awayScore: r.awayScore, startTime: r.startTime,
  }));

  // 평가 대상 — 채점 가능 + 양쪽 선발 ERA 가 있는 경기만(선발을 넣고 뺀 비교라 조건을 맞춘다)
  const targets = rows
    .map((r) => ({ r, he: era(r.homeStarter), ae: era(r.awayStarter) }))
    .filter((x) => x.r.status === "FINISHED" && x.r.homeScore != null && x.r.awayScore != null && x.he != null && x.ae != null);
  if (!targets.length) {
    console.log(`\n${league}: 평가 가능 경기 없음`);
    return;
  }
  // 시간 분할 — 한 구간에서만 좋아지는 값은 과적합이라 잘게 쪼개 본다
  const SPLITS = Number(process.argv.find((a) => a.startsWith("--splits="))?.split("=")[1] ?? 2);
  const cuts = Array.from({ length: SPLITS - 1 }, (_, i) =>
    targets[Math.floor((targets.length * (i + 1)) / SPLITS)].r.startTime);
  const segOf = (t: Date) => cuts.findIndex((c) => t < c) === -1 ? SPLITS - 1 : cuts.findIndex((c) => t < c);

  console.log(`\n══ ${league} — 평가 ${targets.length}경기 · ${SPLITS}분할 (경계 ${cuts.map((c) => c.toISOString().slice(0, 10)).join(" / ")})`);
  console.log(`가중치   전체            고확신(65%+)     ${Array.from({ length: SPLITS }, (_, i) => `구간${i + 1}`.padEnd(14)).join("")}픽바뀜`);

  const basePick = new Map<number, string>();
  for (const w of WEIGHTS) {
    const total = B();
    const segs = Array.from({ length: SPLITS }, B);
    for (const { r, he, ae } of targets) {
      const hc = predictHandicapMarket(all, league, r.homeTeamId, r.awayTeamId, r.startTime, {
        homeStarterEra: he, awayStarterEra: ae, starterWeight: w,
      });
      if (!hc) continue;
      const ok = handicapCorrect(hc.pick, hc.line, r.homeScore!, r.awayScore!);
      if (w === 0) basePick.set(r.id, hc.pick);
      else if (basePick.get(r.id) !== hc.pick) total.flipped++;

      for (const b of [total, segs[segOf(r.startTime)]]) {
        b.n++; if (ok) b.hit++;
        if (hc.prob >= STRONG) { b.strongN++; if (ok) b.strongHit++; }
      }
    }
    console.log(
      `${w.toFixed(2).padStart(5)}   ` +
      `${pct(total.hit, total.n).padStart(5)}% ${String(total.n).padStart(5)}   ` +
      `${pct(total.strongHit, total.strongN).padStart(5)}% ${String(total.strongN).padStart(5)}픽   ` +
      segs.map((b) => `${pct(b.hit, b.n).padStart(5)}% ${String(b.n).padStart(4)}   `).join("") +
      `${String(total.flipped).padStart(4)}`,
    );
  }
}

async function main() {
  const only = process.argv.find((a) => a.startsWith("--league="))?.split("=")[1];
  for (const lg of only ? [only] : LEAGUES) await run(lg);
  console.log(`\n판단 기준. 전체·고확신·전반기·후반기가 모두 기준(0.00)보다 나아야 채택한다.`);
  console.log(`한쪽 반기만 좋아지면 과적합이므로 채택하지 않는다.`);
  await prisma.$disconnect();
}
main();
