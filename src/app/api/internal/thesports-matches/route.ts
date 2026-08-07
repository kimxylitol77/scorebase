// POST /api/internal/thesports-matches
// Lightsail worker 가 TheSports diary (football|baseball) 응답을 batch upsert.
// Bearer auth: env INTERNAL_API_TOKEN.
//
// Body:
//   {
//     sport: "football" | "baseball",
//     matches: Array<{
//       league: string,           // 우리 league code (CSL/EPL/KBO/NPB/MLB/...)
//       tsMatchId: string,        // TheSports match id (e.g. "4jwq26sw61g9r0v")
//       tsHomeTeamId: string,
//       tsAwayTeamId: string,
//       startTime: string,        // ISO
//       status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED",
//       homeScore?: number,
//       awayScore?: number,
//     }>
//   }
//
// 흐름:
//   1) DB TeamSourceId (source='thesports') 우선 lookup. 없으면 mapping JSON fallback.
//      미매핑이면 매치 skip.
//   2) league + tsMatchId 가 externalId 로 match upsert.

import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  HOCKEY_LEAGUES,
  BASKETBALL_LEAGUES,
  BASEBALL_LEAGUES,
  VOLLEYBALL_LEAGUES,
  SOCCER_LEAGUES,
} from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";

// TS 단일 소스 리그 — dedup 경로에서 기존 매치 status/score 도 TS 로 갱신 (단조 가드).
// 야구(MLB/KBO/NPB 등) 2026-06 합류: ESPN 이 연기 경기를 state="post" 로 FINISHED 0-0 오기록하던
// 버그 차단 + TheSports status_id(100=종료/300대·14·19=연기)가 POSTPONED 정확. collect 백스톱
// 유지(NBA/NHL 과 동일 패턴 — coverage gap 방지, score 는 숫자일 때만 갱신).
// 축구만 제외 — api-football 이 lineup/통계/predictions owner 라 status 도 api-football 유지.
function isTsSoleSource(league: string): boolean {
  return (
    HOCKEY_LEAGUES.has(league) ||
    BASKETBALL_LEAGUES.has(league) ||
    BASEBALL_LEAGUES.has(league) ||
    VOLLEYBALL_LEAGUES.has(league) // 배구는 ts 가 유일 소스 (백스톱 collector 없음)
  );
}

// 팀 이름 normalize 비교 (Team 중복 row 대응 — LALIGA Barcelona 4 row 같은 케이스).
// 2026-06-13: 분음부호 폴딩 추가 — 발트/캅카스/아제르 리그는 Žalgiris·Šamaxı·Grobiņa·İmişli
// 처럼 결합 분음부호+dotless i 가 흔해, 기존 `[^a-z0-9]` 제거가 첫 글자까지 날려 매칭 어긋났음.
function normalizeTeamName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // 결합 분음부호 제거 (Žalgiris→Zalgiris, Grobiņa→Grobina)
    .toLowerCase()
    .replace(/[ıİ]/g, "i") // 터키/아제르 dotless i (İmişli, Şamaxı → samaxi)
    .replace(/\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|club)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}
function sameTeamName(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}
export const dynamic = "force-dynamic";

interface MatchPayload {
  league: string;
  tsMatchId: string;
  tsHomeTeamId: string;
  tsAwayTeamId: string;
  startTime: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  homeScore?: number;
  awayScore?: number;
  // 플레이오프 라운드 라벨 (NBA — TheSports stage). 브라켓 그룹화용.
  playoffRound?: string;
  playoffConference?: string | null;
  playoffStageId?: string;
  // 경기 환경(날씨) — diary 의 environment {weather, temperature, humidity, wind, pressure}. 있으면 cache 에 저장.
  environment?: unknown;
}
interface Body {
  sport: "football" | "baseball" | "ice_hockey" | "basketball" | "volleyball";
  matches: MatchPayload[];
}

interface TeamMapEntry { ourId: number; tsId: string; ourLeague?: string }

