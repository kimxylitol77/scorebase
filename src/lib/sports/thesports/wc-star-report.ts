// 월드컵 'STAR 리포트' — 특정 KST 날짜의 주인공 선수(MOM·멀티골)를 뽑아
// 스토리텔링+데이터 결합 글의 결정론적 입력(StarReportData)을 구성한다.
// 소스: getTeamOfDay(그날 평점·경기) + getWorldCupPlayerStats(대회 누적·랭킹)
//       + TheSportsMatchCache.playerStats(이번 경기 상세) + PlayerMarketValue(몸값).
// TheSports API 직접 호출 없음 → Vercel 안전. 수치는 전부 실측, 창작은 프롬프트가 아닌 서사에만.
import { prisma } from "@/lib/db";
import { fifaCountryKo, fifaFlag } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import { getTeamOfDay, type TodPlayer } from "./team-of-day";
import { getWorldCupPlayerStats, type WcPlayerStat } from "./world-cup-player-stats";

/** STAR 리포트 글 slug 접두사. 뒤에 `{KST날짜}-{playerId}` 가 붙는다. */
export const WC_STAR_SLUG_PREFIX = "world-cup-star-";

export function buildStarSlug(dateKst: string, playerId: string): string {
  return `${WC_STAR_SLUG_PREFIX}${dateKst}-${playerId}`;
}

/** slug → {date, playerId}. playerId 는 하이픈 없는 TheSports 해시라 날짜(고정 10자)로 안전 분리. */
export function parseStarSlug(slug: string): { date: string; playerId: string } | null {
  if (!slug.startsWith(WC_STAR_SLUG_PREFIX)) return null;
  const rest = slug.slice(WC_STAR_SLUG_PREFIX.length); // "{YYYY-MM-DD}-{playerId}"
  const date = rest.slice(0, 10);
  const playerId = rest.slice(11);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !playerId) return null;
  return { date, playerId };
}

const POS_KO: Record<string, string> = {
  G: "골키퍼",
  D: "수비수",
  M: "미드필더",
  F: "공격수",
};

const koCountry = (en: string) =>
  fifaCountryKo(en) ?? toKoreanTeamName(en, "WORLD_CUP") ?? en;

/** 대회 랭킹 한 축 — 자격 선수 중 순위/전체/값. 자격 미달이면 null. */
export interface StarRank {
  rank: number;
  total: number;
  value: number;
}

export interface StarReportData {
  playerId: string;
  date: string; // KST YYYY-MM-DD
  dateKo: string; // "7월 7일"
  reason: "MOM" | "MULTIGOAL"; // 선정 사유
  // 프로필
  name: string;
  nameEn: string | null;
  countryKo: string;
  countryEn: string;
  flag: string;
  posKo: string;
  photo: string | null;
  hasMv: boolean; // /transfers/{id} 링크 가능
  age: number | null;
  // 이번(그날) 경기
  match: {
    oppKo: string;
    teamScore: number | null;
    oppScore: number | null;
    result: "승" | "무" | "패" | null;
  };
  rating: number; // 이번 경기 TheSports 평점 (0~10)
  goals: number; // 이번 경기
  assists: number; // 이번 경기
  todayStatLine: string; // 결정론적 상세 스탯 한 줄 (창작 금지 근거)
  // 대회 누적
  tourney: {
    goals: number;
    assists: number;
    keyPasses: number;
    avgRating: number;
    games: number;
    minutes: number;
    shots: number;
    dribbleSucc: number;
    dribbleAtt: number;
    defActions: number;
    saves: number;
  };
  ranks: {
    goals: StarRank | null;
    assists: StarRank | null;
    keyPasses: StarRank | null;
    rating: StarRank | null;
  };
  // 몸값 (€) — 없으면 null
  market: { euro: number; deltaEuro: number | null } | null;
  // 국가대표 다음 예정 경기 + 모델 예측 — 없으면 null (넉아웃 대진 미확정 등)
  nextMatch: {
    oppKo: string;
    kstDate: string; // "7월 11일"
    teamIsHome: boolean;
    predTeamPct: number | null;
    predDrawPct: number | null;
    predOppPct: number | null;
  } | null;
}

