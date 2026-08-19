// 순위표에는 있는데 우리 DB 에 Team row 가 없는 팀(주로 승격팀)을 생성 — 기본 dry-run, --write 로 기록.
//
//   npx tsx --env-file=.env.local scripts/create-missing-standings-teams.ts             # 전 리그 dry-run
//   npx tsx --env-file=.env.local scripts/create-missing-standings-teams.ts EGYPT_PL    # 리그 한정
//   npx tsx --env-file=.env.local scripts/create-missing-standings-teams.ts --write     # 실제 생성
//
// 왜 필요한가.
//   매핑이 없으면 /api/internal/thesports-matches 가 그 경기를 skippedNoTeam 으로 버린다.
//   그런데 Team row 는 경기가 수집돼야 생기므로, 승격팀은 "경기 못 받음 → row 없음 →
//   매핑 못 채움 → 경기 못 받음" 고리에 갇힌다. daily-ts-team-mapping 잡은 ts- externalId
//   Team 이 이미 있을 때만 동작해 이 고리를 못 끊는다. 여기서 첫 단추(Team row)만 만들어주면
//   그 잡이 나머지를 자동으로 처리한다. 2026-08-19 실측: 33리그 93팀이 이 상태였다.
//
// 안전선.
//   ① 이름이 겹치는 기존 Team 이 하나라도 있으면 생성하지 않는다 (중복 row 사고 방지 — 사람이 판단).
//   ② 매핑률 50% 미만 리그는 건너뛴다 (미온보딩 대회 — 표 자체를 안 그린다).
//   ③ 이미 (league, ts-<id>) Team 이 있으면 건너뛴다.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import mapping from "@/lib/sports/thesports/team-id-mapping.json";

type Entry = { ourId: number; ourName: string; ourLeague: string; tsId: string };

/** 매핑률 50% 미만은 미온보딩 대회 — 표를 안 그리므로 대상이 아니다(audit-standings-mapping 과 동일 기준). */
const PARTIAL_THRESHOLD = 0.5;
const WRITE = process.argv.includes("--write");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TsTeam {
  name?: string;
  short_name?: string;
  logo?: string;
}

async function tsTeam(uuid: string): Promise<TsTeam | null> {
  try {
    const r = (await thesportsGet("/v1/football/team/additional/list", {
      uuid,
    })) as unknown as { results?: TsTeam[] };
    return r.results?.[0] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(WRITE ? "▶ WRITE — Team row 생성" : "▶ DRY-RUN — DB 미변경");
  const mapped = new Set((mapping as Entry[]).map((e) => `${e.ourLeague}|${e.tsId}`));
  const caches = await prisma.theSportsStandingsCache.findMany();

  let created = 0;
  let held = 0;
  let failed = 0;

  for (const cache of caches) {
    if (ONLY.length && !ONLY.includes(cache.league)) continue;
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
    if (rate < PARTIAL_THRESHOLD) {
      console.log(`${cache.league} 매핑률 ${(rate * 100).toFixed(0)}% — 미온보딩 대회로 보고 건너뜀`);
      continue;
    }

    console.log(`\n${cache.league} 결손 ${missing.length}/${ids.length}`);

    // 후보 풀 — 그 리그 Team + 그 리그 매치가 참조하는 팀 (라벨이 다른 기존 row 재사용 판단용)
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

    for (const tsId of missing) {
      const t = await tsTeam(tsId);
      await sleep(300);
      if (!t?.name) {
        console.log(`  [실패] ${tsId} — ts 조회 실패`);
        failed++;
        continue;
      }
      const key = normalize(t.name);
      const cands = [...pool.entries()].filter(([, teamName]) => {
        const cn = normalize(teamName);
        return cn === key || (cn.length >= 5 && key.length >= 5 && (cn.includes(key) || key.includes(cn)));
      });
      if (cands.length) {
        console.log(
          `  [보류] "${t.name}" — 이름이 겹치는 기존 팀 있음: ${cands.map(([id, n]) => `${n}#${id}`).join(" | ")}`,
        );
        held++;
        continue;
      }

      const externalId = `ts-${tsId}`;
      const exists = await prisma.team.findUnique({
        where: { league_externalId: { league: cache.league, externalId } },
        select: { id: true },
      });
      if (exists) {
        console.log(`  [건너뜀] "${t.name}" — Team 이미 있음 #${exists.id}`);
        continue;
      }

      console.log(`  [생성] "${t.name}"${t.short_name ? ` (${t.short_name})` : ""} ${tsId}`);
      created++;
      if (!WRITE) continue;

      const team = await prisma.team.create({
        data: {
          league: cache.league,
          externalId,
          name: t.name,
          shortName: t.short_name || null,
          logoUrl: t.logo || null,
        },
        select: { id: true },
      });
      await prisma.teamSourceId.upsert({
        where: {
          league_source_externalId: { league: cache.league, source: "thesports", externalId: tsId },
        },
        update: { teamId: team.id },
        create: { league: cache.league, source: "thesports", externalId: tsId, teamId: team.id },
      });
      console.log(`     ✓ #${team.id}`);
    }
  }

  console.log(
    `\n${WRITE ? "생성" : "생성 예정"} ${created}팀 · 보류(사람 판단) ${held}팀 · ts 조회 실패 ${failed}팀`,
  );
  if (created && !WRITE) console.log("기록하려면 --write. 이후 backfill:ts-team-mapping -- --write 로 매핑을 채운다.");
}

main().finally(() => prisma.$disconnect());
