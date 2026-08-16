// /api/cron/data-freshness — 캐시·파이프라인에 굳은 "조용한 결손"을 사람 대신 매일 확인한다.
//
// 왜 필요한가. 2026-08-14 선수 경력표가 2017/2018 에서 끊긴 채 며칠을 서빙했다.
// api-sports 가 분당 한도를 HTTP 200 + errors 로 답하는 걸 빈 데이터로 삼켜, 시즌이
// 통째로 빠진 결과가 캐시에 굳은 것이다. 응답은 200, 쿼터 잔량 정상, 에러 로그도 없다 —
// 기존 감시(endpoint-monitor·data-quality·cron-freshness)는 "응답이 오나 · cron 이 돌았나"를
// 보므로 이런 결손은 원천적으로 안 걸린다. 발견은 늘 사용자 눈이었다.
//
// 설계 원칙 두 가지.
//  1. 판정은 개별이 아니라 집단 비율로. 선수 한 명의 현 시즌 무출전(부상·정지)은 정상이고,
//     파이프라인이 고장나면 표본이 같이 뒤처진다.
//  2. 임계는 짐작이 아니라 실측 위에 세운다. 2026-08-14 실측 — 스코어 결손 0/1116,
//     킥오프 2h 내 예측 70%, 몸값 7h 전, 정규리그 순위 정체 1건(J3 142h — 이 1건은 실은
//     오탐이었다. 아래 SUPPORTED_LEAGUES 주석 참고. 임계 근거로 재사용하지 말 것).
//     비수기 리그·컵대회를 안 거르면 UCL·UEL 이 1,374h 정체로 잡혀 매일 오탐이 된다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";
import { recordCronRun } from "@/lib/cron-registry";
import { getPlayerCareerByTs } from "@/app/transfers/[id]/career-data";
import { tsPlayerToAf } from "@/lib/players/ts-af-map";
import { getTheSportsInjuriesByTeam } from "@/lib/sports/thesports/injuries";
import rawCoaches from "../../../../../data/team-coaches.json";
import rawTransferTeams from "../../../../../data/transfer-league-teams.json";
import rawNonSoccerCoaches from "../../../../../data/nonsoccer-coaches.json";
import { SOCCER_LEAGUES } from "@/lib/sports/types";
import { ALL_LEAGUES } from "@/lib/sports/sport-leagues";
import { fetchSoccerByDate } from "@/lib/sports/live-scores";
import { buildOrphanDedup } from "@/lib/sports/orphan-dedup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 화면에 나오는 리그만 감시한다 — 목록에서 내려간 리그는 수집도 같이 멈추므로 "정체"가
 * 당연한 결과이고, 사용자 눈에 닿지도 않아 고칠 대상이 아니다.
 * 2026-08-08 J3 제외(사용자 결정) 이후 그 잔존 캐시가 `standings_stale` 을 매일 울렸다 —
 * DB 에 남은 종료 매치 때문에 "활성 리그"로 잡히기 때문. 매일 울리는 경보가 하나 섞이면
 * 알림 전체를 안 보게 되므로 오탐은 결손만큼 해롭다. [[health-check-false-positives]]
 * 나중에 그 리그를 다시 올리면 ALL_LEAGUES 등록과 함께 감시도 자동 복귀한다.
 */
const SUPPORTED_LEAGUES = new Set<string>(ALL_LEAGUES as readonly string[]);

/** 컵·대륙대회는 예선↔조별 전환 때 순위가 정상적으로 멈춘다 — 신선도 대상에서 뺀다. */
const CUP_LEAGUE = /(CUP|COPA|COUPE|POKAL|UCL|UEL|UECL|AFC_CL|LIBERTADORES|SUDAMERICANA|SUPER|FRIENDLY|CLUB_WC|LEAGUES_CUP|CHAMPIONS)/i;

