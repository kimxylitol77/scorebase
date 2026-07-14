// GET /api/internal/data-sanity
// 라이브 데이터 의미적 일관성 검사. mac-mini data-sanity.js 가 3분마다 호출.
// Bearer auth: env INTERNAL_API_TOKEN.
//
// 검출 항목 (2026-05-24~25 retrospective 기반):
//   1. score_drift           — SCHEDULED 야구 매치에 점수 있음 (status updater 죽음)
//   2. inning_missing        — LIVE 야구 매치인데 cache.detailLive.score 없거나 half=0
//   3. cache_db_mismatch     — cache.ft ([home, away]) vs DB.homeScore/awayScore 불일치
//   4. stale_live            — LIVE 야구/축구 매치 updatedAt 30분+ 정체
//   5. standings_stale       — TheSports standings cache 1.5h+ stale (poller 죽음)
//   6. standings_mismatch    — TheSports vs api-football 1위 팀 다름 (한쪽 stale)
//
// 응답: { ok, checkedAt, totals, issues: [{ kind, severity, ... }] }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BASEBALL_LEAGUES, MMA_LEAGUES } from "@/lib/sports/sport-leagues";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 30분 — football-poller 5분 주기 + ws-subscriber 푸시 빈도가 마이너 리그에서
// 낮을 수 있어 15분 → 30분 으로 완화 (false positive 감소, 2026-05-25).
const STALE_LIVE_MS = 30 * 60 * 1000;
// score_drift — 시작 직후 SCHEDULED→LIVE 전환 lag 면제. stale_live 와 동일 이유로 30분
// (2026-06-14: MLB 시작 7초 만에 0:0 SCHEDULED 오판 → 가드 추가. status updater =
//  poller 5분 주기 + ws-subscriber, 마이너 야구 리그는 전환 느림. 진짜 죽음은 30분 후 알림).
const SCORE_DRIFT_GRACE_MS = 30 * 60 * 1000;
// TheSports standings poller 1h 주기 → 1.5h+ stale 면 worker 죽음 의심.
const STANDINGS_TS_STALE_MS = 1.5 * 3600 * 1000;
// api-football standings cron 1일 1회 → 26h+ stale 면 cron 실패 의심.
const STANDINGS_AF_STALE_MS = 26 * 3600 * 1000;
// standings 검사 대상 메이저 리그
const STANDINGS_CHECK_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "UCL", "UEL", "UECL", "MLS",
  "K_LEAGUE_1", "J1_LEAGUE", "CHAMPIONSHIP",
];

type IssueKind =
  | "score_drift"
  | "inning_missing"
  | "cache_db_mismatch"
  | "cache_inner_inconsistent"
  | "finished_no_score"
  | "stale_live"
  | "future_live"
  | "standings_stale"
  | "standings_mismatch"
  | "friendly_dup"
  | "cross_source_dup"
  | "teamsourceid_contamination";

// 리그 → 대륙연맹/종목. 하나의 thesports id 가 서로 다른 연맹의 Team row 에 걸치면 = 이름매칭 오염
// (예: FC 바르셀로나 ts id ↔ 에콰도르 Barcelona SC). 미매핑 리그는 null → 오탐 방지 위해 스킵.
const TEAM_CONF: Record<string, string> = {
  BUNDESLIGA: "UEFA", BUNDESLIGA_2: "UEFA", CHALLENGE_LEAGUE: "UEFA", CYPRUS_1D: "UEFA",
  CZECH_2: "UEFA", CZECH_L: "UEFA", DENMARK_SL: "UEFA", EPL: "UEFA", EREDIVISIE: "UEFA",
  GREEK_SL: "UEFA", LALIGA: "UEFA", LIGUE_1: "UEFA", PRIMEIRA_LIGA: "UEFA", SERIE_A: "UEFA",
  SUPER_LIG: "UEFA", SWISS_SL: "UEFA", UCL: "UEFA", UEL: "UEFA", UECL: "UEFA", WSL: "UEFA",
  UEFA_WCL: "UEFA", KAZAKHSTAN_PL: "UEFA",
  BRASILEIRAO: "CONMEBOL", CHILE_PD: "CONMEBOL", COLOMBIA_PA: "CONMEBOL", COPA_LIB: "CONMEBOL",
  COPA_SUD: "CONMEBOL", ECUADOR_LP: "CONMEBOL", PERU_PD: "CONMEBOL", VENEZUELA_PD: "CONMEBOL",
  URUGUAY_PD: "CONMEBOL", BOLIVIA_PD: "CONMEBOL", ARGENTINA_LPF: "CONMEBOL",
  AFC_CL: "AFC", AFC_CL_TWO: "AFC", CSL: "AFC", J1_LEAGUE: "AFC", K_LEAGUE_1: "AFC",
  QATAR_SL: "AFC", SAUDI_PL: "AFC", UAE_PL: "AFC",
  CANADA_PL: "CONCACAF", CONCACAF_CCUP: "CONCACAF", MLS: "CONCACAF",
  NBA: "BASKETBALL", NHL: "HOCKEY", MLB: "BASEBALL", KBO: "BASEBALL", NPB: "BASEBALL",
};

