// 예정 경기 예측 생성 잡 — 경기 전에 픽을 확정해 둔다.
//
// 지금까지 1X2 는 PREVIEW 글 생성이, 핸디·OU·DC 는 종료 후 채점 잡이 부수적으로 채웠다.
// 그래서 예정 경기에는 픽이 거의 없었다(2026-08-03 실측: 향후 24시간 74경기 중 3건).
// 이 잡이 채점과 무관하게 미리 계산해 /picks/strong 같은 사전 노출 화면을 가능하게 한다.
//
// 사용:
//   npx tsx --env-file=.env.local src/jobs/predict-upcoming.ts          (dry-run)
//   npx tsx --env-file=.env.local src/jobs/predict-upcoming.ts --apply
//   옵션: --hours=72 (기본 72) · --force (이미 있는 예측도 덮어씀)
import "@/lib/env";
import { prisma } from "@/lib/db";
import { computePrediction, type PredictionInput } from "@/lib/predict/compute-prediction";
import type { PredictMatch } from "@/lib/predict/types";
import { pickReadiness } from "@/lib/predict/pick-readiness";

export interface PredictUpcomingResult {
  scanned: number;
  computed: number;
  saved: number;
  skippedHasPred: number;
  skippedNoData: number;
  /** 아직 낼 때가 아니라 미룬 것 — 야구 선발 미확정 · 축구 하루 이상 남음 */
  skippedNotReady: Record<string, number>;
  byLeague: Record<string, number>;
}

export async function runPredictUpcoming(opts?: {
  hours?: number;
  apply?: boolean;
  force?: boolean;
}): Promise<PredictUpcomingResult> {
  const hours = opts?.hours ?? 72;
  const apply = opts?.apply ?? false;
  const force = opts?.force ?? false;
  const now = new Date();

  const pending = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: new Date(now.getTime() + hours * 3600_000) },
    },
    select: {
      id: true, league: true, homeTeamId: true, awayTeamId: true, startTime: true,
      homeStarter: true, awayStarter: true, homeGoalie: true, awayGoalie: true,
      marketHome: true, marketDraw: true, marketAway: true, marketBookmakers: true,
      predHome: true, predHcProb: true,
      homeTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const res: PredictUpcomingResult = {
    scanned: pending.length, computed: 0, saved: 0,
    skippedHasPred: 0, skippedNoData: 0, skippedNotReady: {}, byLeague: {},
  };
  if (!pending.length) return res;

  // 리그별 전체 매치를 한 번씩만 읽어 in-memory 로 재사용 (evaluate 와 같은 방식)
  const cache = new Map<string, PredictMatch[]>();
  for (const lg of new Set(pending.map((m) => m.league))) {
    const list = await prisma.match.findMany({
      where: { league: lg },
      select: {
        id: true, league: true, status: true, homeTeamId: true, awayTeamId: true,
        homeScore: true, awayScore: true, startTime: true,
      },
    });
    cache.set(lg, list as PredictMatch[]);
  }

  for (const m of pending) {
    // 이미 확정된 픽은 그대로 둔다 — 사용자가 본 픽이 나중에 바뀌면 신뢰를 잃는다.
    if (!force && m.predHome != null && m.predHcProb != null) {
      res.skippedHasPred++;
      continue;
    }
    if (m.homeTeamId == null || m.awayTeamId == null) {
      res.skippedNoData++;
      continue;
    }
    // 야구는 선발 확정 전, 축구는 하루 이상 남았으면 아직 낼 때가 아니다 — 다음 회차에 다시 본다
    const ready = pickReadiness(m, now);
    if (!ready.ready) {
      const k = ready.reason ?? "미상";
      res.skippedNotReady[k] = (res.skippedNotReady[k] ?? 0) + 1;
      continue;
    }
    const out = computePrediction(m as PredictionInput, cache.get(m.league)!);
    if (!out) {
      res.skippedNoData++;
      continue;
    }
    res.computed++;
    res.byLeague[m.league] = (res.byLeague[m.league] ?? 0) + 1;

    if (!apply) continue;
    // correct 필드는 건드리지 않는다 — 채점은 evaluate 잡의 몫이다.
    await prisma.match
      .update({
        where: { id: m.id },
        data: {
          predHome: out.predHome, predDraw: out.predDraw, predAway: out.predAway,
          predWinner: out.predWinner,
          ...(out.predOverProb != null ? { predOverProb: out.predOverProb, predOverPick: out.predOverPick } : {}),
          ...(out.predHcProb != null ? { predHcLine: out.predHcLine, predHcPick: out.predHcPick, predHcProb: out.predHcProb } : {}),
          ...(out.predDcProb != null ? { predDcPick: out.predDcPick, predDcProb: out.predDcProb } : {}),
        },
      })
      .then(() => { res.saved++; })
      .catch((e) => {
        console.warn(`[predict-upcoming] m#${m.id} 저장 실패: ${(e as Error).message}`);
      });
  }
  return res;
}

if (require.main === module) {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  const hours = Number(arg("hours") ?? 72);
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  runPredictUpcoming({ hours, apply, force })
    .then((r) => {
      console.log(`[predict-upcoming] ${apply ? "적용" : "dry-run"} · 창 ${hours}h`);
      console.log(`  대상 ${r.scanned} · 계산 ${r.computed} · 저장 ${r.saved}`);
      console.log(`  skip — 이미 픽 있음 ${r.skippedHasPred} · 데이터 부족 ${r.skippedNoData}`);
      const nr = Object.entries(r.skippedNotReady);
      if (nr.length) console.log(`  대기 — ${nr.map(([k, n]) => `${k} ${n}`).join(" · ")}`);
      const top = Object.entries(r.byLeague).sort((a, b) => b[1] - a[1]).slice(0, 15);
      if (top.length) console.log("  리그별: " + top.map(([l, n]) => `${l} ${n}`).join(" · "));
      if (!apply) console.log("  (반영하려면 --apply)");
    })
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