const CAREER_SAMPLE = 12;
const CAREER_STALE_GAP = 2; // 현 시즌보다 2시즌 이상 뒤처지면 결손 의심
// 8/14 사고 당시 실측이 42%(5/12), 정상은 0%. 40% 로 두면 사고를 겨우 스치므로 25% 로 내린다.
// 표본에 현 시즌 무출전(부상·정지)이 한둘 섞여도 3명 미만이면 안 울린다.
const CAREER_ALERT_RATIO = 0.25;
const CAREER_ALERT_MIN = 3;
const SCORE_ALERT_RATIO = 0.03; // 실측 0% — 3% 넘으면 수집 고장
const PRED_MIN_MATCHES = 8; // 표본이 작으면 비율이 요동친다
const PRED_ALERT_RATIO = 0.5;
const MV_STALE_H = 48; // 일일 증분 크론 — 이틀 멈추면 이상
const STANDINGS_STALE_H = 72;
const STANDINGS_HARD_H = 168; // 하나라도 7일 넘으면 개수와 무관하게 알린다
const STANDINGS_ALERT_COUNT = 3;
// 감독 — 2026-08-15 실측: 대상 174팀 전원 보유(결손 0) · 스냅샷 323팀 · 한글명 323/323.
// 결손 5는 감독 교체기에 ts coach_id 가 잠깐 비는 폭(2026-06 실측 빅5 14팀은 af 폴백이 메운다)
// 위로 잡되, 사고급 유실은 놓치지 않는 선. 하한 300 은 8/15 사고 당시 273 을 걸러낸다.
// orphan 카드 중복 — af 날짜조회가 부분 응답이면 리그가 통째로 빠져 "중복 없음"으로 보인다.
// 2026-08-16 실측: 정상 300건대(8/16 312·8/22 300·8/23 299), 분당 한도에 걸린 응답은 167건.
// 주말·평일 편차가 크므로(8/18 63·8/19 67) 하한은 낮게 잡아 평일을 죽이지 않되, 반토막 난
// 부분 응답만 걸러낸다. 이 축은 "안 울리면 정상"이 아니라 "판정을 건너뛰었는지"를 함께 본다.
const ORPHAN_MIN_AF = 40;
const COACH_MISSING_ALERT = 5;
const COACH_ENTRY_FLOOR = 300;
const COACH_NO_KO_ALERT = 10;
const COACHES = rawCoaches as Record<string, { name: string; nameKo: string | null }>;
const TRANSFER_TEAMS = rawTransferTeams as Record<string, string>;
// 전 리그 감독 — 2026-08-15 실측: 축구 75개 리그 합산 952/1072(88.8%), 30% 미만 4개
// (WK_LEAGUE 0 · LIGA_MX 12 · ELSALVADOR_PD 17 · GUATEMALA_LN 17) · 비축구 8리그는 아래 실측.
// 얇은 리그는 소스 사정이라 개별로는 안 울리고, 그 개수가 배로 늘 때만 본다.
const COACH_LEAGUE_MIN_TEAMS = 8; // 표본이 작으면 비율이 요동친다
const COACH_LEAGUE_THIN_PCT = 0.3;
const COACH_ALL_RATIO = 0.7;
const COACH_THIN_LEAGUE_ALERT = 8;
// 비축구 실측 2026-08-15: 145/160 = 91% (미지원 4리그 제외 후).
const COACH_NONSOCCER_RATIO = 0.7;
// 비축구 감독 지원 리그 — build-nonsoccer-coaches 가 채우는 8개. CPBL·LMB·AIHL·NZIHL 은
// 소스 부재로 명시 미지원이라 분모에 넣으면 영구 오탐이 된다.
const NONSOCCER_COACH_LEAGUES = ["KBO", "MLB", "NPB", "NBA", "WNBA", "KBL", "WKBL", "NHL"];
const NONSOCCER_COACHES = rawNonSoccerCoaches as Record<string, unknown>;

interface Finding {
  kind: string;
  detail: string;
  samples?: string[];
}

