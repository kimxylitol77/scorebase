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
  // 2026-07 추가 — 국가대표/축구 캐시 실측 미번역 사유 (빈도순). "unknown injury"=generic "부상"(부위 통계 제외).
  "unknown injury": "부상",
  "hamstring muscle injury": "햄스트링 부상",
  "knee surgery": "무릎 수술",
  "twisted knee": "무릎 염좌",
  "personal reason": "개인 사정",
  "tendon irritation": "힘줄 염증",
  "torn muscle bundle": "근육 파열",
  "lower leg fracture": "하퇴 골절",
  "adductor injury": "내전근 부상",
  "finger injury": "손가락 부상",
  "ankle sprain": "발목 염좌",
  "cruciate ligament surgery": "십자인대 수술",
  "plantar fascia": "족저근막 부상",
  "patellar tendon irritation": "슬개건 염증",
  "contusion": "타박상",
  "ligament injury": "인대 부상",
  "heel injury": "발뒤꿈치 부상",
  "inactive": "결장",
  "muscle tear": "근육 파열",
  "rupture of the pattella": "슬개골 파열",
  "calf muscle strain": "종아리 근육 염좌",
  "suspension through sports court": "출전 정지",
  "shinbone injury": "정강이 부상",
  "stomach complaints": "복통",
  "inguinal hernia": "서혜부 탈장",
  "broken toe": "발가락 골절",
  "calf stiffness": "종아리 뭉침",
  "metatarsal fracture": "중족골 골절",
  "heart problems": "심장 질환",
  "eye injury": "눈 부상",
  "elbow injury": "팔꿈치 부상",
  "minor knock": "경미한 타박",
  "indirect card suspension": "경고 누적 출전 정지",
  "cruciate ligament tear": "십자인대 파열",
  "bruise on the knee": "무릎 타박상",
  "bruised foot": "발 타박상",
};

export function tsInjuryReasonKo(reason: string): string {
  const k = (reason ?? "").trim().toLowerCase();
  if (!k) return "결장";
  return TS_REASON_KO[k] ?? reason.trim();
}

type Sev = "long" | "short" | "returning";
export function tsInjurySeverity(reason: string, missedMatches: number): Sev {
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

  // 1. 각 팀의 최근 매치 후보 (최신 1건만 보면 안 된다)
  //  시즌 중에는 팀의 "최신" 매치가 아직 안 열린 다음 경기라 lineup 캐시가 없다. 그것만 보고
  //  포기하면 리그 전체가 부상자 0명이 된다 — 2026-08 실측: K리그1 최근 60일 종료매치 41건
  //  전부 lineup 이 있고 부상 13건이 담겨 있는데 화면엔 0팀이었다(J1 61건·사우디 13건 동일).
  //  그래서 팀마다 최근 매치를 여러 건 모아 두고, 아래에서 캐시가 실제로 있는 최신 것을 고른다.
  const CANDIDATES_PER_TEAM = 6;
  const now = Date.now();
  const matches = await prisma.match.findMany({
    where: { OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }], startTime: { lte: new Date(now) } },
    select: { id: true, homeTeamId: true, awayTeamId: true, startTime: true },
    orderBy: { startTime: "desc" },
    take: 5000,
  });
  type Cand = { matchId: number; side: "home" | "away"; at: Date };
  const cands = new Map<number, Cand[]>();
  for (const m of matches) {
    for (const [tid, side] of [[m.homeTeamId, "home"], [m.awayTeamId, "away"]] as const) {
      if (tid == null || !tset.has(tid)) continue;
      const arr = cands.get(tid) ?? [];
      if (arr.length < CANDIDATES_PER_TEAM) {
        arr.push({ matchId: m.id, side, at: m.startTime });
        cands.set(tid, arr);
      }
    }
  }

  // 2. 후보들의 lineup 캐시를 한 번에 조회
  const matchIds = [...new Set([...cands.values()].flat().map((v) => v.matchId))];
  const caches = matchIds.length
    ? await prisma.theSportsMatchCache.findMany({
        where: { matchId: { in: matchIds } }, // lineup null 은 후처리에서 skip (Prisma Json not-null 필터 타입 회피)
        select: { matchId: true, lineup: true },
      })
    : [];
  const cacheByMatch = new Map(caches.map((c) => [c.matchId, c.lineup as Record<string, unknown>]));

  // 2b. 팀별로 lineup 캐시가 실제로 있는 최신 매치를 고른다.
  //  또 그 매치가 한참 지났으면 "현재 부상자" 로 쓰지 않는다 — 비시즌엔 석 달 전 명단이
  //  그대로 노출된다 (아스톤 빌라 최신 매치가 5/20 이라 7/7 십자인대 파열한 오나나가 빠졌다).
  //  오래된 팀은 아래 6단계 PlayerEvent 보강으로 넘긴다.
  const STALE_MS = 30 * 86400_000;
  const latest = new Map<number, Cand>();
  for (const [teamId, arr] of cands) {
    const hit = arr.find((c) => cacheByMatch.get(c.matchId)); // arr 은 이미 최신순
    if (hit && now - hit.at.getTime() <= STALE_MS) latest.set(teamId, hit);
  }
  // latest 가 비어도 아래로 진행한다 — 6단계 PlayerEvent 보강이 전 팀을 맡는다.

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

  // 6. 최신 매치에 캐시가 없는 팀 — PlayerEvent(부상 근황)로 보강.
  //  위 1~5 는 팀별 "최신 매치 1건" 만 본다. 비시즌·개막 전엔 그 한 건에 lineup 이 없어
  //  리그 전체가 "풀스쿼드" 로 보인다 (2026-08 EPL 실측: 23팀 중 부상자가 잡힌 팀 1개,
  //  우가르테 십자인대가 명단에서 통째로 빠짐). PlayerEvent 는 같은 lineup.injury 를 120일치
  //  여러 매치에서 모아둔 것이라 커버가 훨씬 넓다.
  const uncovered = teamIds.filter((id) => !out.has(id));
  if (uncovered.length) {
    const fromEvents = await injuriesFromPlayerEvents(uncovered, fake).catch(() => new Map<number, TSInjuryRaw[]>());
    for (const [teamId, list] of fromEvents) out.set(teamId, list);
  }
  return out;
}

