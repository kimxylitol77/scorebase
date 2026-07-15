// MLB 선수 페이지 강화 데이터 — year-by-year 시즌 테이블, sabermetrics(WAR/wRC+/FIP),
// 스플릿(vs 좌우·홈원정·월별), Baseball Savant 퍼센타일, 투수 구종 arsenal.
// 전부 statsapi.mlb.com (무료, 인증 없음) + baseballsavant.mlb.com 퍼센타일 CSV.

import axios from "axios";
import { unstable_cache } from "next/cache";
import { toKoreanTeamName } from "@/lib/team-names";

const client = axios.create({
  baseURL: "https://statsapi.mlb.com/api/v1",
  timeout: 15000,
});

interface RawSplit {
  season?: string;
  team?: { id?: number; name?: string };
  league?: { name?: string };
  isHome?: boolean;
  month?: number;
  split?: { code?: string; description?: string };
  stat?: Record<string, unknown>;
  _type?: string;
}

// people/{id}/stats — 여러 type 을 한 번에 받아 split 마다 _type 표식.
async function getSplits(
  personId: number,
  params: Record<string, string>,
): Promise<RawSplit[]> {
  try {
    const { data } = await client.get(`/people/${personId}/stats`, { params });
    const out: RawSplit[] = [];
    for (const grp of data?.stats ?? []) {
      const t = grp?.type?.displayName as string | undefined;
      for (const s of grp?.splits ?? []) out.push({ ...s, _type: t });
    }
    return out;
  } catch {
    return [];
  }
}

const numOrU = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const strOrU = (v: unknown): string | undefined =>
  v == null || v === "" ? undefined : String(v);

// 비율 문자열(".138") → 퍼센트(13.8)
function rateToPct(rate: unknown): number | undefined {
  if (rate == null) return undefined;
  const n = parseFloat(String(rate));
  return Number.isFinite(n) ? Math.round(n * 1000) / 10 : undefined;
}

// season 별 대표 split 선택 — 멀티팀 시즌(트레이드)은 합산행(team 없음) 우선.
function pickBySeason(
  splits: RawSplit[],
): Map<string, { split: RawSplit; teams: number }> {
  const bySeason = new Map<string, RawSplit[]>();
  for (const s of splits) {
    const y = String(s.season ?? "");
    if (!y) continue;
    let a = bySeason.get(y);
    if (!a) {
      a = [];
      bySeason.set(y, a);
    }
    a.push(s);
  }
  const out = new Map<string, { split: RawSplit; teams: number }>();
  for (const [y, arr] of bySeason) {
    if (arr.length === 1) {
      out.set(y, { split: arr[0], teams: 1 });
    } else {
      const agg = arr.find((s) => !s.team?.name);
      const teams = arr.filter((s) => s.team?.name).length;
      out.set(y, { split: agg ?? arr[arr.length - 1], teams });
    }
  }
  return out;
}

function teamLabelOf(split: RawSplit, teams: number): string {
  if (teams > 1) return `${teams}팀`;
  const name = split.team?.name ?? "";
  return toKoreanTeamName(name) || name || "";
}

/* ============================================================
 * year-by-year 시즌 테이블 (타자 / 투수)
 * ==========================================================*/

export interface HitterSeasonRow {
  season: string;
  teamLabel: string;
  league?: string;
  g?: number;
  pa?: number;
  avg?: string;
  obp?: string;
  slg?: string;
  ops?: string;
  hr?: number;
  rbi?: number;
  r?: number;
  h?: number;
  bb?: number;
  so?: number;
  sb?: number;
  iso?: string;
  babip?: string;
  bbPct?: number;
  kPct?: number;
  // sabermetrics (시즌별 별도 머지)
  war?: number;
  wrcPlus?: number;
  woba?: number;
}

export interface PitcherSeasonRow {
  season: string;
  teamLabel: string;
  league?: string;
  g?: number;
  gs?: number;
  w?: number;
  l?: number;
  sv?: number;
  ip?: string;
  era?: string;
  whip?: string;
  so?: number;
  bb?: number;
  hr?: number;
  k9?: string;
  avg?: string;
  war?: number;
  fip?: number;
  eraMinus?: number;
}

