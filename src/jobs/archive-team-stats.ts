// 팀 시즌 통계 아카이브 잡 — ts /v1/football/season/recent/team/stat (리그당 1콜) 를
// (teamId, seasonLabel) 로 매일 upsert. 시즌 롤오버로 라벨이 바뀌면 이전 시즌 행이 자연
// 동결된다 (SeasonStandingsArchive 와 동일 설계). 위키형 데이터 축적 2단계.
//
// 시즌 uuid: CompetitionSeason ACTIVE(ts) 우선. 없으면 순위 캐시의 tsSeasonId 를 쓰되,
// 레지스트리 ACTIVE 와 어긋나면 skip (지난 시즌 데이터를 새 라벨로 굳히는 오라벨 방지).
// 가드: 경기 수 퇴행이면 덮어쓰지 않음 (부분 응답으로 최종 집계를 훼손하는 사고 차단).
import "@/lib/env";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { SOCCER_LEAGUES } from "@/lib/sports/types";
import { seasonLabelFor } from "@/lib/sports/season-calendar";
import { PROVIDER_TS, getActiveSeason, resolveSeasonYear } from "@/lib/sports/season-registry";

/** 팀 페이지 TeamStat 형태 — data/team-season-stats.json 과 동일 필드. */
export interface ArchivedTeamStat {
  lg: string;
  name: string;
  matches: number | null;
  goals: number | null;
  against: number | null;
  poss: number | null;
  shots: number | null;
  sot: number | null;
  passAcc: number | null;
  dribbleSucc: number | null;
  tackles: number | null;
  corners: number | null;
  fouls: number | null;
  yellow: number | null;
  red: number | null;
}

interface TsTeamStatRow {
  team?: { id?: string; name?: string };
  matches?: number;
  goals?: number;
  goals_against?: number;
  ball_possession?: number;
  shots?: number;
  shots_on_target?: number;
  passes?: number;
  passes_accuracy?: number;
  dribble?: number;
  dribble_succ?: number;
  tackles?: number;
  corner_kicks?: number;
  fouls?: number;
  yellow_cards?: number;
  red_cards?: number;
}

const n = (v: unknown): number | null => (typeof v === "number" ? v : null);

