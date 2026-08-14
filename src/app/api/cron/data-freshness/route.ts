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
//     킥오프 2h 내 예측 70%, 몸값 7h 전, 정규리그 순위 정체 1건(J3 142h).
//     비수기 리그·컵대회를 안 거르면 UCL·UEL 이 1,374h 정체로 잡혀 매일 오탐이 된다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";
import { recordCronRun } from "@/lib/cron-registry";
import { getPlayerCareerByTs } from "@/app/transfers/[id]/career-data";
import { tsPlayerToAf } from "@/lib/players/ts-af-map";
import { getTheSportsInjuriesByTeam } from "@/lib/sports/thesports/injuries";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    .filter(([lg]) => active.has(lg) && !CUP_LEAGUE.test(lg))
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
    injuries: await run("injuries", () => checkInjuries(findings)),
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