/**
 * ts 팀 id → 우리 팀 id. **리그를 함께 봐야 한다.**
 * 같은 ts uuid 가 여러 리그에 매핑돼 있는 항목이 축구만 317건이다(유럽 대항전 참가 팀 —
 * Barcelona = LALIGA·UCL·COPA_LIB 등). tsId 만 키로 쓰면 Map 특성상 마지막 항목이 이겨
 * 엉뚱한 리그의 팀 row 를 물고, 그러면 같은 경기가 두 row 로 갈린다
 * (2026-08-04 SLOVENIA_SNL Celje 가 UECL Celje 로 붙어 크로스소스 중복 발생).
 */
interface TsTeamJsonMap {
  /** `${ourLeague}|${tsId}` — 리그가 맞는 매핑 */
  byLeague: Map<string, number>;
  /** tsId — 그 tsId 가 한 리그에만 있을 때만. 모호하면 담지 않는다 */
  unambiguous: Map<string, number>;
}

function buildTsTeamJsonMap(file: string): TsTeamJsonMap {
  const byLeague = new Map<string, number>();
  const seen = new Map<string, Set<number>>();
  try {
    const arr: TeamMapEntry[] = JSON.parse(readFileSync(file, "utf-8"));
    for (const t of arr) {
      if (!t?.tsId || typeof t.ourId !== "number") continue;
      if (t.ourLeague) byLeague.set(`${t.ourLeague}|${t.tsId}`, t.ourId);
      if (!seen.has(t.tsId)) seen.set(t.tsId, new Set());
      seen.get(t.tsId)!.add(t.ourId);
    }
  } catch {
    /* 파일 없음 — 빈 맵으로 두고 DB lookup 에만 의존 */
  }
  const unambiguous = new Map<string, number>();
  for (const [tsId, ids] of seen) {
    if (ids.size === 1) unambiguous.set(tsId, [...ids][0]);
  }
  return { byLeague, unambiguous };
}

// JSON fallback — DB TeamSourceId 미커버 ts entry 보완용.
let cachedFootballJsonMap: TsTeamJsonMap | null = null;
let cachedBaseballJsonMap: TsTeamJsonMap | null = null;
let cachedIceHockeyJsonMap: TsTeamJsonMap | null = null;
let cachedBasketballJsonMap: TsTeamJsonMap | null = null;
let cachedVolleyballJsonMap: TsTeamJsonMap | null = null;

function loadFootballJsonReverse(): TsTeamJsonMap {
  if (cachedFootballJsonMap) return cachedFootballJsonMap;
  cachedFootballJsonMap = buildTsTeamJsonMap(
    path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json"),
  );
  return cachedFootballJsonMap;
}

function loadBaseballJsonReverse(): TsTeamJsonMap {
  if (cachedBaseballJsonMap) return cachedBaseballJsonMap;
  cachedBaseballJsonMap = buildTsTeamJsonMap(
    path.join(process.cwd(), "src/lib/sports/thesports/baseball-team-id-mapping.json"),
  );
  return cachedBaseballJsonMap;
}

function loadIceHockeyJsonReverse(): TsTeamJsonMap {
  if (cachedIceHockeyJsonMap) return cachedIceHockeyJsonMap;
  cachedIceHockeyJsonMap = buildTsTeamJsonMap(
    path.join(process.cwd(), "src/lib/sports/thesports/ice-hockey-team-id-mapping.json"),
  );
  return cachedIceHockeyJsonMap;
}

function loadBasketballJsonReverse(): TsTeamJsonMap {
  if (cachedBasketballJsonMap) return cachedBasketballJsonMap;
  cachedBasketballJsonMap = buildTsTeamJsonMap(
    path.join(process.cwd(), "src/lib/sports/thesports/basketball-team-id-mapping.json"),
  );
  return cachedBasketballJsonMap;
}

