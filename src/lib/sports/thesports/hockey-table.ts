// 아이스하키(KHL) 시즌 순위 — TheSports ice_hockey season/table/detail (공식 순위), DB 캐시 경유.
// ⚠️ Vercel 은 ts 직접 호출 불가 → Vultr standings-poller(HOCKEY_SEASONS) 가 fetch → POST
//   /api/internal/thesports-standings → TheSportsStandingsCache(league=KHL) upsert. 여기서는 캐시만 읽는다.
// KHL 은 표 7개가 한 payload 로 온다 — 전체("KHL 26/27") 1 + 컨퍼런스 2 + 디비전 4.
// 이름으로 종류를 가르고, tsId→ourId 는 ice-hockey-team-id-mapping(리그별 키)으로 푼다.
// 승점 = 승(정규·연장·승부치기 모두) 2점 + 연장·승부치기 패 1점. ts 의 win 은 연장승 포함, loss 는 정규패만.

import { prisma } from "@/lib/db";
import rawMapping from "./ice-hockey-team-id-mapping.json";

interface MapEntry { ourId: number; ourLeague: string; tsId: string }
const TS_TO_OUR_BY_LEAGUE = new Map<string, Map<string, number>>();
for (const e of rawMapping as MapEntry[]) {
  if (!TS_TO_OUR_BY_LEAGUE.has(e.ourLeague)) TS_TO_OUR_BY_LEAGUE.set(e.ourLeague, new Map());
  TS_TO_OUR_BY_LEAGUE.get(e.ourLeague)!.set(e.tsId, e.ourId);
}

/** 공식 표를 캐시로 받는 하키 리그 — standings-poller HOCKEY_SEASONS 와 짝. */
export const HOCKEY_TS_TABLE_LEAGUES = new Set(["KHL"]);

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // poller 10분 주기 → 6h+ 면 stale(표는 그대로 내되 라벨용)

export type HockeyTableKind = "overall" | "conference" | "division";

export interface HockeyTableRow {
  position: number;
  ourTeamId: number;
  played: number;
  wins: number; // 정규승 (= ts win − 연장·승부치기 승)
  otWins: number; // 연장 + 승부치기 승
  otLosses: number; // 연장 + 승부치기 패
  losses: number; // 정규패
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface HockeyTableGroup {
  kind: HockeyTableKind;
  /** ts 표 이름 ("Western Conference" · "Bobrov Division" · "KHL 26/27") */
  name: string;
  /** 화면용 한글 라벨 */
  label: string;
  rows: HockeyTableRow[];
}

export interface HockeyTable {
  groups: HockeyTableGroup[];
  /** 전체 표 (없으면 컨퍼런스 표를 승점순으로 합친 것) */
  overall: HockeyTableRow[];
  seasonLabel: string; // "2026-27"
  updatedAt: Date | null;
  stale: boolean;
}

interface RawRow {
  team_id: string;
  position: number;
  points: number;
  total: number;
  win: number;
  loss: number;
  goals: number;
  goals_against: number;
  overtime_win?: number;
  overtime_loss?: number;
  shootout_win?: number;
  shootout_loss?: number;
}
interface RawTable { id: string; name?: string; rows?: RawRow[] }

const DIVISION_KO: Record<string, string> = {
  bobrov: "보브로프", tarasov: "타라소프", kharlamov: "하를라모프", chernyshev: "체르니셰프",
};

function classify(name: string): { kind: HockeyTableKind; label: string } {
  const n = name.toLowerCase();
  if (n.includes("conference")) {
    const side = n.includes("west") ? "서부" : n.includes("east") ? "동부" : name.replace(/conference/i, "").trim();
    return { kind: "conference", label: `${side} 컨퍼런스` };
  }
  if (n.includes("division")) {
    const key = n.replace(/division/i, "").trim();
    return { kind: "division", label: `${DIVISION_KO[key] ?? name.replace(/division/i, "").trim()} 디비전` };
  }
  return { kind: "overall", label: "전체 순위" };
}

/** ts 시즌 이름 "KHL 26/27" 또는 캐시 갱신 시각으로 "2026-27" 라벨. */
function seasonLabelFrom(tables: RawTable[], updatedAt: Date | null): string {
  for (const t of tables) {
    const m = /(\d{2})\/(\d{2})/.exec(t.name ?? "");
    if (m) return `20${m[1]}-${m[2]}`;
  }
  const d = updatedAt ?? new Date();
  const y = d.getUTCMonth() + 1 >= 8 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export async function fetchHockeyTable(league: string): Promise<HockeyTable | null> {
  if (!HOCKEY_TS_TABLE_LEAGUES.has(league)) return null;
  const cache = await prisma.theSportsStandingsCache.findUnique({ where: { league } });
  if (!cache) return null;
  const payload = cache.payload as unknown as { tables?: RawTable[] } | null;
  const tables = payload?.tables ?? [];
  const leagueMap = TS_TO_OUR_BY_LEAGUE.get(league);
  const groups: HockeyTableGroup[] = [];
  for (const t of tables) {
    const rows: HockeyTableRow[] = [];
    for (const r of t.rows ?? []) {
      const ourTeamId = leagueMap?.get(r.team_id);
      if (ourTeamId == null) continue;
      const otWins = (r.overtime_win ?? 0) + (r.shootout_win ?? 0);
      const otLosses = (r.overtime_loss ?? 0) + (r.shootout_loss ?? 0);
      rows.push({
        position: r.position,
        ourTeamId,
        played: r.total ?? 0,
        wins: Math.max(0, (r.win ?? 0) - otWins),
        otWins,
        otLosses,
        losses: r.loss ?? 0,
        goalsFor: r.goals ?? 0,
        goalsAgainst: r.goals_against ?? 0,
        points: r.points ?? 0,
      });
    }
    if (rows.length === 0) continue;
    rows.sort((a, b) => a.position - b.position);
    const c = classify(t.name ?? "");
    groups.push({ kind: c.kind, name: t.name ?? "", label: c.label, rows });
  }
  if (groups.length === 0) return null;
  const overallGroup = groups.find((g) => g.kind === "overall");
  const overall =
    overallGroup?.rows ??
    groups
      .filter((g) => g.kind === "conference")
      .flatMap((g) => g.rows)
      .sort((a, b) => b.points - a.points || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst))
      .map((r, i) => ({ ...r, position: i + 1 }));
  const updatedAt = cache.updatedAt ?? null;
  return {
    groups,
    overall,
    seasonLabel: seasonLabelFrom(tables, updatedAt),
    updatedAt,
    stale: updatedAt ? Date.now() - updatedAt.getTime() > STALE_AFTER_MS : true,
  };
}
