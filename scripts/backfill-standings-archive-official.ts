// 비축구 과거 시즌 순위 소급 백필 — MLB(공식 statsapi)·NHL(공식 api-web)·KBO/NPB(ts 과거 시즌).
// af 쿼터와 무관한 무료 공식/ts 소스만 사용. 위키형 데이터 축적 3단계.
//
//   npx tsx --env-file=.env.local scripts/backfill-standings-archive-official.ts
//
// 멱등: upsertArchive 의 퇴행 가드 + 이미 있는 (league, label) 은 skip.
// 라벨: MLB/KBO/NPB = 연도("2023"), NHL = 응답 seasonId 에서("2022-23").

import { prisma } from "../src/lib/db";
import { thesportsGet } from "../src/lib/sports/thesports/client";
import { toKoreanTeamName } from "../src/lib/team-names";
import { upsertArchive, type ArchiveRow } from "../src/jobs/archive-standings";
import rawBaseballMapping from "../src/lib/sports/thesports/baseball-team-id-mapping.json";

// 2026-08-09 심화: 공식 API(MLB·NHL)는 더 깊은 과거도 무료 제공 — 10시즌으로 확장.
// ts 야구(KBO/NPB)는 season/list 가 주는 만큼만 (없는 해는 자동 skip).
const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

async function exists(league: string, label: string): Promise<boolean> {
  const row = await prisma.seasonStandingsArchive.findUnique({
    where: { league_seasonLabel: { league, seasonLabel: label } },
    select: { id: true },
  });
  return !!row;
}

/** 리그의 우리 팀 → 이름 정규화 매처 (공식 API 팀명 ↔ Team.name). */
async function nameMatcher(league: string) {
  const teams = await prisma.team.findMany({
    where: { league },
    select: { id: true, name: true, logoUrl: true },
  });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");
  const byName = new Map(teams.map((t) => [norm(t.name), t]));
  return (name: string) => byName.get(norm(name)) ?? null;
}

// ── MLB — statsapi 과거 시즌 (디비전 그룹 유지) ──
const MLB_DIV_KO: Record<string, string> = {
  "American League East": "AL 동부",
  "American League Central": "AL 중부",
  "American League West": "AL 서부",
  "National League East": "NL 동부",
  "National League Central": "NL 중부",
  "National League West": "NL 서부",
};