interface Issue {
  kind: IssueKind;
  severity: "HIGH" | "WARN";
  matchId: number;
  externalId: string;
  league: string;
  home: string;
  away: string;
  detail: string;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// ── MLB sid=1(Not Started) 경보의 지연/연기 구분 — 공식 statsapi (무료·키 불요) ──
// 우천 지연(Delayed Start 등)은 경기 시작 시 자동 해소라 경보 가치가 없고, 연기·중단은
// LIVE 표기 자체가 잘못이라 더 크게 울려야 함. 2026-06-12 CWS-ATL Rain Delay 가
// "source 누락" WARN 으로 오탐된 건 대응. fetch 실패 시 null → 기존 WARN 동작 유지(fail-open).
interface MlbGame { home: string; away: string; state: string }

async function fetchMlbSchedule(dateEt: string): Promise<MlbGame[]> {
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateEt}`, {
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const j = (await res.json()) as {
    dates?: { games?: { teams?: { home?: { team?: { name?: string } }; away?: { team?: { name?: string } } }; status?: { detailedState?: string } }[] }[];
  };
  const out: MlbGame[] = [];
  for (const d of j.dates ?? [])
    for (const g of d.games ?? [])
      out.push({ home: g.teams?.home?.team?.name ?? "", away: g.teams?.away?.team?.name ?? "", state: g.status?.detailedState ?? "" });
  return out;
}

async function mlbGameState(
  home: string,
  away: string,
  startTime: Date,
  cache: Map<string, Promise<MlbGame[]>>,
): Promise<string | null> {
  try {
    // schedule?date= 는 ET 기준 — UTC startTime 을 미 동부 날짜로 변환 (en-CA = YYYY-MM-DD)
    const dateEt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(startTime);
    if (!cache.has(dateEt)) cache.set(dateEt, fetchMlbSchedule(dateEt));
    const games = await cache.get(dateEt)!;
    const g = games.find((x) => (x.home === home || x.away === home) && (x.home === away || x.away === away));
    return g?.state || null;
  } catch {
    return null;
  }
}

// 팀 이름 normalize 비교 — Team 테이블 중복 row(같은 팀이 source 별 2~4 row) 때문에
// standings_mismatch 비교에서 ourId 직접 비교 못 함. 영문/한글 외 모든 문자 제거 +
// 일반 club prefix/suffix(FC/CF/AC/SC/CD/RCD/SV/Club) 제거 후 양쪽 substring 매칭.
function normalizeTeamName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|club)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}
function sameTeamName(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // "Barcelona" ⊂ "FC Barcelona", "Kashima" ⊂ "Kashima Antlers"
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized();
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) return unauthorized();

  const now = Date.now();
  // 야구는 매치 시작 ±12시간, 축구는 진행 중인 매치만 (LIVE).
  // DB 부담 최소화: 단일 쿼리로 야구 매치 + 관련 cache + 팀명.
  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { status: "LIVE" },
        {
          // 활성 야구 리그 5개 — KBO/NPB/MLB + 2026-05-27 추가 CPBL/LMB.
          // FINISHED 인데 score=null 사고 (collector score path 누락) 도 catch.
          AND: [
            { league: { in: ["KBO", "NPB", "MLB", "CPBL", "LMB"] } },
            { startTime: { gte: new Date(now - 12 * 3600 * 1000), lte: new Date(now + 6 * 3600 * 1000) } },
          ],
        },
      ],
    },
    select: {
      id: true,
      league: true,
      externalId: true,
      status: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
      updatedAt: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  // 모든 LIVE 매치의 ts cache 조회 — 축구 stale_live false positive 방지용
  // (점수 변동 없으면 Match.updatedAt 안 갱신되지만 ts cache 는 계속 fresh).
  // 야구 검사도 같은 caches 사용 (BASEBALL_LEAGUES 만 select 후 처리).
  const allIds = matches.map((m) => m.id);
  const caches = allIds.length
    ? await prisma.theSportsMatchCache.findMany({
        where: { matchId: { in: allIds } },
        select: { matchId: true, detailLive: true, updatedAt: true },
      })
    : [];
  const cacheByMatchId = new Map(caches.map((c) => [c.matchId, c]));
  const baseballIds = matches
    .filter((m) => BASEBALL_LEAGUES.has(m.league))
    .map((m) => m.id);

  const issues: Issue[] = [];
  // MLB schedule 응답 per-request 캐시 — 같은 날짜 다중 경보여도 fetch 1회
  const mlbSched = new Map<string, Promise<MlbGame[]>>();

  for (const m of matches) {
    const matchInfo = {
      matchId: m.id,
      externalId: m.externalId,
      league: m.league,
      home: m.homeTeam.name,
      away: m.awayTeam.name,
    };

    // 4b. future_live — startTime 이 미래 (now + 1h+) 인데 status=LIVE 인 stuck 매치.
    // 2026-05-27 NPB #328161 (5/31 시작) 발견. TheSports status_id=0/1 이 잘못 LIVE 매핑됐던
    // 잔재 또는 status update path 에 미래 매치 가드 누락. 즉시 SCHEDULED 으로 롤백 필요.
    // MMA/UFC 제외 — 파이트 카드 개별 경기 startTime 은 추정치(앞 경기 끝나야 시작)라 추정보다
    // 먼저 LIVE 가 정상. "미래+LIVE"가 매 카드 false positive (stale_live MMA 제외와 동일 이유).
    if (m.status === "LIVE" && m.startTime.getTime() > now + 3600 * 1000 && !MMA_LEAGUES.has(m.league)) {
      issues.push({
        ...matchInfo,
        kind: "future_live",
        severity: "HIGH",
        detail: `startTime=${m.startTime.toISOString().slice(0,16)} (${Math.round((m.startTime.getTime() - now) / 3600000)}h 후) 인데 status=LIVE — 즉시 SCHEDULED 롤백`,
      });
      continue;
    }

    // 4. stale_live — 모든 sport. Match.updatedAt 은 점수 변동시에만 갱신되어
    // 골 없는 30분+ 라이브에서 false positive 가 남. ts cache.updatedAt 이 더
    // 최근이면 그쪽으로 fresh 판정 (cache poll 은 점수 변동과 무관하게 갱신).
    // MMA/UFC 제외: 라운드 진행 중 점수 변동이 없어 updatedAt 정체 + ts cache 자체가
    // 없어 항상 stale 오판. 종료 시 ESPN cron(mma-live)이 FINISHED 전환하므로 stuck 위험 없음.
    if (m.status === "LIVE" && !MMA_LEAGUES.has(m.league)) {
      const cacheUpdatedAt = cacheByMatchId.get(m.id)?.updatedAt;
      const lastUpdate =
        cacheUpdatedAt && cacheUpdatedAt > m.updatedAt
          ? cacheUpdatedAt
          : m.updatedAt;
      const ageMs = now - lastUpdate.getTime();
      if (ageMs > STALE_LIVE_MS) {
        issues.push({
          ...matchInfo,
          kind: "stale_live",
          severity: "HIGH",
          detail: `LIVE 상태인데 ${Math.round(ageMs / 60000)}분 동안 update 없음 (Match + ts cache 둘 다 stale)`,
        });
      }
    }

    if (!BASEBALL_LEAGUES.has(m.league)) continue;

    // 1. score_drift — 야구 SCHEDULED 인데 점수 있음 + 시작 +30분 경과
    // (시작 직후 SCHEDULED→LIVE 전환 lag 는 정상 — SCORE_DRIFT_GRACE_MS 가드로 false positive 차단)
    if (
      m.status === "SCHEDULED" &&
      (m.homeScore != null || m.awayScore != null) &&
      m.startTime.getTime() < now - SCORE_DRIFT_GRACE_MS
    ) {
      // MLB 는 공식 statsapi 로 실제 상태 교차확인 — inning_missing(아래) 과 동일 분기.
      // 0:0 은 거의 항상 시작 전 초기값이라, "status updater 죽음" 단정 전에 실제 상태를 본다.
      //   지연/미시작(Delayed/Warmup/Pre-Game/Scheduled) → 시작 시 자동 해소라 오경보 → skip
      //   연기/중단(Postponed 등) → collect 가 POSTPONED 자동 갱신, 점수도 초기값이라 WARN
      //   실제 In Progress/Final 인데 SCHEDULED → 진짜 status updater 죽음 → HIGH 유지
      // (2026-06-23 #540622 Mets vs Cubs + 2026-06-26 #576674 Dbacks@Cards 우천연기 오진).
      let detail = `status=SCHEDULED 인데 점수=${m.homeScore ?? "-"}:${m.awayScore ?? "-"} (status updater 죽음 의심)`;
      let severity: "HIGH" | "WARN" = "HIGH";
      if (m.league === "MLB") {
        const st = await mlbGameState(m.homeTeam.name, m.awayTeam.name, m.startTime, mlbSched);
        if (st) {
          if (/Delayed|Warmup|Pre-Game|Scheduled/i.test(st)) continue;
          if (/Postponed|Suspended|Cancelled/i.test(st)) {
            severity = "WARN";
            detail = `실제 ${st} 인데 status=SCHEDULED+${m.homeScore ?? 0}:${m.awayScore ?? 0} — POSTPONED 미반영 (collect 자동정정 대기, status updater 죽음 아님)`;
          }
        }
      }
      issues.push({
        ...matchInfo,
        kind: "score_drift",
        severity,
        detail,
      });
    }

    // 1b. finished_no_score — 야구 FINISHED 인데 점수 null.
    // 2026-05-27 CPBL/LMB FINISHED 24건 score=null 발견 (collector score 추출 path 누락).
    // KBO/NPB/MLB 는 live poller 가 채워서 안 드러나지만 baseball-poller silent hang 시 동일 패턴.
    if (
      m.status === "FINISHED" &&
      (m.homeScore == null || m.awayScore == null)
    ) {
      issues.push({
        ...matchInfo,
        kind: "finished_no_score",
        severity: "HIGH",
        detail: `FINISHED 인데 점수=${m.homeScore ?? "null"}:${m.awayScore ?? "null"} — collector score path 또는 ws-subscriber sync 누락`,
      });
    }

    if (m.status !== "LIVE") continue;

    const cache = cacheByMatchId.get(m.id);
    const dl = cache?.detailLive as
      | {
          score?: [
            string,
            number,
            number,
            { ft?: [string, string]; [k: string]: unknown },
          ];
        }
      | null;
    const scoreArr = dl?.score;

    // 2. inning_missing — LIVE 인데 cache.score 없거나 half=0
    if (!Array.isArray(scoreArr) || scoreArr.length < 4) {
      issues.push({
        ...matchInfo,
        kind: "inning_missing",
        severity: "WARN",
        detail: `LIVE 인데 TheSports cache score 없음 (frontend 가 "1회초" fallback 표시 위험)`,
      });
      continue;
    }
    const half = scoreArr[2];
    const sid = scoreArr[1];
    if (half === 0 || half == null) {
      // 2026-05-28 LMB #328115/#328116 케이스 — cache.sid=1 (Not Started) +
      // 빈 scoresObj 인데 우리 Match.status=LIVE stuck. 같은 시간대 다른 매치는 정상
      // = TheSports source 가 두 매치만 누락 (연기 / 표시 누락). worker 죽음 아님.
      //   - 시작 +30분 미만: 매치 시작 lag/시작전 — skip (false positive)
      //   - 시작 +30분+: source 누락 (아래 sid 로 detail 구분)
      // half=0(이닝 데이터 전무)은 sid 무관하게 30분 가드. sid=1 만 면제하던 종전 가드가
      // sid=15 등 다른 "시작 전/지연" 코드를 못 걸러 시작 직후 오탐 (2026-06-18 LMB #503512).
      const elapsedMs = now - m.startTime.getTime();
      if (elapsedMs < 30 * 60 * 1000) continue;
      // half=0 이어도 이닝별 점수(pN)가 있으면 이닝 번호는 "N회" 로 정상 표시된다.
      // score[2]=초/말 지시자만 0 인 것 — LMB TheSports 피드는 초/말을 자주 0 으로 보낸다.
      // 이닝 데이터가 있는데 half=0 만으로 "이닝 표시 불가" 를 띄우던 반복 오탐(LMB) 차단.
      // 진짜 누락(연기/source drop)은 scoresObj 가 비어(pN 없음, sid=1) 아래로 그대로 흘러 걸린다.
      const sObj = scoreArr[3];
      const hasInningData =
        sObj != null &&
        typeof sObj === "object" &&
        Object.keys(sObj).some((k) => /^p\d+$/.test(k));
      if (hasInningData) continue;
      let reason = sid === 1
        ? `TheSports source 누락 또는 매치 연기 (시작 +${Math.round(elapsedMs / 60000)}분, sid=1 Not Started)`
        : `cache half=${half} (이닝 표시 불가)`;
      let severity: "HIGH" | "WARN" = "WARN";
      // MLB 는 공식 statsapi 로 실제 상태 구분 — 지연류(Delayed/Warmup/Pre-Game/Scheduled)는
      // 경기 시작 시 자동 해소되므로 skip, 연기·중단·취소는 LIVE 표기 잘못이라 HIGH 승격.
      if (sid === 1 && m.league === "MLB") {
        const st = await mlbGameState(m.homeTeam.name, m.awayTeam.name, m.startTime, mlbSched);
        if (st) {
          if (/Delayed|Warmup|Pre-Game|Scheduled/i.test(st)) continue;
          if (/Postponed|Suspended|Cancelled/i.test(st)) {
            severity = "HIGH";
            reason = `MLB 공식 "${st}" — 연기/중단 확정인데 status=LIVE (collector 정리 필요)`;
          } else if (/In Progress/i.test(st)) {
            reason = `TheSports source 누락 — MLB 공식은 "${st}" (시작 +${Math.round(elapsedMs / 60000)}분)`;
          }
        }
      }
      issues.push({
        ...matchInfo,
        kind: "inning_missing",
        severity,
        detail: `LIVE 인데 ${reason}`,
      });
    }

    // 3. cache_db_mismatch — ft = [home, away] 단일 인덱싱 (2026-05-27 CPBL 정정).
    // 양방향 검증은 race condition 이전엔 안전망 였으나, 워커 ft 인덱싱 통일 후엔
    // 진짜 정합성만 확인. 단 sync lag (cache 신선 + Match stale) 8분 이내는 skip.
    const ft = scoreArr[3]?.ft;
    if (Array.isArray(ft) && ft.length === 2 && m.homeScore != null && m.awayScore != null) {
      const a = parseInt(ft[0], 10);
      const b = parseInt(ft[1], 10);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const matchAH = a === m.awayScore && b === m.homeScore; // [away, home] — 옛 호환
        const matchHA = a === m.homeScore && b === m.awayScore; // [home, away] — 정답
        if (!matchAH && !matchHA) {
          const cacheUpd = cache?.updatedAt?.getTime() ?? 0;
          const matchUpd = m.updatedAt.getTime();
          const syncLagMs = cacheUpd > matchUpd ? cacheUpd - matchUpd : 0;
          // 야구 collector(점수)와 ws-subscriber(cache)는 경로가 달라 5~7분 차이가 정상 발생 → 8분 가드.
          const SYNC_GRACE_MS = 8 * 60 * 1000;
          if (syncLagMs >= SYNC_GRACE_MS) {
            issues.push({
              ...matchInfo,
              kind: "cache_db_mismatch",
              severity: "HIGH",
              detail: `cache ft=[${a},${b}] vs DB home=${m.homeScore} away=${m.awayScore} 양방향 모두 불일치 (sync lag ${Math.round(syncLagMs / 60000)}분)`,
            });
          }
          // sync 진행 중이라도 cache 내부 정합성은 별도 검사 진행 (아래 4번).
        }
      }
    }

    // 4. cache_inner_inconsistent — 야구 LIVE 의 cache.detailLive.score 내부 정합성.
    // p1~p12 (각 이닝 [away,home]) + ot (연장 합계) 합산이 ft 와 다르면 TheSports push 일부 누락 의심
    // (예: 1점차 매치인데 한 이닝 push 빠져서 sum 이 ft 보다 작음).
    // sumAway = sum(p_i[0]), sumHome = sum(p_i[1]). ft=[away, home] vs [sumAway, sumHome] 비교.
    const fullScore = scoreArr[3] as { [k: string]: unknown } | undefined;
    if (fullScore && Array.isArray(ft) && ft.length === 2) {
      let sumAway = 0;
      let sumHome = 0;
      let hasInning = false;
      for (let i = 1; i <= 12; i++) {
        const p = fullScore["p" + i];
        if (Array.isArray(p) && p.length === 2) {
          hasInning = true;
          const a = parseInt(String(p[0]), 10);
          const b = parseInt(String(p[1]), 10);
          if (Number.isFinite(a)) sumAway += a;
          if (Number.isFinite(b)) sumHome += b;
        }
      }
      // 연장 득점은 TheSports 가 p10+ 대신 ot=[away,home] 에 뭉쳐 넣는다 (야구 한정) →
      // ot 를 빼면 연장 간 경기마다 sum<ft 로 오탐. 합산 포함 (실측 FINISHED 120건 중
      // ot!=0 인 10건 전부 p합+ot==ft, 진짜 불일치 0건 — LMB #590860 등).
      const ot = fullScore["ot"];
      if (Array.isArray(ot) && ot.length === 2) {
        const oa = parseInt(String(ot[0]), 10);
        const ob = parseInt(String(ot[1]), 10);
        if (Number.isFinite(oa)) sumAway += oa;
        if (Number.isFinite(ob)) sumHome += ob;
      }
      const ftAway = parseInt(ft[0], 10);
      const ftHome = parseInt(ft[1], 10);
      // 라이브 push 진행 중(cache 최근 5분 내 갱신)이면 이닝 partial 은 다음 push 가
      // 보정 → skip. 총점(ft)·DB·화면 점수는 정상이고 이닝 분해만 일시 어긋난 정상 케이스
      // (LMB #328157: ft=[4,5] DB 일치, 이닝합만 4) false alarm 차단. cache_db_mismatch
      // 의 sync grace 와 동일 철학 — 5분+ 정체된 채 불일치만 진짜 push 누락 고착으로 알림.
      const innerCacheAgeMs = cache?.updatedAt ? now - cache.updatedAt.getTime() : Infinity;
      const INNER_FRESH_MS = 5 * 60 * 1000;
      if (
        hasInning &&
        Number.isFinite(ftAway) &&
        Number.isFinite(ftHome) &&
        (ftAway !== sumAway || ftHome !== sumHome) &&
        innerCacheAgeMs >= INNER_FRESH_MS
      ) {
        issues.push({
          ...matchInfo,
          kind: "cache_inner_inconsistent",
          severity: "WARN",
          detail: `cache ft=[${ftAway},${ftHome}] vs 이닝 합=[${sumAway},${sumHome}] 불일치 + cache ${Math.round(innerCacheAgeMs / 60000)}분 정체 (TheSports push 누락 고착 의심)`,
        });
      }
    }
  }

  // ───── 4.5. CLUB_FRIENDLY 소스 prefix 중복 — 같은 ts 매치가 raw + ts- 두 row ─────
  // 원인: 옛 collect-friendlies(prefix 없는 externalId) 재실행 or 과거 raw 의 연기 재편성
  // (2026-07-09 보카전 중복 카드). 같은 tsMatchId 두 row = false positive 여지 없는 확정
  // 중복이라 /scores 에 두 카드로 노출. ts- row 가 canonical(worker LIVE 갱신 owner) —
  // 조치는 raw row 삭제.
  const cfRows = await prisma.match.findMany({
    where: { league: "CLUB_FRIENDLY" },
    select: {
      id: true,
      externalId: true,
      status: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  const cfByTs = new Map<string, typeof cfRows>();
  for (const m of cfRows) {
    const tsId = m.externalId.replace(/^ts-/, "");
    if (!cfByTs.has(tsId)) cfByTs.set(tsId, []);
    cfByTs.get(tsId)!.push(m);
  }
  for (const [tsId, rows] of cfByTs) {
    if (rows.length < 2) continue;
    const raw = rows.find((r) => !r.externalId.startsWith("ts-"));
    if (!raw) continue; // ts- 끼리 2개면 별개 매치(다른 id) — 여기 대상 아님
    issues.push({
      kind: "friendly_dup",
      severity: "HIGH",
      matchId: raw.id,
      externalId: raw.externalId,
      league: "CLUB_FRIENDLY",
      home: raw.homeTeam.name,
      away: raw.awayTeam.name,
      detail: `같은 ts 매치(${tsId})가 ${rows.length} row — raw #${raw.id} 삭제 필요 (ts- 가 canonical)`,
    });
  }

  // ───── 4.6. 크로스소스 매치 중복 — 같은 경기가 숫자(af/ESPN) + ts- 두 row ─────
  // 2026-07-11 BELARUS_PL: af #316314(1525920) 0-0 stale + ts #851442(ts-…) 1-0 이
  // 화면에 두 카드로 동시 노출. 이중수집 리그(TS_COVERED_EXCEPTIONS 등)에서 write-time
  // dedup 가드가 뚫리면(diary 시각 오기 등) 발생. friendly_dup 은 같은 tsMatchId 두 row
  // 한정이라 이 유형(다른 id 체계)을 원리상 못 잡음 — 팀쌍+시각으로 감지.
  // 야구는 더블헤더(같은 팀 3h 간격 2경기 정상)가 있어 윈도우 40분, 그 외 3h.
  // ts- vs ts- 는 제외(더블헤더 — LMB 전수감사 확인). 숫자 vs 숫자 크로스소스
  // (football-data vs api-football 등)는 이론상 가능하나 희귀 — 미검출 한계로 수용.
  // 대상 리그 = ts 매핑 보유 리그로 스코핑 — ts- row 가 존재하려면 매핑 필수라 손실 없고,
  // [league, startTime] 인덱스를 태워 3분 폴링의 전 테이블 스캔 회피.
  const tsMappedLeagues = (tsLeagueMap as { code: string }[]).map((e) => e.code);
  const xsRows = await prisma.match.findMany({
    where: {
      league: { in: tsMappedLeagues },
      startTime: { gte: new Date(now - 3 * 86400_000), lte: new Date(now + 7 * 86400_000) },
      status: { not: "POSTPONED" },
    },
    select: {
      id: true, externalId: true, league: true, status: true, startTime: true,
      homeTeamId: true, awayTeamId: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
    },
  });
  // teamId 쌍 키 + normalize 이름 쌍 키 병행 — af/ts 팀 resolve 가 서로 다른 Team row 로
  // 갈린 중복(오늘 케이스의 변형)은 teamId 그룹으로 안 묶여서 이름 키가 백업.
  const xsGroups = new Map<string, typeof xsRows>();
  const addXs = (key: string, m: (typeof xsRows)[number]) => {
    if (!xsGroups.has(key)) xsGroups.set(key, []);
    xsGroups.get(key)!.push(m);
  };
  for (const m of xsRows) {
    addXs(`${m.league}:id:${[m.homeTeamId, m.awayTeamId].sort((a, b) => a - b).join("-")}`, m);
    const nh = normalizeTeamName(m.homeTeam.name);
    const na = normalizeTeamName(m.awayTeam.name);
    if (nh && na) addXs(`${m.league}:nm:${[nh, na].sort().join("|")}`, m);
  }
  const seenXsPairs = new Set<string>();
  for (const rows of xsGroups.values()) {
    if (rows.length < 2) continue;
    const windowMs = BASEBALL_LEAGUES.has(rows[0].league) ? 40 * 60_000 : 3 * 3600_000;
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        if (Math.abs(a.startTime.getTime() - b.startTime.getTime()) > windowMs) continue;
        const aTs = a.externalId.startsWith("ts-");
        const bTs = b.externalId.startsWith("ts-");
        if (aTs === bTs) continue; // 같은 소스끼리는 대상 아님
        // 같은 ts id 의 raw+ts- 쌍은 friendly_dup 담당 — 이중 알림 방지.
        if (a.externalId.replace(/^ts-/, "") === b.externalId.replace(/^ts-/, "")) continue;
        const pairId = [a.id, b.id].sort((x, y) => x - y).join("-");
        if (seenXsPairs.has(pairId)) continue;
        seenXsPairs.add(pairId);
        const numericRow = aTs ? b : a;
        // LIVE/SCHEDULED 포함 = 지금 화면 중복 노출 → HIGH. 둘 다 FINISHED 면 표시는
        // 렌더 dedup 이 합치지만 Elo/폼 계산 이중 집계 오염이라 WARN.
        const active = [a, b].some((r) => r.status === "LIVE" || r.status === "SCHEDULED");
        issues.push({
          kind: "cross_source_dup",
          severity: active ? "HIGH" : "WARN",
          matchId: numericRow.id,
          externalId: numericRow.externalId,
          league: numericRow.league,
          home: numericRow.homeTeam.name,
          away: numericRow.awayTeam.name,
          detail: `크로스소스 중복 — #${a.id}(${a.externalId}, ${a.status} ${a.startTime.toISOString().slice(11, 16)}) + #${b.id}(${b.externalId}, ${b.status} ${b.startTime.toISOString().slice(11, 16)}). 병합/정리 필요`,
        });
      }
    }
  }

  // ───── 5/6. standings 검사 — 메이저 리그 source stale + 두 source 1위 팀 mismatch ─────
  const tsStandings = await prisma.theSportsStandingsCache.findMany({
    where: { league: { in: STANDINGS_CHECK_LEAGUES } },
    select: { league: true, payload: true, updatedAt: true },
  });
  const afStandings = await prisma.apiFootballStandingsCache.findMany({
    where: { league: { in: STANDINGS_CHECK_LEAGUES } },
    select: { league: true, rows: true, updatedAt: true },
  });
  const tsByLeague = new Map(tsStandings.map((s) => [s.league, s]));
  const afByLeague = new Map(afStandings.map((s) => [s.league, s]));

  // 시즌 종료(미래 경기 없음) 리그는 standings 갱신이 불필요 → stale 검사 제외.
  // 5/24 종료된 SERIE_A 등 유럽 리그가 시즌오프 내내 stale 알림 쏟는 것 방지.
  // 2026-07-09: "미래 경기 존재" → "14일 내 경기 존재" 로 좁힘 — 새 시즌 일정이 미리
  // 수집되면(EPL 8/21 개막 50건) 개막 6주 전인데도 면제를 빠져나가 stale 오탐.
  // 개막 전엔 순위표가 존재하지 않아 갱신될 수 없음. 개막 2주 전부터 검사 재개.
  const upcoming = await prisma.match.groupBy({
    by: ["league"],
    where: {
      league: { in: STANDINGS_CHECK_LEAGUES },
      startTime: { gt: new Date(now), lt: new Date(now + 14 * 86400_000) },
    },
    _count: { _all: true },
  });
  const hasUpcoming = new Set(upcoming.filter((g) => g._count._all > 0).map((g) => g.league));

  // 유럽 컵(UCL/UEL/UECL)은 league phase(9~1월)에만 순위표가 갱신되고, 예선·knockout 구간엔
  // 멈춘 게 정상이다. 단 예선 경기가 "미래 경기"라 hasUpcoming 면제를 빠져나가 여름마다 stale
  // 오탐을 낸다. poller 가 다른 리그를 fresh 갱신 중(=살아있음)이면 컵만 stale = 시즌 경계 →
  // 면제. poller 전체가 죽으면 in-season 리그(MLS 등)가 따로 잡으므로 진짜 죽음은 안 놓친다.
  const EUROPEAN_CUPS = new Set(["UCL", "UEL", "UECL"]);
  const pollerAlive = tsStandings.some(
    (s) => !EUROPEAN_CUPS.has(s.league) && now - s.updatedAt.getTime() < STANDINGS_TS_STALE_MS,
  );

  const placeholderInfo = (league: string) => ({
    matchId: 0,
    externalId: "",
    league,
    home: "",
    away: "",
  });

  for (const league of STANDINGS_CHECK_LEAGUES) {
    if (!hasUpcoming.has(league)) continue; // 시즌 종료(미래 경기 없음) → standings stale·mismatch 무시
    const ts = tsByLeague.get(league);
    const af = afByLeague.get(league);
    // 유럽 컵 + poller 살아있음 = league phase 사이 시즌 경계 → stale 알림 면제(위 EUROPEAN_CUPS 주석).
    const cupExempt = EUROPEAN_CUPS.has(league) && pollerAlive;

    // 5a. TheSports stale (1.5h+)
    if (ts) {
      const ageMs = now - ts.updatedAt.getTime();
      if (ageMs > STANDINGS_TS_STALE_MS && !cupExempt) {
        issues.push({
          ...placeholderInfo(league),
          kind: "standings_stale",
          severity: ageMs > 6 * 3600 * 1000 ? "HIGH" : "WARN",
          detail: `TheSports standings cache ${Math.round(ageMs / 60000)}분 stale (poller 1h 주기인데 죽음 의심)`,
        });
      }
    }

    // 5b. api-football stale (26h+).
    // Phase 4 (2026-05-25): TS standings-poller 가 cover 하는 리그는 af cache
    // 갱신 안 함 (cron 이 skip) → af 가 영구 stale 인 게 정상. ts 가 fresh 이면
    // 우리 시스템이 ts 우선 사용하므로 af stale 무관 → skip.
    if (af) {
      const ageMs = now - af.updatedAt.getTime();
      const tsAge = ts ? now - ts.updatedAt.getTime() : Infinity;
      const tsFresh = tsAge < STANDINGS_TS_STALE_MS;
      if (ageMs > STANDINGS_AF_STALE_MS && !tsFresh && !cupExempt) {
        issues.push({
          ...placeholderInfo(league),
          kind: "standings_stale",
          severity: ageMs > 48 * 3600 * 1000 ? "HIGH" : "WARN",
          detail: `api-football standings ${Math.round(ageMs / 3600000)}h stale + ts 도 stale (양쪽 source 죽음 의심)`,
        });
      }
    }

    // 6. 두 source 의 1위 팀 비교 — 한쪽 stale 면 다름.
    //
    // ourId 직접 비교 X — 두 가지 false positive 원인:
    //   (a) team-id-mapping.json 의 entry 는 ourLeague 가 LIGUE_1 같은 정규 리그만
    //       — UEL/UECL standings 의 ts team_id 를 찾으면 LIGUE_1 ourId 가 반환됨
    //       → 검사 league(UEL) vs 매핑 ourLeague(LIGUE_1) 다르면 skip.
    //   (b) 같은 팀이 우리 Team 테이블에 source 별로 중복 row (예: LALIGA Barcelona 4개)
    //       → ourId 가 달라도 이름 같으면 동일 팀으로 판정.
    if (ts && af) {
      const tsPayload = ts.payload as unknown as {
        tables?: Array<{ rows?: Array<{ position?: number; team_id?: string }> }>;
      };
      const afRows = af.rows as unknown as Array<{
        position: number;
        teamExternalId: string;
      }>;
      const tsTop = tsPayload?.tables?.[0]?.rows?.find((r) => r.position === 1);
      const afTop = afRows?.find?.((r) => r.position === 1);
      if (tsTop?.team_id && afTop?.teamExternalId) {
        // TeamSourceId 로 ts 1위 / af 1위 의 canonical teamId 를 각각 조회.
        // 같으면 같은 팀 (정상), 다르면 standings stale.
        const [tsMap, afMap] = await Promise.all([
          prisma.teamSourceId.findUnique({
            where: {
              league_source_externalId: {
                league,
                source: "thesports",
                externalId: tsTop.team_id,
              },
            },
            select: { teamId: true },
          }),
          prisma.teamSourceId.findUnique({
            where: {
              league_source_externalId: {
                league,
                source: "api-football",
                externalId: afTop.teamExternalId,
              },
            },
            select: { teamId: true },
          }),
        ]);

        // (a) 어느 한 쪽 mapping 누락 → cross-league mapping 가능성 + Team 이름 fallback 비교.
        if (!tsMap || !afMap) {
          // ts mapping JSON 의 cross-league 검사는 유지 (UEL 검사 시 LIGUE_1 mapping 반환 케이스).
          const tsMapping = await import("@/lib/sports/thesports/team-id-mapping.json")
            .then((m) => m.default as Array<{ ourId: number; tsId: string; ourLeague: string }>);
          const tsEntry = tsMapping.find((t) => t.tsId === tsTop.team_id);
          if (tsEntry && tsEntry.ourLeague !== league) continue;
          const tsTeam = tsEntry
            ? await prisma.team.findUnique({
                where: { id: tsEntry.ourId },
                select: { id: true, name: true },
              })
            : null;
          const afTeam = await prisma.team.findFirst({
            where: { league, externalId: afTop.teamExternalId },
            select: { id: true, name: true },
          });
          if (tsTeam && afTeam && !sameTeamName(tsTeam.name, afTeam.name)) {
            issues.push({
              ...placeholderInfo(league),
              kind: "standings_mismatch",
              severity: "HIGH",
              detail: `TheSports 1위(${tsTeam.name}) ≠ api-football 1위(${afTeam.name}) — 한쪽 stale 확정`,
            });
          }
          continue;
        }

        // (b) TeamSourceId 둘 다 hit — teamId 비교가 정답.
        if (tsMap.teamId !== afMap.teamId) {
          const [tsTeam, afTeam] = await Promise.all([
            prisma.team.findUnique({
              where: { id: tsMap.teamId },
              select: { name: true },
            }),
            prisma.team.findUnique({
              where: { id: afMap.teamId },
              select: { name: true },
            }),
          ]);
          // 같은 팀인데 Team 테이블에 두 row 양산 케이스 (J1 Kashima 116543↔176429 등) →
          // 진짜 stale 이 아니라 dedup 필요. 이름 normalize 매칭되면 skip + 별도 신호로 분류.
          if (tsTeam && afTeam && sameTeamName(tsTeam.name, afTeam.name)) continue;
          issues.push({
            ...placeholderInfo(league),
            kind: "standings_mismatch",
            severity: "HIGH",
            detail: `TheSports 1위(${tsTeam?.name ?? "?"}) ≠ api-football 1위(${afTeam?.name ?? "?"}) — 한쪽 stale 확정`,
          });
        }
      }
    }
  }

  // 12. teamsourceid_contamination — 하나의 thesports id 가 서로 다른 대륙연맹의 Team row 에
  //     연결된 이름매칭 오염(FC 바르셀로나↔에콰도르 Barcelona SC 류). 알려진 연맹끼리 교차할
  //     때만 HIGH — 미매핑 리그는 스킵해 오탐 방지. 정상 컵 분열(같은 연맹)은 걸리지 않음.
  {
    const tsRows = await prisma.teamSourceId.findMany({
      where: { source: "thesports" },
      select: { externalId: true, teamId: true, team: { select: { name: true, league: true } } },
    });
    const byExt = new Map<string, typeof tsRows>();
    for (const r of tsRows) {
      const arr = byExt.get(r.externalId) ?? byExt.set(r.externalId, []).get(r.externalId)!;
      arr.push(r);
    }
    for (const [ext, rows] of byExt) {
      if (new Set(rows.map((r) => r.teamId)).size <= 1) continue;
      const confs = new Set(rows.map((r) => TEAM_CONF[r.team.league]).filter(Boolean));
      if (confs.size <= 1) continue; // 같은 연맹 = 정상 컵 분열, 또는 미매핑 = 스킵
      const teams = [...new Map(rows.map((r) => [r.teamId, r.team])).values()];
      issues.push({
        matchId: 0,
        externalId: ext,
        league: teams[0].league,
        home: teams.map((t) => `${t.name}(${t.league})`).join(" / "),
        away: "",
        kind: "teamsourceid_contamination",
        severity: "HIGH",
        detail: `ts id ${ext} 가 연맹 교차 Team row 에 연결 [${[...confs].join(", ")}] — 이름매칭 오염. scripts/scan-teamsourceid-contamination.mjs 로 확인`,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    totals: {
      matchesChecked: matches.length,
      baseballMatches: baseballIds.length,
      standingsChecked: STANDINGS_CHECK_LEAGUES.length,
      issues: issues.length,
    },
    issues,
  });
}