interface TsStatRow {
  player_id: string;
  rating?: number;
  goals?: number;
  assists?: number;
  shots?: number;
  shots_on_target?: number;
  key_passes?: number;
  big_chance_created?: number;
  passes?: number;
  passes_accuracy?: number;
  dribble?: number;
  dribble_succ?: number;
  tackles?: number;
  interceptions?: number;
  clearances?: number;
  aerial_won?: number;
  saves?: number;
  punches?: number;
  was_fouled?: number;
  minutes_played?: number;
}

// KST 날짜 → 그날 00:00~24:00(KST)의 UTC startTime 범위.
function kstDayRangeUtc(dateKst: string): { gte: Date; lt: Date } {
  const startUtcMs = Date.parse(`${dateKst}T00:00:00Z`) - 9 * 3600000;
  return { gte: new Date(startUtcMs), lt: new Date(startUtcMs + 86400000) };
}

/** 그날 완료 경기들의 playerStats 를 player_id → 최고 평점 행으로. (상세 스탯 근거용) */
async function collectDayStatRows(dateKst: string): Promise<Map<string, TsStatRow>> {
  const { gte, lt } = kstDayRangeUtc(dateKst);
  const ms = await prisma.match.findMany({
    where: { league: "WORLD_CUP", status: "FINISHED", startTime: { gte, lt } },
    select: { theSportsCache: { select: { playerStats: true } } },
  });
  const map = new Map<string, TsStatRow>();
  for (const m of ms) {
    const ps = m.theSportsCache?.playerStats as TsStatRow[] | null;
    if (!Array.isArray(ps)) continue;
    for (const s of ps) {
      if (!s?.player_id) continue;
      const prev = map.get(s.player_id);
      if (!prev || (Number(s.rating) || 0) > (Number(prev.rating) || 0)) map.set(s.player_id, s);
    }
  }
  return map;
}

const pct = (succ: number, total: number) =>
  total > 0 ? Math.round((succ / total) * 100) : 0;

/** 포지션 맞춤 상세 스탯 한 줄. 0 항목 생략. */
function todayStatLine(pos: string, s: TsStatRow | null): string {
  if (!s) return "상세 기록 미집계";
  const p: string[] = [];
  if (s.goals) p.push(`골 ${s.goals}`);
  if (s.assists) p.push(`도움 ${s.assists}`);
  if (pos === "G") {
    p.push(`선방 ${s.saves ?? 0}`);
    if (s.punches) p.push(`펀칭 ${s.punches}`);
  } else if (pos === "D") {
    if (s.clearances) p.push(`클리어 ${s.clearances}`);
    if (s.interceptions) p.push(`인터셉트 ${s.interceptions}`);
    if (s.tackles) p.push(`태클 ${s.tackles}`);
    if (s.aerial_won) p.push(`공중볼 ${s.aerial_won}승`);
  } else if (pos === "M") {
    if (s.key_passes) p.push(`키패스 ${s.key_passes}`);
    if (s.big_chance_created) p.push(`결정적기회 ${s.big_chance_created}`);
    if (s.dribble_succ) p.push(`드리블 ${s.dribble_succ}/${s.dribble ?? 0}`);
    if (s.tackles) p.push(`태클 ${s.tackles}`);
  } else {
    if (s.shots) p.push(`슛 ${s.shots}(유효 ${s.shots_on_target ?? 0})`);
    if (s.key_passes) p.push(`키패스 ${s.key_passes}`);
    if (s.dribble_succ) p.push(`드리블 ${s.dribble_succ}/${s.dribble ?? 0}`);
  }
  if (s.passes) p.push(`패스 ${pct(s.passes_accuracy ?? 0, s.passes)}%(${s.passes_accuracy ?? 0}/${s.passes})`);
  if (s.was_fouled) p.push(`피파울 ${s.was_fouled}`);
  if (s.minutes_played != null) p.push(`${s.minutes_played}분`);
  return p.join(" · ");
}

