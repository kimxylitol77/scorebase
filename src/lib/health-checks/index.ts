// Health-check 봇 — 매일 06:30 KST cron 이 모든 체크 함수를 직렬 실행.
// 발견된 issue 는 HealthCheck DB row 로 insert + HIGH 는 텔레그램 전송.

import { prisma } from "@/lib/db";
import type { HealthFinding } from "./types";
import { toKoreanPlayerName } from "@/lib/player-names";
import { toKoreanTeamName } from "@/lib/team-names";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import { checkLinkHealth } from "./link-health";
// 채점 제외 기준은 evaluate 잡이 단일 출처 — 여기서 따로 정의하면 두 벌이 어긋난다.
import { MIN_PRIOR } from "@/jobs/evaluate-predictions";
// 축구 리더보드의 시즌 라벨도 같은 이유로 적재 잡이 단일 출처.
import { currentSoccerSeason } from "@/jobs/fetch-league-leaders";
import { SOCCER_LEAGUES, leaguesForSport, type SportCode } from "@/lib/sports/sport-leagues";
import rawWages from "../../../data/football-wages.json";

// ──────────────────────────────────────────────────────────────
// 1. 시즌 표기 — NHL / NBA / EPL / LALIGA / BUNDESLIGA / SERIE_A / LIGUE_1
//    리더보드 season 컬럼이 비현실적이면 HIGH.
// ──────────────────────────────────────────────────────────────
function expectedSeasonForLeague(league: string, now: Date): string[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1~12
  switch (league) {
    case "NHL":
    case "NBA": {
      // 10~12월 시작 → (y)-(y+1) 시즌. 1~6월 = (y-1)-(y) 시즌. 7~9월 = 시즌 무관 (offseason).
      if (m >= 10) return [`${y}-${String(y + 1).slice(2)}`, `${y}-${y + 1}`];
      if (m <= 6) return [`${y - 1}-${String(y).slice(2)}`, `${y - 1}-${y}`];
      return [`${y - 1}-${String(y).slice(2)}`, `${y - 1}-${y}`, `${y}-${String(y + 1).slice(2)}`];
    }
    case "EPL":
    case "LALIGA":
    case "BUNDESLIGA":
    case "SERIE_A":
    case "LIGUE_1":
    case "EREDIVISIE":
    case "PRIMEIRA_LIGA": {
      // 8월 시작 → (y)-(y+1). 1~6월 = (y-1)-(y).
      if (m >= 8) return [`${y}-${String(y + 1).slice(2)}`, `${y}-${y + 1}`];
      return [`${y - 1}-${String(y).slice(2)}`, `${y - 1}-${y}`];
    }
    case "UCL":
    case "UEL":
    case "UECL": {
      // UEFA 컨티넨탈 컵 — 본대회(리그 페이즈) 9월 개막. 7~8월 예선은 완료 시즌으로 간주.
      // (fetch-league-leaders.ts currentSoccerSeason 의 컵 전환 월과 일치시킨다.)
      if (m >= 9) return [`${y}-${String(y + 1).slice(2)}`, `${y}-${y + 1}`];
      return [`${y - 1}-${String(y).slice(2)}`, `${y - 1}-${y}`];
    }
    case "KBO":
    case "NPB":
    case "MLB":
    case "K_LEAGUE_1":
    case "K_LEAGUE_2":
    case "J1_LEAGUE":
    case "J2_LEAGUE":
    case "MLS":
    case "BRASILEIRAO":
    case "LOL":
      return [`${y}`];
    default:
      return [`${y}`, `${y - 1}`, `${y - 1}-${String(y).slice(2)}`, `${y}-${String(y + 1).slice(2)}`];
  }
}

/**
 * 검사가 인정하는 시즌 라벨 — 위 달력 공식에 **적재 잡의 분류**를 더한다.
 *
 * 라벨을 실제로 찍는 쪽은 fetch-league-leaders 다. 검사가 제 공식만 고집하면 잡이 시즌
 * 분류를 바꿀 때마다 오탐이 뜬다 (2026-08-16 실측: J1·J2 추춘제 전환으로 "2026-27",
 * UEFA 컵 전환월 9월→7월로 "2026-27" — 5건이 매일 HIGH 로 올라왔다. 둘 다 잡이 맞았다).
 * 잡 기준을 후보에 더하는 방식이라, 어느 쪽으로도 설명되지 않는 라벨은 그대로 잡힌다.
 */
function expectedSeasons(league: string, now: Date): string[] {
  const base = expectedSeasonForLeague(league, now);
  if (!SOCCER_LEAGUES.has(league)) return base;
  const fromJob = currentSoccerSeason(league).label;
  return base.includes(fromJob) ? base : [...base, fromJob];
}