/** 유럽 축구 시즌(8월 시작) 기준 현재 af 시즌 */
function currentAfSeason(now: Date): number {
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/** 선수 경력 — af 캐시에 부분 결과가 굳었는지. 표본은 몸값 상위(현역·노출 상위). */
async function checkCareer(now: Date, findings: Finding[]) {
  const season = currentAfSeason(now);
  const rows = await prisma.playerMarketValue.findMany({
    where: { currentValue: { not: null } },
    orderBy: { currentValue: "desc" },
    select: { id: true },
    take: CAREER_SAMPLE * 4, // af 매핑 없는 선수를 거르고도 표본이 차도록
  });
  const sample = rows.map((r) => r.id).filter((id) => tsPlayerToAf(id)).slice(0, CAREER_SAMPLE);

  const checked: { tsId: string; latest: number | null }[] = [];
  for (const tsId of sample) {
    try {
      const groups = await getPlayerCareerByTs(tsId);
      const seasons = groups.flatMap((g) => g.rows.map((r) => r.season));
      checked.push({ tsId, latest: seasons.length ? Math.max(...seasons) : null });
    } catch {
      checked.push({ tsId, latest: null }); // 조회 실패도 결손으로 센다
    }
  }
  const stale = checked.filter((c) => c.latest == null || c.latest <= season - CAREER_STALE_GAP);
  if (checked.length >= 5 && stale.length >= CAREER_ALERT_MIN && stale.length / checked.length >= CAREER_ALERT_RATIO) {
    findings.push({
      kind: "career_gap",
      detail: `선수 경력 — 몸값 상위 ${checked.length}명 중 ${stale.length}명이 ${season} 시즌까지 안 옵니다`,
      samples: stale.slice(0, 3).map((s) => `${s.tsId}(${s.latest ?? "없음"})`),
    });
  }
  return { sampled: checked.length, stale: stale.length };
}

/** 종료된 지 6시간 지났는데 점수가 없는 매치 — 수집이 멈춘 신호 */
async function checkScores(now: Date, findings: Finding[]) {
  const from = new Date(now.getTime() - 7 * 86400_000);
  const to = new Date(now.getTime() - 6 * 3600_000);
  const where = { status: "FINISHED", startTime: { gte: from, lte: to } };
  const total = await prisma.match.count({ where });
  const missing = await prisma.match.count({
    where: { ...where, OR: [{ homeScore: null }, { awayScore: null }] },
  });
  if (total >= 50 && missing / total >= SCORE_ALERT_RATIO) {
    const rows = await prisma.match.findMany({
      where: { ...where, OR: [{ homeScore: null }, { awayScore: null }] },
      select: { league: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
      take: 3,
    });
    findings.push({
      kind: "score_missing",
      detail: `종료 매치 점수 결손 — 최근 7일 ${total}경기 중 ${missing}경기 (${Math.round((missing / total) * 100)}%)`,
      samples: rows.map((r) => `${r.league} ${r.homeTeam?.name} vs ${r.awayTeam?.name}`),
    });
  }
  return { total, missing };
}

/** 킥오프 임박인데 예측이 없는 매치 — 예측 지원 리그만(미지원 리그의 0% 는 정상) */
async function checkPredictions(now: Date, findings: Finding[]) {
  const supported = new Set(
    (
      await prisma.match.groupBy({
        by: ["league"],
        where: { startTime: { gte: new Date(now.getTime() - 30 * 86400_000) }, predHome: { not: null } },
        _count: true,
      })
    ).map((r) => r.league),
  );
  const soon = await prisma.match.findMany({
    where: { status: "SCHEDULED", startTime: { gte: now, lte: new Date(now.getTime() + 2 * 3600_000) } },
    select: { league: true, predHome: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  const target = soon.filter((m) => supported.has(m.league));
  const covered = target.filter((m) => m.predHome != null).length;
  if (target.length >= PRED_MIN_MATCHES && covered / target.length < PRED_ALERT_RATIO) {
    findings.push({
      kind: "prediction_gap",
      detail: `킥오프 2시간 내 예측 결손 — ${target.length}경기 중 ${covered}경기만 예측 있음`,
      samples: target.filter((m) => m.predHome == null).slice(0, 3).map((m) => `${m.league} ${m.homeTeam?.name} vs ${m.awayTeam?.name}`),
    });
  }
  return { target: target.length, covered };
}

/** 몸값 피드 — 일일 증분 크론이 멈추면 순위·선수 카드가 통째로 옛 값이 된다 */
async function checkMarketValues(now: Date, findings: Finding[]) {
  const agg = await prisma.playerMarketValue.aggregate({ _max: { updatedAt: true } });
  const last = agg._max.updatedAt;
  const ageH = last ? Math.round((now.getTime() - last.getTime()) / 3600_000) : null;
  if (ageH == null || ageH > MV_STALE_H) {
    findings.push({
      kind: "market_value_stale",
      detail: `몸값 피드 — 마지막 갱신이 ${ageH ?? "기록 없음"}시간 전입니다`,
    });
  }
  return { ageH };
}

/** 순위 — 시즌 중인 정규리그만. 비수기·컵대회 정체는 정상이라 거른다. */
async function checkStandings(now: Date, findings: Finding[]) {
  const active = new Set(
    (
      await prisma.match.groupBy({
        by: ["league"],
        where: { status: "FINISHED", startTime: { gte: new Date(now.getTime() - 14 * 86400_000) } },
        _count: true,
      })
    ).map((r) => r.league),
  );
  const [ts, af] = await Promise.all([
    prisma.theSportsStandingsCache.findMany({ select: { league: true, updatedAt: true } }),
    prisma.apiFootballStandingsCache.findMany({ select: { league: true, updatedAt: true } }),
  ]);
  const newest = new Map<string, Date>();
  for (const r of [...ts, ...af]) {
    const prev = newest.get(r.league);
    if (!prev || r.updatedAt > prev) newest.set(r.league, r.updatedAt);
  }
  const stale = [...newest]
    .filter(([lg]) => SUPPORTED_LEAGUES.has(lg) && active.has(lg) && !CUP_LEAGUE.test(lg))
    .map(([lg, at]) => ({ lg, ageH: Math.round((now.getTime() - at.getTime()) / 3600_000) }))
    .filter((s) => s.ageH > STANDINGS_STALE_H)
    .sort((a, b) => b.ageH - a.ageH);

  const hard = stale.filter((s) => s.ageH > STANDINGS_HARD_H);
  if (stale.length >= STANDINGS_ALERT_COUNT || hard.length > 0) {
    findings.push({
      kind: "standings_stale",
      detail: `순위 정체 — 시즌 중인 정규리그 ${stale.length}개가 ${STANDINGS_STALE_H}시간 넘게 안 갱신됐습니다`,
      samples: stale.slice(0, 3).map((s) => `${s.lg} ${s.ageH}h`),
    });
  }
  return { stale: stale.length };
}

/**
 * 연기 추종 중복 — 같은 대진이 짧은 간격으로 두 행이면 유령 카드가 화면에 떠 있는 것.
 *
 * 왜. 연기·시간변경을 소스 하나만 반영하면 다른 소스 행이 옛 시각에 남아 같은 경기가
 * 두 장으로 보인다(2026-08-16 라리가 — 배당 없는 카드 신고의 정체). 정리 잡
 * (cleanup-duplicate-matches)은 미래 쌍을 종료 후로 미루므로, 그 사이 노출을 여기서 잡는다.
 *
 * 오탐 게이트: ① 야구 제외(더블헤더 정상) ② 킥오프 간격 12h 미만 쌍만(하키 친선
 * 백투백 21h 실측 통과) ③ SCHEDULED/LIVE 만(종료 쌍은 정리 잡 담당).
 * 기준선 실측(2026-08-16): 라리가 정리 후 0건.
 */
const DUP_PAIR_GAP_MS = 12 * 3600 * 1000;
const DUP_BASEBALL_EXEMPT = new Set(["KBO", "NPB", "MLB", "CPBL", "LMB", "KBO_FUTURES", "NPB_MINOR", "WBC", "CARIBBEAN_SERIES"]);

/**
 * /scores 카드 중복 사각지대 — af 날짜조회 orphan 이 DB 매치와 같은 경기인데 이름이 양쪽 다
 * 어긋나 판정을 통과하는 유형. 화면엔 카드가 두 장 뜨는데 어디에도 에러가 없어 사람 눈에만 걸린다
 * (2026-08-16 중국 리그투를 사용자가 발견 — 6경기가 8장으로).
 *
 * 판정은 이름을 보지 않는다 — af 경기 수가 DB 보다 많지 않은데 orphan 이 남는 리그를 수량으로
 * 잡으므로 표기가 아무리 갈려도 걸린다. 그 리그의 af 경기는 원래 전부 DB 에 있어야 하기 때문.
 * (af > DB 인 리그는 DB 미적재 군소·친선이 섞여 정상 orphan 이 많다 — 대상에서 뺀다.)
 */
async function checkOrphanCardDups(now: Date, findings: Finding[]) {
  const dateStr = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const dated = await fetchSoccerByDate(dateStr);
  // af 총건수가 평소보다 급감했으면 분당 한도에 걸려 리그가 통째로 빠진 것 — 그 결과로 판정하면
  // "중복 없음"으로 잘못 읽힌다(실측: 312건 → 167건). 판정을 건너뛰는 게 오탐보다 낫다.
  if (dated.length < ORPHAN_MIN_AF) {
    return { skipped: `af 응답 ${dated.length}건 — 부분 응답 의심, 판정 생략` };
  }
  const dayStartMs = new Date(`${dateStr}T00:00:00+09:00`).getTime();
  const matches = await prisma.match.findMany({
    where: {
      startTime: { gte: new Date(dayStartMs), lt: new Date(dayStartMs + 86400_000) },
    },
    select: {
      league: true, startTime: true, homeTeamId: true, awayTeamId: true, apiFixtureId: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
    },
  });
  const afExtIds = [
    ...new Set(dated.flatMap((d) => [d.homeTeamExtId, d.awayTeamExtId]).filter(Boolean) as string[]),
  ];
  const afTeamIdMap = new Map<string, Set<number>>();
  if (afExtIds.length) {
    const rows = await prisma.teamSourceId.findMany({
      where: { source: "api-football", externalId: { in: afExtIds } },
      select: { externalId: true, teamId: true },
    });
    for (const r of rows) {
      const s = afTeamIdMap.get(r.externalId) ?? new Set<number>();
      s.add(r.teamId);
      afTeamIdMap.set(r.externalId, s);
    }
  }
  const nearby = await prisma.match.findMany({
    where: {
      startTime: { gte: new Date(dayStartMs - 2 * 86400_000), lte: new Date(dayStartMs + 3 * 86400_000) },
    },
    select: { league: true, homeTeamId: true, awayTeamId: true },
  });
  const dedup = buildOrphanDedup(
    matches.map((m) => ({
      league: m.league,
      startTime: m.startTime,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeName: m.homeTeam.name,
      awayName: m.awayTeam.name,
      apiFixtureId: m.apiFixtureId,
    })),
    dated,
    afTeamIdMap,
    new Set(nearby.map((m) => `${m.league}|${m.homeTeamId}|${m.awayTeamId}`)),
  );

  const per = new Map<string, { af: number; db: number; orphan: number }>();
  for (const d of dated) {
    const e = per.get(d.league) ?? { af: 0, db: 0, orphan: 0 };
    e.af++;
    if (!dedup.isCovered(d)) e.orphan++;
    per.set(d.league, e);
  }
  for (const m of matches) {
    const e = per.get(m.league) ?? { af: 0, db: 0, orphan: 0 };
    e.db++;
    per.set(m.league, e);
  }
  const blind = [...per.entries()]
    .filter(([, v]) => v.af > 0 && v.db > 0 && v.orphan > 0 && v.af <= v.db)
    .sort((a, b) => b[1].orphan - a[1].orphan);

  if (blind.length) {
    // 양팀 af id 가 이미 우리 Team 에 물려 있으면 이름 문제가 아니다 — 처방이 갈리므로 구분해 알린다.
    const mappedOnly = blind.every(([lg]) =>
      dated
        .filter((d) => d.league === lg && !dedup.isCovered(d))
        .every(
          (d) =>
            (d.homeTeamExtId ? afTeamIdMap.has(d.homeTeamExtId) : false) &&
            (d.awayTeamExtId ? afTeamIdMap.has(d.awayTeamExtId) : false),
        ),
    );
    findings.push({
      kind: "orphan_card_dup",
      detail:
        `/scores 카드 중복 의심 — ${blind.length}개 리그에서 af 경기가 DB 보다 많지 않은데 보강 카드가 남았습니다` +
        (mappedOnly
          ? " (양팀 af 매핑 있음 → 이름이 아니라 킥오프 날짜 불일치 의심)"
          : " (팀 이름이 양쪽 다 어긋나는 유형 → af 팀 id 매핑 필요)"),
      samples: blind.slice(0, 6).map(([lg, v]) => `${lg} af${v.af}/DB${v.db} 잔여${v.orphan}`),
    });
  }
  return { checked: dated.length, blindLeagues: blind.length };
}

async function checkRescheduleDups(now: Date, findings: Finding[]) {
  const ms = await prisma.match.findMany({
    where: {
      startTime: { gte: new Date(now.getTime() - 15 * 3600_000), lte: new Date(now.getTime() + 30 * 3600_000) },
      status: { in: ["SCHEDULED", "LIVE"] },
    },
    select: {
      id: true, league: true, homeTeamId: true, awayTeamId: true, startTime: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
    },
  });
  const groups = new Map<string, typeof ms>();
  for (const m of ms) {
    if (DUP_BASEBALL_EXEMPT.has(m.league)) continue;
    const k = `${m.league}|${m.homeTeamId}|${m.awayTeamId}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const samples: string[] = [];
  let dups = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const times = arr.map((m) => m.startTime.getTime()).sort((a, b) => a - b);
    let close = false;
    for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] < DUP_PAIR_GAP_MS) close = true;
    if (!close) continue;
    dups++;
    if (samples.length < 5) {
      samples.push(`${arr[0].league} ${arr[0].homeTeam.name} vs ${arr[0].awayTeam.name} (${arr.map((m) => `#${m.id}`).join("·")})`);
    }
  }
  if (dups > 0) {
    findings.push({
      kind: "reschedule_dup",
      detail: `같은 대진 중복 노출 — ${dups}쌍이 12시간 안 간격으로 두 행입니다 (연기 추종 시차 유령 의심)`,
      samples,
    });
  }
  return { dups, checked: ms.length };
}

/**
 * LOL 리더보드 — LeagueLeader LOL 행(KDA·CS·KILL)이 조용히 동결됐는지.
 *
 * 왜. BALLDONTLIE 키가 2026-06-12 죽었는데 잡이 빈 결과를 조용히 반환(safe 격리라
 * 에러도 안 남음)해 두 달 동결을 사용자 눈으로 발견했다(8/15 lolGames 자체 집계로 교체).
 * 소스를 바꿔도 사고 계열은 같다 — 잡은 돌고 에러도 없는데 데이터만 멈춘다.
 *
 * 오탐 게이트: 최근 14일 LCK 종료 매치가 있을 때만 판정. 비시즌·스플릿 휴지기의
 * 정체는 정상이다. 리더 잡은 매일 1회라 60h(이틀+여유)면 두 번 연속 실패다.
 */
const LOL_LEADER_STALE_H = 60; // 8/15 실측 0h (매일 갱신)
const LOL_LEADER_ROW_FLOOR = 15; // 정상 = KDA·CS·KILL 각 10 = 최신 시즌 30행

async function checkLolLeaders(now: Date, findings: Finding[]) {
  const recentFinished = await prisma.match.count({
    where: { league: "LOL", status: "FINISHED", startTime: { gte: new Date(now.getTime() - 14 * 86400_000) } },
  });
  if (recentFinished === 0) return { skipped: "offseason" };

  const agg = await prisma.leagueLeader.aggregate({
    where: { league: "LOL" },
    _max: { fetchedAt: true },
    _count: true,
  });
  const last = agg._max.fetchedAt;
  const ageH = last ? Math.round((now.getTime() - last.getTime()) / 3600_000) : null;
  if (ageH == null || ageH > LOL_LEADER_STALE_H) {
    findings.push({
      kind: "lol_leaders_stale",
      detail: `LOL 리더보드 동결 — 시즌 중인데 마지막 갱신이 ${ageH ?? "기록 없음"}시간 전입니다 (league-leaders 잡의 lolGames 집계 확인)`,
    });
  } else if (agg._count < LOL_LEADER_ROW_FLOOR) {
    findings.push({
      kind: "lol_leaders_shrink",
      detail: `LOL 리더보드 행이 줄었습니다 — ${agg._count}행 (하한 ${LOL_LEADER_ROW_FLOOR}, 실측 30)`,
    });
  }
  return { ageH, rows: agg._count, recentFinished };
}

/**
 * 부상자 명단 — /injuries 가 통째로 비는 걸 사람 대신 잡는다.
 *
 * 왜. 2026-08 사용자가 /injuries/EPL 에서 "부상자가 한 팀만 나온다"를 눈으로 찾았다.
 * 페이지가 force-dynamic 이라 렌더마다 DB 를 치는데 실패를 catch{} 로 삼켜 빈 명단이
 * 그대로 그려진다 — 새로고침하면 정상이라 로그에도 안 남는다. 한 달에 한 번꼴로 반복됐다.
 *
 * 대상은 소스가 확실히 있는 리그만. K리그·J리그·사우디는 af 가 현 시즌 injuries 를
 * 아예 커버하지 않아(2026-08 실측 coverage.injuries=false) 늘 0이고, 넣으면 매일 울려서
 * 아무도 안 보게 된다. 그 리그들의 "데이터 미제공" 은 화면에서 밝히는 게 맞는 처리다.
 *
 * 임계는 실측 위에 — 같은 날 EPL 16 · 라리가 18 · 분데스 14 · 세리에A 12 · 리그1 16 · MLS 30팀.
 * 최저가 12팀이라 2팀 이하는 정상 변동으로 설명되지 않는다.
 */
const INJURY_LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS"];
const INJURY_MIN_TEAMS = 2;

async function checkInjuries(findings: Finding[]) {
  const empty: string[] = [];
  const counts: Record<string, number> = {};
  for (const lg of INJURY_LEAGUES) {
    const teams = await prisma.team.findMany({ where: { league: lg }, select: { id: true } });
    if (!teams.length) continue; // 팀 자체가 없으면 이 리그는 미온보딩 — 판정 대상 아님
    const byTeam = await getTheSportsInjuriesByTeam(teams.map((t) => t.id));
    const withInjury = [...byTeam.values()].filter((v) => v.length > 0).length;
    counts[lg] = withInjury;
    if (withInjury <= INJURY_MIN_TEAMS) empty.push(`${lg} ${withInjury}팀`);
  }
  if (empty.length) {
    findings.push({
      kind: "injuries_empty",
      detail: `부상자 명단이 비었습니다 — 소스가 있는 리그인데 부상자 있는 팀이 ${INJURY_MIN_TEAMS}팀 이하`,
      samples: empty,
    });
  }
  return counts;
}

/**
 * 감독 스냅샷 — 주간 빌더(weekly-static-refresh 일요일 05:00)가 조용히 망가졌는지.
 *
 * 이 축이 필요한 이유. 2026-08-15 build-team-coaches 가 결과를 통째로 덮어쓰는 구조라
 * 대상 집합에서 빠진 강등팀 17명이 소리 없이 사라졌다(웨스트햄·볼프스부르크 등 — ts 엔
 * coach_id 가 그대로 있었으니 감독 교체가 아니라 순수 유실). 빌더는 병합으로 고쳤지만
 * 같은 계열 사고를 사람 눈이 아니라 여기서 잡는다.
 *
 * 세 갈래로 본다. 대상 팀 결손은 "새로 안 채워진 것", 총 엔트리 급감은 "있던 게 없어진 것",
 * 한글명 결손은 "로마자가 화면에 노출되는 것" — 원인이 달라서 하나로는 못 잡는다.
 */
async function checkCoaches(findings: Finding[]) {
  const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
  const big5 = await prisma.teamSourceId.findMany({
    where: { source: "thesports", team: { league: { in: BIG5 } } },
    select: { externalId: true },
  });
  const target = [...new Set([...big5.map((r) => r.externalId), ...Object.keys(TRANSFER_TEAMS)])];
  const missing = target.filter((t) => !COACHES[t]);
  const entries = Object.values(COACHES);
  const noKo = entries.filter((c) => !c.nameKo);

  if (missing.length >= COACH_MISSING_ALERT) {
    findings.push({
      kind: "coach_missing",
      detail: `이적시장 대상 팀에 감독이 없습니다 — ${missing.length}/${target.length}팀 (실측 0)`,
      samples: missing.slice(0, 8).map((t) => `${TRANSFER_TEAMS[t] ?? "BIG5"} ${t}`),
    });
  }
  if (entries.length < COACH_ENTRY_FLOOR) {
    findings.push({
      kind: "coach_registry_shrink",
      detail: `감독 스냅샷이 줄었습니다 — ${entries.length}팀 (하한 ${COACH_ENTRY_FLOOR}, 실측 323). 빌더가 기존 항목을 덮어썼는지 확인`,
    });
  }
  if (noKo.length >= COACH_NO_KO_ALERT) {
    findings.push({
      kind: "coach_name_not_ko",
      detail: `감독 한글명이 비었습니다 — ${noKo.length}/${entries.length}명이 로마자로 노출 (실측 0)`,
      samples: noKo.slice(0, 8).map((c) => c.name),
    });
  }
  return { target: target.length, missing: missing.length, entries: entries.length, noKo: noKo.length };
}

/**
 * 감독 — 8리그 스냅샷 밖 전체. 위 checkCoaches 가 보는 team-coaches.json 은 빅5+확장 174팀뿐이라
 * 나머지 수백 리그가 통째로 비어도 안 걸린다.
 *
 * 소스가 둘로 나뉜다. 축구는 Team.coach(collect-all-team-coaches 가 ts coach/list 로 채움),
 * 비축구 8리그(야구·농구·하키)는 data/nonsoccer-coaches.json. 파이프라인이 달라 따로 본다.
 *
 * 오탐 게이트가 핵심이다. 분모를 잘못 잡으면 정상이 사고로 보인다.
 *  · 종목 — ts 축구 coach/list 가 소스라 배구·하키·야구 리그는 원래 0%다 (SOCCER_LEAGUES 로 거름).
 *  · 컵 — 컵 네임스페이스 Team 은 감독을 안 채운다 (FA_CUP 0/98 실측).
 *  · ts 매핑 — 매핑 없는 팀은 빌더가 손댈 수 없어 분모에서 뺀다.
 *  · 비수기·소규모 — 최근 30일 종료매치 없는 리그와 8팀 미만은 판정 대상 아님.
 *
 * 판정은 개별 리그가 아니라 집단으로. 리그 하나가 얇은 건(LIGA_MX 12%) 소스 사정이고,
 * 파이프라인이 고장나면 전체가 같이 떨어진다.
 */
async function checkAllLeagueCoaches(now: Date, findings: Finding[]) {
  const soccer = new Set<string>(SOCCER_LEAGUES as readonly string[]);
  const active = new Set(
    (
      await prisma.match.groupBy({
        by: ["league"],
        where: { status: "FINISHED", startTime: { gte: new Date(now.getTime() - 30 * 86400_000) } },
        _count: true,
      })
    ).map((r) => r.league),
  );
  const mapped = new Set(
    (await prisma.teamSourceId.findMany({ where: { source: "thesports" }, select: { teamId: true } })).map((m) => m.teamId),
  );
  const teams = await prisma.team.findMany({ select: { id: true, league: true, coach: true } });

  // ── 축구 전 리그 ──
  const byLg = new Map<string, { tot: number; has: number }>();
  for (const t of teams) {
    if (!soccer.has(t.league) || CUP_LEAGUE.test(t.league) || !active.has(t.league) || !mapped.has(t.id)) continue;
    const e = byLg.get(t.league) ?? { tot: 0, has: 0 };
    e.tot++;
    if (t.coach) e.has++;
    byLg.set(t.league, e);
  }
  const lgs = [...byLg.entries()]
    .map(([lg, v]) => ({ lg, ...v, pct: v.has / v.tot }))
    .filter((r) => r.tot >= COACH_LEAGUE_MIN_TEAMS);
  const tot = lgs.reduce((s, r) => s + r.tot, 0);
  const has = lgs.reduce((s, r) => s + r.has, 0);
  const ratio = tot ? has / tot : 1;
  const thin = lgs.filter((r) => r.pct < COACH_LEAGUE_THIN_PCT).sort((a, b) => a.pct - b.pct);

  if (tot >= 200 && ratio < COACH_ALL_RATIO) {
    findings.push({
      kind: "coach_all_leagues_low",
      detail: `축구 전 리그 감독 커버리지 급락 — ${has}/${tot} (${Math.round(ratio * 100)}%, 실측 89%). collect-all-team-coaches 확인`,
      samples: thin.slice(0, 5).map((r) => `${r.lg} ${Math.round(r.pct * 100)}%`),
    });
  }
  if (thin.length >= COACH_THIN_LEAGUE_ALERT) {
    findings.push({
      kind: "coach_league_empty",
      detail: `감독이 거의 없는 축구 리그가 늘었습니다 — ${COACH_LEAGUE_THIN_PCT * 100}% 미만 ${thin.length}개 리그 (실측 4)`,
      samples: thin.slice(0, 8).map((r) => `${r.lg} ${r.has}/${r.tot}`),
    });
  }

  // ── 비축구 8리그 (파이프라인이 다름 — 축구 비율에 섞으면 서로를 가린다) ──
  let bTot = 0, bHas = 0;
  const bDetail: string[] = [];
  for (const lg of NONSOCCER_COACH_LEAGUES) {
    const t = teams.filter((x) => x.league === lg);
    if (!t.length) continue;
    const h = t.filter((x) => NONSOCCER_COACHES[String(x.id)]).length;
    bTot += t.length;
    bHas += h;
    bDetail.push(`${lg} ${h}/${t.length}`);
  }
  const bRatio = bTot ? bHas / bTot : 1;
  if (bTot >= 30 && bRatio < COACH_NONSOCCER_RATIO) {
    findings.push({
      kind: "coach_nonsoccer_low",
      detail: `비축구 감독 커버리지 급락 — ${bHas}/${bTot} (${Math.round(bRatio * 100)}%)`,
      samples: bDetail,
    });
  }

  return {
    soccerLeagues: lgs.length,
    soccerRatio: Math.round(ratio * 100),
    thinLeagues: thin.length,
    nonSoccer: `${bHas}/${bTot}`,
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const findings: Finding[] = [];

  // 축 하나가 터져도 나머지 점검은 계속한다 — 감시가 감시를 막으면 안 된다.
  const run = async <T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> => {
    try {
      return await fn();
    } catch (e) {
      const msg = (e as Error).message;
      findings.push({ kind: `${name}_check_failed`, detail: `${name} 점검 자체가 실패했습니다: ${msg}` });
      return { error: msg };
    }
  };

  const stats = {
    career: await run("career", () => checkCareer(now, findings)),
    scores: await run("scores", () => checkScores(now, findings)),
    predictions: await run("predictions", () => checkPredictions(now, findings)),
    marketValues: await run("marketValues", () => checkMarketValues(now, findings)),
    standings: await run("standings", () => checkStandings(now, findings)),
    lolLeaders: await run("lolLeaders", () => checkLolLeaders(now, findings)),
    rescheduleDups: await run("rescheduleDups", () => checkRescheduleDups(now, findings)),
    orphanCardDups: await run("orphanCardDups", () => checkOrphanCardDups(now, findings)),
    injuries: await run("injuries", () => checkInjuries(findings)),
    coaches: await run("coaches", () => checkCoaches(findings)),
    coachesAllLeagues: await run("coachesAllLeagues", () => checkAllLeagueCoaches(now, findings)),
  };

  if (findings.length > 0) {
    await sendTelegram(
      [
        `🚨 데이터 결손 감지 ${findings.length}건`,
        "",
        ...findings.flatMap((f) => [
          `📍 ${f.detail}`,
          ...(f.samples?.length ? [`   예: ${f.samples.join(" · ")}`] : []),
        ]),
        "",
        `⏰ ${now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
        "💥 영향: 화면에 옛 값이나 빈 값이 그대로 노출됩니다",
        "🔍 원인: api-sports 한도 응답을 빈 데이터로 삼켰거나, 수집 cron 이 멈췄거나, 캐시에 부분 결과가 굳음",
        "➡️ 확인: /api/cron/data-freshness 응답 · af 분당 한도 · 해당 cron 최근 실행",
      ].join("\n"),
    );
  }

  await recordCronRun("data-freshness", { ok: findings.length === 0, count: findings.length });

  return NextResponse.json({
    ok: findings.length === 0,
    checkedAt: now.toISOString(),
    findings,
    stats,
  });
}
