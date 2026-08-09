// 시즌별 순위 영구 아카이브 잡 — 순위 캐시(리그당 1행)가 시즌 롤오버로 덮어써지기 전에
// (league, seasonLabel) 단위로 매일 굳힌다. 롤오버로 라벨이 바뀌면 이전 시즌 행이 자연히
// 동결돼 최종 순위가 된다(시즌 종료 감지 불필요). 위키형 데이터 축적 1단계.
//
// 커버: 축구(getFullStandings 전 리그) · KBO/NPB(ts 야구표) · MLB/CPBL(af 캐시) ·
//       NHL(공식 API, 라벨은 응답 seasonId) · NBA/WNBA(ESPN).
// 가드: 개막 전 placeholder(전 행 played 합 0) skip + 퇴행 방지(기존 행보다 소화 경기 적으면 skip).
import "@/lib/env";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { SOCCER_LEAGUES } from "@/lib/sports/types";
import { NO_STANDINGS_LEAGUES, seasonLabelFor } from "@/lib/sports/season-calendar";
import { resolveSeasonYear } from "@/lib/sports/season-registry";
import { fetchBaseballTable } from "@/lib/sports/thesports/baseball-table";
import { fetchNhlStandings } from "@/lib/sports/nhl-api";
import { fetchBasketballStandings } from "@/lib/sports/basketball-standings";
import { fetchVolleyballTable } from "@/lib/sports/thesports/volleyball-table";
import { toKoreanTeamName } from "@/lib/team-names";

/** 아카이브 행 — 팀명·한글명·로고를 아카이브 시점에 굳힌다(팀 병합·삭제에도 자립). */
export interface ArchiveRow {
  teamId: number | null;
  name: string;
  ko?: string;
  logo?: string | null;
  position: number;
  played: number;
  won: number;
  draw?: number;
  loss: number;
  gf?: number;
  ga?: number;
  points?: number;
  group?: string | null;
}

const playedSum = (rows: ArchiveRow[]) => rows.reduce((s, r) => s + (r.played || 0), 0);

/**
 * (league, seasonLabel) upsert.
 * 반환: "saved" | "empty-skip" | "preseason-skip" | "regress-skip"
 */
export async function upsertArchive(
  league: string,
  seasonLabel: string,
  source: string,
  rows: ArchiveRow[],
): Promise<string> {
  if (rows.length < 2) return "empty-skip";
  const sum = playedSum(rows);
  if (sum === 0) return "preseason-skip"; // 개막 전 placeholder 표 (0경기) — 아카이브 가치 없음
  const existing = await prisma.seasonStandingsArchive.findUnique({
    where: { league_seasonLabel: { league, seasonLabel } },
    select: { rows: true },
  });
  if (existing) {
    const prev = playedSum((existing.rows as unknown as ArchiveRow[]) ?? []);
    // 같은 시즌 라벨인데 소화 경기 수가 줄었다 = 소스 퇴행(부분 응답 등) — 최종표 보호
    if (prev > sum) return "regress-skip";
  }
  await prisma.seasonStandingsArchive.upsert({
    where: { league_seasonLabel: { league, seasonLabel } },
    create: { league, seasonLabel, source, rows: rows as unknown as Prisma.InputJsonValue },
    update: { source, rows: rows as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
  });
  return "saved";
}

/** 우리 Team.id 목록 → {name, ko, logo} 해석기. */
async function teamResolver(teamIds: number[], league: string) {
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true, logoUrl: true },
  });
  const byId = new Map(teams.map((t) => [t.id, t]));
  return (id: number): { name: string; ko?: string; logo: string | null } => {
    const t = byId.get(id);
    if (!t) return { name: `#${id}`, logo: null };
    const ko = toKoreanTeamName(t.name, league);
    return { name: t.name, ko: ko !== t.name ? ko : undefined, logo: t.logoUrl };
  };
}

/** 순위 캐시를 채우는 폴러는 축구·야구·배구뿐 — 축구 외 리그(전용 어댑터가 처리)만 명시 제외. */
const NON_SOCCER_CACHE_LEAGUES = new Set(["KBO", "NPB", "VNL", "VNL_W", "AVC_NATIONS_W", "EGL_W"]);