// 시즌별 sabermetrics — season 마다 1콜 병렬 (yearByYear 에는 WAR/wRC+/FIP 없음).
async function fetchSabrBySeason(
  personId: number,
  seasons: string[],
  group: "hitting" | "pitching",
): Promise<Map<string, Record<string, number>>> {
  const entries = await Promise.all(
    seasons.map(async (y) => {
      const splits = await getSplits(personId, {
        stats: "sabermetrics",
        group,
        season: y,
      });
      const agg = splits.find((s) => !s.team?.name) ?? splits[0];
      return [y, agg?.stat ?? null] as const;
    }),
  );
  const m = new Map<string, Record<string, number>>();
  for (const [y, stat] of entries) {
    if (!stat) continue;
    const obj: Record<string, number> = {};
    for (const [k, v] of Object.entries(stat)) {
      const n = Number(v);
      if (Number.isFinite(n)) obj[k] = n;
    }
    m.set(y, obj);
  }
  return m;
}

async function fetchHitterCareerRaw(personId: number): Promise<HitterSeasonRow[]> {
  const splits = await getSplits(personId, {
    stats: "yearByYear,yearByYearAdvanced",
    group: "hitting",
  });
  const basic = pickBySeason(splits.filter((s) => s._type === "yearByYear"));
  const adv = pickBySeason(splits.filter((s) => s._type === "yearByYearAdvanced"));
  const rows: HitterSeasonRow[] = [];
  for (const [season, { split, teams }] of basic) {
    const st = split.stat ?? {};
    const a = adv.get(season)?.split.stat ?? {};
    rows.push({
      season,
      teamLabel: teamLabelOf(split, teams),
      league: split.league?.name,
      g: numOrU(st.gamesPlayed),
      pa: numOrU(st.plateAppearances),
      avg: strOrU(st.avg),
      obp: strOrU(st.obp),
      slg: strOrU(st.slg),
      ops: strOrU(st.ops),
      hr: numOrU(st.homeRuns),
      rbi: numOrU(st.rbi),
      r: numOrU(st.runs),
      h: numOrU(st.hits),
      bb: numOrU(st.baseOnBalls),
      so: numOrU(st.strikeOuts),
      sb: numOrU(st.stolenBases),
      iso: strOrU(a.iso),
      babip: strOrU(a.babip ?? st.babip),
      bbPct: rateToPct(a.walksPerPlateAppearance),
      kPct: rateToPct(a.strikeoutsPerPlateAppearance),
    });
  }
  rows.sort((x, y) => x.season.localeCompare(y.season));
  if (rows.length > 0) {
    const sabr = await fetchSabrBySeason(personId, rows.map((r) => r.season), "hitting");
    for (const r of rows) {
      const s = sabr.get(r.season);
      if (!s) continue;
      if (s.war != null) r.war = Math.round(s.war * 10) / 10;
      if (s.wRcPlus != null) r.wrcPlus = Math.round(s.wRcPlus);
      if (s.woba != null) r.woba = Math.round(s.woba * 1000) / 1000;
    }
  }
  return rows;
}

async function fetchPitcherCareerRaw(personId: number): Promise<PitcherSeasonRow[]> {
  const splits = await getSplits(personId, { stats: "yearByYear", group: "pitching" });
  const basic = pickBySeason(splits);
  const rows: PitcherSeasonRow[] = [];
  for (const [season, { split, teams }] of basic) {
    const st = split.stat ?? {};
    rows.push({
      season,
      teamLabel: teamLabelOf(split, teams),
      league: split.league?.name,
      g: numOrU(st.gamesPlayed),
      gs: numOrU(st.gamesStarted),
      w: numOrU(st.wins),
      l: numOrU(st.losses),
      sv: numOrU(st.saves),
      ip: strOrU(st.inningsPitched),
      era: strOrU(st.era),
      whip: strOrU(st.whip),
      so: numOrU(st.strikeOuts),
      bb: numOrU(st.baseOnBalls),
      hr: numOrU(st.homeRuns),
      k9: strOrU(st.strikeoutsPer9Inn),
      avg: strOrU(st.avg),
    });
  }
  rows.sort((x, y) => x.season.localeCompare(y.season));
  if (rows.length > 0) {
    const sabr = await fetchSabrBySeason(personId, rows.map((r) => r.season), "pitching");
    for (const r of rows) {
      const s = sabr.get(r.season);
      if (!s) continue;
      if (s.war != null) r.war = Math.round(s.war * 10) / 10;
      if (s.fip != null) r.fip = Math.round(s.fip * 100) / 100;
      if (s.eraMinus != null) r.eraMinus = Math.round(s.eraMinus);
    }
  }
  return rows;
}

