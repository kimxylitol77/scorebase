// 불펜 피로도 트래커 — MLB(statsapi 박스스코어 투구수)·KBO(KboPlayerGameLog 등판·이닝·타자수)·NPB(NpbPlayerGameLog 투구수)를 같은 틀로 요약.
// 판정은 순수함수(assessPitcher)로 두고, 데이터 적재만 종목별 loader 가 맡는다.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { fetchMlbTeamPitchingLog, mlbIpToInnings } from "@/lib/sports/mlb-stats-api";
import { npbPlayerKo } from "@/lib/sports/npb-player-ko";
import { toKoreanPlayerName } from "@/lib/player-names";

/** 한 투수의 하루 등판. pitches 는 MLB·NPB 만(KBO 공식 기록엔 투구수가 없다). */
export interface PitcherUsage {
  date: string;
  pitches: number | null;
  /** 실수 이닝 (1 1/3 → 1.33) */
  innings: number;
  tbf: number | null;
  er: number | null;
}

export type FatigueStatus = "rested" | "caution" | "heavy" | "danger";

export interface PitcherReport {
  pid: string;
  name: string;
  href: string | null;
  usage: PitcherUsage[];
  /** 기준일 전날부터 거슬러 센 연속 등판 일수 */
  consecutiveDays: number;
  apps3d: number;
  pitches3d: number | null;
  tbf3d: number;
  status: FatigueStatus;
  note: string;
}

export interface BullpenTeamReport {
  team: string;
  /** 표시 창 — 오래된 날 → 기준일 전날, 길이 WINDOW_DAYS */
  days: string[];
  pitchers: PitcherReport[];
  /** 투구수 기반 판정인지(MLB) — false 면 이닝·타자수로만 본다(KBO) */
  hasPitchCounts: boolean;
}

export const WINDOW_DAYS = 6;
/** 3일 누적 투구수 과부하 임계(MLB). 불펜 투수 하루 20구 안팎이 보통이라 3일 40구면 두 번 이상 길게 던진 것. */
export const HEAVY_PITCHES_3D = 40;
/** 투구수 없는 KBO 는 3일 상대 타자 수로 대신. 1이닝 ≈ 4타자, 3일 10타자면 세 번 가까이 나온 셈. */
export const HEAVY_TBF_3D = 10;

export const STATUS_LABEL: Record<FatigueStatus, string> = {
  rested: "휴식 충분",
  caution: "어제 등판",
  heavy: "과부하",
  danger: "연투 중",
};

/** "YYYY-MM-DD" 에서 n일 전 */
export function shiftDate(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 기준일(asOf) 전날까지 WINDOW_DAYS 일 — 오래된 날부터 */
export function windowDays(asOf: string): string[] {
  return Array.from({ length: WINDOW_DAYS }, (_, i) => shiftDate(asOf, i - WINDOW_DAYS));
}

/** KBO 표기 "1 1/3" · "2/3" · "5" → 실수 이닝 */
export function kboIpToInnings(ip: string | null | undefined): number {
  if (!ip) return 0;
  let total = 0;
  for (const part of ip.trim().split(/\s+/)) {
    const frac = part.match(/^(\d)\/(\d)$/);
    if (frac) total += Number(frac[1]) / Number(frac[2]);
    else if (/^\d+$/.test(part)) total += Number(part);
  }
  return total;
}

/**
 * 한 투수 판정. days 는 오래된 날 → 전날 순.
 * - 연투: 전날부터 거슬러 연속 등판 일수. 2일 이상이면 "연투 중"(3연투 부담).
 * - 과부하: 최근 3일 누적 투구수(MLB) 또는 상대 타자 수(KBO)가 임계 이상.
 * - 어제 등판: 하루만 던졌으면 주의.
 */
export function assessPitcher(
  base: { pid: string; name: string; href: string | null },
  usage: PitcherUsage[],
  days: string[],
): PitcherReport {
  const byDate = new Map(usage.map((u) => [u.date, u]));
  let consecutiveDays = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (!byDate.has(days[i])) break;
    consecutiveDays++;
  }
  const last3 = days.slice(-3).map((d) => byDate.get(d)).filter((u): u is PitcherUsage => !!u);
  const apps3d = last3.length;
  const hasPitches = last3.some((u) => u.pitches != null);
  const pitches3d = hasPitches ? last3.reduce((a, u) => a + (u.pitches ?? 0), 0) : null;
  const tbf3d = last3.reduce((a, u) => a + (u.tbf ?? 0), 0);

  let status: FatigueStatus = "rested";
  let note = "이틀 이상 쉼";
  if (consecutiveDays >= 2) {
    status = "danger";
    note = `${consecutiveDays}연투 — 오늘 나오면 ${consecutiveDays + 1}연투`;
  } else if (pitches3d != null ? pitches3d >= HEAVY_PITCHES_3D : tbf3d >= HEAVY_TBF_3D) {
    status = "heavy";
    note = pitches3d != null ? `3일 ${pitches3d}구` : `3일 ${apps3d}회 등판 · ${tbf3d}타자`;
  } else if (consecutiveDays === 1) {
    status = "caution";
    note = pitches3d != null ? `어제 ${byDate.get(days[days.length - 1])?.pitches ?? 0}구` : "어제 등판";
  }
  return { ...base, usage, consecutiveDays, apps3d, pitches3d, tbf3d, status, note };
}

