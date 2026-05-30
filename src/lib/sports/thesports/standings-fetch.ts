// /standings/[league] 페이지가 사용하는 ts 시즌 순위표 helper.
//
// 흐름:
//   1) Lightsail worker (standings-poller.js) 가 1시간 주기로 78개 리그 ts API fetch
//   2) POST /api/internal/thesports-standings → TheSportsStandingsCache row upsert
//   3) 이 helper 가 cache row 조회 → 우리 team.id 역매핑 후 반환
//
// Vercel serverless IP 는 ts whitelist 미포함 → 직접 fetch 불가, 반드시 DB cache 경유.
//
// cache miss 또는 stale (4h+) 시 null 반환 → caller (page) 가 DB-from-matches calcStandings fallback.

import { readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import type { TSFootballStandingsRow, TSFootballSeasonStandingsResponse } from "./football-types";

interface TeamMap {
  ourId: number;
  tsId: string;
  ourLeague?: string;
}

const STALE_AFTER_MS = 4 * 60 * 60 * 1000; // 4 hours

// ⚠ 리그별로 분리 — 같은 tsId 가 정규리그 + UCL/UEL/COPA_LIB 등에 다른 ourId 로 존재한다.
// 전역 Map 으로 만들면 last-write 가 이겨 LALIGA Barcelona 가 COPA_LIB Barcelona SC 로
// 오매핑되는 사고(로고/링크 오류). standings-helper.ts 의 TS_TO_OUR_BY_LEAGUE 와 동일 패턴.
let cachedReverseTeamMap: Map<string, Map<string, number>> | null = null;

function loadReverseTeamMap(): Map<string, Map<string, number>> {
  if (cachedReverseTeamMap) return cachedReverseTeamMap;
  const file = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");
  const teams: TeamMap[] = JSON.parse(readFileSync(file, "utf-8"));
  cachedReverseTeamMap = new Map();
  for (const t of teams) {
    if (!t.ourLeague) continue;
    let m = cachedReverseTeamMap.get(t.ourLeague);
    if (!m) {
      m = new Map();
      cachedReverseTeamMap.set(t.ourLeague, m);
    }
    m.set(t.tsId, t.ourId);
  }
  return cachedReverseTeamMap;
}

export interface MappedStandingsRow extends TSFootballStandingsRow {
  /** 우리 DB Team.id — 미매핑 시 null */
  ourTeamId: number | null;
}

export interface MappedStandings {
  promotions: TSFootballSeasonStandingsResponse["results"]["promotions"];
  tables: Array<{
    id: string;
    conference: string;
    group: number;
    stage_id: string;
    rows: MappedStandingsRow[];
  }>;
  /** worker 마지막 갱신 시각 (UI 표시용) */
  fetchedAt: Date;
}

/**
 * Lightsail worker 가 push 한 cache row 에서 ts 순위표 → 우리 team.id 매핑된 형태로 반환.
 * @returns null = cache miss / stale / DB 오류 → caller 가 calcStandings fallback
 */
export async function fetchStandingsForLeague(leagueCode: string): Promise<MappedStandings | null> {
  let row: { tsSeasonId: string; payload: unknown; updatedAt: Date } | null;
  try {
    row = await prisma.theSportsStandingsCache.findUnique({
      where: { league: leagueCode },
      select: { tsSeasonId: true, payload: true, updatedAt: true },
    });
  } catch (e) {
    console.warn(`[ts-standings] DB read fail (${leagueCode}): ${(e as Error).message}`);
    return null;
  }
  if (!row) return null;

  // stale 체크 (4h+) — worker 죽었거나 오프시즌이면 fallback
  const ageMs = Date.now() - row.updatedAt.getTime();
  if (ageMs > STALE_AFTER_MS) return null;

  const payload = row.payload as TSFootballSeasonStandingsResponse["results"];
  if (!payload?.tables) return null;

  const leagueMap = loadReverseTeamMap().get(leagueCode);
  const tables = (payload.tables ?? []).map((t) => ({
    id: t.id,
    conference: t.conference,
    group: t.group,
    stage_id: t.stage_id,
    rows: (t.rows ?? []).map((r: TSFootballStandingsRow) => ({
      ...r,
      ourTeamId: leagueMap?.get(r.team_id) ?? null,
    })),
  }));
  return {
    promotions: payload.promotions ?? [],
    tables,
    fetchedAt: row.updatedAt,
  };
}
