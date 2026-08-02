// 순위표 ts 팀 매핑 결손 감사 — data-sanity `standings_unmapped` 알림이 뜨면 이걸 돌린다.
//   npx tsx --env-file=.env.local scripts/audit-standings-mapping.ts            # 전 리그 요약
//   npx tsx --env-file=.env.local scripts/audit-standings-mapping.ts EGYPT_PL   # 리그별 상세(ts 팀명 + DB 후보)
//
// 결손 = TheSportsStandingsCache 의 team_id 가 team-id-mapping.json 에 없는 것. 그 행은
// getFullStandings 에서 통째로 버려지고 빈자리를 stale af 캐시가 메워 순위표가 오염된다
// (메모리 kleague-standings-mapping-gap). 조치는 json 에 엔트리 추가.
//
// 상세 모드는 ts 팀명을 TheSports 에서 직접 조회한다 (IP whitelist 필요 — 워커/로컬만 가능,
// Vercel 불가). 후보 풀은 "그 리그 Team 행 + 그 리그 매치가 참조하는 팀 행" 으로, 라벨이
// 다른 기존 행을 재사용해 중복 생성을 막기 위함이다.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import mapping from "@/lib/sports/thesports/team-id-mapping.json";

type Entry = { ourId: number; ourName: string; ourLeague: string; tsId: string; tsName?: string };

/** 매핑률 50% 미만은 미온보딩 대회 — 표 자체를 안 그리므로 경보 대상이 아니다(봇과 동일 기준). */
const PARTIAL_THRESHOLD = 0.5;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function tsTeamName(uuid: string): Promise<string | null> {
  try {
    const r = (await thesportsGet("/v1/football/team/additional/list", { uuid })) as unknown as {
      results?: Array<{ name?: string }>;
    };
    return r.results?.[0]?.name ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const only = process.argv.slice(2);
  const entries = mapping as Entry[];
  const mapped = new Set(entries.map((e) => `${e.ourLeague}|${e.tsId}`));
  const usedOurId = new Map<string, Set<number>>();
  for (const e of entries) {
    if (!usedOurId.has(e.ourLeague)) usedOurId.set(e.ourLeague, new Set());
    usedOurId.get(e.ourLeague)!.add(e.ourId);
  }

  const caches = await prisma.theSportsStandingsCache.findMany();
  let totalMissing = 0;
  let partialLeagues = 0;

  for (const cache of caches) {
    if (only.length && !only.includes(cache.league)) continue;
    const payload = cache.payload as unknown as {
      tables?: Array<{ rows?: Array<{ team_id?: string; position?: number }> }>;
    };
    const ids = [
      ...new Set(
        (payload?.tables ?? [])
          .flatMap((t) => t.rows ?? [])
          .filter((r) => r.team_id && r.position != null)
          .map((r) => r.team_id as string),
      ),
    ];
    if (ids.length < 4) continue;
    const missing = ids.filter((id) => !mapped.has(`${cache.league}|${id}`));
    if (!missing.length) continue;
    const rate = (ids.length - missing.length) / ids.length;
    if (!only.length && rate < PARTIAL_THRESHOLD) continue;

    totalMissing += missing.length;
    partialLeagues++;
    console.log(
      `${cache.league.padEnd(20)} ${ids.length - missing.length}/${ids.length} (${(rate * 100).toFixed(0)}%) 결손 ${missing.length}`,
    );
    if (!only.length) continue;

    // 상세 모드 — ts 팀명 조회 + DB 후보 제시
    const leagueTeams = await prisma.team.findMany({
      where: { league: cache.league },
      select: { id: true, name: true },
    });
    const matchTeams = await prisma.match.findMany({
      where: { league: cache.league },
      select: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
      take: 2000,
    });
    const pool = new Map<number, string>();
    for (const t of leagueTeams) pool.set(t.id, t.name);
    for (const m of matchTeams) {
      if (m.homeTeam) pool.set(m.homeTeam.id, m.homeTeam.name);
      if (m.awayTeam) pool.set(m.awayTeam.id, m.awayTeam.name);
    }
    const used = usedOurId.get(cache.league) ?? new Set<number>();

    for (const tsId of missing) {
      const name = (await tsTeamName(tsId)) ?? "(조회 실패)";
      const key = normalize(name);
      const cands = [...pool.entries()]
        .map(([id, teamName]) => {
          const cn = normalize(teamName);
          const hit =
            cn === key ||
            (cn.length >= 5 && key.length >= 5 && (cn.includes(key) || key.includes(cn)));
          return { id, teamName, hit, free: !used.has(id) };
        })
        .filter((c) => c.hit)
        .sort((a, b) => Number(b.free) - Number(a.free));
      console.log(
        `  "${name}" [${tsId}] → ${
          cands.length
            ? cands.map((c) => `${c.teamName}#${c.id}${c.free ? "" : "(사용중)"}`).join(" | ")
            : "후보 없음 — Team row 부재(승격팀 미수집)일 가능성"
        }`,
      );
    }
  }

  console.log(`\n부분 결손 리그 ${partialLeagues}개 / 결손 팀 ${totalMissing}개`);
  await prisma.$disconnect();
}

main();