const SEVERITY: Record<FatigueStatus, number> = { danger: 3, heavy: 2, caution: 1, rested: 0 };

function finishReport(team: string, days: string[], pitchers: PitcherReport[], hasPitchCounts: boolean): BullpenTeamReport {
  pitchers.sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || b.usage.length - a.usage.length || a.name.localeCompare(b.name));
  return { team, days, pitchers, hasPitchCounts };
}

/** MLB — 창 안에서 선발(등판 순서 0)로 나온 적 있는 투수는 불펜에서 뺀다. */
async function loadMlbBullpenRaw(teamName: string, asOf: string): Promise<BullpenTeamReport | null> {
  const days = windowDays(asOf);
  const log = await fetchMlbTeamPitchingLog(teamName, days[0], days[days.length - 1]);
  if (!log) return null;
  const starters = new Set(log.filter((a) => a.order === 0).map((a) => a.pid));
  const byPid = new Map<number, { name: string; usage: PitcherUsage[] }>();
  for (const a of log) {
    if (starters.has(a.pid)) continue;
    // 선수 페이지와 같은 사전(toKoreanPlayerName)으로 한글화 — 탭은 영문·클릭하면 한글이던 불일치(사용자 신고 2026-09-24)
    const e = byPid.get(a.pid) ?? { name: toKoreanPlayerName(a.name) || a.name, usage: [] };
    e.usage.push({ date: a.date, pitches: a.pitches, innings: mlbIpToInnings(a.ip ?? undefined), tbf: a.tbf, er: a.er });
    byPid.set(a.pid, e);
  }
  const pitchers = [...byPid.entries()].map(([pid, e]) =>
    assessPitcher({ pid: String(pid), name: e.name, href: `/players/${pid}` }, e.usage, days),
  );
  return finishReport(teamName, days, pitchers, true);
}

/** KBO 팀명("KT 위즈") → 경기 로그 team 표기("KT"). 10개 구단 전부 첫 어절이 약칭. */
export const kboTeamAbbr = (teamName: string) => teamName.split(" ")[0];

