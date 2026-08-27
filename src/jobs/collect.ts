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
import { LOL_LEAGUES, SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { hasProtectedResult } from "@/lib/sports/baseball-source-cancel";
import { toKoreanTeamName } from "@/lib/team-names";
import { NPB_TEAM_SHORT_NAMES } from "@/lib/sports/npb-team-names";
import { sendTelegram } from "@/lib/notify/telegram";
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
// 점수 없는 FINISHED 는 확정 결과가 아니다 — 우천 연기 경기가 한 번 FINISHED 로 잘못
// 찍히면 이후 소스가 계속 POST(연기) 를 줘도 이 가드에 막혀 영영 "종료 -:-" 로 남았다
// (2026-08-01 KBO #2485 롯데-삼성: raw 는 POST 로 갱신되는데 status 만 FINISHED 고착).
// 점수가 있는 FINISHED 는 종전대로 강력 보호 — 역행 차단 목적 그대로.
// "점수 없음" 판정은 hasProtectedResult 가 맡는다 — `!= null` 로 재면 0-0 이 점수 있음으로
// 읽혀 같은 고착이 재현된다 (2026-08-25 KBO 18·NPB 5 실측). 야구의 0-0 은 결과가 아니다.
function mergeStatus(
  existing: MatchStatus | null | undefined,
  incoming: MatchStatus,
  existingHasScore = true,
): MatchStatus {
  if (existing === "FINISHED" && incoming === "POSTPONED" && !existingHasScore) {
    return "POSTPONED";
  }
  if (existing === "FINISHED") return "FINISHED";
  return incoming;
}

// 팀 이름 normalize 완전일치 비교 — af/ts 팀 resolve 가 서로 다른 Team row 로 갈린
// 경우(접두어·분음부호 표기 차이로 중복 Team) teamId 페어 dedup 이 못 잡는 구멍을 메움.
// route 의 sameTeamName 과 달리 substring 매칭은 의도적으로 배제 — Niger⊂Nigeria,
// Dundee⊂Dundee United, Rangers⊂Cove Rangers 처럼 별개 두 경기를 병합하는 오탐 때문.
// 위 normalizeTeamName(EPL cross-check 용, 분음부호 미처리)과 별개 — Loose 접미로 구분.
function normalizeTeamNameLoose(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ıİ]/g, "i")
    .replace(/\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|club)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}
function eqTeamNameLoose(a: string, b: string): boolean {
  const na = normalizeTeamNameLoose(a);
  const nb = normalizeTeamNameLoose(b);
  return !!na && na === nb;
}

// ── 개최지 이전 홈/원정 반전 가드 (2026-08-23 리그1 렌-PSG #1165778 사고) ──
// 구장 이전 등으로 소스가 같은 externalId 매치의 홈/원정을 사후에 뒤집으면, 그대로
// update 할 경우 Match 팀 방향만 뒤집히고 pred/market·배당 3테이블·라인업 라벨·봇픽·
// 발행된 프리뷰 글은 옛 방향으로 남아 통째로 오염된다. 자동 스왑 금지 — row 를 건드리지
// 않고 경고 로그 + 알림만 남긴다. 교정은 메모리 venue-move-home-away-flip 절차대로
// 수동 단일 트랜잭션 (대칭 필드 미러링 + 배당 컬럼 스왑 + 봇픽 + 프리뷰 글).
// 알림 dedup: collect 는 30분 cron 이라 매 회 울리면 하루 40건+ 소음 — HealthCheck
// (category=collect:home_away_flip) 최근 기록이 있으면 재발송 생략 (12h당 1회).
const FLIP_ALERT_DEDUP_MS = 12 * 3600 * 1000;