/** 자격 선수 정렬 리스트에서 대상 선수의 순위/전체/값. 미자격이면 null. */
function rankOf(
  list: WcPlayerStat[],
  id: string,
  filter: (s: WcPlayerStat) => boolean,
  cmp: (a: WcPlayerStat, b: WcPlayerStat) => number,
  valueOf: (s: WcPlayerStat) => number,
): StarRank | null {
  const q = list.filter(filter).sort(cmp);
  const idx = q.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  return { rank: idx + 1, total: q.length, value: valueOf(q[idx]) };
}

/** history [{t,v}] 에서 최근 ~45일 전 대비 현재값 증감(€). 산출 불가/변동 없음이면 null. */
function marketDelta(currentValue: number, history: unknown, nowMs: number): number | null {
  if (!Array.isArray(history) || history.length < 2) return null;
  const rows = history
    .map((h) => {
      const o = h as { t?: unknown; v?: unknown };
      const tRaw = o?.t;
      const t = typeof tRaw === "number" ? (tRaw < 1e12 ? tRaw * 1000 : tRaw) : Date.parse(String(tRaw));
      const v = Number(o?.v);
      return Number.isFinite(t) && Number.isFinite(v) ? { t, v } : null;
    })
    .filter((x): x is { t: number; v: number } => x !== null)
    .sort((a, b) => a.t - b.t);
  if (rows.length < 2) return null;
  const cutoff = nowMs - 45 * 86400000;
  // 컷오프 이전(또는 가장 오래된) 값 대비 현재값.
  const base = [...rows].reverse().find((r) => r.t <= cutoff) ?? rows[0];
  const delta = Math.round(currentValue - base.v);
  return delta !== 0 ? delta : null;
}

/**
 * 지정 KST 날짜의 STAR 후보 산출 — MOM(그날 최고 평점) + 멀티골(있으면) 최대 2명.
 * 완료 경기가 없거나 데이터 부족이면 빈 배열.
 */
