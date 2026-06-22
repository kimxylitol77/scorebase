// 야구 선수 비교 로더 — MLB/KBO/NPB 타자·투수 시즌 스탯을 통합 키로 정규화(레이더 없음, 표 + MLB 퍼센타일).
// 타자/투수(type b|p)는 피커가 rosters group 으로 결정해 URL ?t= 로 전달.
import { fetchHitterProfile, fetchPitcherProfile } from "@/lib/sports/mlb-stats-api";
import { fetchPlayerPercentiles } from "@/lib/sports/mlb-player-extras";
import { fetchKboHitterStats, fetchKboPitcherStats, kboPhotoUrl } from "@/lib/sports/kbo-official";
import { fetchNpbHitterStats, fetchNpbPitcherStats, fetchNpbPhotoUrl } from "@/lib/sports/npb-official";
import baseballRosters from "../../../data/baseball-rosters.json";
import type { StatRowDef } from "./loaders";

export type BatPit = "b" | "p";

export interface BaseballComparePlayer {
  id: string;
  name: string;
  photo: string | null;
  sub: string | null;
  stats: Record<string, number>;
  percentiles: { year: number; values: Record<string, number> } | null; // MLB만
}

// rosters.json(KBO/NPB) id → 한글명 (KBO/NPB stats 는 이름 미포함)
const ROSTER_NAME = new Map<string, string>();
for (const arr of Object.values(baseballRosters as Record<string, Array<{ id: string; name: string }>>)) {
  for (const p of arr) ROSTER_NAME.set(p.id, p.name);
}

const pnum = (v: string | number | undefined | null): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

const int = (v: number) => Math.round(v).toLocaleString();
const dec1 = (v: number) => v.toFixed(1);
const dec2 = (v: number) => v.toFixed(2);
const avg3 = (v: number) => v.toFixed(3).replace(/^0/, ""); // 0.285 → .285

export const BAT_ROWS: StatRowDef[] = [
  { label: "경기", key: "g", fmt: int },
  { label: "타율", key: "avg", fmt: avg3 },
  { label: "안타", key: "hits", fmt: int },
  { label: "홈런", key: "hr", fmt: int },
  { label: "타점", key: "rbi", fmt: int },
  { label: "도루", key: "sb", fmt: int },
  { label: "출루율", key: "obp", fmt: avg3 },
  { label: "장타율", key: "slg", fmt: avg3 },
  { label: "OPS", key: "ops", fmt: avg3 },
];
export const PIT_ROWS: StatRowDef[] = [
  { label: "등판", key: "g", fmt: int },
  { label: "평균자책", key: "era", lowerBetter: true, fmt: dec2 },
  { label: "WHIP", key: "whip", lowerBetter: true, fmt: dec2 },
  { label: "승", key: "wins", fmt: int },
  { label: "패", key: "losses", lowerBetter: true, fmt: int },
  { label: "탈삼진", key: "k", fmt: int },
  { label: "이닝", key: "ip", fmt: dec1 },
];

const mlbPhoto = (id: string) => `https://midfield.mlbstatic.com/v1/people/${id}/spots/120`;

export async function loadBaseball(id: string, league: string, type: BatPit): Promise<BaseballComparePlayer | null> {
  const season = new Date().getUTCFullYear();

  if (league === "MLB") {
    const pid = Number(id);
    if (!Number.isFinite(pid)) return null;
    if (type === "p") {
      const prof = await fetchPitcherProfile(pid, season);
      if (!prof) return null;
      const s = prof.season ?? {};
      const pct = await fetchPlayerPercentiles(pid, season, "pitcher");
      return {
        id, name: prof.name, photo: mlbPhoto(id), sub: [prof.hand && `${prof.hand}투`, prof.team].filter(Boolean).join(" · ") || null,
        stats: { g: pnum(s.gs), era: pnum(s.era), whip: pnum(s.whip), wins: pnum(s.wins), losses: pnum(s.losses), k: pnum(s.so), ip: pnum(s.ip) },
        percentiles: pct,
      };
    }
    const prof = await fetchHitterProfile(pid, season);
    if (!prof) return null;
    const s = prof.season ?? {};
    const pct = await fetchPlayerPercentiles(pid, season, "batter");
    return {
      id, name: prof.name, photo: mlbPhoto(id), sub: [prof.position, prof.team].filter(Boolean).join(" · ") || null,
      stats: { g: pnum(s.games), avg: pnum(s.avg), hits: pnum(s.hits), hr: pnum(s.hr), rbi: pnum(s.rbi), sb: pnum(s.sb), obp: pnum(s.obp), slg: pnum(s.slg), ops: pnum(s.ops) },
      percentiles: pct,
    };
  }

  const name = ROSTER_NAME.get(id) || "선수";

  if (league === "KBO") {
    if (type === "p") {
      const s = await fetchKboPitcherStats(id);
      if (!s) return null;
      return {
        id, name, photo: kboPhotoUrl(id), sub: s.team ?? null,
        stats: { g: pnum(s.g), era: pnum(s.era), whip: pnum(s.whip), wins: pnum(s.wins), losses: pnum(s.losses), k: pnum(s.k), ip: pnum(s.ip) },
        percentiles: null,
      };
    }
    const s = await fetchKboHitterStats(id);
    if (!s) return null;
    const obp = pnum(s.obp), slg = pnum(s.slg);
    return {
      id, name, photo: kboPhotoUrl(id), sub: s.team ?? null,
      stats: { g: pnum(s.g), avg: pnum(s.avg), hits: pnum(s.h), hr: pnum(s.hr), rbi: pnum(s.rbi), sb: pnum(s.sb), obp, slg, ops: obp + slg },
      percentiles: null,
    };
  }

  if (league === "NPB") {
    if (type === "p") {
      const s = await fetchNpbPitcherStats(id);
      if (!s) return null;
      const photo = await fetchNpbPhotoUrl(id);
      return {
        id, name, photo: photo ?? null, sub: s.team ?? null,
        stats: { g: pnum(s.g), era: pnum(s.era), whip: pnum(s.whip), wins: pnum(s.wins), losses: pnum(s.losses), k: pnum(s.k), ip: pnum(s.ip) },
        percentiles: null,
      };
    }
    const s = await fetchNpbHitterStats(id);
    if (!s) return null;
    const photo = await fetchNpbPhotoUrl(id);
    return {
      id, name, photo: photo ?? null, sub: s.team ?? null,
      stats: { g: pnum(s.g), avg: pnum(s.avg), hits: pnum(s.hits), hr: pnum(s.hr), rbi: pnum(s.rbi), sb: pnum(s.sb), obp: pnum(s.obp), slg: pnum(s.slg), ops: pnum(s.ops) },
      percentiles: null,
    };
  }

  return null;
}
