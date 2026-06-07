// TheSports 부상자 — 매치 lineup.injury(양 팀 active) 를 팀별 현재 부상자로 집계.
//   /injuries 축구 분기에서 1순위 소스로 사용 (cache 없는 팀은 api-football fallback).
//   TheSports injury/list endpoint 는 plan 권한 없음(401) → match/lineup/detail.injury 가 유일 소스.
import { prisma } from "@/lib/db";

// injury reason(영문) → 한글. key 는 소문자·trim 정규화. 미등록은 원문 노출(graceful).
const TS_REASON_KO: Record<string, string> = {
  "muscle injury": "근육 부상",
  "muscle problems": "근육 부상",
  "muscular problems": "근육 부상",
  "knee injury": "무릎 부상",
  "knee problems": "무릎 부상",
  "torn knee ligaments": "무릎 인대 파열",
  "cruciate ligament rupture": "십자인대 파열",
  "cruciate ligament injury": "십자인대 부상",
  "acl injury": "십자인대 부상",
  "hamstring injury": "햄스트링 부상",
  "hamstring problems": "햄스트링 부상",
  "ankle injury": "발목 부상",
  "ankle problems": "발목 부상",
  "broken ankle": "발목 골절",
  "thigh injury": "허벅지 부상",
  "thigh problems": "허벅지 부상",
  "thigh muscle strain": "허벅지 근육 염좌",
  "calf injury": "종아리 부상",
  "calf problems": "종아리 부상",
  "groin injury": "사타구니 부상",
  "groin problems": "사타구니 부상",
  "foot injury": "발 부상",
  "broken foot": "발 골절",
  "heel problems": "발뒤꿈치 부상",
  "toe injury": "발가락 부상",
  "leg injury": "다리 부상",
  "broken leg": "다리 골절",
  "shoulder injury": "어깨 부상",
  "broken collarbone": "쇄골 골절",
  "hip injury": "고관절 부상",
  "back injury": "허리 부상",
  "back problems": "허리 부상",
  "hand injury": "손 부상",
  "wrist injury": "손목 부상",
  "arm injury": "팔 부상",
  "broken arm": "팔 골절",
  "head injury": "머리 부상",
  "concussion": "뇌진탕",
  "achilles tendon problems": "아킬레스건 부상",
  "achilles tendon rupture": "아킬레스건 파열",
  "tendonitis": "건염",
  "fracture": "골절",
  "surgery": "수술",
  "knock": "타박상",
  "wound": "외상",
  "ill": "질병",
  "illness": "질병",
  "fitness": "컨디션 난조",
  "rest": "휴식",
  "yellow card suspension": "경고 누적 출전정지",
  "red card suspension": "퇴장 출전정지",
  "suspended": "출전정지",
  "suspension": "출전정지",
  "personal reasons": "개인 사정",
  "coach's decision": "감독 결정",
  "national team": "대표팀 차출",
  "doubtful": "출전 불투명",
  "unknown": "미상",
  "other": "기타",
};

export function tsInjuryReasonKo(reason: string): string {
  const k = (reason ?? "").trim().toLowerCase();
  if (!k) return "결장";
  return TS_REASON_KO[k] ?? reason.trim();
}

type Sev = "long" | "short" | "returning";
function tsInjurySeverity(reason: string, missedMatches: number): Sev {
  const r = (reason ?? "").toLowerCase();
  // 출전정지(경고/퇴장)는 부상 아님 → short 로 분류(별도 컬러 없음)
  if (r.includes("suspension") || r.includes("suspended") || r.includes(" card")) return "short";
  if (r.includes("broken") || r.includes("torn") || r.includes("rupture") || r.includes("acl") || r.includes("surgery") || r.includes("fracture") || r.includes("cruciate")) return "long";
  if (missedMatches >= 5) return "long";
  return "short";
}

// 페이지의 RawInjury 와 동일 구조 (playerId 음수 = resolvePlayerNames 우회).
export interface TSInjuryRaw {
  playerId: number;
  playerName: string;
  reason: string;
  fixtureDate?: string;
  overrideKo: string;
  overrideSev: Sev;
}

