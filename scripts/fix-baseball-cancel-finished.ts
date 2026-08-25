// 취소된 야구 경기가 "종료 0-0" 으로 굳은 것을 연기(POSTPONED)로 정정한다.
//
// 원인은 collect 의 mergeStatus 가 `homeScore != null` 로 "지킬 결과가 있나" 를 재던 것.
// 0-0 이 점수 있음으로 읽혀, 소스가 매 수집마다 POST 를 줘도 FINISHED 가 고착했다.
// 코드는 hasProtectedResult 로 고쳤지만(2026-08-25), collect 는 today±7일 창만 다시
// 읽으므로 창 밖에서 이미 굳은 과거 매치는 자가치유되지 않는다 → 이 스크립트로 1회 정정.
//
// 대상 게이트 3중. (1) 야구 리그 (2) status=FINISHED + 0-0 (3) 마지막 소스 응답(raw)이
// 연기/취소. 셋을 다 만족해야 손댄다 — 소스가 FT 라고 하는 0-0 은 진짜 결과일 수 있다.
//
// 사용: npx tsx --env-file=.env.local scripts/fix-baseball-cancel-finished.ts [--apply]
import { prisma } from "@/lib/db";
import { rejectPreviewsForPostponed } from "@/lib/reject-stale-previews";

const BASEBALL = ["KBO", "NPB", "MLB", "LMB", "CPBL", "KBO_FUTURES"];
/** 소스가 "안 열렸다" 고 말하는 status short. CANC 는 미래 기벽이 있으나 여기선 과거 매치만 본다. */
const CANCEL_SHORT = ["POST", "CANC", "ABD", "SUSP", "PST"];

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await prisma.match.findMany({
    where: { league: { in: BASEBALL }, status: "FINISHED", homeScore: 0, awayScore: 0 },
    select: { id: true, league: true, startTime: true, raw: true, predCorrect: true },
    orderBy: { startTime: "asc" },
  });
  const targets = rows.filter((m) => {
    const short = String(m.raw ?? "").match(/"short":"([A-Z_]+)"/)?.[1];
    return short != null && CANCEL_SHORT.includes(short);
  });

  console.log(`야구 FINISHED 0-0 ${rows.length}건 중 소스가 연기/취소 = ${targets.length}건`);
  for (const m of targets) {
    console.log(`  #${m.id} ${m.league} ${m.startTime.toISOString().slice(0, 10)} predCorrect=${m.predCorrect}`);
  }
  if (targets.length === 0) return;
  if (!apply) {
    console.log("\n--apply 없이 실행 — 아무것도 바꾸지 않았다.");
    return;
  }

  const ids = targets.map((m) => m.id);
  const res = await prisma.match.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "POSTPONED",
      homeScore: null,
      awayScore: null,
      // 열리지 않은 경기의 채점은 무효 — 남겨두면 적중률이 오답으로 깎인다.
      predCorrect: null,
      predDcCorrect: null,
      predOverCorrect: null,
      predBttsCorrect: null,
      predHcCorrect: null,
      apiPredCorrect: null,
    },
  });
  const rejected = await rejectPreviewsForPostponed(ids);
  // 회원 픽도 미정산으로 되돌린다 — 경기가 없었으니 맞고 틀림이 없다.
  const picks = await prisma.post.updateMany({
    where: { matchId: { in: ids }, isCorrect: { not: null } },
    data: { isCorrect: null, settledAt: null },
  });
  console.log(`\n정정 ${res.count}건 / PREVIEW 회수 ${rejected}건 / 픽 정산취소 ${picks.count}건`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
