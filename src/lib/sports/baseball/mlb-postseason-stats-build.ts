// MLB 포스트시즌 선수 기록 조립 — statsapi gameType=P 시즌 집계(타격·투구)를 스탯 표 행(BbPlayerRow)·확장 성분으로. 순수 함수.
import { ipToNumber, type BbPlayerRow } from "./player-rankings";
import type { AdvancedInput } from "./stats-table";

export interface PsSplit {
  player?: { id?: number; fullName?: string };
  team?: { id?: number; name?: string };
  stat: Record<string, number | string | undefined>;
}

/** 포스트시즌 투수 규정 이닝 = 최다 이닝의 25% (정규시즌 30이닝은 가을야구에서 선발 두세 명만 넘는다). 최소 1이닝. */
export const PS_MIN_IP_RATIO = 0.25;

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const n = Number(v); // ".250"·"3.00" 은 숫자, "-.--"·".---" 는 NaN
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown) => num(v) ?? 0;

export interface PostseasonRows {
  bat: BbPlayerRow[];
  pit: BbPlayerRow[];
  adv: AdvancedInput;
  /** 투수 규정 이닝 (최다 이닝 × 25%, 올림) */
  minIp: number;
}

/**
 * @param nameKoOf statsapi 선수 id → 한글 이름(정규시즌 표에서). 없으면 영문 이름.
 * @param teamKoOf statsapi 팀 이름 → 한글 팀 이름
 */
export function buildPostseasonRows(
  hitting: PsSplit[],
  pitching: PsSplit[],
  nameKoOf: (id: string) => string | undefined,
  teamKoOf: (name: string) => string,
): PostseasonRows {
  const adv: AdvancedInput = { hitting: {}, pitching: {} };
  const base = (s: PsSplit) => {
    const id = String(s.player!.id);
    const en = s.player?.fullName ?? null;
    return {
      key: id, externalId: id, name: nameKoOf(id) ?? en ?? id, nameEn: en,
      team: s.team?.name ? teamKoOf(s.team.name) : "",
      avg: null, hits: null, hr: null, rbi: null, ops: null,
      era: null, whip: null, ip: null, so: null, w: null, l: null, sv: null,
      salary: null, logId: null,
    };
  };

  const bat: BbPlayerRow[] = [];
  for (const s of hitting) {
    if (!s.player?.id) continue;
    const t = s.stat;
    bat.push({ ...base(s), games: int(t.gamesPlayed), avg: num(t.avg), hits: int(t.hits), hr: int(t.homeRuns), rbi: int(t.rbi), ops: num(t.ops) });
    adv.hitting[String(s.player.id)] = { pa: int(t.plateAppearances), ab: int(t.atBats), h: int(t.hits), d2b: int(t.doubles), d3b: int(t.triples), hr: int(t.homeRuns), bb: int(t.baseOnBalls), ibb: int(t.intentionalWalks), hbp: int(t.hitByPitch), sf: int(t.sacFlies), so: int(t.strikeOuts) };
  }

  const pit: BbPlayerRow[] = [];
  for (const s of pitching) {
    if (!s.player?.id) continue;
    const t = s.stat;
    const ip = ipToNumber(String(t.inningsPitched ?? "0")); // "5.1" = 5⅓
    pit.push({ ...base(s), games: int(t.gamesPitched ?? t.gamesPlayed), era: num(t.era), whip: num(t.whip), ip, so: int(t.strikeOuts), w: int(t.wins), l: int(t.losses), sv: int(t.saves) });
    adv.pitching[String(s.player.id)] = { ip, bf: int(t.battersFaced), so: int(t.strikeOuts), bb: int(t.baseOnBalls), hbp: int(t.hitByPitch), hr: int(t.homeRuns), er: int(t.earnedRuns) };
  }

  const maxIp = pit.reduce((m, r) => Math.max(m, r.ip ?? 0), 0);
  return { bat, pit, adv, minIp: Math.max(1, Math.ceil(maxIp * PS_MIN_IP_RATIO)) };
}