interface TSInjEntry {
  id?: string;
  name?: string;
  reason?: string;
  end_time?: number;
  start_time?: number;
  missed_matches?: number;
  position?: string;
}

/**
 * 팀(우리 Team.id)별 현재 부상자. 각 팀의 "가장 최근 매치" lineup.injury 에서 active(end_time=0) 만.
 * 반환 Map 에 **key 가 있는 팀 = TheSports 가 추적 중**(부상자 0명이어도 빈 배열로 신뢰).
 * key 없는 팀 = lineup 캐시 없음 → 호출부에서 api-football fallback.
 */
export async function getTheSportsInjuriesByTeam(
  teamIds: number[],
): Promise<Map<number, TSInjuryRaw[]>> {
  const out = new Map<number, TSInjuryRaw[]>();
  if (teamIds.length === 0) return out;
  const tset = new Set(teamIds);

  // 1. 각 팀의 최신 매치 + side (home/away)
  const matches = await prisma.match.findMany({
    where: { OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }] },
    select: { id: true, homeTeamId: true, awayTeamId: true, startTime: true },
    orderBy: { startTime: "desc" },
    take: 5000,
  });
  const latest = new Map<number, { matchId: number; side: "home" | "away" }>();
  for (const m of matches) {
    if (m.homeTeamId != null && tset.has(m.homeTeamId) && !latest.has(m.homeTeamId)) latest.set(m.homeTeamId, { matchId: m.id, side: "home" });
    if (m.awayTeamId != null && tset.has(m.awayTeamId) && !latest.has(m.awayTeamId)) latest.set(m.awayTeamId, { matchId: m.id, side: "away" });
  }
  if (latest.size === 0) return out;

  // 2. 최신 매치들의 lineup 캐시
  const matchIds = [...new Set([...latest.values()].map((v) => v.matchId))];
  const caches = await prisma.theSportsMatchCache.findMany({
    where: { matchId: { in: matchIds } }, // lineup null 은 후처리에서 skip (Prisma Json not-null 필터 타입 회피)
    select: { matchId: true, lineup: true },
  });
  const cacheByMatch = new Map(caches.map((c) => [c.matchId, c.lineup as Record<string, unknown>]));

  // 3. 팀별 active injury entry 수집 + ts player id 모으기
  const teamEntries = new Map<number, TSInjEntry[]>();
  const tsIds = new Set<string>();
  for (const [teamId, { matchId, side }] of latest) {
    const lu = cacheByMatch.get(matchId);
    if (!lu) continue; // 캐시 없음 → key 미생성(api-football fallback 대상)
    const inj = (lu.injury ?? (lu.lineup as Record<string, unknown>)?.injury) as
      | { home?: TSInjEntry[]; away?: TSInjEntry[] } | undefined;
    const list = (inj?.[side] ?? []).filter((x) => (x?.end_time ?? 0) === 0);
    teamEntries.set(teamId, list);
    for (const x of list) if (x.id) tsIds.add(x.id);
  }

  // 4. ts player id → 한글명
  const players = tsIds.size
    ? await prisma.theSportsPlayer.findMany({ where: { id: { in: [...tsIds] } }, select: { id: true, nameKo: true, name: true } })
    : [];
  const nameById = new Map(players.map((p) => [p.id, p.nameKo || p.name]));

  // 5. RawInjury 변환 (playerId 음수 fake → resolve 우회)
  let fake = -1;
  for (const [teamId, list] of teamEntries) {
    out.set(
      teamId,
      list.map((x) => ({
        playerId: fake--,
        playerName: (x.id ? nameById.get(x.id) : null) || x.name || "선수",
        reason: x.reason ?? "",
        fixtureDate: x.start_time ? new Date(x.start_time * 1000).toISOString() : undefined,
        overrideKo: tsInjuryReasonKo(x.reason ?? ""),
        overrideSev: tsInjurySeverity(x.reason ?? "", x.missed_matches ?? 0),
      })),
    );
  }
  return out;
}