/**
 * PlayerEvent(INJURY) → 팀별 현재 부상자. 캐시 미보유 팀 보강용.
 * "현재 부상 중" 판정은 마지막 관측(detail.lastSeenAt = 이 부상이 마지막으로 라인업에 실려
 * 있던 경기)이 45일 이내인지로 본다. 복귀 이벤트가 드물어(773건 중 88건) 미종결만 걸러서는
 * 몇 달 전 3경기 결장까지 부상자로 남는다.
 * 45일은 실측으로 잡았다 — EPL 기준 30일 31명 / 45일 33명 / 90일 55명. 45일이 프리시즌에
 * 다친 장기 부상(오나나 십자인대 35일·망장비 34일)을 담으면서, 지난 시즌 종료 시점(82일)에
 * 몰린 이미 복귀했을 무더기는 빼는 지점이다.
 */
async function injuriesFromPlayerEvents(ourTeamIds: number[], fakeStart: number): Promise<Map<number, TSInjuryRaw[]>> {
  const out = new Map<number, TSInjuryRaw[]>();
  const srcs = await prisma.teamSourceId.findMany({
    where: { source: "thesports", teamId: { in: ourTeamIds } },
    select: { externalId: true, teamId: true },
  });
  if (!srcs.length) return out;
  const ourByTs = new Map(srcs.map((s) => [s.externalId, s.teamId]));

  const mvs = await prisma.playerMarketValue.findMany({
    where: { teamId: { in: [...ourByTs.keys()] } },
    select: { id: true, teamId: true },
  });
  if (!mvs.length) return out;
  const teamByPlayer = new Map(mvs.map((m) => [m.id, m.teamId!]));
  const playerIds = mvs.map((m) => m.id);

  const [injuries, returns] = await Promise.all([
    prisma.playerEvent.findMany({
      where: { playerId: { in: playerIds }, type: "INJURY", id: { startsWith: "injury:" } },
      select: { id: true, playerId: true, occurredAt: true, detail: true },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.playerEvent.findMany({
      where: { playerId: { in: playerIds }, type: "RETURN" },
      select: { id: true },
    }),
  ]);
  const returned = new Set(returns.map((r) => r.id.replace(/^return:/, "")));

  const now = Date.now();
  const FRESH_MS = 45 * 86400_000;
  const seen = new Set<string>(); // 선수당 최신 부상 1건
  let fake = fakeStart;
  const nameRows = await prisma.theSportsPlayer.findMany({
    where: { id: { in: [...new Set(injuries.map((e) => e.playerId))] } },
    select: { id: true, nameKo: true, name: true },
  });
  const nameById = new Map(nameRows.map((p) => [p.id, p.nameKo || p.name]));

  for (const e of injuries) {
    if (returned.has(e.id.replace(/^injury:/, ""))) continue;
    if (seen.has(e.playerId)) continue;
    const d = (e.detail ?? {}) as { reason?: string; reasonRaw?: string | null; missedMatches?: number | null; lastSeenAt?: string };
    const lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : e.occurredAt.getTime();
    if (now - lastSeen > FRESH_MS) continue;
    const ourId = ourByTs.get(teamByPlayer.get(e.playerId) ?? "");
    if (ourId == null) continue;
    seen.add(e.playerId);
    const raw = d.reasonRaw ?? "";
    out.set(ourId, [
      ...(out.get(ourId) ?? []),
      {
        playerId: fake--,
        playerName: nameById.get(e.playerId) || "선수",
        reason: raw,
        fixtureDate: e.occurredAt.toISOString(),
        overrideKo: d.reason || tsInjuryReasonKo(raw),
        overrideSev: tsInjurySeverity(raw, d.missedMatches ?? 0),
      },
    ]);
  }
  return out;
}
