// 부상자 일일 스냅샷 — 결장 영향을 나중에 백테스트하기 위한 원장을 쌓는다.
//
// 부상자는 api-football /injuries 를 그때그때 호출해 in-memory 로만 쓰고 있어 **과거 명단이
//   남지 않는다**. 그래서 "그날 누가 빠졌나 → 결과가 어땠나"를 검증할 수 없었다.
//
// ⚠️ 이 잡은 **예측을 바꾸지 않는다.** 데이터만 쌓는다. 승률 반영은 몇 달 뒤 백테스트를
//   통과해야 한다(기존 원칙: 새 시그널은 백테스트 통과만).
//
// 사용:
//   npx tsx --env-file=.env.local src/jobs/capture-injuries.ts          (dry-run)
//   npx tsx --env-file=.env.local src/jobs/capture-injuries.ts --apply
import "@/lib/env";
import { prisma } from "@/lib/db";
import { fetchSeasonInjuries } from "@/lib/sports/api-football-pro";
import { starterShareByAfId } from "@/lib/predict/starter-share";

/** 부상자 데이터가 실제로 오고, 시즌스탯으로 주전도까지 붙는 리그 (/injuries 페이지와 동일 집합) */
const LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "SAUDI_PL",
];

/** 유럽은 8월 개막이라 연도가 시즌 시작 해 — af 는 2025-26 을 season=2025 로 본다 */
function afSeason(now: Date): number {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() + 1 >= 7 ? y : y - 1;
}

export interface CaptureInjuriesResult {
  capturedOn: string;
  scanned: number;
  saved: number;
  withShare: number;
  withoutShare: number;
  byLeague: Record<string, number>;
}

export async function runCaptureInjuries(opts?: {
  apply?: boolean;
  leagues?: string[];
}): Promise<CaptureInjuriesResult> {
  const apply = opts?.apply ?? false;
  const now = new Date();
  // KST 기준 날짜 — 같은 날 재실행 시 멱등 키
  const capturedOn = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const season = afSeason(now);

  const res: CaptureInjuriesResult = {
    capturedOn, scanned: 0, saved: 0, withShare: 0, withoutShare: 0, byLeague: {},
  };

  for (const league of opts?.leagues ?? LEAGUES) {
    const rows = await fetchSeasonInjuries(league, season);
    if (!rows.length) continue;

    // af 는 시즌 전체 부상 이력을 준다 — 같은 선수가 여러 fixture 로 중복된다.
    // 오늘 시점의 "현재 상태"만 남기려 선수당 가장 최근 fixture 1건으로 접는다.
    const latest = new Map<number, (typeof rows)[0]>();
    for (const r of rows) {
      if (!r.playerId) continue;
      const prev = latest.get(r.playerId);
      if (!prev || (r.fixtureDate ?? "") > (prev.fixtureDate ?? "")) latest.set(r.playerId, r);
    }

    for (const r of latest.values()) {
      res.scanned++;
      res.byLeague[league] = (res.byLeague[league] ?? 0) + 1;
      // 주전도 — 없으면 null 로 둔다. 0 으로 채우면 "후보였다"로 오해돼 백테스트가 오염된다.
      const share = starterShareByAfId(r.playerId);
      if (share?.teamMinutesShare != null) res.withShare++;
      else res.withoutShare++;

      if (!apply) continue;
      await prisma.injurySnapshot
        .upsert({
          where: { capturedOn_league_playerAfId: { capturedOn, league, playerAfId: r.playerId } },
          create: {
            capturedOn, league,
            teamName: r.teamName ?? "",
            playerAfId: r.playerId,
            playerTsId: share?.tsId ?? null,
            playerName: r.playerName ?? "",
            reason: r.reason || null,
            type: r.type || null,
            starts: share?.starts ?? null,
            matches: share?.matches ?? null,
            minutes: share?.minutes ?? null,
            teamMinutesShare: share?.teamMinutesShare ?? null,
          },
          update: {
            reason: r.reason || null,
            type: r.type || null,
            teamMinutesShare: share?.teamMinutesShare ?? null,
          },
        })
        .then(() => { res.saved++; })
        .catch((e) => {
          console.warn(`[capture-injuries] ${league} af#${r.playerId} 저장 실패: ${(e as Error).message}`);
        });
    }
  }
  return res;
}

if (require.main === module) {
  const apply = process.argv.includes("--apply");
  runCaptureInjuries({ apply })
    .then((r) => {
      console.log(`[capture-injuries] ${apply ? "적용" : "dry-run"} · ${r.capturedOn}`);
      console.log(`  부상자 ${r.scanned}명 · 저장 ${r.saved}`);
      console.log(`  주전도 산출 ${r.withShare} · 스탯 없어 미상 ${r.withoutShare}`);
      console.log("  리그별: " + Object.entries(r.byLeague).map(([l, n]) => `${l} ${n}`).join(" · "));
      if (!apply) console.log("  (저장하려면 --apply)");
    })
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
