// 야구 주간 선수 집계 — KBO·NPB 는 경기별 선수 로그(KboPlayerGameLog·NpbPlayerGameLog)를 주간 창으로 합산,
// MLB 는 statsapi 주간 스플릿(buildMlbWeeklyPlayers)을 같은 모양으로 맞춘다. 카드(api/og/baseball-weekly-card)의 단일 출처.
// 창 = end(KST 날짜, 포함) 기준 지난 7일. 타자는 OPS 순(규정 타수 이상), 투수는 ERA 순(규정 이닝 이상).
import { prisma } from "@/lib/db";
import { buildMlbWeeklyPlayers } from "./mlb-weekly-players";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import { npbPlayerKo, npbPlayerPhoto } from "@/lib/sports/npb-player-ko";

export interface WeeklyBatterRow {
  id: string; // 선수 페이지 pid (KBO kboId · NPB npbId · MLB personId)
  name: string;
  team: string;
  photo: string | null;
  games: number;
  ab: number;
  h: number;
  hr: number;
  rbi: number;
  sb: number;
  avg: number;
  ops: number;
}

export interface WeeklyPitcherRow {
  id: string;
  name: string;
  team: string;
  photo: string | null;
  games: number;
  ip: string; // 표시용 "12.2"
  ipNum: number;
  er: number;
  so: number;
  era: number;
  wins: number;
  losses: number;
  saves: number;
  whip: number | null;
}

export interface BaseballWeeklyPlayers {
  league: string;
  from: string; // KST YYYY-MM-DD
  to: string;
  batters: WeeklyBatterRow[]; // OPS 순
  pitchers: WeeklyPitcherRow[]; // ERA 순
}

// 주 6경기 기준 주전 타자 ≈ 20타수 — 12 로 두면 3경기 12타수 표본이 OPS 1위로 올라온다(실측)
const MIN_AB: Record<string, number> = { KBO: 15, NPB: 15, MLB: 15 };
const MIN_IP: Record<string, number> = { KBO: 5, NPB: 5, MLB: 5 };

const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);

/** "5 2/3" · "5.2" · "7" → 5.667 · 5.667 · 7 */
export function parseIp(ip: string | null | undefined): number {
  if (!ip) return 0;
  const s = ip.trim();
  const frac = s.match(/^(\d+)?\s*(\d)\/3$/);
  if (frac) return Number(frac[1] ?? 0) + Number(frac[2]) / 3;
  const dot = s.match(/^(\d+)\.(\d)$/);
  if (dot) return Number(dot[1]) + Number(dot[2]) / 3;
  return Number(s) || 0;
}
export const fmtIp = (n: number) => `${Math.floor(n)}.${Math.round((n - Math.floor(n)) * 3)}`;

interface LogRow {
  pid: string;
  role: string;
  name: string | null;
  team: string | null;
  result: string | null;
  ip: string | null;
  er: number | null;
  ab: number | null;
  d2b: number | null;
  d3b: number | null;
  rbi: number | null;
  sb: number | null;
  h: number | null;
  hr: number | null;
  bb: number | null;
  so: number | null;
  hbp?: number | null;
}