async function backfillMlb(out: string[]) {
  const divisions = new Map<number, string>();
  try {
    const dv = await fetch("https://statsapi.mlb.com/api/v1/divisions?sportId=1").then((r) => r.json());
    for (const d of dv.divisions ?? []) divisions.set(d.id, d.name);
  } catch { /* 폴백: group 없이 진행 */ }
  const match = await nameMatcher("MLB");

  for (const y of YEARS) {
    const label = String(y);
    if (await exists("MLB", label)) { out.push(`MLB ${label}: 이미 있음`); continue; }
    try {
      // standings 응답의 team.name 은 짧은 이름("Orioles") — 그 시즌 팀 목록으로 풀네임 해석
      const tl = await fetch(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${y}`, {
        signal: AbortSignal.timeout(12000),
      }).then((r) => r.json());
      const fullName = new Map<number, string>(
        (tl.teams ?? []).map((t: { id: number; name: string }) => [t.id, t.name]),
      );
      const d = await fetch(
        `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${y}&standingsTypes=regularSeason`,
        { signal: AbortSignal.timeout(12000) },
      ).then((r) => r.json());
      const rows: ArchiveRow[] = [];
      for (const rec of d.records ?? []) {
        const divName = divisions.get(rec.division?.id) ?? null;
        const group = divName ? MLB_DIV_KO[divName] ?? divName : null;
        for (const tr of rec.teamRecords ?? []) {
          const name: string = fullName.get(tr.team?.id) ?? tr.team?.name ?? "?";
          const hit = match(name);
          const ko = toKoreanTeamName(name, "MLB");
          rows.push({
            teamId: hit?.id ?? null,
            name,
            ko: ko !== name ? ko : undefined,
            logo: hit?.logoUrl ?? null,
            position: Number(tr.divisionRank ?? 0) || 0,
            played: (tr.wins ?? 0) + (tr.losses ?? 0),
            won: tr.wins ?? 0,
            loss: tr.losses ?? 0,
            draw: 0,
            group,
          });
        }
      }
      if (rows.length < 20) { out.push(`MLB ${label}: 행 부족(${rows.length}) — skip`); continue; }
      const res = await upsertArchive("MLB", label, "mlb-official-backfill", rows);
      out.push(`MLB ${label}: ${res} (${rows.length}팀, teamId ${rows.filter((r) => r.teamId).length})`);
    } catch (e) {
      out.push(`MLB ${label}: 실패 ${(e as Error).message.slice(0, 60)}`);
    }
  }
}

// ── NHL — api-web 과거 시즌 (정규시즌 마지막 날 — 시즌 범위 밖 날짜는 빈 배열을 준다) ──
// 19-20 은 코로나 중단(3/12) — 중단 시점 표가 공식 최종(승점% 기준 플레이오프 진출 판정).
const NHL_DATES = [
  "2025-04-17", "2024-04-18", "2023-04-14", "2022-04-29", "2021-05-19",
  "2020-03-11", "2019-04-06", "2018-04-08", "2017-04-09", "2016-04-10",
];

async function backfillNhl(out: string[]) {
  const match = await nameMatcher("NHL");
  for (const date of NHL_DATES) {
    try {
      const d = await fetch(`https://api-web.nhle.com/v1/standings/${date}`, {
        signal: AbortSignal.timeout(12000),
      }).then((r) => r.json());
      const std: Record<string, unknown>[] = d.standings ?? [];
      if (std.length < 20) { out.push(`NHL ${date}: 행 부족 — skip`); continue; }
      const def = (v: unknown): string =>
        v && typeof v === "object" && "default" in v ? String((v as { default?: string }).default ?? "") : String(v ?? "");
      const num = (v: unknown): number => (typeof v === "number" ? v : 0);
      const seasonId = String((std[0] as { seasonId?: number }).seasonId ?? "");
      const m = /^(\d{4})(\d{4})$/.exec(seasonId);
      if (!m) { out.push(`NHL ${date}: seasonId 해석 불가`); continue; }
      const label = `${m[1]}-${m[2].slice(2)}`;
      if (await exists("NHL", label)) { out.push(`NHL ${label}: 이미 있음`); continue; }
      const sorted = std
        .map((s) => ({
          name: def(s.teamName),
          played: num(s.gamesPlayed),
          won: num(s.wins),
          loss: num(s.losses),
          points: num(s.points),
          rw: num(s.regulationWins),
          gf: num(s.goalFor),
          ga: num(s.goalAgainst),
          division: s.divisionName ? def(s.divisionName) : null,
        }))
        .sort((a, b) => b.points - a.points || b.rw - a.rw || (b.gf - b.ga) - (a.gf - a.ga));
      const rows: ArchiveRow[] = sorted.map((s, i) => {
        const hit = match(s.name);
        const ko = toKoreanTeamName(s.name, "NHL");
        return {
          teamId: hit?.id ?? null,
          name: s.name,
          ko: ko !== s.name ? ko : undefined,
          logo: hit?.logoUrl ?? null,
          position: i + 1,
          played: s.played,
          won: s.won,
          loss: s.loss,
          gf: s.gf,
          ga: s.ga,
          points: s.points,
          group: s.division ?? undefined,
        };
      });
      const res = await upsertArchive("NHL", label, "nhl-official-backfill", rows);
      out.push(`NHL ${label}: ${res} (${rows.length}팀, teamId ${rows.filter((r) => r.teamId).length})`);
    } catch (e) {
      out.push(`NHL ${date}: 실패 ${(e as Error).message.slice(0, 60)}`);
    }
  }
}

// ── KBO·NPB — ts 과거 시즌 (season/list → 같은 tournament 의 과거 uuid → table/detail) ──
interface BaseballMapEntry { ourId: number; ourLeague: string; tsId: string }
const baseballMapping = rawBaseballMapping as BaseballMapEntry[];