export async function getStarCandidates(dateKst: string): Promise<StarReportData[]> {
  const tod = await getTeamOfDay(dateKst);
  if (!tod || tod.xi.length === 0) return [];

  const pool: TodPlayer[] = [...tod.xi, ...tod.bench];
  const byRating = [...pool].sort((a, b) => b.rating - a.rating || b.goals - a.goals);
  const mom = byRating[0];

  // 멀티골(그날 2골+) 최고 득점자 — MOM 과 다르면 추가.
  const multi = [...pool]
    .filter((p) => p.goals >= 2 && p.id !== mom.id)
    .sort((a, b) => b.goals - a.goals || b.rating - a.rating)[0];

  const picks: { p: TodPlayer; reason: "MOM" | "MULTIGOAL" }[] = [{ p: mom, reason: "MOM" }];
  if (multi) picks.push({ p: multi, reason: "MULTIGOAL" });

  // 공통 데이터 소스 1회 로드.
  const [dayRows, tourneyStats] = await Promise.all([
    collectDayStatRows(dateKst),
    getWorldCupPlayerStats(),
  ]);
  const tourneyById = new Map(tourneyStats.map((s) => [s.id, s]));

  const ids = picks.map((x) => x.p.id);
  const mvRows = await prisma.playerMarketValue.findMany({
    where: { id: { in: ids } },
    select: { id: true, currentValue: true, age: true, history: true },
  });
  const mvById = new Map(mvRows.map((r) => [r.id, r]));

  const now = new Date();
  const nowMs = now.getTime();
  const [, mm, dd] = dateKst.split("-");
  const dateKo = `${Number(mm)}월 ${Number(dd)}일`;

  const out: StarReportData[] = [];
  for (const { p, reason } of picks) {
    const t = tourneyById.get(p.id);
    // 이번 경기 상대·스코어 — tod.matches 에서 소속 국가가 뛴 경기 매칭.
    const mm2 = tod.matches.find((m) => m.home === p.country || m.away === p.country);
    let matchInfo: StarReportData["match"] = { oppKo: "", teamScore: null, oppScore: null, result: null };
    if (mm2) {
      const isHome = mm2.home === p.country;
      const ts = isHome ? mm2.homeScore : mm2.awayScore;
      const os = isHome ? mm2.awayScore : mm2.homeScore;
      const result = ts == null || os == null ? null : ts > os ? "승" : ts < os ? "패" : "무";
      matchInfo = { oppKo: isHome ? mm2.awayKo : mm2.homeKo, teamScore: ts, oppScore: os, result };
    }

    // 대회 랭킹
    const ranks: StarReportData["ranks"] = {
      goals:
        t && t.goals > 0
          ? rankOf(tourneyStats, p.id, (s) => s.goals > 0, (a, b) => b.goals - a.goals || b.avgRating - a.avgRating, (s) => s.goals)
          : null,
      assists:
        t && t.assists > 0
          ? rankOf(tourneyStats, p.id, (s) => s.assists > 0, (a, b) => b.assists - a.assists || b.avgRating - a.avgRating, (s) => s.assists)
          : null,
      keyPasses:
        t && t.keyPasses > 0
          ? rankOf(tourneyStats, p.id, (s) => s.keyPasses > 0, (a, b) => b.keyPasses - a.keyPasses || b.avgRating - a.avgRating, (s) => s.keyPasses)
          : null,
      rating:
        t && t.avgRating > 0 && t.minutes >= 45
          ? rankOf(tourneyStats, p.id, (s) => s.avgRating > 0 && s.minutes >= 45, (a, b) => b.avgRating - a.avgRating || b.minutes - a.minutes, (s) => s.avgRating)
          : null,
    };

    // 몸값
    const mv = mvById.get(p.id);
    const market =
      mv && mv.currentValue != null && mv.currentValue > 0
        ? { euro: mv.currentValue, deltaEuro: marketDelta(mv.currentValue, mv.history, nowMs) }
        : null;

    // 다음 경기 + 예측
    const next = await prisma.match.findFirst({
      where: {
        league: "WORLD_CUP",
        status: "SCHEDULED",
        startTime: { gt: now },
        OR: [{ homeTeam: { name: p.country } }, { awayTeam: { name: p.country } }],
      },
      orderBy: { startTime: "asc" },
      select: {
        startTime: true,
        predHome: true,
        predDraw: true,
        predAway: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    });
    let nextMatch: StarReportData["nextMatch"] = null;
    if (next) {
      const teamIsHome = next.homeTeam.name === p.country;
      const oppEn = teamIsHome ? next.awayTeam.name : next.homeTeam.name;
      const kst = new Date(next.startTime.getTime() + 9 * 3600000);
      const toPct = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100));
      nextMatch = {
        oppKo: koCountry(oppEn),
        kstDate: `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`,
        teamIsHome,
        predTeamPct: toPct(teamIsHome ? next.predHome : next.predAway),
        predDrawPct: toPct(next.predDraw),
        predOppPct: toPct(teamIsHome ? next.predAway : next.predHome),
      };
    }

    out.push({
      playerId: p.id,
      date: dateKst,
      dateKo,
      reason,
      name: p.name,
      nameEn: p.nameEn,
      countryKo: p.countryKo,
      countryEn: p.country,
      flag: p.flag,
      posKo: POS_KO[p.pos] ?? p.pos,
      photo: p.logo,
      hasMv: p.hasMv,
      age: mv?.age ?? null,
      match: matchInfo,
      rating: p.rating,
      goals: p.goals,
      assists: p.assists,
      todayStatLine: todayStatLine(p.pos, dayRows.get(p.id) ?? null),
      tourney: {
        goals: t?.goals ?? p.goals,
        assists: t?.assists ?? p.assists,
        keyPasses: t?.keyPasses ?? 0,
        avgRating: t?.avgRating ?? p.rating,
        games: t?.games ?? 1,
        minutes: t?.minutes ?? 0,
        shots: t?.shots ?? 0,
        dribbleSucc: t?.dribbleSucc ?? 0,
        dribbleAtt: t?.dribbleAtt ?? 0,
        defActions: t?.defActions ?? 0,
        saves: t?.saves ?? 0,
      },
      ranks,
      market,
      nextMatch,
    });
  }
  return out;
}