async function archiveFootball(counts: Record<string, number>, failures: string[]) {
  // SOCCER_LEAGUES 에 없는 축구 리그(J3 실측)도 ts 캐시가 있으면 아카이브.
  const targets = new Set<string>(SOCCER_LEAGUES as readonly string[]);
  const caches = await prisma.theSportsStandingsCache.findMany({ select: { league: true } });
  for (const c of caches) {
    if (!NON_SOCCER_CACHE_LEAGUES.has(c.league)) targets.add(c.league);
  }
  for (const league of targets) {
    if (NO_STANDINGS_LEAGUES.has(league)) continue;
    try {
      const std = await getFullStandings(league);
      if (std.length === 0) continue; // 순위 소스 없음/시즌 게이트 차단 — 정상 skip
      const resolve = await teamResolver(std.map((r) => r.teamId), league);
      const rows: ArchiveRow[] = std.map((r) => ({
        teamId: r.teamId,
        ...resolve(r.teamId),
        position: r.position,
        played: r.won + r.draw + r.loss,
        won: r.won,
        draw: r.draw,
        loss: r.loss,
        gf: r.goalsFor,
        ga: r.goalsAgainst,
        points: r.points,
        group: r.group ?? undefined,
      }));
      const label = seasonLabelFor(league, await resolveSeasonYear(league));
      const res = await upsertArchive(league, label, "site", rows);
      counts[res] = (counts[res] ?? 0) + 1;
    } catch (e) {
      failures.push(`${league}: ${(e as Error).message}`);
    }
  }
}

async function archiveBaseball(counts: Record<string, number>, failures: string[]) {
  // KBO·NPB — ts 야구표(1순위, 득실 포함)
  for (const league of ["KBO", "NPB"]) {
    try {
      const table = await fetchBaseballTable(league);
      if (table.length === 0) continue;
      const resolve = await teamResolver(table.map((r) => r.ourTeamId), league);
      const rows: ArchiveRow[] = table.map((r) => ({
        teamId: r.ourTeamId,
        ...resolve(r.ourTeamId),
        position: r.position,
        played: r.played,
        won: r.wins,
        draw: r.draws,
        loss: r.losses,
        gf: r.goalsFor,
        ga: r.goalsAgainst,
      }));
      const label = seasonLabelFor(league, await resolveSeasonYear(league));
      const res = await upsertArchive(league, label, "baseball-table", rows);
      counts[res] = (counts[res] ?? 0) + 1;
    } catch (e) {
      failures.push(`${league}: ${(e as Error).message}`);
    }
  }

  // MLB·CPBL — baseball-standings cron 이 채우는 af 캐시(LightRow). points = 승수 관례.
  for (const league of ["MLB", "CPBL"]) {
    try {
      const cache = await prisma.apiFootballStandingsCache.findUnique({
        where: { league },
        select: { rows: true, season: true },
      });
      if (!cache) continue;
      const light = (cache.rows as unknown as Array<{
        position: number;
        teamExternalId: string | null;
        teamName?: string | null;
        won: number;
        draw: number;
        loss: number;
      }>) ?? [];
      if (light.length === 0) continue;
      const ext = light.map((r) => r.teamExternalId).filter((v): v is string => v != null);
      const teams = await prisma.team.findMany({
        where: { league, externalId: { in: ext } },
        select: { id: true, externalId: true, name: true, logoUrl: true },
      });
      const byExt = new Map(teams.map((t) => [t.externalId, t]));
      const rows: ArchiveRow[] = light.map((r) => {
        const t = r.teamExternalId ? byExt.get(r.teamExternalId) : undefined;
        const name = t?.name ?? r.teamName ?? "?";
        const ko = toKoreanTeamName(name, league);
        return {
          teamId: t?.id ?? null,
          name,
          ko: ko !== name ? ko : undefined,
          logo: t?.logoUrl ?? null,
          position: r.position,
          played: r.won + r.draw + r.loss,
          won: r.won,
          draw: r.draw,
          loss: r.loss,
        };
      });
      const label = seasonLabelFor(league, cache.season); // 캐시가 든 시즌 그대로 (라벨 불일치 방지)
      const res = await upsertArchive(league, label, "af-cache", rows);
      counts[res] = (counts[res] ?? 0) + 1;
    } catch (e) {
      failures.push(`${league}: ${(e as Error).message}`);
    }
  }
}

async function archiveNhl(counts: Record<string, number>, failures: string[]) {
  try {
    const std = await fetchNhlStandings();
    if (!std || std.rows.length === 0) return;
    // 라벨은 응답 seasonId("20252026")에서 — 오프시즌에 /standings/now 가 지난 시즌
    // 최종표를 주는데 달력 계산으로 라벨을 붙이면 새 시즌으로 오라벨된다.
    const m = /^(\d{4})(\d{4})$/.exec(std.season);
    if (!m) {
      failures.push(`NHL: seasonId 해석 불가 "${std.season}"`);
      return;
    }
    const label = `${m[1]}-${m[2].slice(2)}`;
    // teamName 이 이미 풀네임("Colorado Avalanche") — placeName 을 덧붙이면 중복된다.
    // teamId 는 우리 Team(NHL) 이름 정규화 매칭으로 연결 (실패 시 null — 표시는 name/ko 로 충분).
    const nhlTeams = await prisma.team.findMany({
      where: { league: "NHL" },
      select: { id: true, name: true, logoUrl: true },
    });
    const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const byName = new Map(nhlTeams.map((t) => [normName(t.name), t]));
    const rows: ArchiveRow[] = std.rows.map((r, i) => {
      const name = r.name;
      const hit = byName.get(normName(name));
      const ko = toKoreanTeamName(name, "NHL");
      return {
        teamId: hit?.id ?? null,
        name,
        ko: ko !== name ? ko : undefined,
        logo: hit?.logoUrl ?? null,
        position: i + 1,
        played: r.gamesPlayed,
        won: r.wins,
        loss: r.losses,
        gf: r.goalFor,
        ga: r.goalAgainst,
        points: r.points,
        group: r.division ?? undefined,
      };
    });
    const res = await upsertArchive("NHL", label, "nhl-official", rows);
    counts[res] = (counts[res] ?? 0) + 1;
  } catch (e) {
    failures.push(`NHL: ${(e as Error).message}`);
  }
}

