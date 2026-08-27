// KBO/NPB 시즌 순위 — TheSports season/table/detail (공식 순위).
// ⚠️ Vercel serverless IP 는 ts whitelist 미포함 → 직접 fetch 불가, 반드시 DB cache 경유.
//   lightsail standings-poller.js 가 baseball season/table/detail fetch → POST
//   /api/internal/thesports-standings → TheSportsStandingsCache (league=KBO/NPB) upsert.
//   이 helper 는 cache 읽기 → baseball-team-id-mapping (tsId→ourId) 매핑.
// cache miss/stale(4h+) 시 빈 배열 → page 가 calcStandings fallback.
// team_id 매칭 KBO 10/10·NPB 12/12 검증 (2026-06-05).

import { prisma } from "@/lib/db";
import rawMapping from "./baseball-team-id-mapping.json";

interface MapEntry {
  ourId: number;
  ourLeague: string;
  tsId: string;
}
const mapping = rawMapping as MapEntry[];

const STALE_AFTER_MS = 4 * 60 * 60 * 1000; // worker 10분 주기 → 4h+ 면 stale

export interface BaseballTableRow {
  position: number;
  ourTeamId: number;
  /** 소속 표 이름 — NPB 는 Central/Pacific 두 표라 position 만으론 순위가 유일하지 않다. */
  division: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number; // 득점 (runs scored)
  goalsAgainst: number; // 실점
}

interface RawRow {
  team_id: string;
  position: number;
  total: number;
  win: number;
  draw: number;
  loss: number;
  goals: number;
  goals_against: number;
}

/** NPB 디비전 표 이름 → 한글 라벨. KBO 처럼 단일 표(리그 전체)면 빈 문자열. */
export function npbDivisionKo(division: string | undefined): string {
  const n = (division ?? "").toLowerCase();
  if (n.includes("central")) return "센트럴";
  if (n.includes("pacific")) return "퍼시픽";
  return "";
}

/** 시범경기 표 판정 — ts 가 "Pre-season" 이름으로 준다(표기 흔들림 방어로 소문자·기호 제거 후 비교). */
function isPreSeasonTable(name: string | undefined): boolean {
  const n = (name ?? "").toLowerCase().replace(/[\s_-]/g, "");
  return n.includes("preseason") || n.includes("시범");
}

/**
 * KBO/NPB 시즌 순위 (TheSports 공식, DB cache 경유). 미지원/cache 없음/stale 시 빈 배열.
 * ⚠️ 시범경기(Pre-season) 표는 제외한다 — 아래 주석 참고.
 */
export async function fetchBaseballTable(league: string): Promise<BaseballTableRow[]> {
  if (league !== "KBO" && league !== "NPB") return [];
  let row: { payload: unknown; updatedAt: Date } | null;
  try {
    row = await prisma.theSportsStandingsCache.findUnique({
      where: { league },
      select: { payload: true, updatedAt: true },
    });
  } catch {
    return [];
  }
  if (!row) return [];
  if (Date.now() - row.updatedAt.getTime() > STALE_AFTER_MS) return [];

  const payload = row.payload as { tables?: Array<{ name?: string; rows?: RawRow[] }> };
  const tsIdToOur = new Map(
    mapping.filter((m) => m.ourLeague === league).map((m) => [m.tsId, m.ourId]),
  );
  // ⚠️ ts 는 정규 시즌 표와 **시범경기(Pre-season) 표**를 같은 tables 배열에 담아 준다
  //   (2026-08-27 실측: KBO = "KBO 2026" + "Pre-season", NPB = Central + Pacific + "Pre-season").
  //   전부 flatMap 하면 같은 팀이 두 번 들어가고 position 1,1,2,2… 가 되어
  //   순위 인덱스가 통째로 어긋난다 — KIA 가 정규 4위인데 팀 페이지 제목이 "KBO 7위"로 나갔다.
  //   NPB 는 양대 리그라 표가 둘인 게 정상이므로 "첫 표만" 이 아니라 시범경기 표만 제외한다.
  const tables = (payload.tables ?? []).filter((t) => !isPreSeasonTable(t.name));
  const src = tables.length > 0 ? tables : (payload.tables ?? []); // 전부 걸러지면 원본 유지
  return src
    .flatMap((t) =>
      (t.rows ?? []).map((r): BaseballTableRow | null => {
        const ourTeamId = tsIdToOur.get(r.team_id);
        if (ourTeamId == null) return null;
        return {
          position: r.position,
          ourTeamId,
          division: t.name ?? "",
          played: r.total,
          wins: r.win,
          draws: r.draw,
          losses: r.loss,
          goalsFor: r.goals,
          goalsAgainst: r.goals_against,
        };
      }),
    )
    .filter((r): r is BaseballTableRow => r != null)
    .sort((a, b) => a.position - b.position);
}
