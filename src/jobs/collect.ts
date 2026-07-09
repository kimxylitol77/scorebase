// 경기 데이터 수집 잡.
// 사용:
//   npm run job:collect -- --league EPL --date 2026-05-08
//   npm run job:collect -- --league EPL          (오늘)
//   npm run job:collect -- --all                 (모든 리그, 오늘)

import "@/lib/env";
import { prisma } from "@/lib/db";
import { collectors, getPrimarySource } from "@/lib/sports";
import { resolveTeamId } from "@/lib/sports/team-resolver";
import { fetchEplRange } from "@/lib/sports/football-data";
import { fetchEspnSoccerByDate } from "@/lib/sports/espn-soccer";
import { fetchWorldCupAll } from "@/lib/sports/world-cup";
import { fetchLolAll } from "@/lib/sports/lol";
import { LOL_LEAGUES } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import { NPB_TEAM_SHORT_NAMES } from "@/lib/sports/npb-team-names";
import type { League, MatchStatus, NormalizedMatch } from "@/lib/sports/types";

/**
 * NPB 팀의 경우 normalized.shortName 이 비어있어도 한국 미디어 통용 약자로 자동 set.
 * (API-Sports Baseball 응답에 shortName 미제공 → 매핑 사전 fallback)
 */
function resolveShortName(league: string, normalized: string | null | undefined, fullName: string): string | null {
  if (normalized) return normalized;
  if (league === "NPB") {
    const ko = toKoreanTeamName(fullName);
    return NPB_TEAM_SHORT_NAMES[ko] ?? NPB_TEAM_SHORT_NAMES[fullName] ?? null;
  }
  return null;
}

// 팀 이름 정규화 — football-data 와 ESPN 의 팀명 표기 차이 흡수
// (예: "Manchester City FC" ↔ "Manchester City", "Tottenham Hotspur" ↔ "Tottenham")
function normalizeTeamName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(fc|afc|cf|club|hotspur|wanderers)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

function findEspnMatch(
  espnList: NormalizedMatch[],
  m: NormalizedMatch,
): NormalizedMatch | undefined {
  const homeN = normalizeTeamName(m.homeTeam.name);
  const awayN = normalizeTeamName(m.awayTeam.name);
  return espnList.find((e) => {
    const eh = normalizeTeamName(e.homeTeam.name);
    const ea = normalizeTeamName(e.awayTeam.name);
    return (
      (eh.includes(homeN) || homeN.includes(eh)) &&
      (ea.includes(awayN) || awayN.includes(ea))
    );
  });
}

/**
 * football-data EPL 결과를 ESPN 스코어보드와 cross-check 해서
 * 종료된 매치의 점수가 다르면 ESPN 값으로 덮어쓴다.
 * (football-data 무료 플랜 데이터 오류 사례 대응 — Liverpool vs Chelsea 1:1 → 잘못 1:2 응답한 사례)
 */
