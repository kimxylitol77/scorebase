// 월드컵 본선 선수 스탯 실시간 집계 — 득점·도움·평점·카드 랭킹.
// 소스: TheSportsMatchCache.playerStats (Lightsail football-poller 가 라이브 중 ~2분 간격 push)
//       + cache.lineup (이름·사진·소속 side). TheSports API 직접 호출 없음 → Vercel 안전.
import { prisma } from "@/lib/db";
import { fifaCountryKo, fifaFlag } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import type { LeaderRow } from "@/components/LeagueLeaderBoard";
import rawOv from "../../../../data/player-overrides.json";

const OV = rawOv as Record<string, { nameKo?: string }>;

/**
 * override JSON 의 수동 교정 한글명. STAR 리포트 헤더·JSON-LD 가 본문과 같은
 * 이름(override 우선)을 쓰도록 노출 — theSportsPlayer.nameKo 는 daily 봇이 TheSports
 * 값으로 덮어 override(예: 킬리안 음바페)와 어긋날 수 있음.
 */
export function playerOverrideNameKo(id: string): string | null {
  return OV[id]?.nameKo ?? null;
}

export interface WcPlayerStat {
  id: string; // ts player id
  name: string; // 한글 우선 (override → TheSportsPlayer.nameKo → lineup 영문)
  nameEn: string | null;
  country: string; // 소속 국가 영문 팀명 (표시 변환은 호출부에서)
  photo: string | null;
  hasMv: boolean; // PlayerMarketValue 보유 → /transfers 링크 가능
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  saves: number; // GK 세이브 (필드 플레이어는 0)
  keyPasses: number; // 키패스 (찬스메이킹)
  defActions: number; // 수비 포인트 = 태클 + 인터셉트 + 클리어런스
  wasFouled: number; // 파울 유도 (걷어차인 횟수)
  bigMiss: number; // 빅찬스 미스
  woodwork: number; // 골대 맞춘 횟수
  aerialWon: number; // 공중볼 승리
  aerialLost: number; // 공중볼 패배 (제공권 지배율 계산용)
  dribbleSucc: number; // 드리블 성공
  dribbleAtt: number; // 드리블 시도 (성공률 계산용)
  shots: number; // 슛 시도 (결정력 = goals÷shots)
  mvEuro: number; // 시장가치 € (없으면 0)
  avgRating: number; // rating>0 경기 평균 (소수 2)
  minutes: number;
  games: number; // 출전 경기 수 (minutes>0)
}

interface TsPlayerStatRow {
  player_id: string;
  goals?: number;
  assists?: number;
  yellow_cards?: number;
  red_cards?: number;
  yellow2red_cards?: number;
  saves?: number;
  key_passes?: number;
  tackles?: number;
  interceptions?: number;
  clearances?: number;
  was_fouled?: number;
  big_chance_missed?: number;
  hit_woodwork?: number;
  aerial_won?: number;
  aerial_lost?: number;
  dribble?: number;
  dribble_succ?: number;
  shots?: number;
  rating?: number;
  minutes_played?: number;
}

interface TsLineupPlayer {
  id: string;
  name: string;
  logo?: string;
}