function loadVolleyballJsonReverse(): TsTeamJsonMap {
  if (cachedVolleyballJsonMap) return cachedVolleyballJsonMap;
  cachedVolleyballJsonMap = buildTsTeamJsonMap(
    path.join(process.cwd(), "src/lib/sports/thesports/volleyball-team-id-mapping.json"),
  );
  return cachedVolleyballJsonMap;
}

/** 이번 batch 의 tsTeamId 들을 한 번에 TeamSourceId 에서 fetch — Map<"league|ext", teamId>. */
async function loadDbMapForBatch(
  matches: MatchPayload[],
): Promise<Map<string, number>> {
  const byLeague = new Map<string, Set<string>>();
  for (const m of matches) {
    if (!byLeague.has(m.league)) byLeague.set(m.league, new Set());
    byLeague.get(m.league)!.add(m.tsHomeTeamId);
    byLeague.get(m.league)!.add(m.tsAwayTeamId);
  }
  const result = new Map<string, number>();
  for (const [league, exts] of byLeague) {
    if (exts.size === 0) continue;
    const rows = await prisma.teamSourceId.findMany({
      where: {
        league,
        source: "thesports",
        externalId: { in: [...exts] },
      },
      select: { externalId: true, teamId: true },
    });
    for (const r of rows) {
      result.set(`${league}|${r.externalId}`, r.teamId);
    }
  }
  return result;
}

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.sport !== "football" && body.sport !== "baseball" && body.sport !== "ice_hockey" && body.sport !== "basketball" && body.sport !== "volleyball") {
    return NextResponse.json({ error: "sport must be football | baseball | ice_hockey | basketball | volleyball" }, { status: 400 });
  }
  if (!Array.isArray(body.matches)) {
    return NextResponse.json({ error: "matches array required" }, { status: 400 });
  }

  // DB TeamSourceId 우선 lookup (league + source='thesports' + tsTeamId)
  const dbMap = await loadDbMapForBatch(body.matches);
  // JSON fallback — DB 에 없는 ts entry 보완
  const jsonMap =
    body.sport === "football"
      ? loadFootballJsonReverse()
      : body.sport === "baseball"
        ? loadBaseballJsonReverse()
        : body.sport === "ice_hockey"
          ? loadIceHockeyJsonReverse()
          : body.sport === "volleyball"
            ? loadVolleyballJsonReverse()
            : loadBasketballJsonReverse();

  // 순서: DB(리그 일치) → JSON(리그 일치) → JSON(그 tsId 가 한 리그뿐일 때만).
  // 여러 리그에 걸친 tsId 인데 요청 리그 매핑이 없으면 포기한다 — 아무 리그나 물면
  // 같은 경기가 두 row 로 갈린다.
  function resolveTsTeamId(league: string, tsTeamId: string): number | undefined {
    return (
      dbMap.get(`${league}|${tsTeamId}`) ??
      jsonMap.byLeague.get(`${league}|${tsTeamId}`) ??
      jsonMap.unambiguous.get(tsTeamId)
    );
  }

  let upserted = 0;
  let skippedNoTeam = 0;
  let skippedDuplicate = 0;
  let startTimeFixed = 0;

  for (const m of body.matches) {
    const homeId = resolveTsTeamId(m.league, m.tsHomeTeamId);
    const awayId = resolveTsTeamId(m.league, m.tsAwayTeamId);
    if (!homeId || !awayId) {
      // ts team mapping 없음 — 매치 row 못 만듦. 다만 같은 league + 시각 ±90분 안에
      // non-ts 매치 (api-football/ESPN 가 만든 매치) 가 unique 하면 ts cache 만 연결.
      // 그러면 fast-poller 가 그 매치 incidents/score 채워 GoalsTooltip 활성.
      // 2026-05-25: 50% 매치 cache 누락 (사용자 신고 hover tooltip 안 뜸) 해소.
      try {
        const startMs = new Date(m.startTime).getTime();
        const candidates = await prisma.match.findMany({
          where: {
            league: m.league,
            startTime: {
              gte: new Date(startMs - 90 * 60 * 1000),
              lte: new Date(startMs + 90 * 60 * 1000),
            },
            NOT: { externalId: { startsWith: "ts-" } },
          },
          select: { id: true },
        });
        // unique candidate (= 같은 시각 매치 1개만) 일 때만 안전하게 매핑.
        // EPL 시즌 마지막 라운드 10경기 동시 같은 케이스는 모호해서 skip.
        // 2026-06-13: 이 경로는 팀 매핑 실패 시의 blind 추측이라, 이미 다른 tsMatchId 로
        // 연결된 cache 를 덮어쓰면 안 됨 (매핑 경로/이전 연결이 우선). cache 부재 시에만 신규 연결.
        if (candidates.length === 1) {
          const existed = await prisma.theSportsMatchCache.findUnique({
            where: { matchId: candidates[0].id },
            select: { matchId: true },
          });
          if (!existed) {
            await prisma.theSportsMatchCache.create({
              data: { matchId: candidates[0].id, tsMatchId: m.tsMatchId, detailLive: {} },
            });
          }
        }
      } catch {
        // silent — 다음 cycle 재시도
      }
      skippedNoTeam++;
      continue;
    }
    // externalId prefix "ts-" 로 ESPN/API-Sports 와 namespace 분리 — duplicate 방지.
    // 2026-05-25: ":" → "-" 변경 — Next.js dynamic route segment 가 URL 안 ":" 처리
    // 못해 /live/[league]/[gameId] 페이지 404 됐던 문제 fix.
    const externalId = `ts-${m.tsMatchId}`;
    try {
      // ── 근본 dedup: 같은 매치를 다른 source (api-football/ESPN) 가 이미 등록했는지 체크.
      // SKIP_LEAGUES (worker 단) 가 누락한 리그도 여기서 차단 — worker 재배포 안 해도 효과.
      // 조건: 같은 league + 시각 ±150분 + 팀 IDs (양방향) + externalId 가 ts- 아님.
      // 이미 ts: 매치 있으면 update path (where 절) 로 흘러가니 skip 필요 없음.
      // 2026-07-11: 축구만 ±90분 → ±150분 (poller strict 와 통일) — TheSports diary 가
      // 시각을 잘못 기재하면 (BELARUS_PL 15:00, 실제 13:00 = 120분 차) 90분 윈도우가 뚫려
      // 중복 ts- row 가 생겼음 (#316314/#851442). 정규 축구는 같은 두 팀이 150분 내 두
      // 경기를 치를 수 없어 안전. 야구(더블헤더 단축 시 150분 내 2경기 가능 — isTsSoleSource
      // score 동기가 1차전 row 오염) + CLUB_FRIENDLY(스플릿 스쿼드 당일 2연전)는 90분 유지.
      // 2026-08-04: 축구 150분 → 72h. af 는 시즌 개막 전 전체 일정을 넣으면서 킥오프
      // 미확정 경기를 리그별 기본 시각으로 채운다(실측: 미래 af 966건 중 PRIMEIRA_LIGA 는
      // 16:00 에 171건이 몰려 있다). 그 리그가 TS_COVERED 라 af 수집이 꺼지면 그 시각은
      // 영영 갱신되지 않는데, ts 가 확정 시각으로 보내면 오차가 150분을 넘어(16:00 vs
      // 19:15 = 195분) dedup 이 못 찾고 새 row 를 만들어 같은 경기가 2장이 됐다.
      // 같은 리그에서 같은 두 팀이 사흘 안에 다시 붙지는 않으므로 창을 넓혀도 안전하다.
      // 야구(더블헤더)·클럽친선(당일 2연전)은 90분 유지.
      const DEDUP_WINDOW_MS =
        SOCCER_LEAGUES.has(m.league) && m.league !== "CLUB_FRIENDLY"
          ? 72 * 3600 * 1000
          : 90 * 60 * 1000;
      const startMs = new Date(m.startTime).getTime();
      // 창이 넓어지면 후보가 둘 이상일 수 있다(같은 두 팀의 리그 경기와 컵 경기가 사흘 안에
      // 들어오는 등). findFirst 로 아무거나 잡으면 엉뚱한 경기에 병합되므로 **시각이 가장
      // 가까운 것**을 고른다.
      const nonTsCandidates = await prisma.match.findMany({
        where: {
          league: m.league,
          startTime: {
            gte: new Date(startMs - DEDUP_WINDOW_MS),
            lte: new Date(startMs + DEDUP_WINDOW_MS),
          },
          OR: [
            { homeTeamId: homeId, awayTeamId: awayId },
            { homeTeamId: awayId, awayTeamId: homeId },
          ],
          NOT: { externalId: { startsWith: "ts-" } },
        },
        // startTime 도 받는다 — ts 가 정본이라 af 의 미확정 시각을 교정해야 한다
        select: { id: true, externalId: true, startTime: true, homeTeamId: true, awayTeamId: true },
      });
      // 방향 가드 — 창을 넓힌 구간에서는 홈/원정이 같은 것만 인정한다. 소스 간 홈·원정
      // 표기가 뒤바뀌는 건 킥오프가 거의 같을 때 얘기고, 며칠 떨어진 역방향은 홈앤어웨이
      // 2차전일 수 있어 같은 경기로 묶으면 안 된다(data-sanity 탐지기와 같은 기준, 2357f75).
      const NEAR_MS = 150 * 60 * 1000;
      const usable = nonTsCandidates.filter((c) => {
        if (Math.abs(c.startTime.getTime() - startMs) <= NEAR_MS) return true;
        return c.homeTeamId === homeId && c.awayTeamId === awayId;
      });
      let existingNonTs: { id: number; externalId: string; startTime?: Date } | null =
        usable.length
          ? usable.reduce((best, c) =>
              Math.abs(c.startTime.getTime() - startMs) < Math.abs(best.startTime.getTime() - startMs)
                ? c
                : best,
            )
          : null;

      // fallback: team-id 매칭 실패 시 이름 normalize 매칭. Team 중복 row 케이스
      // (LALIGA Barcelona 4 row, EPL Team.externalId 시스템 mismatch) 잡음. 2026-05-25.
      if (!existingNonTs) {
        const homeTeam = await prisma.team.findUnique({ where: { id: homeId }, select: { name: true } });
        const awayTeam = await prisma.team.findUnique({ where: { id: awayId }, select: { name: true } });
        if (homeTeam && awayTeam) {
          // 이름 fallback 은 substring 휴리스틱이라 윈도우를 90분으로 유지 — 150분으로
          // 넓히면 동시 킥오프 컵 라운드에서 오버매칭(Dundee⊂Dundee United 류) 노출 증가.
          const candidates = await prisma.match.findMany({
            where: {
              league: m.league,
              startTime: {
                gte: new Date(startMs - 90 * 60 * 1000),
                lte: new Date(startMs + 90 * 60 * 1000),
              },
              NOT: { externalId: { startsWith: "ts-" } },
            },
            select: {
              id: true,
              externalId: true,
              startTime: true,
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
            },
          });
          existingNonTs = candidates.find((c) =>
            (sameTeamName(c.homeTeam.name, homeTeam.name) && sameTeamName(c.awayTeam.name, awayTeam.name)) ||
            (sameTeamName(c.homeTeam.name, awayTeam.name) && sameTeamName(c.awayTeam.name, homeTeam.name)),
          ) ?? null;
        }
      }

      // 3차 fallback: ts id 역참조 (2026-07-11). poller(±150분 strict)나 이전 push 가
      // 이 ts 경기를 이미 non-ts 매치의 cache 에 연결했다면 그 매치가 canonical.
      // diary 시각이 아무리 틀려도 ts id 는 안 틀리므로 시간 윈도우와 무관하게 확실히
      // 차단 — BELARUS_PL 사고에서 af row cache 에 같은 tsMatchId 가 이미 연결돼 있었음.
      // @@index([tsMatchId]) 존재. 자기 자신(ts- row)은 startsWith 조건으로 제외.
      // 단 blind link(위 skippedNoTeam 경로의 추측 연결)가 엉뚱한 매치를 가리킬 수 있어
      // 팀쌍(양방향) 일치할 때만 채택 — 불일치면 오염 링크로 보고 정상 생성 진행.
      if (!existingNonTs) {
        const cacheLink = await prisma.theSportsMatchCache.findFirst({
          where: {
            tsMatchId: m.tsMatchId,
            match: { league: m.league, NOT: { externalId: { startsWith: "ts-" } } },
          },
          select: {
            match: { select: { id: true, externalId: true, startTime: true, homeTeamId: true, awayTeamId: true } },
          },
        });
        if (cacheLink) {
          const lm = cacheLink.match;
          const teamsMatch =
            (lm.homeTeamId === homeId && lm.awayTeamId === awayId) ||
            (lm.homeTeamId === awayId && lm.awayTeamId === homeId);
          if (teamsMatch) existingNonTs = { id: lm.id, externalId: lm.externalId, startTime: lm.startTime };
        }
      }

      if (existingNonTs) {
        skippedDuplicate++;
        // ts 가 정본이다(사용자 확정 2026-08-04). af 가 개막 전에 넣은 미확정 시각이
        // 그대로 굳어 화면에 틀린 킥오프가 나가므로, 차이가 크면 ts 확정값으로 교정한다.
        // 30분 이하 차이는 소스 간 흔한 반올림이라 건드리지 않는다(무의미한 쓰기 방지).
        const existingMs = existingNonTs.startTime?.getTime();
        if (existingMs != null && Math.abs(existingMs - startMs) > 30 * 60 * 1000) {
          await prisma.match.update({
            where: { id: existingNonTs.id },
            data: { startTime: new Date(startMs) },
          });
          startTimeFixed++;
        }
        // SKIP_LEAGUES (api-football 이 매치 row 만드는 리그) 매치도 fast-poller 가
        // detail_live 의 incidents/score 채울 수 있게 ts cache row 만 만든다.
        // 매치 row 는 api-football 것 유지 — 중복 안 만듦.
        try {
          await prisma.theSportsMatchCache.upsert({
            where: { matchId: existingNonTs.id },
            update: {
              tsMatchId: m.tsMatchId,
              ...(m.environment !== undefined ? { environment: m.environment as Prisma.InputJsonValue } : {}),
            },
            create: {
              matchId: existingNonTs.id,
              tsMatchId: m.tsMatchId,
              detailLive: {},
              ...(m.environment !== undefined ? { environment: m.environment as Prisma.InputJsonValue } : {}),
            },
          });
          // TS 단일소스 리그(NBA/NHL/MLB/KBO/NPB 등 — ESPN/api-sports 는 백스톱)는 기존 매치
          // status/score 도 TS 로 동기화. dedup-link 만 하면 끝난 경기가 SCHEDULED 로 stuck →
          // /scores "연기" 오표시. 축구만 api-football owner 라 skip. 단조 가드(역행 차단, POSTPONED 예외).
          if (isTsSoleSource(m.league)) {
            const RANK = { SCHEDULED: 0, LIVE: 1, FINISHED: 2, POSTPONED: 2 } as const;
            const cur = await prisma.match.findUnique({
              where: { id: existingNonTs.id },
              select: {
                status: true, homeScore: true, awayScore: true,
                playoffRound: true, playoffConference: true, playoffStageId: true,
              },
            });
            if (cur) {
              const upd: Record<string, unknown> = {};
              const allow = m.status === "POSTPONED" ||
                RANK[m.status] >= (RANK[cur.status as keyof typeof RANK] ?? 0);
              if (allow && m.status !== cur.status) upd.status = m.status;
              // 시작 전이면 score 를 쓰지 않고, 남아 있던 값은 지운다 (위 upsert 경로와 동일 이유).
              const syncedStatus = allow ? m.status : cur.status;
              if (syncedStatus === "SCHEDULED") {
                if (cur.homeScore != null) upd.homeScore = null;
                if (cur.awayScore != null) upd.awayScore = null;
              } else {
                if (typeof m.homeScore === "number" && m.homeScore !== cur.homeScore) upd.homeScore = m.homeScore;
                if (typeof m.awayScore === "number" && m.awayScore !== cur.awayScore) upd.awayScore = m.awayScore;
              }
              // 플레이오프 라벨 — NBA 매치는 api-sports owner 라 dedup 경로로 흐름. 여기서 라벨 부착.
              if (m.playoffRound && m.playoffRound !== cur.playoffRound) upd.playoffRound = m.playoffRound;
              if (m.playoffConference !== undefined && m.playoffConference !== cur.playoffConference) upd.playoffConference = m.playoffConference;
              if (m.playoffStageId && m.playoffStageId !== cur.playoffStageId) upd.playoffStageId = m.playoffStageId;
              if (Object.keys(upd).length) await prisma.match.update({ where: { id: existingNonTs.id }, data: upd });
            }
          }
        } catch (e) {
          // schema FK 또는 unique 충돌 silent — 다음 cycle 에서 재시도
        }
        continue;
      }

      // ── 유령 ts-vs-ts 중복 차단 (2026-07-26): TheSports 가 같은 fixture 를 두 ts id 로
      // 내보내는 케이스 (한쪽은 status 13 TBD → worker 가 SCHEDULED 로 매핑). 같은 팀페어의
      // ts- 쌍둥이가 이미 FINISHED 인데 시작시각 지난 SCHEDULED 를 새로 만들려는 push 는
      // 유령 — daily dup-cleanup 이 지워도 diary push 가 매시간 재생성하는 루프를 여기서 끊는다.
      // 기존 row 업데이트는 막지 않음 (신규 생성만 차단). 스플릿스쿼드 2연전은 양쪽 다
      // 킥오프 전에 SCHEDULED 로 생성되므로 이 조건(과거 시작시각 + 쌍둥이 FINISHED)에 안 걸린다.
      if (m.status === "SCHEDULED" && startMs < Date.now()) {
        const ownRow = await prisma.match.findUnique({
          where: { league_externalId: { league: m.league, externalId } },
          select: { id: true },
        });
        if (!ownRow) {
          const tsTwin = await prisma.match.findFirst({
            where: {
              league: m.league,
              externalId: { startsWith: "ts-", not: externalId },
              status: "FINISHED",
              startTime: {
                gte: new Date(startMs - DEDUP_WINDOW_MS),
                lte: new Date(startMs + DEDUP_WINDOW_MS),
              },
              OR: [
                { homeTeamId: homeId, awayTeamId: awayId },
                { homeTeamId: awayId, awayTeamId: homeId },
              ],
            },
            select: { id: true },
          });
          if (tsTwin) {
            skippedDuplicate++;
            console.log(`[ts-matches] ghost skip ${m.league}/${m.tsMatchId} — FINISHED ts twin #${tsTwin.id}`);
            continue;
          }
        }
      }

      // 단조 progression 가드 — 30분 주기 collector 가 detail_live 의 stale/wrong
      // status (e.g. baseball 100 = FINISHED 인데 구버전 mapper 가 SCHEDULED 로 잘못
      // 매핑한 케이스) 로 fresh FINISHED 매치를 SCHEDULED 로 revert + score null
      // 덮어쓰는 사고 차단 (2026-05-27 LMB 5/27 매치 매 30분 revert).
      // POSTPONED 는 어디서나 진입 허용 (matchday cancel).
      const STATUS_RANK = { SCHEDULED: 0, LIVE: 1, FINISHED: 2, POSTPONED: 2 } as const;
      const existing = await prisma.match.findUnique({
        where: { league_externalId: { league: m.league, externalId } },
        select: { status: true, homeScore: true, awayScore: true },
      });
      const incomingRank = STATUS_RANK[m.status];
      const allowStatus =
        !existing ||
        m.status === "POSTPONED" ||
        incomingRank >= (STATUS_RANK[existing.status as keyof typeof STATUS_RANK] ?? 0);
      // score 가 null/undefined 로 들어오면 기존 값 보존 (cache 로 채워진 fresh score
      // 덮어쓰지 않게). 명시적 숫자만 update.
      const updateData: Record<string, unknown> = {
        homeTeamId: homeId,
        awayTeamId: awayId,
      };
      // 진행/종료된 매치의 킥오프를 **미래로** 미는 갱신은 무시한다. TheSports 는 diary(일정)와
      // detail_live(라이브)가 서로 다른 킥오프를 줄 때가 있는데(2026-08-04 CLUB_FRIENDLY
      // Bournemouth vs Genoa: diary 15:00 · live 13:00), 라이브로 먼저 전환된 뒤 diary 가
      // startTime 을 덮으면 "미래인데 LIVE" 로 고착돼 data-sanity 가 매번 알린다.
      // 이미 시작한 경기의 킥오프가 미래일 수는 없으므로 진행 중인 값을 정본으로 둔다.
      const incomingStart = new Date(m.startTime);
      const liveOrDone = existing?.status === "LIVE" || existing?.status === "FINISHED";
      if (!(liveOrDone && incomingStart.getTime() > Date.now())) {
        updateData.startTime = incomingStart;
      }
      if (allowStatus) updateData.status = m.status;
      // 시작 전 경기의 score 는 버린다 — 일부 소스가 예정 경기를 0-0 으로 실어 보내고,
      // 이 라우트는 숫자만 update 하므로 한번 들어온 0 이 영영 남아 카드에 "0 : 0" 이 뜬다
      // (2026-07-29 실측 CLUB_FRIENDLY 154건). 이미 남아 있는 값도 여기서 되돌린다.
      const finalStatus = allowStatus ? m.status : (existing?.status ?? m.status);
      const preGame = finalStatus === "SCHEDULED";
      if (preGame) {
        if (existing && (existing.homeScore != null || existing.awayScore != null)) {
          updateData.homeScore = null;
          updateData.awayScore = null;
        }
      } else {
        if (typeof m.homeScore === "number") updateData.homeScore = m.homeScore;
        if (typeof m.awayScore === "number") updateData.awayScore = m.awayScore;
      }
      if (m.playoffRound) updateData.playoffRound = m.playoffRound;
      if (m.playoffConference !== undefined) updateData.playoffConference = m.playoffConference;
      if (m.playoffStageId) updateData.playoffStageId = m.playoffStageId;

      const savedMatch = await prisma.match.upsert({
        where: { league_externalId: { league: m.league, externalId } },
        update: updateData,
        create: {
          league: m.league,
          externalId,
          homeTeamId: homeId,
          awayTeamId: awayId,
          homeScore: m.homeScore ?? null,
          awayScore: m.awayScore ?? null,
          status: m.status,
          startTime: new Date(m.startTime),
          playoffRound: m.playoffRound ?? null,
          playoffConference: m.playoffConference ?? null,
          playoffStageId: m.playoffStageId ?? null,
        },
        select: { id: true },
      });
      // 날씨 — diary 가 실어오면 cache 에 저장 (poller 의 다른 필드 push 는 건드리지 않음)
      if (m.environment !== undefined) {
        await prisma.theSportsMatchCache.upsert({
          where: { matchId: savedMatch.id },
          update: { environment: m.environment as Prisma.InputJsonValue },
          create: { matchId: savedMatch.id, tsMatchId: m.tsMatchId, detailLive: {}, environment: m.environment as Prisma.InputJsonValue },
        });
      }
      upserted++;
    } catch (e) {
      console.warn(`[ts-matches] upsert fail ${m.league}/${m.tsMatchId}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    upserted,
    skippedNoTeam,
    skippedDuplicate,
    startTimeFixed,
    received: body.matches.length,
  });
}