async function crossCheckEplWithEspn(
  matches: NormalizedMatch[],
): Promise<{ corrected: number }> {
  if (matches.length === 0) return { corrected: 0 };
  // 매치 날짜 unique 셋 → ESPN 한 번씩만 호출
  const dateKeys = Array.from(
    new Set(matches.map((m) => m.startTime.toISOString().slice(0, 10))),
  );
  const espnByDate = new Map<string, NormalizedMatch[]>();
  for (const d of dateKeys) {
    try {
      const espn = await fetchEspnSoccerByDate("EPL", d);
      espnByDate.set(d, espn);
    } catch (e) {
      console.warn(`[xcheck/EPL] ${d} ESPN fetch 실패:`, (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  let corrected = 0;
  for (const m of matches) {
    if (m.status !== "FINISHED") continue;
    const dateKey = m.startTime.toISOString().slice(0, 10);
    const espn = findEspnMatch(espnByDate.get(dateKey) ?? [], m);
    if (!espn || espn.status !== "FINISHED") continue;
    if (
      espn.homeScore !== m.homeScore ||
      espn.awayScore !== m.awayScore
    ) {
      console.log(
        `[xcheck/EPL] ${m.homeTeam.name} vs ${m.awayTeam.name}: football-data ${m.homeScore}:${m.awayScore} → ESPN ${espn.homeScore}:${espn.awayScore}`,
      );
      m.homeScore = espn.homeScore;
      m.awayScore = espn.awayScore;
      corrected++;
    }
  }
  return { corrected };
}

function todayKST(): string {
  // KST(UTC+9) 기준 오늘 날짜
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function addDays(yyyymmdd: string, delta: number): string {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// --all 시 수집할 리그 list. 매 30분 cron 에서 호출되니 부하 고려해 list 직접 명시.
const ALL_LEAGUES: League[] = [
  "KBO", "NPB", "MLB",
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "AFC_CL_TWO", "AFC_U23", "SAUDI_PL",
  "UEL", "UECL",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
  "BRASILEIRAO", "LIGA_MX", "COPA_LIB", "COPA_SUD", "CSL", "A_LEAGUE",
  "CLUB_WORLD_CUP",
  // CLUB_FRIENDLY 는 Vercel af(667) 에서 제외 — TheSports 가 빅클럽 프리시즌 커버가 넓어
  //   워커(collect-friendlies, TheSports)로 이관. af 는 ts 팀 id 와 충돌(별도 행 양산)하기도 함.
  "LOL", "LCK_CL", "LPL", "LEC", "LCS", // NHL/NBA/WNBA 제거 — TheSports ice_hockey/basketball worker 가 매치 소스 (2026-05-28 마이그레이션)
  // stale-cleanup 알림 발견 12개 리그 추가 (2026-05-23) — cron 미호출로 SCHEDULED 자동 POSTPONED 발생
  "URVALSDEILD", "IRELAND_PD", "ICELAND_1L", "SLOVENIA_SNL",
  "HNL", "ALLSVENSKAN", "EGYPT_PL", "AUSTRIA_BL",
  "LIGA_I", "SERBIA_SL", "CHILE_PD", "PERU_PD",
];

function parseArgs(): { leagues: League[]; date: string } {
  const args = process.argv.slice(2);
  let date = todayKST();
  let leagues: League[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") leagues = ALL_LEAGUES;
    else if (args[i] === "--league") leagues = [args[++i] as League];
    else if (args[i] === "--date") date = args[++i];
  }

  if (leagues.length === 0) leagues = ALL_LEAGUES;
  return { leagues, date };
}

// Match.status 보호 규칙 — collector 가 cron 마다 status 를 덮어쓰는 패턴 안전망.
// FINISHED 만 강력 보호 (점수 확정 후 새 응답으로 LIVE/SCHEDULED 역행 차단).
// POSTPONED 는 어디서나 탈출 가능 — api-sports 가 PST 잘못 응답 후 곧바로 Scheduled
// 로 복귀하는 케이스 자동 복구 (2026-05-25, 2026-05-27 NBA/WNBA stale POSTPONED 사고
// 패턴: 진단/수동 fix 스크립트 불필요).
function mergeStatus(
  existing: MatchStatus | null | undefined,
  incoming: MatchStatus,
): MatchStatus {
  if (existing === "FINISHED") return "FINISHED";
  return incoming;
}

// opts.source: 팀 resolve 에 쓸 source 명시 — 기본은 getPrimarySource(league).
// EPL 처럼 primary=football-data 인 리그에 api-football 데이터를 넣을 때 반드시 명시할 것.
// 소스 라벨이 거짓이면 (league, source, ext) 매핑이 다른 체계의 팀을 가리켜 Team 이름
// 덮어쓰기 오염 발생 (2026-07-09 EPL Arsenal→Ipswich 사고).
export async function upsertMatch(m: NormalizedMatch, opts?: { source?: string }) {
  // TBD placeholder skip — NBA/NHL 컨퍼런스 파이널 차기 라운드 매치업 미정 시 ESPN 이
  // "TBD vs TBD" 로 placeholder 매치 제공. 실제 매치업 확정 시 별도 매치로 등장하므로
  // placeholder 는 DB 에 저장 안 함 (페이지 노출 방지 + LIVE 잘못된 status 회피).
  const TBD_RE = /^(TBD|TTBD|TBDT)$/i;
  if (TBD_RE.test(m.homeTeam.name) || TBD_RE.test(m.awayTeam.name)) {
    return;
  }
  const homeShort = resolveShortName(m.league, m.homeTeam.shortName, m.homeTeam.name);
  const awayShort = resolveShortName(m.league, m.awayTeam.shortName, m.awayTeam.name);
  const source = opts?.source ?? getPrimarySource(m.league);
  const homeTeamId = await resolveTeamId({
    league: m.league,
    source,
    externalId: m.homeTeam.externalId,
    name: m.homeTeam.name,
    shortName: homeShort,
    logoUrl: m.homeTeam.logoUrl ?? null,
  });
  const awayTeamId = await resolveTeamId({
    league: m.league,
    source,
    externalId: m.awayTeam.externalId,
    name: m.awayTeam.name,
    shortName: awayShort,
    logoUrl: m.awayTeam.logoUrl ?? null,
  });
  const homeTeam = { id: homeTeamId };
  const awayTeam = { id: awayTeamId };

  // === Dedup 가드 (2026-05-24): 다른 source / 다른 externalId 로 들어온 같은 매치 차단 ===
  // 조건: 같은 league + startTime ±30분 + 동일 두 팀 페어 (home/away 양방향) + 다른 externalId.
  // 새 row 생성 X → 기존 row 의 score/status/startTime 만 update. homeTeamId/awayTeamId 유지
  // (Article·Prediction 등 dependents 연결 보호). home/away 방향 다르면 score swap.
  //
  // 원인 예: 같은 LALIGA Barcelona vs Valencia 매치를 api-football fixture_id=748519 와
  // 다른 source 의 매치 id 로 두 row 생성 — chain collector / 시즌 변경 / 다른 fixture id
  // 응답 등 케이스. 매번 cron 마다 dup 누적되던 패턴 차단.
  const dedupWindow = 30 * 60 * 1000;
  const existing = await prisma.match.findFirst({
    where: {
      league: m.league,
      externalId: { not: m.externalId },
      startTime: {
        gte: new Date(m.startTime.getTime() - dedupWindow),
        lte: new Date(m.startTime.getTime() + dedupWindow),
      },
      OR: [
        { homeTeamId: homeTeam.id, awayTeamId: awayTeam.id },
        { homeTeamId: awayTeam.id, awayTeamId: homeTeam.id },
      ],
    },
    select: { id: true, externalId: true, homeTeamId: true, status: true },
  });

  if (existing) {
    const sameDirection = existing.homeTeamId === homeTeam.id;
    console.log(
      `[upsertMatch/dedup] ${m.league} new=${m.externalId} ≈ existing=${existing.externalId} (matchId=${existing.id}) — update only`,
    );
    // raw 는 방향 일치일 때만 전파. WC 브래킷(page.tsx)은 raw 의 teams.home/away.winner 를
    // DB row 의 home/away 위치로 매핑하므로, 방향 불일치 row 에 af raw 를 그대로 저장하면
    // 승자가 반대로 잡힌다. ts- 소스 row 는 Match.raw 가 비어 있어(전 리그 0/N) 덮어쓸 값 없음.
    await prisma.match.update({
      where: { id: existing.id },
      data: {
        homeScore: sameDirection ? (m.homeScore ?? null) : (m.awayScore ?? null),
        awayScore: sameDirection ? (m.awayScore ?? null) : (m.homeScore ?? null),
        status: mergeStatus(existing.status as MatchStatus, m.status),
        startTime: m.startTime,
        ...(sameDirection ? { raw: JSON.stringify(m.raw) } : {}),
      },
    });
    return;
  }

  // upsert update 분기의 status 보호 — 같은 league+externalId 의 기존 row 가 FINISHED 면
  // 새 응답이 LIVE/SCHEDULED 라도 status 유지. POSTPONED 는 incoming 으로 자유 갱신.
  const current = await prisma.match.findUnique({
    where: { league_externalId: { league: m.league, externalId: m.externalId } },
    select: { status: true },
  });
  const mergedStatus = mergeStatus(current?.status as MatchStatus | undefined, m.status);

  await prisma.match.upsert({
    where: {
      league_externalId: { league: m.league, externalId: m.externalId },
    },
    update: {
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore: m.homeScore ?? null,
      awayScore: m.awayScore ?? null,
      status: mergedStatus,
      startTime: m.startTime,
      raw: JSON.stringify(m.raw),
      // referee 는 값이 있을 때만 갱신 (undefined → prisma 가 제외해 기존값 유지).
      // ESPN 6리그처럼 collect 에서 못 뽑는 매치는 fetch-api-football 이 채운 값을 보존.
      referee: m.referee ?? undefined,
    },
    create: {
      league: m.league,
      externalId: m.externalId,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore: m.homeScore ?? null,
      awayScore: m.awayScore ?? null,
      status: m.status,
      startTime: m.startTime,
      raw: JSON.stringify(m.raw),
      referee: m.referee ?? null,
    },
  });
}

export async function runCollect(opts?: {
  leagues?: League[];
  date?: string;
  /** 양수 N 이면 date ~ date+N 일까지 모두 fetch (미래 일정 채우기). 기본 0 = 단일 날짜. */
  futureDays?: number;
  /** 양수 N 이면 date-N ~ date 까지도 함께 fetch (어제 끝난 매치 score/status 보정). 기본 0. */
  pastDays?: number;
}) {
  const argLeagues = opts?.leagues;
  const argDate = opts?.date;
  const futureDays = opts?.futureDays ?? 0;
  const pastDays = opts?.pastDays ?? 0;
  const { leagues, date } = argLeagues || argDate
    ? {
        leagues: argLeagues ?? (["KBO", "EPL", "NBA"] as League[]),
        date: argDate ?? todayKST(),
      }
    : parseArgs();
  const startDate = pastDays > 0 ? addDays(date, -pastDays) : date;
  const endDate = futureDays > 0 ? addDays(date, futureDays) : date;
  const isRange = pastDays > 0 || futureDays > 0;
  console.log(
    `[collect] 시작 — leagues=${leagues.join(",")}, ${startDate}${
      isRange ? ` ~ ${endDate} (-${pastDays}d/+${futureDays}d)` : ""
    }`,
  );

  // BDL LOL 전체는 collect 1회당 한 번만 fetch(여러 LOL 계열 리그가 공유) → 중복 API 호출 방지.
  let lolCache: NormalizedMatch[] | null = null;
  for (const league of leagues) {
    try {
      // EPL: football-data 는 dateFrom/dateTo 한 번 호출로 범위 처리 가능
      // + ESPN cross-check 로 score 오류 보정
      if (league === "EPL" && process.env.FOOTBALL_DATA_KEY) {
        const matches = isRange
          ? await fetchEplRange(startDate, endDate)
          : await collectors.EPL.fetchByDate(date);
        const { corrected } = await crossCheckEplWithEspn(matches);
        console.log(
          `[collect/EPL] ${matches.length}경기 수집 (${startDate}~${endDate})${
            corrected > 0 ? ` · ESPN 보정 ${corrected}건` : ""
          }`,
        );
        for (const m of matches) await upsertMatch(m);
        continue;
      }
      // 월드컵: 토너먼트 전체를 호출 1회로 받아 upsert.
      // 6/11~7/19 한 달 일정이라 day-loop 보다 단발 호출이 훨씬 효율적이다.
      if (league === "WORLD_CUP") {
        const matches = await fetchWorldCupAll();
        console.log(`[collect/WORLD_CUP] ${matches.length}경기 수집 (전체)`);
        for (const m of matches) await upsertMatch(m);
        continue;
      }
      // LoL 계열(LCK·LCK CL·해외): BDL 전체 1회 fetch(캐시) 후 tournament→league 분리 upsert.
      // BDL 은 dates[] 필터를 지원하지만(live-scores 가 사용) 미래 일정 선수집·과거 score
      // 보정에는 전체 fetch 가 맞다 — 전 tournament 합 ~400건·4페이지라 부하 무시 가능.
      //
      // 리드타임 한계 (2026-06-10 진단): LCK 본선(324)은 풀 시즌 일정이 팀 확정 상태로
      // 선등록되지만, LCK_CL·LPL·LEC·LCS 는 BDL 이 미래 매치 팀을 TBD(null)로 뒀다가
      // 경기 3~7일 전에야 확정 → fetchLolAll 의 팀 null 필터에 걸렸다가 확정 시점의
      // collect(일 9회)가 자동 upsert. 소스 종속이라 코드로 리드타임 단축 불가.
      // ⚠️ 점검 시 "당일 생성" 으로 보이면 createdAt > startTime(경기 후 backfill) 여부
      // 먼저 확인 — 2026-06-06 리그 신설 때 과거 경기 일괄 backfill 이 당일수집처럼 보였음.
      if (LOL_LEAGUES.has(league)) {
        if (!lolCache) lolCache = await fetchLolAll();
        const matches = lolCache.filter((m) => m.league === league);
        console.log(`[collect/${league}] ${matches.length}경기 수집 (LoL 계열)`);
        for (const m of matches) await upsertMatch(m);
        continue;
      }
      // 그 외: day-loop
      let total = 0;
      for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
        const matches = await collectors[league].fetchByDate(d);
        for (const m of matches) await upsertMatch(m);
        total += matches.length;
        if (isRange) await new Promise((r) => setTimeout(r, 80));
      }
      console.log(`[collect/${league}] ${total}경기 수집`);
    } catch (err) {
      console.error(`[collect/${league}] 실패:`, (err as Error).message);
    }
  }

  console.log("[collect] 완료");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCollect()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