export const getHitterCareer = unstable_cache(fetchHitterCareerRaw, ["mlb-hitter-career-v1"], {
  revalidate: 3600,
});
export const getPitcherCareer = unstable_cache(fetchPitcherCareerRaw, ["mlb-pitcher-career-v1"], {
  revalidate: 3600,
});

/* ============================================================
 * 스플릿 — vs 좌/우, 홈/원정, 월별
 * ==========================================================*/

export interface SplitRow {
  label: string;
  avg?: string;
  ops?: string;
  obp?: string;
  slg?: string;
  hr?: number;
  pa?: number;
  era?: string;
  whip?: string;
  ip?: string;
  so?: number;
}

export interface PlayerSplits {
  vsLeft?: SplitRow;
  vsRight?: SplitRow;
  home?: SplitRow;
  away?: SplitRow;
  byMonth: SplitRow[];
}

const MONTH_KO: Record<number, string> = {
  3: "3월",
  4: "4월",
  5: "5월",
  6: "6월",
  7: "7월",
  8: "8월",
  9: "9월",
  10: "10월",
};

function toSplitRow(s: RawSplit, label: string, group: "hitting" | "pitching"): SplitRow {
  const st = s.stat ?? {};
  if (group === "hitting") {
    return {
      label,
      avg: strOrU(st.avg),
      ops: strOrU(st.ops),
      obp: strOrU(st.obp),
      slg: strOrU(st.slg),
      hr: numOrU(st.homeRuns),
      pa: numOrU(st.plateAppearances),
    };
  }
  return {
    label,
    era: strOrU(st.era),
    whip: strOrU(st.whip),
    ip: strOrU(st.inningsPitched),
    so: numOrU(st.strikeOuts),
    avg: strOrU(st.avg),
  };
}

async function fetchSplitsRaw(
  personId: number,
  season: number,
  group: "hitting" | "pitching",
): Promise<PlayerSplits> {
  const [lr, ha] = await Promise.all([
    getSplits(personId, {
      stats: "statSplits",
      sitCodes: "vl,vr",
      group,
      season: String(season),
    }),
    getSplits(personId, { stats: "homeAndAway,byMonth", group, season: String(season) }),
  ]);
  const vlLabel = group === "pitching" ? "vs 좌타" : "vs 좌투";
  const vrLabel = group === "pitching" ? "vs 우타" : "vs 우투";
  const res: PlayerSplits = { byMonth: [] };
  for (const s of lr) {
    if (s.split?.code === "vl") res.vsLeft = toSplitRow(s, vlLabel, group);
    if (s.split?.code === "vr") res.vsRight = toSplitRow(s, vrLabel, group);
  }
  const months: { m: number; row: SplitRow }[] = [];
  for (const s of ha) {
    if (s._type === "homeAndAway") {
      if (s.isHome === true) res.home = toSplitRow(s, "홈", group);
      else if (s.isHome === false) res.away = toSplitRow(s, "원정", group);
    } else if (s._type === "byMonth" && s.month != null) {
      months.push({ m: s.month, row: toSplitRow(s, MONTH_KO[s.month] ?? `${s.month}월`, group) });
    }
  }
  months.sort((a, b) => a.m - b.m);
  res.byMonth = months.map((x) => x.row);
  return res;
}

export const getPlayerSplits = unstable_cache(fetchSplitsRaw, ["mlb-splits-v1"], {
  revalidate: 3600,
});