async function alertHomeAwayFlip(m: NormalizedMatch, matchId: number, source: string) {
  const key = `${m.league}:${m.externalId}`;
  console.warn(
    `[upsertMatch/flip] ${key} (matchId=${matchId}) — 소스(${source})가 홈/원정을 반대로 보냄: ` +
      `소스 홈=${m.homeTeam.name} vs ${m.awayTeam.name}. DB 방향 유지·갱신 skip, 수동 교정 필요`,
  );
  try {
    const recent = await prisma.healthCheck.findFirst({
      where: {
        category: "collect:home_away_flip",
        key,
        runAt: { gte: new Date(Date.now() - FLIP_ALERT_DEDUP_MS) },
      },
      select: { id: true },
    });
    if (recent) return;
    await prisma.healthCheck.create({
      data: {
        severity: "HIGH",
        category: "collect:home_away_flip",
        key,
        message: `홈/원정 반전 감지 — 소스 홈=${m.homeTeam.name}, DB 는 반대 방향. 갱신 중단됨`,
        metadata: { matchId, source, sourceHome: m.homeTeam.name, sourceAway: m.awayTeam.name },
      },
    });
    await sendTelegram(
      [
        `🚨 <b>홈/원정 반전 감지 (개최지 이전 의심)</b>`,
        ``,
        `📍 <b>무엇</b>: ${m.league} ${m.homeTeam.name} vs ${m.awayTeam.name} (matchId=${matchId}, ext=${m.externalId})`,
        `💥 <b>영향</b>: 소스가 홈/원정을 뒤집었는데 DB 는 옛 방향 — 라이브 이벤트·라인업·배당이 반전 노출 위험. collect 가 이 매치 갱신을 중단함`,
        `🔍 <b>원인</b>: 구장 이전 시 소스(${source})가 공식 기록대로 홈/원정 스왑 (렌-PSG 사고 계열)`,
        `➡️ <b>확인</b>: 메모리 venue-move-home-away-flip 절차로 수동 교정 (팀 스왑 + 대칭 필드 + 배당 3테이블 + 봇픽 + 프리뷰 글)`,
      ].join("\n"),
    );
  } catch (e) {
    console.error(`[upsertMatch/flip] 알림 실패:`, (e as Error).message);
  }
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
  // 정규 축구는 ±150분 — TheSports diary 시각 오기(2026-07-11 BELARUS_PL 120분 차)로
  // 좁은 윈도우가 뚫려 af/ts 중복 row 가 생겼음. 같은 리그 같은 두 팀이 150분 내 두
  // 경기를 치를 수 없어 확대 안전. 야구(더블헤더)와 CLUB_FRIENDLY(스플릿 스쿼드 당일
  // 2연전 — collect-friendlies 가 이 함수 사용)는 30분 유지.
  const dedupWindow =
    SOCCER_LEAGUES.has(m.league) && m.league !== "CLUB_FRIENDLY"
      ? 150 * 60 * 1000
      : 30 * 60 * 1000;
  let existing = await prisma.match.findFirst({
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
    select: { id: true, externalId: true, homeTeamId: true, status: true, homeScore: true, awayScore: true },
  });
  let dedupSameDirection = existing ? existing.homeTeamId === homeTeam.id : true;

  // 이름 fallback (축구 한정, 2026-07-11): af/ts 팀 resolve 가 다른 Team row 로 갈리면
  // (표기 차이·중복 Team) teamId 페어가 이미 있는 반대 소스 row 를 못 봐 중복 생성.
  // 신규 생성 직전(자기 row 부재)에만 실행해 평상시 collect 비용 증가 회피.
  // 후보는 반대 prefix 로 제한 (숫자 incoming → ts- 후보만, ts- incoming → 숫자 후보만)
  // — 같은 소스 안의 별개 두 경기(동시 킥오프 컵 라운드)를 병합하는 오탐 차단.
  if (!existing && SOCCER_LEAGUES.has(m.league)) {
    const ownRow = await prisma.match.findUnique({
      where: { league_externalId: { league: m.league, externalId: m.externalId } },
      select: { id: true },
    });
    if (!ownRow) {
      const incomingTs = m.externalId.startsWith("ts-");
      const candidates = await prisma.match.findMany({
        where: {
          league: m.league,
          startTime: {
            gte: new Date(m.startTime.getTime() - dedupWindow),
            lte: new Date(m.startTime.getTime() + dedupWindow),
          },
          ...(incomingTs
            ? { NOT: { externalId: { startsWith: "ts-" } } }
            : { externalId: { startsWith: "ts-" } }),
        },
        select: {
          id: true,
          externalId: true,
          homeTeamId: true,
          status: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      });
      // 완전일치만 — 어느 clause 로 매치됐는지로 방향 판정 (더비 substring 오판 차단).
      for (const c of candidates) {
        if (eqTeamNameLoose(c.homeTeam.name, m.homeTeam.name) && eqTeamNameLoose(c.awayTeam.name, m.awayTeam.name)) {
          existing = { id: c.id, externalId: c.externalId, homeTeamId: c.homeTeamId, status: c.status, homeScore: c.homeScore, awayScore: c.awayScore };
          dedupSameDirection = true;
          break;
        }
        if (eqTeamNameLoose(c.homeTeam.name, m.awayTeam.name) && eqTeamNameLoose(c.awayTeam.name, m.homeTeam.name)) {
          existing = { id: c.id, externalId: c.externalId, homeTeamId: c.homeTeamId, status: c.status, homeScore: c.homeScore, awayScore: c.awayScore };
          dedupSameDirection = false;
          break;
        }
      }

      // 숫자↔숫자(ESPN↔af) 확장 dedup (2026-08-16): 두 소스가 미래 라운드를 서로 다른
      // placeholder 시각으로 실으면 ±150분 창을 벗어나 같은 경기가 두 row 로 갈린다
      // (LALIGA 66쌍·BUNDESLIGA 35쌍·LIGUE_1 42쌍 실측 — ESPN 18:00Z vs af 15:00Z 격차 180분).
      // 숫자 id 끼리는 위 이름 fallback 도 반대 prefix 제한이라 원리상 못 잡는다.
      // 같은 리그에서 같은 팀쌍이 "동방향"으로 4일 내 두 번 붙는 일은 없으므로(역방향
      // 홈앤어웨이 2차전은 제외됨), 양쪽 다 SCHEDULED 인 예정 경기에 한해 ±4일로 넓혀
      // 기존 row 갱신만 한다. 창 4일 = cleanup-duplicate-matches 탐지기 3·4 와 동일 기준
      // (생성 차단과 사후 탐지는 같은 기준 — cross-source-dup-reschedule).
      // 친선은 제외 — 국대 친선은 같은 팀쌍 동방향 2연전이 실재한다
      // (실측: 2026-06 에티오피아 v 말라위 6/6·6/9 별개 A매치).
      if (
        !existing &&
        m.league !== "CLUB_FRIENDLY" &&
        m.league !== "INTL_FRIENDLY" &&
        !incomingTs &&
        m.status === "SCHEDULED"
      ) {
        const NUM_XS_WINDOW = 4 * 86400_000;
        const numTwins = await prisma.match.findMany({
          where: {
            league: m.league,
            externalId: { not: m.externalId },
            NOT: { externalId: { startsWith: "ts-" } },
            status: "SCHEDULED",
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            startTime: {
              gte: new Date(m.startTime.getTime() - NUM_XS_WINDOW),
              lte: new Date(m.startTime.getTime() + NUM_XS_WINDOW),
            },
          },
          select: { id: true, externalId: true, homeTeamId: true, status: true, homeScore: true, awayScore: true, startTime: true },
        });
        if (numTwins.length > 0) {
          const closest = numTwins.sort(
            (a, b) =>
              Math.abs(a.startTime.getTime() - m.startTime.getTime()) -
              Math.abs(b.startTime.getTime() - m.startTime.getTime()),
          )[0];
          existing = { id: closest.id, externalId: closest.externalId, homeTeamId: closest.homeTeamId, status: closest.status, homeScore: closest.homeScore, awayScore: closest.awayScore };
          dedupSameDirection = true;
        }
      }
    }
  }

  if (existing) {
    const sameDirection = dedupSameDirection;
    console.log(
      `[upsertMatch/dedup] ${m.league} new=${m.externalId} ≈ existing=${existing.externalId} (matchId=${existing.id}) — update only`,
    );
    // raw 는 방향 일치일 때만 전파. WC 브래킷(page.tsx)은 raw 의 teams.home/away.winner 를
    // DB row 의 home/away 위치로 매핑하므로, 방향 불일치 row 에 af raw 를 그대로 저장하면
    // 승자가 반대로 잡힌다. ts- 소스 row 는 Match.raw 가 비어 있어(전 리그 0/N) 덮어쓸 값 없음.
    // 다른 소스의 row 를 덮는 경로라 보수적으로 (2026-07-11) —
    // score 는 숫자로 들어올 때만 갱신 (af NS 응답의 null 이 fresh ts 점수를 지우는 사고 방지),
    // status 는 강등 금지 (af SCHEDULED 가 ts LIVE row 를 되돌리는 사고 방지).
    // POSTPONED 는 기존 탈출 규칙 유지 (existing/incoming 어느 쪽이든 자유 전이).
    const DEDUP_RANK = { SCHEDULED: 0, LIVE: 1, FINISHED: 2, POSTPONED: 2 } as const;
    const exStatus = existing.status as MatchStatus;
    const allowStatusUpdate =
      exStatus === "POSTPONED" ||
      m.status === "POSTPONED" ||
      (DEDUP_RANK[m.status] ?? 0) >= (DEDUP_RANK[exStatus] ?? 0);
    await prisma.match.update({
      where: { id: existing.id },
      data: {
        homeScore: sameDirection ? (m.homeScore ?? undefined) : (m.awayScore ?? undefined),
        awayScore: sameDirection ? (m.awayScore ?? undefined) : (m.homeScore ?? undefined),
        ...(allowStatusUpdate
          ? {
              status: mergeStatus(
                exStatus,
                m.status,
                hasProtectedResult(m.league, existing.homeScore, existing.awayScore),
              ),
            }
          : {}),
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
    select: { id: true, status: true, homeScore: true, awayScore: true, homeTeamId: true, awayTeamId: true },
  });

  // 홈/원정 반전 감지 — 기존 row 와 정확히 교차(홈↔원정)로만 판정. 팀 교체·TBD 확정 등
  // 다른 변경은 대상 아님. 감지 시 갱신 전체 중단 — 그대로 update 하면 팀 방향과 raw 만
  // 뒤집혀 부속 데이터(pred/odds/라인업/글)와 어긋난다 (위 alertHomeAwayFlip 주석 참고).
  if (
    current &&
    homeTeam.id !== awayTeam.id &&
    current.homeTeamId === awayTeam.id &&
    current.awayTeamId === homeTeam.id
  ) {
    await alertHomeAwayFlip(m, current.id, source);
    return;
  }

  const mergedStatus = mergeStatus(
    current?.status as MatchStatus | undefined,
    m.status,
    current != null && hasProtectedResult(m.league, current.homeScore, current.awayScore),
  );

  await prisma.match.upsert({
    where: {
      league_externalId: { league: m.league, externalId: m.externalId },
    },
    update: {
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      // 확정(FINISHED) 매치의 점수는 소스 null 로 지우지 않는다 — af 가 NS 로 고착된
      // fixture 를 pastDays 재수집할 때 수동/타소스 확정 점수가 -:- 로 지워지는 사고 방지
      // (2026-08-17 SUI_CUP #5801019, af 미갱신·실경기 0-4 종료). dedup 분기의
      // "score 는 숫자로 들어올 때만 갱신" 과 같은 취지 — 미확정 매치는 종전대로 null 반영.
      homeScore: m.homeScore ?? (mergedStatus === "FINISHED" ? undefined : null),
      awayScore: m.awayScore ?? (mergedStatus === "FINISHED" ? undefined : null),
      status: mergedStatus,
      startTime: m.startTime,
      raw: JSON.stringify(m.raw),
      // referee 는 값이 있을 때만 갱신 (undefined → prisma 가 제외해 기존값 유지).
      // ESPN 6리그처럼 collect 에서 못 뽑는 매치는 fetch-api-football 이 채운 값을 보존.
      referee: m.referee ?? undefined,
      // venueId 도 같은 이유로 값이 있을 때만 — ts 외 소스가 재수집해도 기존값을 지우지 않는다.
      venueId: m.venueId ?? undefined,
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
      venueId: m.venueId ?? null,
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
        leagues: argLeagues ?? (["KBO", "EPL"] as League[]),
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