/** KBO — 창 안에서 "선발" 로 나온 적 있는 투수는 불펜에서 뺀다. 로그는 전날 05:30 KST 에 적재되므로 전날까지 반영. */
async function loadKboBullpenRaw(teamName: string, asOf: string): Promise<BullpenTeamReport | null> {
  const days = windowDays(asOf);
  const rows = await prisma.kboPlayerGameLog.findMany({
    where: {
      role: "P",
      team: kboTeamAbbr(teamName),
      date: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days[days.length - 1]}T00:00:00Z`) },
    },
    select: { kboId: true, name: true, date: true, roleDetail: true, ip: true, tbf: true, er: true },
  });
  const starters = new Set(rows.filter((r) => r.roleDetail === "선발").map((r) => r.kboId));
  const byPid = new Map<string, { name: string; usage: PitcherUsage[] }>();
  for (const r of rows) {
    if (starters.has(r.kboId)) continue;
    const e = byPid.get(r.kboId) ?? { name: r.name ?? r.kboId, usage: [] };
    e.usage.push({ date: r.date.toISOString().slice(0, 10), pitches: null, innings: kboIpToInnings(r.ip), tbf: r.tbf, er: r.er });
    byPid.set(r.kboId, e);
  }
  const pitchers = [...byPid.entries()].map(([pid, e]) =>
    assessPitcher({ pid, name: e.name, href: `/players/${pid}?league=KBO` }, e.usage, days),
  );
  return finishReport(teamName, days, pitchers, false);
}

/** NPB Team.shortName → 경기 로그 team 표기. 로그는 npb.jp 박스스코어를 한국어 약칭으로 적는데 두 팀만 표기가 다르다. */
export const npbLogTeam = (shortName: string) => ({ 요코하마: "DeNA", 지바롯데: "롯데" })[shortName] ?? shortName;

/** NPB — KBO 와 같은 로그 패턴이되 투구수가 있어 MLB 식 판정. 이름은 pid 카나 사전으로 한글화(없으면 박스스코어 원문). */
async function loadNpbBullpenRaw(shortName: string, asOf: string): Promise<BullpenTeamReport | null> {
  const days = windowDays(asOf);
  const rows = await prisma.npbPlayerGameLog.findMany({
    where: {
      role: "P",
      team: npbLogTeam(shortName),
      date: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days[days.length - 1]}T00:00:00Z`) },
    },
    select: { npbId: true, name: true, date: true, roleDetail: true, ip: true, pitches: true, tbf: true, er: true },
  });
  const starters = new Set(rows.filter((r) => r.roleDetail === "선발").map((r) => r.npbId));
  const byPid = new Map<string, { name: string; usage: PitcherUsage[] }>();
  for (const r of rows) {
    if (starters.has(r.npbId)) continue;
    const e = byPid.get(r.npbId) ?? { name: npbPlayerKo(r.npbId, r.name ?? r.npbId), usage: [] };
    e.usage.push({ date: r.date.toISOString().slice(0, 10), pitches: r.pitches, innings: kboIpToInnings(r.ip), tbf: r.tbf, er: r.er });
    byPid.set(r.npbId, e);
  }
  const pitchers = [...byPid.entries()].map(([pid, e]) =>
    assessPitcher({ pid, name: e.name, href: `/players/${pid}?league=NPB` }, e.usage, days),
  );
  return finishReport(shortName, days, pitchers, true);
}

export type BullpenLeague = "MLB" | "KBO" | "NPB";

/** 경기 시작 시각 → 그 리그 현지 날짜(YYYY-MM-DD). MLB 는 동부, KBO·NPB 는 KST(일본과 같은 시간대). */
export function localGameDate(startTime: Date, league: BullpenLeague): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: league === "MLB" ? "America/New_York" : "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(startTime);
}

/** 팀·기준일 단위 1시간 캐시 — statsapi 박스스코어 6콜을 렌더마다 치지 않게. NPB 는 teamName 자리에 shortName. */
export const loadBullpenReport = unstable_cache(
  async (league: BullpenLeague, teamName: string, asOf: string): Promise<BullpenTeamReport | null> => {
    try {
      return league === "MLB"
        ? await loadMlbBullpenRaw(teamName, asOf)
        : league === "NPB"
          ? await loadNpbBullpenRaw(teamName, asOf)
          : await loadKboBullpenRaw(teamName, asOf);
    } catch (e) {
      console.warn(`[bullpen] ${league} ${teamName} ${asOf} 실패:`, (e as Error).message);
      return null;
    }
  },
  ["bullpen-fatigue-v1"],
  { revalidate: 3600 },
);