/** 본선 LIVE+FINISHED 매치의 playerStats 를 선수 단위로 누적 집계. */
export async function getWorldCupPlayerStats(): Promise<WcPlayerStat[]> {
  const matches = await prisma.match.findMany({
    where: { league: "WORLD_CUP", status: { in: ["LIVE", "FINISHED"] } },
    select: {
      id: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (matches.length === 0) return [];
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const caches = await prisma.theSportsMatchCache.findMany({
    where: { matchId: { in: matches.map((m) => m.id) } },
    select: { matchId: true, playerStats: true, lineup: true },
  });

  interface Acc {
    name: string;
    photo: string | null;
    country: string;
    goals: number;
    assists: number;
    yellow: number;
    red: number;
    saves: number;
    keyPasses: number;
    defActions: number;
    wasFouled: number;
    bigMiss: number;
    woodwork: number;
    aerialWon: number;
    aerialLost: number;
    dribbleSucc: number;
    dribbleAtt: number;
    shots: number;
    ratings: number[];
    minutes: number;
    games: number;
  }
  const acc = new Map<string, Acc>();

  for (const c of caches) {
    const stats = c.playerStats as TsPlayerStatRow[] | null;
    if (!Array.isArray(stats) || stats.length === 0) continue;
    const m = matchById.get(c.matchId);
    if (!m) continue;

    // lineup → 선수 id 별 이름·사진·소속 side(국가)
    const luRoot = c.lineup as { lineup?: { home?: TsLineupPlayer[]; away?: TsLineupPlayer[] } } | null;
    const lu = luRoot?.lineup ?? (luRoot as { home?: TsLineupPlayer[]; away?: TsLineupPlayer[] } | null);
    const meta = new Map<string, { name: string; logo: string | null; country: string }>();
    for (const [side, country] of [
      ["home", m.homeTeam.name],
      ["away", m.awayTeam.name],
    ] as const) {
      for (const pl of lu?.[side] ?? []) {
        meta.set(pl.id, { name: pl.name, logo: pl.logo || null, country });
      }
    }

    for (const s of stats) {
      if (!s.player_id) continue;
      const info = meta.get(s.player_id);
      const a = acc.get(s.player_id) ?? {
        name: info?.name ?? "",
        photo: info?.logo ?? null,
        country: info?.country ?? "",
        goals: 0,
        assists: 0,
        yellow: 0,
        red: 0,
        saves: 0,
        keyPasses: 0,
        defActions: 0,
        wasFouled: 0,
        bigMiss: 0,
        woodwork: 0,
        aerialWon: 0,
        aerialLost: 0,
        dribbleSucc: 0,
        dribbleAtt: 0,
        shots: 0,
        ratings: [],
        minutes: 0,
        games: 0,
      };
      if (!a.name && info?.name) a.name = info.name;
      if (!a.photo && info?.logo) a.photo = info.logo;
      if (!a.country && info?.country) a.country = info.country;
      a.goals += s.goals ?? 0;
      a.assists += s.assists ?? 0;
      a.yellow += s.yellow_cards ?? 0;
      a.red += (s.red_cards ?? 0) + (s.yellow2red_cards ?? 0);
      a.saves += s.saves ?? 0;
      a.keyPasses += s.key_passes ?? 0;
      a.defActions += (s.tackles ?? 0) + (s.interceptions ?? 0) + (s.clearances ?? 0);
      a.wasFouled += s.was_fouled ?? 0;
      a.bigMiss += s.big_chance_missed ?? 0;
      a.woodwork += s.hit_woodwork ?? 0;
      a.aerialWon += s.aerial_won ?? 0;
      a.aerialLost += s.aerial_lost ?? 0;
      a.dribbleSucc += s.dribble_succ ?? 0;
      a.dribbleAtt += s.dribble ?? 0;
      a.shots += s.shots ?? 0;
      const rating = Number(s.rating) || 0;
      if (rating > 0) a.ratings.push(rating);
      const min = s.minutes_played ?? 0;
      a.minutes += min;
      if (min > 0) a.games += 1;
      acc.set(s.player_id, a);
    }
  }
  if (acc.size === 0) return [];

  // 한글명 + 시장가치 링크 가능 여부
  const ids = [...acc.keys()];
  const [tsRows, mvRows] = await Promise.all([
    prisma.theSportsPlayer.findMany({
      where: { id: { in: ids }, nameKo: { not: null } },
      select: { id: true, nameKo: true },
    }),
    prisma.playerMarketValue.findMany({
      where: { id: { in: ids } },
      select: { id: true, currentValue: true },
    }),
  ]);
  const koById = new Map(tsRows.map((r) => [r.id, r.nameKo!]));
  const mvIds = new Set(mvRows.map((r) => r.id));
  const mvEuroById = new Map(mvRows.map((r) => [r.id, r.currentValue ?? 0]));

  return [...acc.entries()].map(([id, a]) => ({
    id,
    name: OV[id]?.nameKo || koById.get(id) || a.name || "선수",
    nameEn: a.name || null,
    country: a.country,
    photo: a.photo,
    hasMv: mvIds.has(id),
    goals: a.goals,
    assists: a.assists,
    yellow: a.yellow,
    red: a.red,
    saves: a.saves,
    keyPasses: a.keyPasses,
    defActions: a.defActions,
    wasFouled: a.wasFouled,
    bigMiss: a.bigMiss,
    woodwork: a.woodwork,
    aerialWon: a.aerialWon,
    aerialLost: a.aerialLost,
    dribbleSucc: a.dribbleSucc,
    dribbleAtt: a.dribbleAtt,
    shots: a.shots,
    mvEuro: mvEuroById.get(id) ?? 0,
    avgRating: a.ratings.length
      ? +(a.ratings.reduce((s, r) => s + r, 0) / a.ratings.length).toFixed(2)
      : 0,
    minutes: a.minutes,
    games: a.games,
  }));
}

/** 집계 → LeagueLeaderBoard rowsByCategory (GOAL·ASSIST·RATING·SAVE·YELLOW·RED 각 TOP 10).
 *  predictions/WORLD_CUP 와 /world-cup 허브가 공유. 전 카테고리 빈 배열이면 null. */
export function buildWcLeaderRows(stats: WcPlayerStat[]): Record<string, LeaderRow[]> | null {
  if (stats.length === 0) return null;
  const countryKo = (en: string) => fifaCountryKo(en) ?? toKoreanTeamName(en, "WORLD_CUP") ?? en;
  const toRow = (s: WcPlayerStat, i: number, value: number, unit: string | null): LeaderRow => ({
    rank: i + 1,
    playerName: s.name,
    playerNameEn: s.nameEn,
    teamName: `${fifaFlag(s.country)} ${countryKo(s.country)}`.trim(),
    teamShort: null,
    value,
    unit,
    appearances: s.games,
    photoUrl: s.photo,
    externalId: s.hasMv ? s.id : null,
  });
  const top = (
    filter: (s: WcPlayerStat) => boolean,
    sort: (a: WcPlayerStat, b: WcPlayerStat) => number,
    value: (s: WcPlayerStat) => number,
    unit: string | null,
  ) => stats.filter(filter).sort(sort).slice(0, 10).map((s, i) => toRow(s, i, value(s), unit));
  const rows: Record<string, LeaderRow[]> = {
    GOAL: top((s) => s.goals > 0, (a, b) => b.goals - a.goals || b.avgRating - a.avgRating, (s) => s.goals, "골"),
    ASSIST: top((s) => s.assists > 0, (a, b) => b.assists - a.assists || b.avgRating - a.avgRating, (s) => s.assists, "도움"),
    // 키패스(찬스메이킹) — 도움으로 이어지지 않은 결정적 패스까지
    CHANCE: top((s) => s.keyPasses > 0, (a, b) => b.keyPasses - a.keyPasses || b.avgRating - a.avgRating, (s) => s.keyPasses, "회"),
    // 평점 — 누적 45분+ 출전 선수만 (교체 투입 노이즈 방지)
    RATING: top((s) => s.avgRating > 0 && s.minutes >= 45, (a, b) => b.avgRating - a.avgRating || b.minutes - a.minutes, (s) => s.avgRating, "평점"),
    // 수비 포인트 = 태클+인터셉트+클리어런스 합산
    DEFENSE: top((s) => s.defActions > 0, (a, b) => b.defActions - a.defActions || b.avgRating - a.avgRating, (s) => s.defActions, "회"),
    // 세이브 — GK 만 값이 쌓임 (필드 플레이어 0)
    SAVE: top((s) => s.saves > 0, (a, b) => b.saves - a.saves || b.avgRating - a.avgRating, (s) => s.saves, "세이브"),
    YELLOW: top((s) => s.yellow > 0, (a, b) => b.yellow - a.yellow || b.avgRating - a.avgRating, (s) => s.yellow, "장"),
    RED: top((s) => s.red > 0, (a, b) => b.red - a.red || b.avgRating - a.avgRating, (s) => s.red, "장"),
    // ===== 이색 랭킹 (predictions 전용 섹션) =====
    // 가성비 = 평점 ÷ log10(몸값€M + 2) — 몸값 낮고 평점 높을수록 ↑. 45분+ & 시장가치 보유만.
    VALUE: stats
      .filter((s) => s.mvEuro > 0 && s.avgRating > 0 && s.minutes >= 45)
      .map((s) => ({ s, idx: s.avgRating / Math.log10(s.mvEuro / 1e6 + 2) }))
      .sort((a, b) => b.idx - a.idx || b.s.avgRating - a.s.avgRating)
      .slice(0, 10)
      .map(({ s, idx }, i) => {
        const r = toRow(s, i, +idx.toFixed(1), "지수");
        // 몸값을 팀 줄에 병기 — "🇰🇷 대한민국 · €3M"
        const m = s.mvEuro / 1e6;
        return { ...r, teamName: `${r.teamName} · €${m >= 10 ? Math.round(m) : m.toFixed(1)}M` };
      }),
    FOULED: top((s) => s.wasFouled > 0, (a, b) => b.wasFouled - a.wasFouled || b.avgRating - a.avgRating, (s) => s.wasFouled, "회"),
    BIGMISS: top((s) => s.bigMiss > 0, (a, b) => b.bigMiss - a.bigMiss || b.avgRating - a.avgRating, (s) => s.bigMiss, "회"),
    WOODWORK: top((s) => s.woodwork > 0, (a, b) => b.woodwork - a.woodwork || b.avgRating - a.avgRating, (s) => s.woodwork, "회"),
    // 제공권 지배율 = aerial_won ÷ (won+lost) %. 최소 10 경합 (표본 노이즈 방지).
    AERIAL: stats
      .filter((s) => s.aerialWon + s.aerialLost >= 10)
      .map((s) => ({ s, total: s.aerialWon + s.aerialLost }))
      .sort((a, b) => b.s.aerialWon / b.total - a.s.aerialWon / a.total || b.total - a.total)
      .slice(0, 10)
      .map(({ s, total }, i) => {
        const r = toRow(s, i, Math.round((s.aerialWon / total) * 100), "%");
        return { ...r, teamName: `${r.teamName} · ${s.aerialWon}/${total}` };
      }),
    // 드리블 성공률 = dribble_succ ÷ dribble %. 최소 5 시도.
    DRIBBLE: stats
      .filter((s) => s.dribbleAtt >= 5)
      .sort((a, b) => b.dribbleSucc / b.dribbleAtt - a.dribbleSucc / a.dribbleAtt || b.dribbleAtt - a.dribbleAtt)
      .slice(0, 10)
      .map((s, i) => {
        const r = toRow(s, i, Math.round((s.dribbleSucc / s.dribbleAtt) * 100), "%");
        return { ...r, teamName: `${r.teamName} · ${s.dribbleSucc}/${s.dribbleAtt}` };
      }),
    // 결정력 = goals ÷ shots %. 득점자만. shots<goals 데이터 흠집은 분모 보정(max).
    CLINICAL: stats
      .filter((s) => s.goals >= 1)
      .map((s) => ({ s, denom: Math.max(s.shots, s.goals) }))
      .sort((a, b) => b.s.goals / b.denom - a.s.goals / a.denom || b.s.goals - a.s.goals)
      .slice(0, 10)
      .map(({ s, denom }, i) => {
        const r = toRow(s, i, Math.round((s.goals / denom) * 100), "%");
        return { ...r, teamName: `${r.teamName} · ${s.goals}골/${s.shots}슛` };
      }),
  };
  return Object.values(rows).every((r) => r.length === 0) ? null : rows;
}

/** 핵심 랭킹 탭 (선수 랭킹 섹션) / 이색 랭킹 탭 (predictions 전용 섹션) 분리용 키 셋. */
export const WC_CORE_CATS = ["GOAL", "ASSIST", "CHANCE", "RATING", "DEFENSE", "SAVE", "YELLOW", "RED"];
export const WC_FUN_CATS = ["VALUE", "FOULED", "BIGMISS", "WOODWORK", "AERIAL", "DRIBBLE", "CLINICAL"];

/** rowsByCategory 에서 지정 키만 추출 — 전부 빈 배열이면 null. */
export function pickCats(
  rows: Record<string, LeaderRow[]> | null,
  keys: string[],
): Record<string, LeaderRow[]> | null {
  if (!rows) return null;
  const out: Record<string, LeaderRow[]> = {};
  for (const k of keys) if (rows[k]?.length) out[k] = rows[k];
  return Object.keys(out).length ? out : null;
}