async function checkSeasonLabels(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const distinct = await prisma.leagueLeader.groupBy({
    by: ["league", "season"],
    _count: { _all: true },
  });
  // 리그별 최신 season 만 사용 (page.tsx 와 동일 로직).
  const byLeague = new Map<string, string>();
  for (const row of distinct) {
    const prev = byLeague.get(row.league);
    if (!prev || row.season.localeCompare(prev) > 0) byLeague.set(row.league, row.season);
  }
  // 시즌 전환기 오탐 방지 — 달력이 새 시즌 월로 넘어가도 리그가 실제로 개막하기 전에는
  //   리더보드가 지난 시즌을 보여주는 게 맞다. 유럽 빅리그는 8/8~8/29 로 흩어져 개막하는데
  //   expectedSeasonForLeague 는 8월 1일부터 새 시즌을 요구해, 개막 전까지 최대 4주간
  //   매일 HIGH 7건을 띄웠다 (2026-08-03 실측 — 7개 리그 모두 신시즌 종료 경기 0건이었다).
  //   그래서 "최근에 끝난 경기가 있는가" 를 함께 본다. 경기가 없으면 리더보드가 지난 시즌인
  //   게 정상이고, 경기가 있는데도 라벨이 안 넘어갔으면 그건 진짜 문제라 그대로 잡힌다.
  const recentlyPlayed = new Set(
    (
      await prisma.match.groupBy({
        by: ["league"],
        where: {
          status: "FINISHED",
          startTime: { gte: new Date(now.getTime() - 30 * 24 * 3600 * 1000), lte: now },
        },
        _count: { _all: true },
      })
    ).map((r) => r.league),
  );

  for (const [league, season] of byLeague) {
    const expected = expectedSeasons(league, now);
    if (expected.includes(season)) continue;
    if (!recentlyPlayed.has(league)) continue; // 개막 전·비시즌 — 지난 시즌 표기가 정상
    out.push({
      category: "season-label",
      key: league,
      severity: "HIGH",
      message: `${league} 리더보드 시즌 = "${season}" — 예상 ${expected.join(" / ")}`,
      metadata: { actual: season, expected },
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 2. 매치 카운트 — 시즌 진행도 대비 비현실적 큰/작은 수치
// ──────────────────────────────────────────────────────────────
async function checkMatchCounts(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  // (league, 정규시즌 총 매치, 시즌 시작 월, 시즌 끝 월) — 12월 = 12 표기.
  const SCHEDULE: Array<{ league: string; total: number; startMonth: number; endMonth: number }> = [
    { league: "EPL", total: 380, startMonth: 8, endMonth: 5 },
    { league: "LALIGA", total: 380, startMonth: 8, endMonth: 5 },
    { league: "BUNDESLIGA", total: 306, startMonth: 8, endMonth: 5 },
    { league: "SERIE_A", total: 380, startMonth: 8, endMonth: 5 },
    { league: "LIGUE_1", total: 306, startMonth: 8, endMonth: 5 },
    { league: "KBO", total: 720, startMonth: 3, endMonth: 10 },
    { league: "NPB", total: 858, startMonth: 3, endMonth: 10 },
    { league: "MLB", total: 2430, startMonth: 3, endMonth: 10 },
    { league: "NBA", total: 1230, startMonth: 10, endMonth: 4 },
    { league: "NHL", total: 1312, startMonth: 10, endMonth: 4 },
    { league: "MLS", total: 510, startMonth: 2, endMonth: 12 },
  ];
  const m = now.getUTCMonth() + 1;
  for (const cfg of SCHEDULE) {
    // 진행도 계산 — 시즌이 같은 해 안에 끝나는지(KBO/MLB), 두 해에 걸치는지(EPL)에 따라 다름.
    let progress: number;
    if (cfg.startMonth <= cfg.endMonth) {
      // 같은 해 — 3월 시작 ~ 10월 끝.
      if (m < cfg.startMonth) progress = 0;
      else if (m > cfg.endMonth) progress = 1;
      else progress = (m - cfg.startMonth + 1) / (cfg.endMonth - cfg.startMonth + 1);
    } else {
      // 두 해 — 8월 시작 ~ 5월 끝.
      if (m >= cfg.startMonth) progress = (m - cfg.startMonth + 1) / 10;
      else if (m <= cfg.endMonth) progress = (12 - cfg.startMonth + m + 1) / 10;
      else progress = 1; // 6~7월 = 비시즌
    }
    const expected = Math.round(progress * cfg.total);
    // 현재 진행 시즌 시작일 이후만 카운트 — 과거 시즌(작년) FINISHED 누적이 섞여 과대
    // 판정되던 false positive 방지 (예: MLB 2025+2026 합산 2443 → 2026 시즌만 1645).
    const seasonStartYear =
      cfg.startMonth <= cfg.endMonth
        ? now.getUTCFullYear()
        : m >= cfg.startMonth
          ? now.getUTCFullYear()
          : now.getUTCFullYear() - 1;
    const seasonStart = new Date(Date.UTC(seasonStartYear, cfg.startMonth - 1, 1));
    const finished = await prisma.match.count({
      where: { league: cfg.league, status: "FINISHED", startTime: { gte: seasonStart } },
    });
    // ±50% 또는 100경기 이상 차이면 경고.
    const tolerance = Math.max(100, cfg.total * 0.25);
    const diff = Math.abs(finished - expected);
    if (diff > tolerance) {
      out.push({
        category: "match-count",
        key: cfg.league,
        severity: diff > tolerance * 2 ? "HIGH" : "MED",
        message: `${cfg.league} FINISHED ${finished}경기 — 예상 ${expected} (진행도 ${(progress * 100).toFixed(0)}%, 차 ${diff})`,
        metadata: { finished, expected, progress, tolerance },
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 3. SCHEDULED freshness — 시즌 중 리그에 다음 7일 SCHEDULED 매치가 0이면 경고
// ──────────────────────────────────────────────────────────────
// 시즌 종료 후 자연스러운 0건을 false positive 로 잡지 않도록 리그별 endMonth 정의.
// 마지막 FINISHED 가 endMonth 의 15일 이후 + 현재 같은 endMonth 이면 시즌 막바지 자연 0건 (suppress).
// 또는 현재 시각이 명확히 비시즌 month 면 suppress.
const SEASON_END_MONTH: Record<string, number> = {
  EPL: 5, LALIGA: 5, BUNDESLIGA: 5, SERIE_A: 5, LIGUE_1: 5,
  UCL: 5, UEL: 5, UECL: 5,
  NBA: 6, NHL: 6,
  KBO: 11, NPB: 11, MLB: 11, MLS: 12,
  K_LEAGUE_1: 11, K_LEAGUE_2: 11, J1_LEAGUE: 11, J2_LEAGUE: 11,
};
const OFFSEASON_MONTHS: Record<string, Set<number>> = {
  EPL: new Set([6, 7]), LALIGA: new Set([6, 7]), BUNDESLIGA: new Set([6, 7]),
  SERIE_A: new Set([6, 7]), LIGUE_1: new Set([6, 7]),
  KBO: new Set([12, 1, 2]), NPB: new Set([12, 1, 2]), MLB: new Set([12, 1, 2]),
  K_LEAGUE_1: new Set([12, 1, 2]), K_LEAGUE_2: new Set([12, 1, 2]),
  J1_LEAGUE: new Set([12, 1]), J2_LEAGUE: new Set([12, 1]),
  MLS: new Set([12, 1]),
  NBA: new Set([7, 8, 9]), NHL: new Set([7, 8, 9]),
};

/** api-football 다음 경기 날짜 (휴식 감지용 외부 verify). 없으면 null. */
async function fetchAfNextFixtureDate(leagueId: number): Promise<Date | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?league=${leagueId}&next=1`, {
      headers: { "x-apisports-key": key },
    });
    if (!res.ok) return null;
    const j = await res.json();
    const d = j.response?.[0]?.fixture?.date;
    return d ? new Date(d) : null;
  } catch {
    return null;
  }
}

async function checkScheduledFreshness(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const horizon = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "K_LEAGUE_1", "KBO", "NPB", "MLB", "NBA", "NHL", "MLS"];
  const currentMonth = now.getUTCMonth() + 1;
  for (const league of LEAGUES) {
    // 비시즌 month 면 자연 0건 — suppress
    if (OFFSEASON_MONTHS[league]?.has(currentMonth)) continue;

    const cnt = await prisma.match.count({
      where: { league, status: "SCHEDULED", startTime: { gte: now, lte: horizon } },
    });
    const recentFinished = await prisma.match.count({
      where: {
        league,
        status: "FINISHED",
        startTime: { gte: new Date(now.getTime() - 14 * 24 * 3600 * 1000), lte: now },
      },
    });

    // 시즌 종료 직후 grace — 마지막 FINISHED 가 endMonth 의 15일 이후 + 현재도 같은 endMonth 면
    // 다음 시즌 일정 (보통 다음 startMonth 의 fixtures 발표 후) 까지 자연 0건. suppress.
    const endM = SEASON_END_MONTH[league];
    if (endM != null && currentMonth === endM) {
      const lastFinished = await prisma.match.findFirst({
        where: { league, status: "FINISHED" },
        orderBy: { startTime: "desc" },
        select: { startTime: true },
      });
      if (lastFinished) {
        const lastM = lastFinished.startTime.getUTCMonth() + 1;
        const lastD = lastFinished.startTime.getUTCDate();
        // 농구/하키 파이널은 6월 초·중순 종료라 날짜 변동이 커서 15일 기준에 걸렸다
        // (6/14 종료가 하루 차이로 시즌중 오판). NBA/NHL 은 endMonth 안에 마지막 경기가
        // 있으면 시즌 종료로 간주. 그 외 리그는 기존대로 15일 이후 종료만 막바지로 본다.
        const finalsSport = league === "NBA" || league === "NHL";
        if (lastM === endM && (finalsSport || lastD >= 15)) continue; // 시즌 막 종료
      }
    }

    if (recentFinished > 0 && cnt === 0) {
      // 외부 verify — api-football 다음 경기가 horizon(7일) 밖이면 리그 휴식(월드컵 등) → suppress.
      // 축구만(API_FOOTBALL_LEAGUE_ID 보유). 야구/농구는 6~7월 시즌 중이라 verify 불필요.
      const afId = API_FOOTBALL_LEAGUE_ID[league];
      if (afId) {
        const nextDate = await fetchAfNextFixtureDate(afId);
        // 다음 경기가 horizon 밖 = 리그 휴식(월드컵 등) → suppress. nextDate=null 도
        // api-football 에 향후 일정 없음 = 장기 휴식 중 일정 미발표(2026 WC 로 MLS/K리그
        // 휴식) → 동일하게 휴식 간주 suppress. (우리 수집 갭이면 af 엔 일정이 남음)
        if (!nextDate || nextDate.getTime() > horizon.getTime()) continue;
      }
      out.push({
        category: "scheduled-freshness",
        key: league,
        severity: "HIGH",
        message: `${league} 시즌 중인데 다음 7일 SCHEDULED 매치 0건 (최근 14일 FINISHED ${recentFinished}건)`,
        metadata: { scheduled7d: 0, recentFinished14d: recentFinished },
      });
    } else if (recentFinished > 5 && cnt < 3) {
      out.push({
        category: "scheduled-freshness",
        key: league,
        severity: "MED",
        message: `${league} 다음 7일 SCHEDULED ${cnt}건 (보통보다 적음)`,
        metadata: { scheduled7d: cnt, recentFinished14d: recentFinished },
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 4. leagueLeader.teamName 이 해당 리그 team 화이트리스트에 있는지
//    예: LOL=LCK 인데 외부 리그 팀명 노출 시 HIGH
// ──────────────────────────────────────────────────────────────
// 컨티넨탈/하위 컵 — 자국 리그 팀 출전이 정상이므로 valid set 매칭이 의미 없음 → 체크 자체 skip.
const CONTINENTAL_CUP_LEAGUES = new Set([
  "UCL",
  "UEL",
  "UECL",
  "AFC_CL",
  "AFC_CL_TWO",
  "AFC_U23",
  "WORLD_CUP",
  "CLUB_WORLD_CUP",
  "COPA_LIB",
  "COPA_SUD",
  "ASEAN_CHAMP", // 국가대표 대회 — 소속 클럽 리그 정합성 검사의 대상이 아니다
]);

// 친선 라벨 row 와의 일치는 "오염" 증거가 아니라 친선 중복 row 의 존재 증명일 뿐이다
// (친선은 소속이 아님). 외부 리그 비교에서 제외.
const FRIENDLY_LEAGUES = new Set([
  "CLUB_FRIENDLY",
  "INTL_FRIENDLY",
  "HOCKEY_FRIENDLY",
  "VB_FRIENDLY",
  "VB_FRIENDLY_W",
]);

// 리그 → 종목. 동명 클럽이 종목만 다른 경우(축구 TPS Turku ↔ 하키 리그 TPS)가 있어
// 외부 리그 비교는 같은 종목 안에서만 의미가 있다.
const SPORT_OF_LEAGUE = new Map<string, string>();
for (const code of ["soccer", "baseball", "basketball", "volleyball", "hockey", "esports", "mma", "tennis", "golf", "f1"] as SportCode[]) {
  for (const lg of leaguesForSport(code)) SPORT_OF_LEAGUE.set(lg, code);
}

function teamNameMatchesValid(name: string, validNames: Set<string>): boolean {
  if (validNames.has(name)) return true;
  // substring 양방향 매칭 — leader "Sabres" ⊂ DB "Buffalo Sabres", leader "Inter Miami" ⊂ DB "Inter Miami CF".
  // 너무 짧은 토큰 (1 글자) 우연 매칭 방지.
  if (name.length < 2) return false;
  for (const n of validNames) {
    if (n.length < 2) continue;
    if (n.includes(name) || name.includes(n)) return true;
  }
  return false;
}

/**
 * 외부 리그 오염 판정 전용 — 자기 리그 매칭(위, 느슨함 유지)과 달리 정규화 완전일치만 인정.
 * substring 을 쓰면 "Liverpool URU"(우루과이)가 EPL "Liverpool" 에, "Inter Toronto FC" 가
 * MLS "Toronto FC" 에 걸려 영구 오탐이 매일 MED 로 쌓였다(60일 실측 — 스스로 해소 불가).
 */
function teamNameForeignExact(name: string, validNames: Set<string>): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
  const target = norm(name);
  if (target.length < 3) return false;
  for (const n of validNames) if (norm(n) === target) return true;
  return false;
}

async function checkLeaderboardLeagueConsistency(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const leaders = await prisma.leagueLeader.findMany({
    select: { league: true, teamName: true, playerName: true, rank: true, category: true, season: true },
  });
  if (leaders.length === 0) return out;

  // 리그별 최신 season 만 — MLS 처럼 [2026, 2025-26] 동시 존재 시 옛 시즌 row false-positive 회피.
  const latestSeasonByLeague = new Map<string, string>();
  for (const r of leaders) {
    const cur = latestSeasonByLeague.get(r.league);
    if (!cur || r.season > cur) latestSeasonByLeague.set(r.league, r.season);
  }

  // 리그별로 우리 사이트가 인지하는 팀명 set 구성 (원문 + 한국어 + shortName).
  const teams = await prisma.team.findMany({ select: { league: true, name: true, shortName: true } });
  const byLeague = new Map<string, Set<string>>();
  for (const t of teams) {
    if (!byLeague.has(t.league)) byLeague.set(t.league, new Set());
    const set = byLeague.get(t.league)!;
    set.add(t.name);
    set.add(toKoreanTeamName(t.name, t.league));
    if (t.shortName && t.shortName.trim().length > 0) set.add(t.shortName);
  }

  // 리그별 mismatch 개수 카운트
  const mismatchByLeague = new Map<string, { total: number; samples: string[] }>();
  for (const r of leaders) {
    if (CONTINENTAL_CUP_LEAGUES.has(r.league)) continue;
    if (r.season !== latestSeasonByLeague.get(r.league)) continue;
    // 유효 팀 목록은 Team.league = **현재** 소속인데 리더보드는 시즌 기록이다. 지난 시즌 표를
    // 현재 소속과 맞대면 승격·강등팀이 통째로 "외부 리그"로 잡힌다 (2026-08-16: 세리에A 표의
    // 베로나·피사가 Team.league=SERIE_B 라 MED 로 올라왔다 — 강등됐을 뿐 기록은 맞다).
    // 현 시즌 표만 검사한다. 현 시즌에 섞여 들어온 진짜 오적재는 그대로 잡힌다.
    if (!expectedSeasons(r.league, now).includes(r.season)) continue;
    const validNames = byLeague.get(r.league);
    if (!validNames || validNames.size === 0) continue;
    // 양방향 시도: 원문 teamName + 한국어 변환
    const koTeam = toKoreanTeamName(r.teamName, r.league);
    if (teamNameMatchesValid(r.teamName, validNames)) continue;
    if (koTeam !== r.teamName && teamNameMatchesValid(koTeam, validNames)) continue;

    // 자기 리그에 안 맞아도 곧바로 "외부 리그"로 단정하지 않는다.
    // 미매칭 대다수는 외부 선수가 아니라 팀명 정규화갭(한글 leader "뉴욕 양키스" vs 영문 Team
    // "New York Yankees", NPB 원시약자 "(デ)" 등)이고, 이게 HIGH 오발화의 원인이었음.
    // 진짜 "외부 리그 오염"은 그 팀이 다른 리그 Team set 에 실제로 존재할 때만 → 그때만 flag.
    let foreign: string | null = null;
    const sport = SPORT_OF_LEAGUE.get(r.league);
    for (const [oleague, oset] of byLeague) {
      if (oleague === r.league || CONTINENTAL_CUP_LEAGUES.has(oleague)) continue;
      if (FRIENDLY_LEAGUES.has(oleague)) continue; // 친선 중복 row — 소속 증거 아님
      // 종목이 다르면 동명 클럽일 뿐(축구 TPS ↔ 하키 TPS) — 비교 무의미
      if (sport && SPORT_OF_LEAGUE.get(oleague) && SPORT_OF_LEAGUE.get(oleague) !== sport) continue;
      // 완전일치만 — substring 은 타 리그 유사명("Liverpool URU"↔EPL Liverpool)에 걸려 영구 오탐
      if (
        teamNameForeignExact(r.teamName, oset) ||
        (koTeam !== r.teamName && teamNameForeignExact(koTeam, oset))
      ) {
        foreign = oleague;
        break;
      }
    }
    if (!foreign) continue; // 정규화갭 — 외부 리그 아님, skip

    const e = mismatchByLeague.get(r.league) ?? { total: 0, samples: [] };
    e.total++;
    if (e.samples.length < 3) e.samples.push(`${r.playerName} (${r.teamName} → ${foreign})`);
    mismatchByLeague.set(r.league, e);
  }
  for (const [league, info] of mismatchByLeague) {
    out.push({
      category: "leaderboard-consistency",
      key: league,
      // 외부리그 선수 추정은 이름매칭 휴리스틱이라 오발화 잦음 → HIGH(텔레그램) 대신 MED.
      severity: "MED",
      message: `${league} 리더보드에 외부 리그 추정 선수 ${info.total}명 — 예: ${info.samples.join(", ")}`,
      metadata: info,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 5. 영문 선수 노출 비율 — 최근 14일 Match 의 lineup/starter JSON 에서 fullName 추출 → 사전 매핑 통과율
// ──────────────────────────────────────────────────────────────
async function checkPlayerNameMissingRate(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const since = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const matches = await prisma.match.findMany({
    where: { startTime: { gte: since }, status: { in: ["FINISHED", "LIVE", "SCHEDULED"] } },
    select: { league: true, lineupHome: true, lineupAway: true, homeStarter: true, awayStarter: true },
    take: 500,
  });
  const counts = new Map<string, { total: number; missing: number; samples: Set<string> }>();
  const walk = (obj: unknown, league: string): void => {
    if (!obj) return;
    if (typeof obj === "string") return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item, league);
      return;
    }
    if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if ((k === "name" || k === "fullName" || k === "player") && typeof v === "string" && /^[A-Za-z]/.test(v)) {
          const e = counts.get(league) ?? { total: 0, missing: 0, samples: new Set<string>() };
          e.total++;
          const ko = toKoreanPlayerName(v);
          if (ko === v.trim()) {
            e.missing++;
            if (e.samples.size < 5) e.samples.add(v);
          }
          counts.set(league, e);
        } else if (v && typeof v === "object") {
          walk(v, league);
        }
      }
    }
  };
  for (const m of matches) {
    for (const field of ["lineupHome", "lineupAway", "homeStarter", "awayStarter"] as const) {
      const raw = m[field];
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw);
        walk(obj, m.league);
      } catch {
        /* ignore parse error */
      }
    }
  }
  for (const [league, e] of counts) {
    if (e.total < 10) continue; // 표본 부족
    const rate = e.missing / e.total;
    if (rate > 0.2) {
      out.push({
        category: "player-name-missing",
        key: league,
        severity: rate > 0.4 ? "HIGH" : "MED",
        message: `${league} 영문 선수 노출 비율 ${(rate * 100).toFixed(0)}% (${e.missing}/${e.total}) — 예: ${Array.from(e.samples).slice(0, 3).join(", ")}`,
        metadata: { rate, missing: e.missing, total: e.total, samples: Array.from(e.samples) },
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 6. 영문 팀명 노출 비율 — Match 의 homeTeam/awayTeam.name 통과율
// ──────────────────────────────────────────────────────────────
async function checkTeamNameMissingRate(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const teams = await prisma.team.findMany({
    where: {
      OR: [
        { homeMatches: { some: { startTime: { gte: since } } } },
        { awayMatches: { some: { startTime: { gte: since } } } },
      ],
    },
    select: { league: true, name: true },
    take: 1000,
  });
  // 정해진 매치업 미정 / 올스타 / placeholder 팀 — 사용자 노출 자체가 정상이므로 missing 비율에서 제외.
  // NBA playoff TBD, NBA All-Star Team Stars/Stripes/World, 기타 임시 placeholder.
  const PLACEHOLDER_TEAM_NAMES = new Set([
    "TBD",
    "Team Stars", "Team Stripes", "World",
    "Team LeBron", "Team Durant", "Team Giannis",
  ]);
  const counts = new Map<string, { total: number; missing: number; samples: Set<string> }>();
  for (const t of teams) {
    if (PLACEHOLDER_TEAM_NAMES.has(t.name)) continue;
    const e = counts.get(t.league) ?? { total: 0, missing: 0, samples: new Set<string>() };
    e.total++;
    const ko = toKoreanTeamName(t.name, t.league);
    // "NC 다이노스" / "LG 트윈스" / "BNK 피어엑스" / "T1" 처럼 영문 약자 포함 한글 팀명을 잘못 잡지 않도록
    // 한글이 포함되어 있으면 사이트 인지 팀으로 간주.
    const hasHangul = /[가-힯]/.test(t.name);
    if (ko === t.name && !hasHangul) {
      e.missing++;
      if (e.samples.size < 5) e.samples.add(t.name);
    }
    counts.set(t.league, e);
  }
  // 대형 리그만 HIGH/MED 알림 — 마이너 리그는 공식 한글 소스 자체가 없어 만성 영문노출이
  // 정상(미관 이슈일 뿐). LOW 로 두어 텔레그램 HIGH 스팸 차단.
  const MAJOR_TEAM_NAME = new Set([
    "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL", "UEL", "UECL",
    "K_LEAGUE_1", "J1_LEAGUE", "MLS", "NBA", "NHL", "MLB", "KBO", "NPB",
  ]);
  for (const [league, e] of counts) {
    if (e.total < 3) continue;
    const rate = e.missing / e.total;
    if (rate > 0.15) {
      const major = MAJOR_TEAM_NAME.has(league);
      out.push({
        category: "team-name-missing",
        key: league,
        severity: major ? (rate > 0.3 ? "HIGH" : "MED") : "LOW",
        message: `${league} 영문 팀명 노출 ${(rate * 100).toFixed(0)}% (${e.missing}/${e.total}) — ${Array.from(e.samples).slice(0, 3).join(", ")}`,
        metadata: { rate, missing: e.missing, total: e.total, samples: Array.from(e.samples) },
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 7. 적중률 — 1X2 / OU / 핸디 / BTTS / DC. 임계 50% 이하 = MED, 40% 이하 = HIGH
// ──────────────────────────────────────────────────────────────
async function checkAccuracy(): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  // 최근 60일 평가된 매치 — 30일은 표본 부족 + 시즌 막바지 이변으로 false-positive 발생
  // (예: SERIE_A 30일 37% → 60일 44% → 90일 48% 정상화. 시즌 전체 42%).
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const FIELDS: Array<{ name: string; field: "predCorrect" | "predOverCorrect" | "predHcCorrect" | "predBttsCorrect" | "predDcCorrect" }> = [
    { name: "1X2", field: "predCorrect" },
    { name: "OU", field: "predOverCorrect" },
    { name: "핸디", field: "predHcCorrect" },
    { name: "BTTS", field: "predBttsCorrect" },
    { name: "DC", field: "predDcCorrect" },
  ];
  const LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "KBO", "MLB", "NBA", "NHL"];
  for (const league of LEAGUES) {
    for (const { name, field } of FIELDS) {
      const rows = await prisma.match.findMany({
        where: {
          league,
          startTime: { gte: since },
          status: "FINISHED",
          NOT: { [field]: null },
        },
        select: { [field]: true },
      });
      if (rows.length < 30) continue; // 표본 너무 적으면 noise — 30건 미만 skip
      const correct = rows.filter((r) => (r as Record<string, unknown>)[field] === true).length;
      const rate = correct / rows.length;
      // 1X2 는 3-way 분류라 baseline 모델도 40-50% 대 — 임계 완화.
      // OU/BTTS 는 2-way 라 50% 가 random, 45% 미만이면 신호.
      const isTwoWay = name === "OU" || name === "BTTS" || name === "DC";
      const highT = isTwoWay ? 0.42 : 0.35;
      const medT = isTwoWay ? 0.48 : 0.42;
      if (rate < medT) {
        out.push({
          category: "accuracy",
          key: `${league}-${name}`,
          // 60일 누적 적중률 = 매일 거의 안 변하는 정보성 지표 → HIGH(텔레그램) 제외, MED/LOW.
          severity: rate < highT ? "MED" : "LOW",
          message: `${league} ${name} 적중률 ${(rate * 100).toFixed(0)}% (${correct}/${rows.length}) — 60일`,
          metadata: { rate, correct, total: rows.length },
        });
      }
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 8. Article 생성 cadence — 어제 PREVIEW / RECAP 글이 N건 이상 생성됐는지
// ──────────────────────────────────────────────────────────────
async function checkArticleCadence(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const yesterdayStart = new Date(now);
  yesterdayStart.setUTCHours(0, 0, 0, 0);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() + 1);
  // RECAP 자동발행은 2026-05 SEO 판단으로 의도적 중단(73a88ad recap cron 제거) — cadence
  // 점검 제외(0건이 정상). PREVIEW 만 점검.
  for (const type of ["PREVIEW"] as const) {
    const cnt = await prisma.article.count({
      where: {
        type,
        publishedAt: { gte: yesterdayStart, lt: yesterdayEnd },
      },
    });
    // 7일 평균 대비 비교
    const week = await prisma.article.count({
      where: {
        type,
        publishedAt: {
          gte: new Date(yesterdayStart.getTime() - 7 * 24 * 3600 * 1000),
          lt: yesterdayStart,
        },
      },
    });
    const avg = week / 7;
    if (cnt === 0 && avg >= 3) {
      out.push({
        category: "article-cadence",
        key: type,
        severity: "HIGH",
        message: `${type} 글 어제 0건 (최근 7일 평균 ${avg.toFixed(1)}건/일) — cron 실패 의심`,
        metadata: { yesterday: cnt, weeklyAvg: avg },
      });
    } else if (cnt < avg * 0.3 && avg >= 3) {
      out.push({
        category: "article-cadence",
        key: type,
        severity: "MED",
        message: `${type} 글 어제 ${cnt}건 (평균 ${avg.toFixed(1)}건/일의 30% 미만)`,
        metadata: { yesterday: cnt, weeklyAvg: avg },
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 9. starter coverage (KBO/MLB) + goalie coverage (NHL)
// ──────────────────────────────────────────────────────────────
async function checkStarterCoverage(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const horizon = new Date(now.getTime() + 24 * 3600 * 1000);
  for (const league of ["KBO", "MLB", "NPB"]) {
    const total = await prisma.match.count({
      where: { league, status: "SCHEDULED", startTime: { gte: now, lte: horizon } },
    });
    if (total < 5) continue;
    const withStarter = await prisma.match.count({
      where: {
        league,
        status: "SCHEDULED",
        startTime: { gte: now, lte: horizon },
        NOT: [{ homeStarter: null }, { awayStarter: null }],
      },
    });
    const rate = withStarter / total;
    if (rate < 0.5) {
      out.push({
        category: "starter-coverage",
        key: league,
        // KBO/NPB 는 무료 선발투수 소스 없음(알려진 한계, 유료 Data Sports Group 미계약)
        // → LOW. MLB(MLB Stats API 무료)만 실제 알림 대상.
        severity:
          league === "KBO" || league === "NPB"
            ? "LOW"
            : rate < 0.2
              ? "HIGH"
              : "MED",
        message: `${league} 오늘 매치 starter 매핑 ${withStarter}/${total} (${(rate * 100).toFixed(0)}%)`,
        metadata: { league, withStarter, total, rate },
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 10. cron lag — Match.updatedAt 최신 시각이 12시간 초과면 collect 잡 lag 의심
// ──────────────────────────────────────────────────────────────
async function checkCronLag(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const latest = await prisma.match.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  if (!latest) return out;
  const lagHours = (now.getTime() - latest.updatedAt.getTime()) / (3600 * 1000);
  if (lagHours > 12) {
    out.push({
      category: "cron-lag",
      key: "collect",
      severity: lagHours > 24 ? "HIGH" : "MED",
      message: `Match 테이블 최근 업데이트 ${lagHours.toFixed(1)}h 전 — collect 잡 lag 의심`,
      metadata: { lagHours, latestUpdate: latest.updatedAt.toISOString() },
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 11. odds coverage — 다가오는 매치의 market odds 채워진 비율
// ──────────────────────────────────────────────────────────────
async function checkOddsCoverage(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const horizon = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  for (const league of ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLB", "NBA", "NHL", "KBO"]) {
    const total = await prisma.match.count({
      where: { league, status: "SCHEDULED", startTime: { gte: now, lte: horizon } },
    });
    if (total < 3) continue;
    const withOdds = await prisma.match.count({
      where: {
        league,
        status: "SCHEDULED",
        startTime: { gte: now, lte: horizon },
        NOT: [{ marketHome: null }, { marketAway: null }],
      },
    });
    const rate = withOdds / total;
    if (rate < 0.5) {
      out.push({
        category: "odds-coverage",
        key: league,
        severity: rate < 0.2 ? "MED" : "LOW",
        message: `${league} 다음 3일 매치 odds 매핑 ${withOdds}/${total} (${(rate * 100).toFixed(0)}%)`,
        metadata: { withOdds, total, rate },
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 12. PageView 분석 — 어제 페이지뷰가 평소의 30% 미만이면 트래픽 이상
// ──────────────────────────────────────────────────────────────
async function checkPageViewAnomaly(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  // 모델이 PageView 라는 가정 — 실제 schema 에 없으면 skip.
  try {
    const yesterdayStart = new Date(now);
    yesterdayStart.setUTCHours(0, 0, 0, 0);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() + 1);
    const pv = (prisma as unknown as Record<string, { count?: (args: unknown) => Promise<number> }>).pageView;
    if (!pv || !pv.count) return out;
    const yesterday = await pv.count({ where: { ts: { gte: yesterdayStart, lt: yesterdayEnd } } } as never);
    const weekStart = new Date(yesterdayStart.getTime() - 7 * 24 * 3600 * 1000);
    const week = await pv.count({ where: { ts: { gte: weekStart, lt: yesterdayStart } } } as never);
    const avg = week / 7;
    if (avg < 10) return out; // 표본 부족
    const ratio = yesterday / avg;
    if (ratio < 0.3) {
      out.push({
        category: "pageview-anomaly",
        key: "site",
        severity: "MED",
        message: `어제 PV ${yesterday} — 7일 평균 ${avg.toFixed(0)}의 ${(ratio * 100).toFixed(0)}% (이상 저조)`,
        metadata: { yesterday, weeklyAvg: avg, ratio },
      });
    }
  } catch {
    /* schema 없으면 skip */
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 13. odds 시장과 모델 우승 차이 이상 — value bet 이 너무 많으면 모델 mis-calibration
// ──────────────────────────────────────────────────────────────
async function checkModelMarketDeviation(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const horizon = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const rows = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      NOT: [{ marketHome: null }, { predHome: null }],
    },
    select: { league: true, marketHome: true, predHome: true, marketAway: true, predAway: true },
    take: 200,
  });
  const byLeague = new Map<string, { large: number; total: number }>();
  for (const r of rows) {
    const e = byLeague.get(r.league) ?? { large: 0, total: 0 };
    e.total++;
    const dh = Math.abs((r.predHome ?? 0) - (r.marketHome ?? 0));
    const da = Math.abs((r.predAway ?? 0) - (r.marketAway ?? 0));
    if (Math.max(dh, da) > 0.15) e.large++; // 15%p 이상 차이
    byLeague.set(r.league, e);
  }
  for (const [league, e] of byLeague) {
    if (e.total < 10) continue;
    const rate = e.large / e.total;
    if (rate > 0.4) {
      out.push({
        category: "model-market-deviation",
        key: league,
        severity: "MED",
        message: `${league} 모델 vs 시장 차이 15%p+ 매치 ${(rate * 100).toFixed(0)}% (${e.large}/${e.total}) — 모델 mis-calibration 의심`,
        metadata: { rate, large: e.large, total: e.total },
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 14. ghost team — 매치는 있지만 Team 테이블에 등록 안 된 teamId
// ──────────────────────────────────────────────────────────────
async function checkGhostTeams(): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const teamIds = new Set((await prisma.team.findMany({ select: { id: true } })).map((t) => t.id));
  const recent = await prisma.match.findMany({
    where: { startTime: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
    select: { homeTeamId: true, awayTeamId: true, league: true },
    take: 2000,
  });
  const ghosts = new Map<string, Set<number>>();
  for (const m of recent) {
    for (const tid of [m.homeTeamId, m.awayTeamId]) {
      if (!teamIds.has(tid)) {
        const s = ghosts.get(m.league) ?? new Set<number>();
        s.add(tid);
        ghosts.set(m.league, s);
      }
    }
  }
  for (const [league, set] of ghosts) {
    out.push({
      category: "ghost-team",
      key: league,
      severity: set.size > 5 ? "HIGH" : "MED",
      message: `${league} 매치 참조 teamId ${set.size}개가 Team 테이블에 없음 — Ghost 매치 의심`,
      metadata: { league, ghostCount: set.size, sampleIds: Array.from(set).slice(0, 10) },
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 15. Notice 신선도 — 마지막 NOTICE 가 30일 초과면 LOW (운영 활성도 지표)
// ──────────────────────────────────────────────────────────────
async function checkNoticeFreshness(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  try {
    const latest = await prisma.notice.findFirst({
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true, title: true },
    });
    if (!latest) return out;
    const ageDays = (now.getTime() - latest.publishedAt.getTime()) / (24 * 3600 * 1000);
    if (ageDays > 30) {
      out.push({
        category: "notice-stale",
        key: "site",
        severity: "LOW",
        message: `최근 Notice "${latest.title}" — ${ageDays.toFixed(0)}일 전 (30일 초과)`,
        metadata: { ageDays, title: latest.title },
      });
    }
  } catch {
    /* Notice 모델 없으면 skip */
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 16. NHL goalie coverage — 시즌 중 NHL 매치 의 goalie 매핑
// ──────────────────────────────────────────────────────────────
async function checkNhlGoalieCoverage(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const horizon = new Date(now.getTime() + 24 * 3600 * 1000);
  const total = await prisma.match.count({
    where: { league: "NHL", status: "SCHEDULED", startTime: { gte: now, lte: horizon } },
  });
  if (total < 3) return out;
  const withGoalie = await prisma.match.count({
    where: {
      league: "NHL",
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      NOT: [{ homeGoalie: null }, { awayGoalie: null }],
    },
  });
  const rate = withGoalie / total;
  if (rate < 0.5) {
    out.push({
      category: "goalie-coverage-nhl",
      key: "NHL",
      severity: rate < 0.2 ? "MED" : "LOW",
      message: `NHL 오늘 매치 goalie 매핑 ${withGoalie}/${total} (${(rate * 100).toFixed(0)}%)`,
      metadata: { withGoalie, total, rate },
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 17. predCorrect null 비율 (FINISHED 매치인데 평가 안 됨)
// ──────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────
// 선수 출전로그 신선도 — 커버 리그의 최근 매치데이가 PlayerMatchLog 에 반영됐는지.
// 왜. 수집(player-match-logs)이 af from/to 오류로 한 달 조용히 0건이었고(2026-08-19),
// 시즌 중엔 선수 페이지 출전기록·시즌별 기록이 통째로 멎는데 아무도 몰랐다.
// 판정: 12~48h 전에 끝난 커버 리그 매치가 있는데 최신 로그가 그보다 오래됨 → MED.
// (12h 유예 = af 경기별 스탯 발행 + 일간 04:30 UTC 수집 차례가 오기까지의 정상 지연)
// ──────────────────────────────────────────────────────────────
const LOG_COVERED_LEAGUES = ["EPL", "LALIGA", "SERIE_A", "BUNDESLIGA", "LIGUE_1", "MLS", "K_LEAGUE_1", "J1_LEAGUE"];
async function checkPlayerLogFreshness(now: Date): Promise<HealthFinding[]> {
  const latestMatch = await prisma.match.findFirst({
    where: {
      status: "FINISHED",
      league: { in: LOG_COVERED_LEAGUES },
      startTime: { gte: new Date(now.getTime() - 48 * 3600_000), lte: new Date(now.getTime() - 12 * 3600_000) },
    },
    orderBy: { startTime: "desc" },
    select: { league: true, startTime: true },
  });
  if (!latestMatch) return [];
  const latestLog = await prisma.playerMatchLog.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (latestLog && latestLog.date >= latestMatch.startTime) return [];
  const logAgeH = latestLog ? Math.round((now.getTime() - latestLog.date.getTime()) / 3600_000) : null;
  return [
    {
      category: "player-log-freshness",
      key: "coverage",
      severity: "MED",
      message: `선수 출전로그가 최근 매치데이 미반영 — 최신 로그 ${logAgeH == null ? "없음" : `${logAgeH}h 전`}, 최근 종료 매치 ${latestMatch.league} ${latestMatch.startTime.toISOString().slice(0, 10)}`,
      metadata: { latestLogAt: latestLog?.date ?? null, latestMatchAt: latestMatch.startTime, league: latestMatch.league },
    },
  ];
}

// ──────────────────────────────────────────────────────────────
// 주급 스냅샷 동결 — data/football-wages.json 이 몇 주째 그대로면 수집이 죽은 것.
//   2026-08-21 실측: Capology 가 Cloudflare 챌린지로 봇을 막아 5대리그 경로까지 403 이 되었고,
//   주간 러너 ⑦-e 는 빈 응답 가드에 걸려 옛 파일을 유지하며 "성공"처럼 조용히 끝나고 있었다.
//   그래서 잡 실행 여부(cron-lag)로는 안 잡히고 파일의 fetchedAt 으로만 드러난다.
//   자가치유에는 등록하지 않는다 — 재실행해도 403 이라 치유가 안 되고 알림만 반복된다.
//   차단이 풀리면 이 finding 이 저절로 사라진다.
// ──────────────────────────────────────────────────────────────
async function checkWageFreshness(now: Date): Promise<HealthFinding[]> {
  const fetchedAt = (rawWages as { fetchedAt?: string }).fetchedAt;
  const at = fetchedAt ? Date.parse(fetchedAt) : NaN;
  if (!Number.isFinite(at)) {
    return [{ category: "wage-freshness", key: "snapshot", severity: "MED", message: "주급 스냅샷에 fetchedAt 이 없음 — football-wages.json 형식 확인 필요" }];
  }
  const ageDays = Math.floor((now.getTime() - at) / 86400_000);
  // 주간 러너가 정상이면 7일 이내. 2주 연속 실패(=21일)부터 실제 문제로 본다.
  if (ageDays <= 21) return [];
  return [
    {
      category: "wage-freshness",
      key: "snapshot",
      severity: "MED",
      message: `주급 스냅샷 ${ageDays}일째 동결 (${fetchedAt!.slice(0, 10)} 기준) — Capology Cloudflare 차단 여부 확인. 화면에는 "기준 시점"이 함께 표기된다`,
      metadata: { fetchedAt, ageDays },
    },
  ];
}

// ──────────────────────────────────────────────────────────────
// 예상 라인업 품질 — 2026-08-21 에 두 번 크게 틀렸던 축이라 셋 다 수치로 지킨다.
//   ① 남의 팀 선수단 오염 — 유령 쌍둥이 브리지가 (source, externalId) 쌍만 보고 이어서
//      EPL 절반이 스웨덴·노르웨이 팀, 분데스 8팀이 리그1·MLS 팀 선수단이 됐다.
//      탐지 = XI 선수의 몸값피드 소속(ts team id)이 그 팀과 다른 비율. 몸값 있는 선수만 분모.
//   ② 좌표 결손 — 좌표가 없으면 화면이 포메이션 틀에 점수순으로 꽂아 좌우가 뒤집힌다.
//   ③ 캐시 정지 — cron 이 죽으면 옛 XI 가 그대로 남는다(하루 2회라 36h 면 확실히 이상).
// 자가치유(club-xi 재실행)는 ②③ 에만 뜻이 있다 — ①은 데이터 문제라 재실행해도 그대로다.
// ──────────────────────────────────────────────────────────────
async function checkClubXiQuality(now: Date): Promise<HealthFinding[]> {
  const caches = await prisma.predictedXiCache.findMany({ select: { league: true, payload: true, updatedAt: true } });
  if (!caches.length) {
    return [{ category: "club-xi", key: "empty", severity: "HIGH", message: "예상 라인업 캐시가 비어 있음 — /api/cron/club-xi 확인" }];
  }
  const out: HealthFinding[] = [];

  // ③ 신선도 — 하루 2회(07:00·19:00 KST)라 36h 넘으면 확실히 멈춘 것
  const oldest = caches.reduce((a, c) => (c.updatedAt < a.updatedAt ? c : a));
  const ageH = Math.round((now.getTime() - oldest.updatedAt.getTime()) / 3600_000);
  if (ageH > 36) {
    out.push({
      category: "club-xi", key: "stale", severity: "MED",
      message: `예상 라인업 캐시 ${ageH}h 정지 — 가장 오래된 리그 ${oldest.league}`,
      metadata: { league: oldest.league, ageH },
    });
  }

  type XiRow = { teamName?: string; xi?: Array<{ id?: string; x?: number; y?: number }> };
  const entries: Array<{ league: string; teamId: number; t: XiRow }> = [];
  for (const c of caches)
    for (const [tid, t] of Object.entries(c.payload as Record<string, XiRow>)) entries.push({ league: c.league, teamId: Number(tid), t });

  // ② 좌표 보유율 — 실측 정상 91%. 70% 밑이면 좌표 경로가 깨진 것.
  const withXY = entries.filter((e) => (e.t.xi?.length ?? 0) > 0 && e.t.xi!.every((x) => (x.x ?? 0) > 0 || (x.y ?? 0) > 0)).length;
  const xyPct = Math.round((withXY / entries.length) * 100);
  if (xyPct < 70) {
    out.push({
      category: "club-xi", key: "coords", severity: "MED",
      message: `예상 라인업 좌표 보유 ${xyPct}% (정상 90%대) — 좌표 집계가 깨지면 피치 배치가 포메이션 틀로 되돌아간다`,
      metadata: { pct: xyPct, withXY, total: entries.length },
    });
  }

  // ① 남의 팀 선수단 오염 — **payload.teamName 이 Team.name 과 다른가**로 본다.
  //  빌더는 teamName 을 라인업 캐시의 팀명에서 가져오므로, 브리지가 남의 팀 라인업을 끌어오면
  //  이름부터 어긋난다(실측: 호펜하임 칸에 "Lyon", 샬케 칸에 "Monaco").
  //  처음엔 "XI 선수의 몸값피드 소속" 으로 재려 했으나 사우디·리그2 처럼 몸값 커버리지가 낮은
  //  리그에서 전원 불일치로 잡혀 오탐이었다(알이티하드 10/10 — 실제로는 정상 XI).
  //  이름 대조는 오탐이 없고 실제 사고를 그대로 잡는다.
  const ids = entries.map((e) => e.teamId);
  const teams = ids.length
    ? await prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(teams.map((t) => [t.id, t.name]));
  const norm = (v: string) =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const bad: string[] = [];
  for (const e of entries) {
    const dbName = nameById.get(e.teamId);
    const pName = e.t.teamName;
    if (!dbName || !pName) continue;
    if (norm(dbName) !== norm(pName)) bad.push(`${e.league}:${dbName}→${pName}`);
  }
  if (bad.length) {
    out.push({
      category: "club-xi", key: "wrong-squad",
      severity: bad.length >= 5 ? "HIGH" : "MED",
      message: `예상 라인업에 남의 팀 선수단 ${bad.length}팀 — ${bad.slice(0, 6).join(", ")}${bad.length > 6 ? " 외" : ""}. 유령 쌍둥이 브리지(build-club-xi idGroup) 확인`,
      metadata: { teams: bad.slice(0, 30) },
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 경기별 세부 스탯 결손 — af /fixtures/players 응답에서 shots·keyPasses·tackles 를 읽는다.
//   파서가 회귀하면 새 경기부터 조용히 null 로 쌓이고, 화면은 칩이 안 보일 뿐이라 눈에 안 띈다.
//   실측(2026-08-21 백필 직후) 최근 7일 출전 행의 결손 12% — 세부 스탯을 안 주는 리그가 섞인 값.
//   40% 를 넘으면 파서·수집 경로를 의심한다.
// ──────────────────────────────────────────────────────────────
async function checkMatchLogDetail(): Promise<HealthFinding[]> {
  const rows: Array<{ played: number; detailed: number }> = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS played, count(shots)::int AS detailed
    FROM "PlayerMatchLog"
    WHERE date > now() - interval '7 days' AND COALESCE(minutes, 0) > 0`);
  const { played, detailed } = rows[0] ?? { played: 0, detailed: 0 };
  if (played < 200) return []; // 표본 부족(비시즌·수집 공백)은 판정하지 않는다
  const missPct = Math.round((1 - detailed / played) * 100);
  if (missPct <= 40) return [];
  return [
    {
      category: "match-log-detail",
      key: "coverage",
      severity: "MED",
      message: `경기별 세부 스탯 결손 ${missPct}% (최근 7일 출전 ${played}행 중 ${played - detailed}행) — af 파서(parseFixturePlayers) 확인`,
      metadata: { played, detailed, missPct },
    },
  ];
}

async function checkEvaluationGap(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  // evaluate cron 은 하루 1회(00:00 KST)다. 직전 24시간 매치는 아직 채점 차례가 안 왔을 뿐이라
  //   분모에 넣으면 7일 창에서 항상 1/7 이 미평가로 잡혀 정상 상태에서도 경고가 뜬다.
  const until = new Date(now.getTime() - 24 * 3600 * 1000);
  const candidates = await prisma.match.findMany({
    where: { status: "FINISHED", startTime: { gte: since, lte: until }, NOT: { predHome: null } },
    select: { league: true, homeTeamId: true, awayTeamId: true, predCorrect: true },
  });
  if (candidates.length === 0) return out;

  // evaluate 는 MIN_PRIOR 가드로 "같은 대회 출전 5경기 미만" 매치를 건너뛴다. 컵·친선·
  //   단기 토너먼트는 그 안에서 5경기를 못 채워 사실상 영구 제외인데, 예전엔 이걸 분모에
  //   그대로 넣어 매일 "69% — cron 누락 의심" HIGH 가 떴다 (2026-08-03, 실제 cron 은 정상).
  //   그래서 evaluate 와 같은 기준으로 채점 대상만 센다.
  //   출전수는 전 기간 합계로 근사한다(매치 시점 이전만 세는 정확한 계산은 질의가 너무 많다).
  //   근사 방향은 "대상에 더 넣는" 쪽이라 진짜 누락을 놓치지 않는다.
  const leagues = [...new Set(candidates.map((c) => c.league))];
  const [homeApp, awayApp] = await Promise.all([
    prisma.match.groupBy({
      by: ["league", "homeTeamId"],
      where: { league: { in: leagues }, status: "FINISHED" },
      _count: { _all: true },
    }),
    prisma.match.groupBy({
      by: ["league", "awayTeamId"],
      where: { league: { in: leagues }, status: "FINISHED" },
      _count: { _all: true },
    }),
  ]);
  const apps = new Map<string, number>();
  const bump = (lg: string, team: number, n: number) => {
    const k = `${lg}|${team}`;
    apps.set(k, (apps.get(k) ?? 0) + n);
  };
  for (const r of homeApp) bump(r.league, r.homeTeamId, r._count._all);
  for (const r of awayApp) bump(r.league, r.awayTeamId, r._count._all);

  const gradable = candidates.filter((c) => {
    if (c.league === "WORLD_CUP") return true; // 외부 시드 Elo — evaluate 도 가드 면제
    const h = apps.get(`${c.league}|${c.homeTeamId}`) ?? 0;
    const a = apps.get(`${c.league}|${c.awayTeamId}`) ?? 0;
    return Math.min(h, a) >= MIN_PRIOR;
  });
  const total = gradable.length;
  if (total < 20) return out;
  const evaluated = gradable.filter((c) => c.predCorrect !== null).length;
  const excluded = candidates.length - total;

  const rate = evaluated / total;
  if (rate < 0.9) {
    out.push({
      category: "evaluation-gap",
      key: "predCorrect",
      severity: rate < 0.7 ? "HIGH" : "MED",
      message: `최근 7일 채점 대상 ${total}건 중 평가 ${evaluated}건 (${(rate * 100).toFixed(0)}%) — evaluate cron 누락 의심 (표본 부족 제외 ${excluded}건은 분모에서 뺌)`,
      metadata: { total, evaluated, rate, excluded, minPrior: MIN_PRIOR },
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 18. 중복 매치 — 같은 league + 같은 시각 (시간 단위) + 같은 팀 조합으로 row 가 2개 이상이면 finding.
//     원인: 보통 TheSports collector + api-football/ESPN collector 가 같은 매치를 다른 externalId 로 동시 수집.
//     /scores 페이지에 같은 매치가 두 번 표시되는 증상.
// ──────────────────────────────────────────────────────────────
async function checkDuplicateMatches(now: Date): Promise<HealthFinding[]> {
  const out: HealthFinding[] = [];
  const past = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const future = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
  // status 무관 — collector 전환 (ESPN → API-Sports 등) 이후 한쪽이 stale LIVE 로 남고
  // 다른쪽이 FINISHED 인 케이스도 cover. POSTPONED 등은 정상 1개라 영향 없음.
  const matches = await prisma.match.findMany({
    where: {
      startTime: { gte: past, lte: future },
    },
    select: {
      id: true,
      league: true,
      externalId: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  const groups = new Map<string, { league: string; ids: number[]; teamKey: string; startTime: Date }>();
  for (const m of matches) {
    const hour = m.startTime.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const teamKey = [m.homeTeam.name, m.awayTeam.name].sort().join("|");
    const key = `${m.league}__${hour}__${teamKey}`;
    const g = groups.get(key);
    if (g) {
      g.ids.push(m.id);
    } else {
      groups.set(key, { league: m.league, ids: [m.id], teamKey, startTime: m.startTime });
    }
  }

  const byLeague = new Map<string, { count: number; samples: string[] }>();
  for (const g of groups.values()) {
    if (g.ids.length < 2) continue;
    const e = byLeague.get(g.league) ?? { count: 0, samples: [] };
    e.count++;
    if (e.samples.length < 3) {
      e.samples.push(`${g.teamKey} @ ${g.startTime.toISOString().slice(0, 16)}`);
    }
    byLeague.set(g.league, e);
  }

  for (const [league, info] of byLeague) {
    out.push({
      category: "duplicate-match",
      key: league,
      severity: info.count >= 5 ? "HIGH" : "MED",
      message: `${league} 중복 매치 ${info.count}건 — 예: ${info.samples.join(", ")}`,
      metadata: info,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// 메인 — 모든 체크 직렬 실행 + 에러는 finding 으로 변환
// ──────────────────────────────────────────────────────────────
const CHECKS: Array<{ name: string; fn: (now: Date) => Promise<HealthFinding[]> }> = [
  { name: "season-labels", fn: checkSeasonLabels },
  { name: "match-counts", fn: checkMatchCounts },
  { name: "scheduled-freshness", fn: checkScheduledFreshness },
  { name: "leaderboard-consistency", fn: checkLeaderboardLeagueConsistency },
  { name: "player-name-missing", fn: checkPlayerNameMissingRate },
  { name: "team-name-missing", fn: checkTeamNameMissingRate },
  { name: "accuracy", fn: async () => checkAccuracy() },
  { name: "article-cadence", fn: checkArticleCadence },
  { name: "starter-coverage", fn: checkStarterCoverage },
  { name: "cron-lag", fn: checkCronLag },
  { name: "odds-coverage", fn: checkOddsCoverage },
  { name: "pageview-anomaly", fn: checkPageViewAnomaly },
  { name: "model-market-deviation", fn: checkModelMarketDeviation },
  { name: "ghost-team", fn: async () => checkGhostTeams() },
  { name: "notice-stale", fn: checkNoticeFreshness },
  { name: "nhl-goalie-coverage", fn: checkNhlGoalieCoverage },
  { name: "evaluation-gap", fn: checkEvaluationGap },
  { name: "duplicate-match", fn: checkDuplicateMatches },
  { name: "link-health", fn: checkLinkHealth },
  { name: "player-log-freshness", fn: checkPlayerLogFreshness },
  { name: "wage-freshness", fn: checkWageFreshness },
  { name: "club-xi-quality", fn: checkClubXiQuality },
  { name: "match-log-detail", fn: async () => checkMatchLogDetail() },
];

/**
 * 체크 1개만 재실행 — 자가치유(self-heal.ts)의 판정 단계 전용.
 * 치유 액션 후 "같은 탐지기"를 다시 돌려 finding 소멸을 확인해야
 * 판정 기준이 탐지와 항상 일치한다(별도 검증 로직을 두면 둘이 어긋난다).
 */
export async function runSingleHealthCheck(name: string): Promise<HealthFinding[]> {
  const c = CHECKS.find((x) => x.name === name);
  if (!c) throw new Error(`unknown health check: ${name}`);
  return c.fn(new Date());
}

export async function runHealthChecks(): Promise<HealthFinding[]> {
  const now = new Date();
  const all: HealthFinding[] = [];
  for (const c of CHECKS) {
    try {
      const findings = await c.fn(now);
      all.push(...findings);
    } catch (e) {
      all.push({
        category: "check-error",
        key: c.name,
        severity: "MED",
        message: `[${c.name}] 체크 자체 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return all;
}
