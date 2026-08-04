// /picks/strong 데이터 — 고확신 픽 목록 + 그 픽을 뒷받침하는 근거 + 기준의 실제 성적.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import {
  selectStrongPicks,
  STRONG_THRESHOLD,
  type StrongMarket,
  type StrongPick,
} from "@/lib/predict/strong-picks";

/** 예정 경기를 몇 시간 앞까지 볼지 — 예측 잡이 72h 창을 채우므로 그에 맞춘다 */
const WINDOW_HOURS = 72;

/** 날짜 네비에 띄울 지난 날짜 수 */
export const HISTORY_DAYS = 14;

/** 폼 산출에 쓰는 직전 경기 수 */
const FORM_GAMES = 5;

export interface StrongPickResult extends StrongPick {
  /** 채점 결과 — null 이면 아직 채점 전 */
  correct: boolean | null;
}

/** 선발 투수·골리 JSON 에서 화면에 쓸 만큼만 뽑은 것 */
export interface StarterBrief {
  name: string;
  /** 야구 = 평균자책, 하키 = GAA. 둘 다 낮을수록 좋다 */
  era: number | null;
}

export interface TeamForm {
  win: number;
  draw: number;
  loss: number;
}

/** 픽을 뒷받침하는 근거 — 전부 DB 실측이고, 없는 항목은 그냥 비운다 */
export interface PickEvidence {
  form: { home: TeamForm; away: TeamForm } | null;
  starter: { home: StarterBrief; away: StarterBrief } | null;
  /** 베팅사이트 평균 implied (vig 제거 저장값) — 시장과 얼마나 갈리는지 */
  market: { home: number; draw: number | null; away: number } | null;
}

export interface StrongPickMatch {
  matchId: number;
  league: string;
  startTime: Date;
  home: string;
  away: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  /** 1X2 확률 분할 바 — 셋 다 있을 때만 */
  winProb: { home: number; draw: number; away: number } | null;
  picks: StrongPickResult[];
  evidence: PickEvidence;
}

const MATCH_SELECT = {
  id: true,
  league: true,
  startTime: true,
  status: true,
  homeScore: true,
  awayScore: true,
  homeTeamId: true,
  awayTeamId: true,
  predHome: true,
  predDraw: true,
  predAway: true,
  predWinner: true,
  predCorrect: true,
  predHcPick: true,
  predHcProb: true,
  predHcLine: true,
  predHcCorrect: true,
  predOverPick: true,
  predOverProb: true,
  predOverCorrect: true,
  predDcPick: true,
  predDcProb: true,
  predDcCorrect: true,
  marketHome: true,
  marketDraw: true,
  marketAway: true,
  homeStarter: true,
  awayStarter: true,
  homeGoalie: true,
  awayGoalie: true,
  homeTeam: { select: { name: true, logoUrl: true } },
  awayTeam: { select: { name: true, logoUrl: true } },
} as const;

/** 어느 마켓이든 기준을 넘을 가능성이 있는 것만 — 최저 임계로 1차 거른다 */
const THRESHOLD_OR = [
  { predHcProb: { gte: STRONG_THRESHOLD.HANDICAP } },
  { predDcProb: { gte: STRONG_THRESHOLD.DOUBLE_CHANCE } },
  { predHome: { gte: STRONG_THRESHOLD["1X2"] } },
  { predAway: { gte: STRONG_THRESHOLD["1X2"] } },
  { predDraw: { gte: STRONG_THRESHOLD["1X2"] } },
  { predOverProb: { gte: STRONG_THRESHOLD.OVER_UNDER } },
  { predOverProb: { lte: 1 - STRONG_THRESHOLD.OVER_UNDER } },
];