function aggregateLogs(league: string, rows: LogRow[], nameOf: (r: LogRow) => string, photoOf: (pid: string) => string | null) {
  const bat = new Map<string, WeeklyBatterRow & { bb: number; d2b: number; d3b: number; hbp: number }>();
  const pit = new Map<string, WeeklyPitcherRow & { h: number; bb: number }>();
  for (const r of rows) {
    if (r.role === "B") {
      let b = bat.get(r.pid);
      if (!b) {
        b = { id: r.pid, name: nameOf(r), team: r.team ?? "", photo: photoOf(r.pid), games: 0, ab: 0, h: 0, hr: 0, rbi: 0, sb: 0, avg: 0, ops: 0, bb: 0, d2b: 0, d3b: 0, hbp: 0 };
        bat.set(r.pid, b);
      }
      b.games++;
      b.ab += r.ab ?? 0; b.h += r.h ?? 0; b.hr += r.hr ?? 0; b.rbi += r.rbi ?? 0; b.sb += r.sb ?? 0;
      b.bb += r.bb ?? 0; b.d2b += r.d2b ?? 0; b.d3b += r.d3b ?? 0; b.hbp += r.hbp ?? 0;
    } else if (r.role === "P") {
      let p = pit.get(r.pid);
      if (!p) {
        p = { id: r.pid, name: nameOf(r), team: r.team ?? "", photo: photoOf(r.pid), games: 0, ip: "0.0", ipNum: 0, er: 0, so: 0, era: 0, wins: 0, losses: 0, saves: 0, whip: null, h: 0, bb: 0 };
        pit.set(r.pid, p);
      }
      p.games++;
      p.ipNum += parseIp(r.ip); p.er += r.er ?? 0; p.so += r.so ?? 0; p.h += r.h ?? 0; p.bb += r.bb ?? 0;
      if (r.result === "W") p.wins++; else if (r.result === "L") p.losses++; else if (r.result === "S") p.saves++;
    }
  }
  const batters = [...bat.values()]
    .filter((b) => b.ab >= (MIN_AB[league] ?? 12))
    .map((b) => {
      const singles = b.h - b.d2b - b.d3b - b.hr;
      const tb = singles + 2 * b.d2b + 3 * b.d3b + 4 * b.hr;
      const pa = b.ab + b.bb + b.hbp;
      const obp = pa ? (b.h + b.bb + b.hbp) / pa : 0;
      const slg = b.ab ? tb / b.ab : 0;
      const { bb: _bb, d2b: _d, d3b: _t, hbp: _h, ...rest } = b;
      void _bb; void _d; void _t; void _h;
      return { ...rest, avg: b.ab ? b.h / b.ab : 0, ops: obp + slg };
    })
    .sort((a, b) => b.ops - a.ops || b.hr - a.hr);
  const pitchers = [...pit.values()]
    .filter((p) => p.ipNum >= (MIN_IP[league] ?? 5))
    .map((p) => {
      const { h, bb, ...rest } = p;
      return { ...rest, ip: fmtIp(p.ipNum), era: (p.er * 9) / p.ipNum, whip: (h + bb) / p.ipNum };
    })
    .sort((a, b) => a.era - b.era || b.ipNum - a.ipNum || b.so - a.so);
  return { batters, pitchers };
}

export async function getBaseballWeeklyPlayers(league: string, endKst?: string): Promise<BaseballWeeklyPlayers | null> {
  const to = endKst ?? kstDay(new Date());
  const toDate = new Date(`${to}T00:00:00Z`);
  const fromDate = new Date(toDate.getTime() - 6 * 86400000);
  const from = fromDate.toISOString().slice(0, 10);

  if (league === "MLB") {
    // statsapi 주간 스플릿 — refDate 는 창 종료일 KST 자정
    const d = await buildMlbWeeklyPlayers(new Date(`${to}T23:59:59+09:00`));
    if (!d) return null;
    const photo = (id: number | null) => (id ? `https://midfield.mlbstatic.com/v1/people/${id}/spots/120` : null);
    return {
      league, from: d.startDate, to: d.endDate,
      batters: d.topHitters.map((h) => ({
        id: String(h.personId ?? ""), name: h.name, team: h.team, photo: photo(h.personId), games: h.games, ab: h.atBats,
        h: Math.round((h.avg ?? 0) * h.atBats), hr: h.homeRuns, rbi: h.rbi, sb: h.stolenBases, avg: h.avg ?? 0, ops: h.ops ?? 0,
      })),
      pitchers: d.topPitchers.map((p) => ({
        id: String(p.personId ?? ""), name: p.name, team: p.team, photo: photo(p.personId), games: 0, ip: p.inningsPitched, ipNum: p.ipNum,
        er: Math.round(((p.era ?? 0) * p.ipNum) / 9), so: p.strikeOuts, era: p.era ?? 0, wins: p.wins, losses: p.losses, saves: p.saves, whip: p.whip,
      })),
    };
  }

  const where = { date: { gte: fromDate, lte: toDate } };
  const select = { role: true, name: true, team: true, result: true, ip: true, er: true, ab: true, d2b: true, d3b: true, rbi: true, sb: true, h: true, hr: true, bb: true, so: true };
  if (league === "KBO") {
    const rows = await prisma.kboPlayerGameLog.findMany({ where, select: { ...select, kboId: true } });
    if (rows.length === 0) return null;
    const logs: LogRow[] = rows.map((r) => ({ ...r, pid: r.kboId }));
    return { league, from, to, ...aggregateLogs(league, logs, (r) => r.name ?? r.pid, (pid) => kboPhotoUrl(pid)) };
  }
  if (league === "NPB") {
    const rows = await prisma.npbPlayerGameLog.findMany({ where, select: { ...select, npbId: true, hbp: true } });
    if (rows.length === 0) return null;
    const logs: LogRow[] = rows.map((r) => ({ ...r, pid: r.npbId }));
    return { league, from, to, ...aggregateLogs(league, logs, (r) => npbPlayerKo(r.pid, r.name ?? r.pid), (pid) => npbPlayerPhoto(pid) ?? null) };
  }
  return null;
}