/* ============================================================
 * Baseball Savant 퍼센타일 (Statcast)
 * ==========================================================*/

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// 연도+타입별 전체 선수 퍼센타일 CSV → player_id → {지표: 0~100}.
async function fetchSavantPercentilesRaw(
  year: number,
  type: "batter" | "pitcher",
): Promise<Record<string, Record<string, number>>> {
  try {
    const { data } = await axios.get<string>(
      `https://baseballsavant.mlb.com/leaderboard/percentile-rankings?type=${type}&year=${year}&csv=true`,
      { timeout: 20000, responseType: "text" },
    );
    const lines = data.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return {};
    const header = parseCsvLine(lines[0].replace(/^﻿/, "")).map((h) =>
      h.replace(/^"|"$/g, ""),
    );
    const idIdx = header.indexOf("player_id");
    if (idIdx < 0) return {};
    const out: Record<string, Record<string, number>> = {};
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]).map((c) => c.replace(/^"|"$/g, ""));
      const pid = cells[idIdx];
      if (!pid) continue;
      const obj: Record<string, number> = {};
      for (let j = 0; j < header.length; j++) {
        const key = header[j];
        if (key === "player_name" || key === "player_id" || key === "year") continue;
        const v = cells[j];
        if (v == null || v === "") continue;
        const n = Number(v);
        if (Number.isFinite(n)) obj[key] = n;
      }
      out[pid] = obj;
    }
    return out;
  } catch {
    return {};
  }
}

export const getSavantPercentiles = unstable_cache(
  fetchSavantPercentilesRaw,
  ["savant-percentiles-v1"],
  { revalidate: 21600 }, // 6h — 전체 리더보드라 무겁다.
);

// 선수 1명 — 올 시즌 우선, 없으면 직전 시즌(시즌 초·미집계 대비).
export async function fetchPlayerPercentiles(
  personId: number,
  season: number,
  type: "batter" | "pitcher",
): Promise<{ year: number; values: Record<string, number> } | null> {
  for (const y of [season, season - 1]) {
    const all = await getSavantPercentiles(y, type);
    const v = all[String(personId)];
    if (v && Object.keys(v).length > 0) return { year: y, values: v };
  }
  return null;
}

/* ============================================================
 * 투수 구종 arsenal
 * ==========================================================*/

const PITCH_KO: Record<string, string> = {
  FF: "포심",
  FT: "투심",
  SI: "싱커",
  FC: "커터",
  SL: "슬라이더",
  ST: "스위퍼",
  SV: "슬러브",
  CU: "커브",
  KC: "너클커브",
  CS: "슬로우커브",
  CH: "체인지업",
  FS: "스플리터",
  FO: "포크볼",
  SC: "스크류볼",
  KN: "너클볼",
  EP: "이퓨스",
};

export interface ArsenalPitch {
  code: string;
  name: string;
  usage: number; // %
  mph: number;
}

async function fetchArsenalRaw(personId: number, season: number): Promise<ArsenalPitch[]> {
  const splits = await getSplits(personId, {
    stats: "pitchArsenal",
    group: "pitching",
    season: String(season),
  });
  const out: ArsenalPitch[] = [];
  for (const s of splits) {
    const st = s.stat ?? {};
    const t = st.type as { code?: string; description?: string } | undefined;
    const code = t?.code ?? "";
    const pct = numOrU(st.percentage);
    const mph = numOrU(st.averageSpeed);
    if (pct == null) continue;
    out.push({
      code,
      name: PITCH_KO[code] ?? t?.description ?? code,
      usage: Math.round(pct * 1000) / 10,
      mph: mph != null ? Math.round(mph * 10) / 10 : 0,
    });
  }
  out.sort((a, b) => b.usage - a.usage);
  return out;
}

export const getPitchArsenal = unstable_cache(fetchArsenalRaw, ["mlb-arsenal-v1"], {
  revalidate: 21600,
});

/* ============================================================
 * 타구 분포 (스프레이차트) — Statcast search CSV 의 hc_x/hc_y 좌표
 * ==========================================================*/