/** NBA 시즌 라벨 — 10월 경계 분할연도. 8월(오프시즌)엔 직전 시즌 최종표가 서빙되므로 직전 라벨. */
function nbaSeasonLabel(at: Date): string {
  const y = at.getUTCMonth() + 1 >= 10 ? at.getUTCFullYear() : at.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

async function archiveBasketball(counts: Record<string, number>, failures: string[]) {
  // KBL/WKBL 은 오프시즌 소스 시즌 판별이 불확실해 제외 — 10월 개막 후 편입.
  for (const league of ["NBA", "WNBA"]) {
    try {
      const std = await fetchBasketballStandings(league);
      if (!std || std.rows.length === 0) continue;
      // ⚠ BasketballStandingRow.ourTeamId 는 합성 네임스페이스(9000008 등) — 실제 Team.id 아님.
      //   teamName 정규화 매칭으로 진짜 Team 을 잇는다 (실측 2026-08-09: 가짜 id 저장 사고 수정).
      const teams = await prisma.team.findMany({
        where: { league },
        select: { id: true, name: true, logoUrl: true },
      });
      const normBb = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const byName = new Map(teams.map((t) => [normBb(t.name), t]));
      const rows: ArchiveRow[] = std.rows.map((r) => {
        const name = r.teamName ?? "?";
        const hit = byName.get(normBb(name));
        const ko = toKoreanTeamName(name, league);
        return {
          teamId: hit?.id ?? null,
          name,
          ko: ko !== name ? ko : undefined,
          logo: r.logoUrl ?? hit?.logoUrl ?? null,
          position: r.position,
          played: r.played,
          won: r.wins,
          loss: r.losses,
          gf: r.scored ?? undefined,
          ga: r.conceded ?? undefined,
          group: r.group ?? undefined,
        };
      });
      const label =
        league === "NBA"
          ? nbaSeasonLabel(new Date())
          : seasonLabelFor(league, await resolveSeasonYear(league)); // WNBA = 달력형
      const res = await upsertArchive(league, label, "espn-basketball", rows);
      counts[res] = (counts[res] ?? 0) + 1;
    } catch (e) {
      failures.push(`${league}: ${(e as Error).message}`);
    }
  }
}

// 배구 (VNL·AVC·유럽 골든리그 — ts 캐시 + volleyball-table 매핑 재사용). 연 단위 대회 = 달력 라벨.
async function archiveVolleyball(counts: Record<string, number>, failures: string[]) {
  for (const league of ["VNL", "VNL_W", "AVC_NATIONS_W", "EGL_W"]) {
    try {
      const groups = await fetchVolleyballTable(league);
      const flat = groups.flatMap((g) =>
        (g.rows ?? []).map((r) => ({ ...r, group: groups.length > 1 ? g.name : undefined })),
      );
      if (flat.length === 0) continue;
      const resolve = await teamResolver(flat.map((r) => r.ourTeamId), league);
      const rows: ArchiveRow[] = flat.map((r) => ({
        teamId: r.ourTeamId,
        ...resolve(r.ourTeamId),
        position: r.position,
        played: r.played,
        won: r.wins,
        loss: r.losses,
        gf: r.setsWin,
        ga: r.setsLoss,
        points: r.points,
        group: r.group,
      }));
      const label = seasonLabelFor(league, await resolveSeasonYear(league));
      const res = await upsertArchive(league, label, "volleyball-table", rows);
      counts[res] = (counts[res] ?? 0) + 1;
    } catch (e) {
      failures.push(`${league}: ${(e as Error).message.slice(0, 60)}`);
    }
  }
}

export async function runArchiveStandings() {
  const counts: Record<string, number> = {};
  const failures: string[] = [];
  await archiveFootball(counts, failures);
  await archiveBaseball(counts, failures);
  await archiveNhl(counts, failures);
  await archiveBasketball(counts, failures);
  await archiveVolleyball(counts, failures);
  const total = await prisma.seasonStandingsArchive.count();
  return { counts, failures, totalArchived: total };
}

// 직접 실행 (npm run job:archive-standings)
if (import.meta.url === `file://${process.argv[1]}`) {
  runArchiveStandings()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