export async function upsertTeamStat(
  teamId: number,
  league: string,
  seasonLabel: string,
  stat: ArchivedTeamStat,
): Promise<"saved" | "regress-skip"> {
  const existing = await prisma.teamSeasonStatArchive.findUnique({
    where: { teamId_seasonLabel: { teamId, seasonLabel } },
    select: { stat: true },
  });
  if (existing) {
    const prev = (existing.stat as unknown as ArchivedTeamStat)?.matches ?? 0;
    if ((prev ?? 0) > (stat.matches ?? 0)) return "regress-skip";
  }
  await prisma.teamSeasonStatArchive.upsert({
    where: { teamId_seasonLabel: { teamId, seasonLabel } },
    create: { teamId, league, seasonLabel, stat: stat as unknown as Prisma.InputJsonValue },
    update: { league, stat: stat as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
  });
  return "saved";
}

export async function runArchiveTeamStats() {
  const out = { leagues: 0, saved: 0, regress: 0, empty: 0, skipMismatch: 0, failures: [] as string[] };

  // ts 순위 캐시가 있는 축구 리그 = ts 시즌 uuid 를 아는 리그
  const caches = await prisma.theSportsStandingsCache.findMany({
    select: { league: true, tsSeasonId: true },
  });
  const soccer = new Set(SOCCER_LEAGUES as readonly string[]);

  for (const c of caches) {
    if (!soccer.has(c.league)) continue; // 야구(KBO/NPB) 캐시 제외 — 이 엔드포인트는 축구 전용
    try {
      const active = await getActiveSeason(c.league, PROVIDER_TS);
      let uuid = c.tsSeasonId;
      if (active?.providerSeasonId) {
        uuid = active.providerSeasonId;
      } else if (active) {
        // 레지스트리는 있는데 uuid 없음 — 캐시 uuid 그대로
      }
      // 레지스트리 ACTIVE 가 있고 캐시 uuid 와 다르면 캐시 쪽은 무시하고 ACTIVE 를 쓴다(위에서 반영됨).
      const r = await thesportsGet<{ code: number; results?: TsTeamStatRow[] }>(
        "/v1/football/season/recent/team/stat",
        { uuid },
      );
      const rows = r?.results ?? [];
      out.leagues++;
      if (rows.length === 0) {
        out.empty++;
        continue;
      }

      // ts team id → 우리 Team.id (TeamSourceId, 해당 리그 팀만)
      const srcRows = await prisma.teamSourceId.findMany({
        where: { source: "thesports", team: { league: c.league } },
        select: { externalId: true, teamId: true },
      });
      const tsToOur = new Map(srcRows.map((s) => [s.externalId, s.teamId]));

      const label = seasonLabelFor(c.league, await resolveSeasonYear(c.league));
      // 팀별 직렬 왕복(조회+upsert)이면 130개 리그에서 분 단위로 밀린다 — 리그 단위 배치.
      const pending: { teamId: number; stat: ArchivedTeamStat }[] = [];
      for (const row of rows) {
        const tsId = row.team?.id;
        if (!tsId) continue;
        const ourId = tsToOur.get(tsId);
        if (ourId == null) continue; // 매핑 없는 팀 — 팀 페이지 자체가 없어 아카이브 무의미
        const passes = n(row.passes);
        const passesAcc = n(row.passes_accuracy);
        const stat: ArchivedTeamStat = {
          lg: c.league,
          name: row.team?.name ?? "?",
          matches: n(row.matches),
          goals: n(row.goals),
          against: n(row.goals_against),
          poss: n(row.ball_possession),
          shots: n(row.shots),
          sot: n(row.shots_on_target),
          passAcc: passes && passesAcc != null ? Math.round((passesAcc / passes) * 100) : null,
          dribbleSucc: n(row.dribble_succ),
          tackles: n(row.tackles),
          corners: n(row.corner_kicks),
          fouls: n(row.fouls),
          yellow: n(row.yellow_cards),
          red: n(row.red_cards),
        };
        // 개막 전/집계 전 placeholder — 0경기면 굳힐 가치 없음
        if (!stat.matches) continue;
        pending.push({ teamId: ourId, stat });
      }
      if (pending.length === 0) continue;
      // 기존 행 일괄 조회(퇴행 가드) 후 upsert 병렬 8
      const existingRows = await prisma.teamSeasonStatArchive.findMany({
        where: { seasonLabel: label, teamId: { in: pending.map((p) => p.teamId) } },
        select: { teamId: true, stat: true },
      });
      const prevMatches = new Map(
        existingRows.map((e) => [e.teamId, (e.stat as unknown as ArchivedTeamStat)?.matches ?? 0]),
      );
      const todo = pending.filter((p) => (prevMatches.get(p.teamId) ?? 0) <= (p.stat.matches ?? 0));
      out.regress += pending.length - todo.length;
      for (let i = 0; i < todo.length; i += 8) {
        await Promise.all(
          todo.slice(i, i + 8).map((p) =>
            prisma.teamSeasonStatArchive.upsert({
              where: { teamId_seasonLabel: { teamId: p.teamId, seasonLabel: label } },
              create: { teamId: p.teamId, league: c.league, seasonLabel: label, stat: p.stat as unknown as Prisma.InputJsonValue },
              update: { league: c.league, stat: p.stat as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
            }),
          ),
        );
      }
      out.saved += todo.length;
    } catch (e) {
      out.failures.push(`${c.league}: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  return out;
}

// 직접 실행 (npx tsx --env-file=.env.local src/jobs/archive-team-stats.ts)
if (import.meta.url === `file://${process.argv[1]}`) {
  runArchiveTeamStats()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
