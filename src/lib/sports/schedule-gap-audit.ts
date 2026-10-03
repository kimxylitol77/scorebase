// 축구 리그 일정 공백 감시 — 원천(TheSports diary·api-football)엔 경기가 있는데 우리 DB 엔 없는 리그를 찾는다.
// 시즌 자동 탐지는 "DB 에 다가오는 경기가 있는 리그"만 보므로, 경기가 통째로 끊긴 리그(ISL·UAE 등)는 원리상 못 잡는다.
// 그래서 원천 쪽에서 거꾸로 훑는다(2026-10-03). 스크립트(audit-league-schedule-gaps)와 매일 cron 이 같이 쓴다.
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { TS_FOOTBALL_COMPETITION_ID } from "@/lib/sports/thesports/football-competitions";
import { TS_COVERED_EXCEPTIONS } from "@/lib/sports/ts-covered-exceptions";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { ALL_LEAGUES } from "@/lib/sports/collect-leagues";
import { tsInactiveLeagues } from "@/lib/sports/ts-coverage-fallback";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";

const DAY = 86400;

export interface ScheduleGap {
  league: string;
  db: number;
  ts: number;
  /** -1 = 조회 안 함 */
  af: number;
  tsCollects: boolean;
  afCollects: boolean;
  /** af 수집 목록에 아예 없음 */
  afUnregistered: boolean;
  reason: string;
}

// 세 원천(DB·ts·af)을 같은 UTC 날짜 경계로 센다 — 시각으로 자르면 경계 날 경기가 한쪽에만 잡혀 오탐이 난다
// (2026-10-03 A매치 휴식기: 다음 경기가 정확히 7일 뒤라 세리에A 가 "DB 0·af 3" 으로 잘못 나왔다).
function window(days: number, now: Date) {
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + days * DAY * 1000).toISOString().slice(0, 10);
  return { from, to, start: new Date(`${from}T00:00:00Z`), end: new Date(`${to}T23:59:59Z`) };
}

async function tsCounts(days: number, now: Date, deadline: number): Promise<Map<string, number>> {
  const byComp = new Map<string, number>();
  const { start, end } = window(days, now);
  const t0 = Math.floor(start.getTime() / 1000) + DAY / 2; // 각 UTC 날짜 정오 — diary 는 그 날짜 경기를 준다
  for (let i = 0; i <= days && Date.now() < deadline; i++) {
    const d = await thesportsGet<{ code: number; results?: Array<{ competition_id?: string; match_time?: number }> }>(
      "/v1/football/match/diary",
      { tsp: t0 + i * DAY } as never,
    ).catch(() => null);
    for (const m of d?.results ?? []) {
      if (!m.competition_id || !m.match_time) continue;
      const t = m.match_time * 1000;
      if (t < start.getTime() || t > end.getTime()) continue;
      byComp.set(m.competition_id, (byComp.get(m.competition_id) ?? 0) + 1);
    }
  }
  return byComp;
}

async function afCount(afId: number, days: number, now: Date): Promise<number> {
  const { from, to } = window(days, now);
  const y = now.getUTCFullYear();
  let best = 0;
  for (const season of [y, y - 1]) {
    const r = await fetch(`https://v3.football.api-sports.io/fixtures?league=${afId}&season=${season}&from=${from}&to=${to}`, {
      headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "" },
      signal: AbortSignal.timeout(15000),
    })
      .then((x) => x.json() as Promise<{ results?: number }>)
      .catch(() => null);
    best = Math.max(best, Number(r?.results ?? 0));
  }
  return best;
}