export interface BattedBall {
  x: number; // hc_x (원본 Statcast 좌표)
  y: number; // hc_y
  result: "hr" | "hit" | "out";
  ev?: number; // 타구 속도(mph)
}

const HIT_EVENTS = new Set(["single", "double", "triple"]);

// 한 타자의 시즌 인플레이 타구 좌표 — Savant statcast_search CSV(무거움, pitch 단위)를
// 받아 hc_x/hc_y 있는 행(=인플레이)만 추린다. 6h 캐시라 파싱 결과(작은 배열)만 보관.
async function fetchBattedBallsRaw(personId: number, season: number): Promise<BattedBall[]> {
  try {
    const { data } = await axios.get<string>(
      // hfSea 가 실제 시즌 필터. game_year 는 무시돼 커리어 전체(25000행 캡)를 반환하므로 금지.
      `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfSea=${season}%7C&player_type=batter&batters_lookup[]=${personId}&type=details`,
      { timeout: 25000, responseType: "text" },
    );
    const lines = data.split("\n");
    if (lines.length < 2) return [];
    const header = parseCsvLine(lines[0].replace(/^﻿/, "")).map((h) => h.replace(/^"|"$/g, ""));
    const iX = header.indexOf("hc_x");
    const iY = header.indexOf("hc_y");
    const iEv = header.indexOf("events");
    const iSpeed = header.indexOf("launch_speed");
    if (iX < 0 || iY < 0 || iEv < 0) return [];
    const out: BattedBall[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const c = parseCsvLine(lines[i]).map((s) => s.replace(/^"|"$/g, ""));
      const x = Number(c[iX]);
      const y = Number(c[iY]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) continue;
      const ev = c[iEv] ?? "";
      const result: BattedBall["result"] =
        ev === "home_run" ? "hr" : HIT_EVENTS.has(ev) ? "hit" : "out";
      const speed = iSpeed >= 0 ? Number(c[iSpeed]) : NaN;
      out.push({ x, y, result, ev: Number.isFinite(speed) ? speed : undefined });
    }
    return out;
  } catch {
    return [];
  }
}

export const getBattedBalls = unstable_cache(fetchBattedBallsRaw, ["mlb-batted-balls-v1"], {
  revalidate: 21600,
});

/* ============================================================
 * 투구 로케이션 (존 히트맵) — Statcast plate_x/plate_z + 구종
 * ==========================================================*/

export interface PitchLoc {
  px: number; // plate_x (ft, 포수 시점 좌우)
  pz: number; // plate_z (ft, 지면 기준 높이)
  code: string; // pitch_type (FF/SL/CU…)
}

// 한 투수의 시즌 투구 로케이션 — pitcher lookup CSV. plate_x/plate_z 유효 행만.
async function fetchPitchLocationsRaw(personId: number, season: number): Promise<PitchLoc[]> {
  try {
    const { data } = await axios.get<string>(
      // hfSea 가 실제 시즌 필터. game_year 는 무시돼 커리어 전체(25000행 캡)를 반환하므로 금지.
      `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfSea=${season}%7C&player_type=pitcher&pitchers_lookup[]=${personId}&type=details`,
      { timeout: 25000, responseType: "text" },
    );
    const lines = data.split("\n");
    if (lines.length < 2) return [];
    const header = parseCsvLine(lines[0].replace(/^﻿/, "")).map((h) => h.replace(/^"|"$/g, ""));
    const iType = header.indexOf("pitch_type");
    const iPx = header.indexOf("plate_x");
    const iPz = header.indexOf("plate_z");
    if (iType < 0 || iPx < 0 || iPz < 0) return [];
    const out: PitchLoc[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const c = parseCsvLine(lines[i]).map((s) => s.replace(/^"|"$/g, ""));
      const px = Number(c[iPx]);
      const pz = Number(c[iPz]);
      const code = c[iType] ?? "";
      if (!code || !Number.isFinite(px) || !Number.isFinite(pz)) continue;
      out.push({ px, pz, code });
    }
    return out;
  } catch {
    return [];
  }
}

export const getPitchLocations = unstable_cache(fetchPitchLocationsRaw, ["mlb-pitch-loc-v1"], {
  revalidate: 21600,
});