/** "2026-08-04"(KST) → 그날 00:00~24:00 의 UTC 구간 */
export function kstDayRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00+09:00`);
  return { start, end: new Date(start.getTime() + 24 * 3600_000) };
}

/** 오늘(KST) yyyy-mm-dd */
export function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

const marketCorrect = (
  m: { predCorrect: boolean | null; predHcCorrect: boolean | null; predOverCorrect: boolean | null; predDcCorrect: boolean | null },
  market: StrongMarket,
): boolean | null =>
  market === "1X2" ? m.predCorrect
  : market === "HANDICAP" ? m.predHcCorrect
  : market === "OVER_UNDER" ? m.predOverCorrect
  : m.predDcCorrect;

/** 선발/골리 JSON — 이름과 ERA(하키는 GAA)만. 형식이 리그마다 달라 방어적으로 읽는다 */
function parseStarterBrief(raw: string | null): StarterBrief | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { name?: string; era?: number; gaa?: number };
    if (!j?.name) return null;
    const era = typeof j.era === "number" ? j.era : typeof j.gaa === "number" ? j.gaa : null;
    // KBO·NPB 는 이미 한글로 저장돼 있다 — 그대로 두지 않으면 사전 조회가 헛돌며 경고만 남는다
    const name = /[가-힣]/.test(j.name) ? j.name : toKoreanPlayerName(j.name) || j.name;
    return { name, era };
  } catch {
    return null;
  }
}

/**
 * 각 팀의 직전 FORM_GAMES 경기 성적.
 * ⚠️ 반드시 그 경기 시작 시각 이전 경기만 센다 — 지난 날짜를 볼 때 경기 이후 결과가
 *    섞이면 "그때는 알 수 없던 정보"로 픽을 정당화하게 된다.
 */
async function loadForms(
  targets: { teamIds: number[]; asOf: Date }[],
): Promise<Map<string, TeamForm>> {
  const ids = [...new Set(targets.flatMap((t) => t.teamIds))];
  const out = new Map<string, TeamForm>();
  if (!ids.length) return out;

  const latestAsOf = new Date(Math.max(...targets.map((t) => t.asOf.getTime())));
  const rows = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      homeScore: { not: null },
      awayScore: { not: null },
      startTime: { lt: latestAsOf },
      OR: [{ homeTeamId: { in: ids } }, { awayTeamId: { in: ids } }],
    },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true },
    orderBy: { startTime: "desc" },
    take: ids.length * FORM_GAMES * 6, // 팀별로 넉넉히 — asOf 로 잘라내면 줄어든다
  });

  for (const t of targets) {
    for (const teamId of t.teamIds) {
      const form: TeamForm = { win: 0, draw: 0, loss: 0 };
      let seen = 0;
      for (const r of rows) {
        if (seen >= FORM_GAMES) break;
        if (r.startTime >= t.asOf) continue;
        const isHome = r.homeTeamId === teamId;
        if (!isHome && r.awayTeamId !== teamId) continue;
        const gf = isHome ? r.homeScore! : r.awayScore!;
        const ga = isHome ? r.awayScore! : r.homeScore!;
        if (gf > ga) form.win++;
        else if (gf < ga) form.loss++;
        else form.draw++;
        seen++;
      }
      if (seen > 0) out.set(`${t.asOf.getTime()}:${teamId}`, form);
    }
  }
  return out;
}

/**
 * 고확신 픽 목록.
 * @param date KST yyyy-mm-dd. 주면 그날 경기(결과 포함), 없으면 앞으로 72시간의 예정 경기.
 */
export async function loadStrongPicks(date?: string): Promise<StrongPickMatch[]> {
  const now = new Date();
  const range = date ? kstDayRange(date) : { start: now, end: new Date(now.getTime() + WINDOW_HOURS * 3600_000) };

  const rows = await prisma.match.findMany({
    where: {
      startTime: { gte: range.start, lte: range.end },
      ...(date ? {} : { status: "SCHEDULED" }),
      OR: THRESHOLD_OR,
    },
    select: MATCH_SELECT,
    orderBy: { startTime: "asc" },
    take: 200,
  });

  const picked = rows
    .map((m) => {
      const home = toKoreanTeamName(m.homeTeam?.name ?? "", m.league) || (m.homeTeam?.name ?? "");
      const away = toKoreanTeamName(m.awayTeam?.name ?? "", m.league) || (m.awayTeam?.name ?? "");
      return { m, home, away, picks: selectStrongPicks(m, home, away) };
    })
    // 1차 필터를 통과했어도 실제 기준 미달일 수 있다
    .filter((x) => x.picks.length > 0);

  const forms = await loadForms(
    picked.map((x) => ({ teamIds: [x.m.homeTeamId, x.m.awayTeamId], asOf: x.m.startTime })),
  );

  return picked.map(({ m, home, away, picks }) => {
    const key = (teamId: number) => forms.get(`${m.startTime.getTime()}:${teamId}`);
    const hForm = key(m.homeTeamId);
    const aForm = key(m.awayTeamId);
    const hStarter = parseStarterBrief(m.homeStarter ?? m.homeGoalie);
    const aStarter = parseStarterBrief(m.awayStarter ?? m.awayGoalie);

    return {
      matchId: m.id,
      league: m.league,
      startTime: m.startTime,
      home,
      away,
      homeLogo: m.homeTeam?.logoUrl ?? null,
      awayLogo: m.awayTeam?.logoUrl ?? null,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      finished: m.status === "FINISHED",
      winProb:
        m.predHome != null && m.predAway != null
          ? { home: m.predHome, draw: m.predDraw ?? 0, away: m.predAway }
          : null,
      picks: picks.map((p) => ({ ...p, correct: marketCorrect(m, p.market) })),
      evidence: {
        form: hForm && aForm ? { home: hForm, away: aForm } : null,
        starter: hStarter && aStarter ? { home: hStarter, away: aStarter } : null,
        market:
          m.marketHome != null && m.marketAway != null
            ? { home: m.marketHome, draw: m.marketDraw, away: m.marketAway }
            : null,
      },
    };
  });
}

export interface MarketAccuracy {
  total: number;
  hit: number;
  rate: number;
}

export interface StrongAccuracy extends MarketAccuracy {
  /** 마켓별 실측 — 픽 카드에 "이 기준의 과거 성적"으로 붙인다 */
  byMarket: Record<StrongMarket, MarketAccuracy>;
}

/**
 * 이 기준의 실제 성적 — 화면에 "근거"로 내보내는 수치라 반드시 DB 실측이어야 한다.
 * 마켓별 count 두 번씩(전체·적중)이라 전수 스캔보다 가볍다.
 */
export async function loadStrongAccuracy(): Promise<StrongAccuracy> {
  const hcWhere = { predHcCorrect: { not: null }, predHcProb: { gte: STRONG_THRESHOLD.HANDICAP } };
  const dcWhere = { predDcCorrect: { not: null }, predDcProb: { gte: STRONG_THRESHOLD.DOUBLE_CHANCE } };
  const ouWhere = {
    predOverCorrect: { not: null },
    OR: [
      { predOverProb: { gte: STRONG_THRESHOLD.OVER_UNDER } },
      { predOverProb: { lte: 1 - STRONG_THRESHOLD.OVER_UNDER } },
    ],
  };
  const x12Where = {
    predCorrect: { not: null },
    OR: [
      { predHome: { gte: STRONG_THRESHOLD["1X2"] } },
      { predDraw: { gte: STRONG_THRESHOLD["1X2"] } },
      { predAway: { gte: STRONG_THRESHOLD["1X2"] } },
    ],
  };

  const [hcN, hcHit, dcN, dcHit, ouN, ouHit, x12N, x12Hit] = await Promise.all([
    prisma.match.count({ where: hcWhere }),
    prisma.match.count({ where: { ...hcWhere, predHcCorrect: true } }),
    prisma.match.count({ where: dcWhere }),
    prisma.match.count({ where: { ...dcWhere, predDcCorrect: true } }),
    prisma.match.count({ where: ouWhere }),
    prisma.match.count({ where: { ...ouWhere, predOverCorrect: true } }),
    prisma.match.count({ where: x12Where }),
    prisma.match.count({ where: { ...x12Where, predCorrect: true } }),
  ]);
  const mk = (total: number, hit: number): MarketAccuracy => ({
    total,
    hit,
    rate: total ? (hit / total) * 100 : 0,
  });
  const total = hcN + dcN + ouN + x12N;
  const hit = hcHit + dcHit + ouHit + x12Hit;
  return {
    ...mk(total, hit),
    byMarket: {
      HANDICAP: mk(hcN, hcHit),
      DOUBLE_CHANCE: mk(dcN, dcHit),
      OVER_UNDER: mk(ouN, ouHit),
      "1X2": mk(x12N, x12Hit),
    },
  };
}

export interface DailyStat {
  /** KST yyyy-mm-dd */
  date: string;
  picks: number;
  hits: number;
}

/**
 * 최근 N일 일자별 성적 — 날짜 네비 겸 막대 그래프의 소스.
 * 마켓 4개를 각각 세야 해서 SQL 한 방으로 집계한다(경기 수만큼 픽이 아니라 픽 수 기준).
 */
export async function loadDailySummary(days = HISTORY_DAYS): Promise<DailyStat[]> {
  // 하루 더 조회하고 가장 오래된 날을 버린다 — "N일 전 그 시각"부터라 경계 날짜는
  // 반만 잡히고, 그러면 막대 숫자가 그날 목록과 어긋난다(실측으로 확인).
  const queryDays = days + 1;
  const hc = STRONG_THRESHOLD.HANDICAP;
  const dc = STRONG_THRESHOLD.DOUBLE_CHANCE;
  const x12 = STRONG_THRESHOLD["1X2"];
  const ou = STRONG_THRESHOLD.OVER_UNDER;

  // ⚠️ startTime 은 timestamp **without** time zone 이라 at time zone 을 한 번만 쓰면
  //    KST→UTC 로 거꾸로 해석돼 날짜가 하루 밀린다. UTC 로 못박은 뒤 KST 로 옮겨야 한다.
  // ⚠️ 조건은 selectStrongPicks 와 정확히 같아야 한다 — 다르면 막대 숫자와 그날 목록이 어긋난다.
  //    pick 필드가 비어 있으면 화면에 픽이 안 만들어지므로 여기서도 세지 않는다.
  const rows = await prisma.$queryRaw<{ d: Date; picks: bigint; hits: bigint }[]>`
    select (("startTime" at time zone 'UTC') at time zone 'Asia/Seoul')::date as d,
      count(*) filter (where "predHcCorrect" is not null and "predHcPick" is not null and "predHcProb" >= ${hc})
        + count(*) filter (where "predDcCorrect" is not null and "predDcPick" is not null and "predDcProb" >= ${dc})
        + count(*) filter (where "predCorrect" is not null and "predWinner" is not null and greatest("predHome","predDraw","predAway") >= ${x12})
        + count(*) filter (where "predOverCorrect" is not null and (("predOverPick" = 'OVER' and "predOverProb" >= ${ou}) or ("predOverPick" = 'UNDER' and "predOverProb" <= ${1 - ou})))
        as picks,
      count(*) filter (where "predHcCorrect" = true and "predHcPick" is not null and "predHcProb" >= ${hc})
        + count(*) filter (where "predDcCorrect" = true and "predDcPick" is not null and "predDcProb" >= ${dc})
        + count(*) filter (where "predCorrect" = true and "predWinner" is not null and greatest("predHome","predDraw","predAway") >= ${x12})
        + count(*) filter (where "predOverCorrect" = true and (("predOverPick" = 'OVER' and "predOverProb" >= ${ou}) or ("predOverPick" = 'UNDER' and "predOverProb" <= ${1 - ou})))
        as hits
    from "Match"
    where "startTime" >= now() - make_interval(days => ${queryDays}::int)
      and "startTime" < now()
    group by 1
    order by 1 desc
  `;

  return rows
    .map((r) => ({
      date: new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(r.d),
      picks: Number(r.picks),
      hits: Number(r.hits),
    }))
    .filter((r) => r.picks > 0)
    .slice(0, days);
}