/** 공백 의심 리그 목록. budgetMs 를 넘기면 ts 조회를 거기서 끊는다(cron 시간 한도). */
export async function auditScheduleGaps(opts: { days?: number; now?: Date; budgetMs?: number } = {}): Promise<ScheduleGap[]> {
  const days = opts.days ?? 30;
  const now = opts.now ?? new Date();
  const deadline = Date.now() + (opts.budgetMs ?? 200_000);
  const inCollect = new Set<string>(ALL_LEAGUES);
  const mapping = tsLeagueMap as Array<{ code: string; tsId?: string; tsSeasonId?: string }>;
  const tsCovered = new Set(mapping.filter((e) => e.tsSeasonId).map((e) => e.code));
  const leagues = [...SOCCER_LEAGUES].sort();
  // collect 가 실적 0 으로 af 에 되돌리는 리그 — af 수집 중으로 본다(ts-coverage-fallback)
  const fallback = new Set<string>(
    await tsInactiveLeagues(leagues.filter((l) => inCollect.has(l) && tsCovered.has(l) && !TS_COVERED_EXCEPTIONS.has(l as never)), now),
  );
  const ts = await tsCounts(days, now, deadline);
  const { start, end } = window(days, now);
  const db = new Map(
    (await prisma.match.groupBy({ by: ["league"], where: { startTime: { gte: start, lte: end } }, _count: true })).map((g) => [g.league, g._count]),
  );

  const out: ScheduleGap[] = [];
  for (const lg of leagues) {
    const tsComp = TS_FOOTBALL_COMPETITION_ID[lg as keyof typeof TS_FOOTBALL_COMPETITION_ID] ?? mapping.find((e) => e.code === lg)?.tsId;
    // ts 대회 하나를 여러 리그가 조로 나눠 쓰면(카코넨 A·B·C + 위카코넨) ts 수는 합계라 리그별 비교가 안 된다 → af 로만 본다
    const shared = !!tsComp && mapping.filter((e) => e.tsId === tsComp).length > 1;
    const tsN = tsComp && !shared ? ts.get(tsComp) ?? 0 : 0;
    const dbN = db.get(lg) ?? 0;
    const tsCollects = !!TS_FOOTBALL_COMPETITION_ID[lg as keyof typeof TS_FOOTBALL_COMPETITION_ID];
    const afSkip = tsCovered.has(lg) && !TS_COVERED_EXCEPTIONS.has(lg as never) && !fallback.has(lg);
    const afCollects = inCollect.has(lg) && !afSkip;
    // af 는 DB 가 비었거나 ts 대비 크게 모자랄 때만 묻는다(쿼터 절약)
    const afId = API_FOOTBALL_LEAGUE_ID[lg];
    // af 로 수집 중인 리그는 collect 와 같은 7일 창으로 센다 — 첫 경기가 10일 뒤인 리그(UAE 2026-10)를 공백으로 오보하지 않게
    const afN = afId && (dbN === 0 || dbN < tsN * 0.5) ? await afCount(afId, afCollects ? Math.min(days, 7) : days, now) : -1;
    const src = Math.max(tsN, afN);
    // af 로 수집하는 리그는 collect 가 7일 앞까지만 받는다 — DB 에 경기가 있으면 먼 날짜 부족은 정상(리드타임)
    const leadTimeOnly = afCollects && dbN > 0 && days > 7;
    if (leadTimeOnly || src <= 0 || dbN >= Math.max(1, src * 0.5)) continue;
    const reason =
      !tsCollects && !afCollects
        ? inCollect.has(lg)
          ? "아무도 수집 안 함 — ts 수집 목록(TS_FOOTBALL_COMPETITION_ID) 밖 + af skip"
          : "아무도 수집 안 함 — ts 수집 목록 밖 + af 수집 대상(collect-leagues.ts) 아님"
        : tsCollects && tsN === 0 && !afCollects
          ? "ts 수집 대상인데 ts 에 경기 0 + af skip"
          : !afCollects && afN > 0 && tsN === 0
            ? "af 에만 경기 있음 + af 수집 꺼짐"
            : "수집은 켜져 있는데 DB 부족 — 팀 매핑·dedup 확인";
    out.push({ league: lg, db: dbN, ts: tsN, af: afN, tsCollects, afCollects, afUnregistered: !inCollect.has(lg), reason });
  }
  return out;
}

export function formatGap(g: ScheduleGap): string {
  return `${g.league} — DB ${g.db} · ts ${g.ts} · af ${g.af < 0 ? "-" : g.af}: ${g.reason}`;
}