async function backfillTsBaseball(out: string[]) {
  const seasonList = await thesportsGet<{ code: number; results?: Array<{ id: string; unique_tournament_id: string; year: string }> }>(
    "/v1/baseball/season/list",
    {},
  );
  const seasons = seasonList.results ?? [];

  for (const league of ["KBO", "NPB"]) {
    try {
      const cache = await prisma.theSportsStandingsCache.findUnique({
        where: { league },
        select: { tsSeasonId: true },
      });
      if (!cache) { out.push(`${league}: 현재 시즌 캐시 없음 — skip`); continue; }
      const cur = seasons.find((s) => s.id === cache.tsSeasonId);
      if (!cur) { out.push(`${league}: season/list 에서 현재 시즌 미발견 — skip`); continue; }
      const past = seasons.filter(
        (s) => s.unique_tournament_id === cur.unique_tournament_id && YEARS.includes(Number(s.year)),
      );
      const tsIdToOur = new Map(
        baseballMapping.filter((mp) => mp.ourLeague === league).map((mp) => [mp.tsId, mp.ourId]),
      );
      const teams = await prisma.team.findMany({
        where: { league },
        select: { id: true, name: true, logoUrl: true },
      });
      const teamById = new Map(teams.map((t) => [t.id, t]));

      for (const s of past.sort((a, b) => Number(a.year) - Number(b.year))) {
        const label = s.year;
        if (await exists(league, label)) { out.push(`${league} ${label}: 이미 있음`); continue; }
        interface TsRow { team_id: string; position: number; total: number; win: number; draw: number; loss: number; goals: number; goals_against: number }
        const d = await thesportsGet<{ code: number; results?: { tables?: Array<{ rows?: TsRow[] }> } }>(
          "/v1/baseball/season/table/detail",
          { uuid: s.id },
        );
        const raw = (d.results?.tables ?? []).flatMap((t) => t.rows ?? []);
        const rows: ArchiveRow[] = raw
          .map((r): ArchiveRow | null => {
            const ourId = tsIdToOur.get(r.team_id);
            if (ourId == null) return null; // 매핑 없는 팀(해체·과거 명칭)은 제외 — 부분표 방지 아래서 검사
            const t = teamById.get(ourId);
            const ko = t ? toKoreanTeamName(t.name, league) : undefined;
            return {
              teamId: ourId,
              name: t?.name ?? `#${ourId}`,
              ko: ko && ko !== t?.name ? ko : undefined,
              logo: t?.logoUrl ?? null,
              position: r.position,
              played: r.total,
              won: r.win,
              draw: r.draw,
              loss: r.loss,
              gf: r.goals,
              ga: r.goals_against,
            };
          })
          .filter((r): r is ArchiveRow => r != null)
          .sort((a, b) => a.position - b.position);
        // 과거 시즌 팀 매핑이 반 이상 빠지면 반쪽 표 — 굳히지 않는다
        if (rows.length < raw.length * 0.8 || rows.length < 6) {
          out.push(`${league} ${label}: 매핑 부족(${rows.length}/${raw.length}) — skip`);
          continue;
        }
        const res = await upsertArchive(league, label, "ts-baseball-backfill", rows);
        out.push(`${league} ${label}: ${res} (${rows.length}팀)`);
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e) {
      out.push(`${league}: 실패 ${(e as Error).message.slice(0, 60)}`);
    }
  }
}

// ── NBA — api-sports basketball 과거 시즌 (ESPN 은 과거 미제공, 같은 API 키·별도 쿼터) ──
const NBA_SEASONS = ["2020-2021", "2021-2022", "2022-2023", "2023-2024", "2024-2025"];
const CONF_KO: Record<string, string> = { "Western Conference": "서부", "Eastern Conference": "동부" };

async function backfillNbaApiSports(out: string[]) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) { out.push("NBA: API 키 없음"); return; }
  const match = await nameMatcher("NBA");
  for (const season of NBA_SEASONS) {
    const label = `${season.slice(0, 4)}-${season.slice(7)}`; // "2024-2025" → "2024-25"
    if (await exists("NBA", label)) { out.push(`NBA ${label}: 이미 있음`); continue; }
    try {
      const d = await fetch(`https://v1.basketball.api-sports.io/standings?league=12&season=${season}`, {
        headers: { "x-apisports-key": apiKey },
        signal: AbortSignal.timeout(12000),
      }).then((r) => r.json());
      interface NbaRow {
        position: number;
        group?: { name?: string };
        team?: { name?: string; logo?: string };
        games?: { played?: number; win?: { total?: number }; lose?: { total?: number } };
      }
      const raw: NbaRow[] = (d.response?.[0] ?? []).filter(
        (r: NbaRow) => r.group?.name && CONF_KO[r.group.name],
      );
      if (raw.length < 28) { out.push(`NBA ${label}: 행 부족(${raw.length}) — skip`); continue; }
      const rows: ArchiveRow[] = raw.map((r) => {
        const name = r.team?.name ?? "?";
        const hit = match(name);
        const ko = toKoreanTeamName(name, "NBA");
        return {
          teamId: hit?.id ?? null,
          name,
          ko: ko !== name ? ko : undefined,
          logo: hit?.logoUrl ?? r.team?.logo ?? null,
          position: r.position,
          played: r.games?.played ?? 0,
          won: r.games?.win?.total ?? 0,
          loss: r.games?.lose?.total ?? 0,
          group: CONF_KO[r.group!.name!],
        };
      });
      const res = await upsertArchive("NBA", label, "api-sports-basketball-backfill", rows);
      out.push(`NBA ${label}: ${res} (${rows.length}팀, teamId ${rows.filter((r) => r.teamId).length})`);
      await new Promise((r) => setTimeout(r, 6500)); // free tier 분당 10콜 안전
    } catch (e) {
      out.push(`NBA ${label}: 실패 ${(e as Error).message.slice(0, 60)}`);
    }
  }
}

async function main() {
  const out: string[] = [];
  await backfillMlb(out);
  await backfillNhl(out);
  await backfillTsBaseball(out);
  await backfillNbaApiSports(out);
  console.log(out.join("\n"));
  const total = await prisma.seasonStandingsArchive.count();
  console.log(`총 아카이브 행: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
