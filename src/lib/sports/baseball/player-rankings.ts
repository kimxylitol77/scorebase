// 야구 선수 랭킹(KBO·MLB·NPB) — 시즌 성적 종합 지수(타자·투수), 연봉 대비 가성비, 경기별 로그 폼. /baseball/rankings 가 쓴다.
// 재료: BaseballPlayerSeasonStats(일일 적재) · PlayerSalary(KBO·MLB) · Kbo/NpbPlayerGameLog. 계산 근거는 docs/baseball-rankings.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { percentiles } from "@/lib/transfers/player-rankings";
import { getKboSalaries } from "@/lib/sports/kbo-salaries";

export type BbLeague = "KBO" | "MLB" | "NPB";
export type BbRole = "bat" | "pit";
export const BB_LEAGUES: BbLeague[] = ["KBO", "MLB", "NPB"];

export interface BbPlayerRow {
  key: string; // externalId 우선, 없으면 이름
  externalId: string | null;
  name: string;
  nameEn: string | null;
  team: string;
  games: number;
  avg: number | null; hits: number | null; hr: number | null; rbi: number | null; ops: number | null;
  era: number | null; whip: number | null; ip: number | null; so: number | null; w: number | null; l: number | null; sv: number | null;
  salary: number | null; // 만원(KBO, 국내 선수만)·달러(MLB) — 리그 안에서만 비교
  /** 경기별 로그 연결 id (KBO kboId · NPB npbId) */
  logId: string | null;
}

export interface BbForm {
  n: number; // 집계 경기 수
  // 타자
  ab?: number; ops?: number | null; avg?: number | null;
  // 투수
  ip?: number; era?: number | null;
}

export interface BbLeagueData { league: BbLeague; season: string; rows: BbPlayerRow[]; form: Record<string, BbForm>; salaryCoverage: number }

/** "5.1" 식 이닝 → 실수(5⅓). */
export function ipToNumber(ip: string | number | null | undefined): number {
  if (ip == null) return 0;
  if (typeof ip === "number") return ip;
  const [a, b] = ip.split(".");
  return (Number(a) || 0) + ((Number(b) || 0) % 3) / 3;
}

export const POWER_MIN_GAMES_RATIO = 0.5; // 리그 최다 출장 대비
export const POWER_MIN_IP = 30;
export const FORM_BAT_GAMES = 10;
export const FORM_BAT_MIN_AB = 25;
export const FORM_PIT_GAMES = 5;
export const FORM_PIT_MIN_IP = 10;
export const MLB_FORM_DAYS = 14; // MLB 는 경기별 로그가 없어 공식 API 기간 집계(최근 14일)로 폼을 잰다
export const BAT_WEIGHTS = { ops: 40, hr: 20, rbi: 15, avg: 15, hits: 10 } as const;
export const PIT_WEIGHTS = { era: 35, whip: 25, so: 20, ip: 10, wsv: 10 } as const;

export interface BbPowerRow { key: string; score: number; parts: { label: string; pct: number }[] }

/** 타자 종합 — 리그 최다 출장의 50% 이상 출장 타자, OPS·HR·RBI·AVG·안타 백분위 합성. */
export function computeBatPower(rows: BbPlayerRow[]): BbPowerRow[] {
  const bats = rows.filter((r) => r.ops != null && r.avg != null);
  const maxG = Math.max(0, ...bats.map((r) => r.games));
  const elig = bats.filter((r) => r.games >= maxG * POWER_MIN_GAMES_RATIO);
  if (elig.length === 0) return [];
  const P = (f: (r: BbPlayerRow) => number) => percentiles(elig.map((r) => [r.key, f(r)]));
  const ops = P((r) => r.ops!), hr = P((r) => r.hr ?? 0), rbi = P((r) => r.rbi ?? 0), avg = P((r) => r.avg!), hits = P((r) => r.hits ?? 0);
  return elig
    .map((r) => {
      const p = { ops: ops.get(r.key) ?? 0, hr: hr.get(r.key) ?? 0, rbi: rbi.get(r.key) ?? 0, avg: avg.get(r.key) ?? 0, hits: hits.get(r.key) ?? 0 };
      const score = (p.ops * BAT_WEIGHTS.ops + p.hr * BAT_WEIGHTS.hr + p.rbi * BAT_WEIGHTS.rbi + p.avg * BAT_WEIGHTS.avg + p.hits * BAT_WEIGHTS.hits) / 100;
      return { key: r.key, score: Math.round(score * 10) / 10, parts: [{ label: "OPS", pct: p.ops }, { label: "홈런", pct: p.hr }, { label: "타점", pct: p.rbi }, { label: "타율", pct: p.avg }, { label: "안타", pct: p.hits }] };
    })
    .sort((a, b) => b.score - a.score || b.parts[0].pct - a.parts[0].pct);
}

/** 투수 종합 — 30이닝 이상, ERA·WHIP(낮을수록 상위)·탈삼진·이닝·승+세이브 백분위 합성. */
export function computePitPower(rows: BbPlayerRow[]): BbPowerRow[] {
  const elig = rows.filter((r) => r.era != null && r.ip != null && r.ip >= POWER_MIN_IP);
  if (elig.length === 0) return [];
  const P = (f: (r: BbPlayerRow) => number) => percentiles(elig.map((r) => [r.key, f(r)]));
  const era = P((r) => -r.era!), whip = P((r) => -(r.whip ?? 9)), so = P((r) => r.so ?? 0), ip = P((r) => r.ip!), wsv = P((r) => (r.w ?? 0) + (r.sv ?? 0));
  return elig
    .map((r) => {
      const p = { era: era.get(r.key) ?? 0, whip: whip.get(r.key) ?? 0, so: so.get(r.key) ?? 0, ip: ip.get(r.key) ?? 0, wsv: wsv.get(r.key) ?? 0 };
      const score = (p.era * PIT_WEIGHTS.era + p.whip * PIT_WEIGHTS.whip + p.so * PIT_WEIGHTS.so + p.ip * PIT_WEIGHTS.ip + p.wsv * PIT_WEIGHTS.wsv) / 100;
      return { key: r.key, score: Math.round(score * 10) / 10, parts: [{ label: "ERA", pct: p.era }, { label: "WHIP", pct: p.whip }, { label: "탈삼진", pct: p.so }, { label: "이닝", pct: p.ip }, { label: "승·세이브", pct: p.wsv }] };
    })
    .sort((a, b) => b.score - a.score || b.parts[0].pct - a.parts[0].pct);
}

export interface BbBargainRow { key: string; score: number; power: number; salaryPct: number }

/** 연봉 구간 폭 — 이 단위로 반올림한 뒤 백분위를 매겨, 최저연봉 근처의 몇만 달러 차이가 순위를 가르지 않게 한다(동률은 종합 지수로). */
export const SALARY_BUCKET: Record<BbLeague, number> = { MLB: 100_000, KBO: 1_000, NPB: 1_000 }; // MLB 달러 · KBO 만원 단위(1천만원)

/** 가성비 = 종합 지수 − 연봉 백분위(종합 자격 + 연봉 있는 선수 풀 안 log 연봉, 구간 반올림). */
export function computeBbBargain(power: BbPowerRow[], rows: BbPlayerRow[], bucket = 1): BbBargainRow[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const elig = power.filter((p) => (byKey.get(p.key)?.salary ?? 0) > 0);
  if (elig.length === 0) return [];
  const salPct = percentiles(elig.map((p) => [p.key, Math.log(Math.max(bucket, Math.round(byKey.get(p.key)!.salary! / bucket) * bucket))]));
  return elig
    .map((p) => ({ key: p.key, score: Math.round((p.score - (salPct.get(p.key) ?? 0)) * 10) / 10, power: p.score, salaryPct: salPct.get(p.key) ?? 0 }))
    .sort((a, b) => b.score - a.score || b.power - a.power);
}

export interface BbFormRow { key: string; form: BbForm; season: number | null; delta: number | null }

/** 폼 — 타자 최근 10경기 OPS(25타수 이상) 내림차순, 투수 최근 5등판 ERA(10이닝 이상) 오름차순. */
export function computeBbForm(rows: BbPlayerRow[], form: Record<string, BbForm>, role: BbRole): BbFormRow[] {
  const out: BbFormRow[] = [];
  for (const r of rows) {
    const f = r.logId ? form[r.logId] : undefined;
    if (!f) continue;
    if (role === "bat") {
      if (r.ops == null || (f.ab ?? 0) < FORM_BAT_MIN_AB || f.ops == null) continue;
      out.push({ key: r.key, form: f, season: r.ops, delta: Math.round((f.ops - r.ops) * 1000) / 1000 });
    } else {
      if (r.era == null || (f.ip ?? 0) < FORM_PIT_MIN_IP || f.era == null) continue;
      out.push({ key: r.key, form: f, season: r.era, delta: Math.round((f.era - r.era) * 100) / 100 });
    }
  }
  return role === "bat"
    ? out.sort((a, b) => (b.form.ops ?? 0) - (a.form.ops ?? 0) || (b.form.ab ?? 0) - (a.form.ab ?? 0))
    : out.sort((a, b) => (a.form.era ?? 99) - (b.form.era ?? 99) || (b.form.ip ?? 0) - (a.form.ip ?? 0));
}

/** 경기별 로그 → 폼 집계(타자 OPS·투수 ERA). 순수 함수 — SQL 로 자른 최근 N경기 행을 받는다. */
export interface LogLine { id: string; role: string; ab: number; h: number; d2b: number; d3b: number; hr: number; bb: number; hbp: number; ip: string | null; er: number }
export function aggregateForm(lines: LogLine[]): Record<string, BbForm> {
  const acc = new Map<string, { n: number; ab: number; h: number; tb: number; bb: number; hbp: number; ip: number; er: number; role: string }>();
  for (const l of lines) {
    const a = acc.get(l.id) ?? { n: 0, ab: 0, h: 0, tb: 0, bb: 0, hbp: 0, ip: 0, er: 0, role: l.role };
    a.n++;
    if (l.role === "P") { a.ip += ipToNumber(l.ip); a.er += l.er; }
    else { a.ab += l.ab; a.h += l.h; a.bb += l.bb; a.hbp += l.hbp; a.tb += l.h + l.d2b + 2 * l.d3b + 3 * l.hr; }
    acc.set(l.id, a);
  }
  const out: Record<string, BbForm> = {};
  for (const [id, a] of acc) {
    if (a.role === "P") out[id] = { n: a.n, ip: Math.round(a.ip * 10) / 10, era: a.ip > 0 ? Math.round(((a.er * 9) / a.ip) * 100) / 100 : null };
    else {
      const obpDen = a.ab + a.bb + a.hbp;
      const obp = obpDen > 0 ? (a.h + a.bb + a.hbp) / obpDen : null;
      const slg = a.ab > 0 ? a.tb / a.ab : null;
      out[id] = { n: a.n, ab: a.ab, avg: a.ab > 0 ? Math.round((a.h / a.ab) * 1000) / 1000 : null, ops: obp != null && slg != null ? Math.round((obp + slg) * 1000) / 1000 : null };
    }
  }
  return out;
}

// ── 로더 (6h 캐시) ─────────────────────────────────────────────────────────

interface MlbRangeSplit { player?: { id?: number }; stat: Record<string, unknown> }
/** MLB 최근 14일 폼 — statsapi byDateRange 리그 전체 집계(타자·투수 각 1콜). 키 = mlbam id. */
async function fetchMlbRecentForm(season: number): Promise<Record<string, BbForm>> {
  const end = new Date();
  const start = new Date(end.getTime() - MLB_FORM_DAYS * 86400_000);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const out: Record<string, BbForm> = {};
  for (const group of ["hitting", "pitching"] as const) {
    try {
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/stats?stats=byDateRange&group=${group}&sportId=1&season=${season}&startDate=${d(start)}&endDate=${d(end)}&limit=3000&playerPool=all`,
        { cache: "no-store", headers: { "user-agent": "scorebase-baseball-rankings" } },
      );
      if (!r.ok) continue;
      const j = (await r.json()) as { stats?: Array<{ splits?: MlbRangeSplit[] }> };
      for (const x of j.stats?.[0]?.splits ?? []) {
        const id = x.player?.id;
        if (!id) continue;
        const st = x.stat;
        const n = Number(st.gamesPlayed ?? 0) || 0;
        if (group === "hitting") {
          const ab = Number(st.atBats ?? 0) || 0;
          const ops = st.ops == null ? null : Number(st.ops);
          const avg = st.avg == null ? null : Number(st.avg);
          out[String(id)] = { n, ab, ops: Number.isFinite(ops as number) ? ops : null, avg: Number.isFinite(avg as number) ? avg : null };
        } else {
          const ip = ipToNumber(String(st.inningsPitched ?? "0"));
          const era = st.era == null ? null : Number(st.era);
          // 같은 선수가 타자로도 잡힌 투타겸업은 투수 폼으로 덮지 않고 합친다
          out[String(id)] = { ...(out[String(id)] ?? { n }), n: out[String(id)]?.n ?? n, ip: Math.round(ip * 10) / 10, era: Number.isFinite(era as number) ? era : null };
        }
      }
    } catch { /* 한 그룹 실패는 그 역할만 빈다 */ }
  }
  return out;
}

const stripJp = (s: string | null | undefined) => (s ?? "").replace(/[\s　*]/g, "");

export const getBbLeagueData = unstable_cache(
  async (league: BbLeague): Promise<BbLeagueData> => {
    const season = String(new Date().getUTCFullYear());
    const stats = await prisma.baseballPlayerSeasonStats.findMany({ where: { league, season } });
    // 연봉 — KBO 는 공식 연봉 JSON 을 kboId 로 직결(동명이인 44건 회피, 외국인은 달러 공시라 제외), MLB 는 영문명 매칭
    const salByName = new Map<string, number>();
    const salById = new Map<string, number>();
    if (league === "MLB") {
      const sal = await prisma.playerSalary.findMany({ where: { league }, select: { playerName: true, salary: true } });
      for (const s of sal) if (!salByName.has(s.playerName)) salByName.set(s.playerName, s.salary);
    } else if (league === "KBO") {
      for (const s of getKboSalaries()) if (!salById.has(s.kboId)) salById.set(s.kboId, s.salary);
    }
    // 경기별 로그 → 폼 (KBO id 직결, NPB 는 팀+성(로그 이름이 성만) 유일 매칭)
    let form: Record<string, BbForm> = {};
    let logIdOf: (r: (typeof stats)[number]) => string | null = () => null;
    if (league === "KBO") {
      const lines = await prisma.$queryRaw<LogLine[]>`
        WITH l AS (
          SELECT "kboId" AS id, role, COALESCE(ab,0)::int ab, COALESCE(h,0)::int h, COALESCE(d2b,0)::int d2b, COALESCE(d3b,0)::int d3b, COALESCE(hr,0)::int hr, COALESCE(bb,0)::int bb, 0::int hbp, ip, COALESCE(er,0)::int er,
            ROW_NUMBER() OVER (PARTITION BY "kboId", role ORDER BY date DESC, seq DESC) rn
          FROM "KboPlayerGameLog" WHERE season = ${Number(season)}
        ) SELECT id, role, ab, h, d2b, d3b, hr, bb, hbp, ip, er FROM l WHERE (role = 'B' AND rn <= ${FORM_BAT_GAMES}) OR (role = 'P' AND rn <= ${FORM_PIT_GAMES})`;
      form = aggregateForm(lines);
      logIdOf = (r) => r.externalId;
    } else if (league === "MLB") {
      form = await fetchMlbRecentForm(Number(season));
      logIdOf = (r) => r.externalId;
    } else if (league === "NPB") {
      const lines = await prisma.$queryRaw<(LogLine & { name: string | null; team: string | null })[]>`
        WITH l AS (
          SELECT "npbId" AS id, name, team, role, COALESCE(ab,0)::int ab, COALESCE(h,0)::int h, COALESCE(d2b,0)::int d2b, COALESCE(d3b,0)::int d3b, COALESCE(hr,0)::int hr, COALESCE(bb,0)::int bb, COALESCE(hbp,0)::int hbp, ip, COALESCE(er,0)::int er,
            ROW_NUMBER() OVER (PARTITION BY "npbId", role ORDER BY date DESC, seq DESC) rn
          FROM "NpbPlayerGameLog" WHERE season = ${Number(season)}
        ) SELECT id, name, team, role, ab, h, d2b, d3b, hr, bb, hbp, ip, er FROM l WHERE (role = 'B' AND rn <= ${FORM_BAT_GAMES}) OR (role = 'P' AND rn <= ${FORM_PIT_GAMES})`;
      form = aggregateForm(lines);
      // (팀, 로그 이름) → npbId 가 유일할 때만 연결
      const cand = new Map<string, Set<string>>();
      for (const l of lines) {
        const k = `${l.team ?? ""}|${stripJp(l.name)}`;
        if (!cand.has(k)) cand.set(k, new Set());
        cand.get(k)!.add(l.id);
      }
      logIdOf = (r) => {
        const full = stripJp(r.playerNameEn);
        let hit: string | null = null;
        for (const [k, ids] of cand) {
          const [team, nm] = k.split("|");
          if (team === r.teamName && nm && full.startsWith(nm) && ids.size === 1) { if (hit) return null; hit = [...ids][0]; }
        }
        return hit;
      };
    }
    const rows: BbPlayerRow[] = stats.map((s) => ({
      key: s.externalId ?? `${s.playerName}|${s.teamName}`,
      externalId: s.externalId, name: s.playerName, nameEn: s.playerNameEn, team: s.teamName, games: s.games ?? 0,
      avg: s.avg, hits: s.hits, hr: s.homeRuns, rbi: s.rbi, ops: s.ops,
      // MLB 는 이닝을 야구 표기 그대로(166.1 = 166⅓) 저장하고 KBO·NPB 는 소수(72.667)로 저장한다 — 소수로 통일
      era: s.era, whip: s.whip, ip: s.ip == null ? null : league === "MLB" ? ipToNumber(s.ip.toFixed(1)) : s.ip, so: s.so, w: s.wins, l: s.losses, sv: s.saves,
      salary: league === "KBO" ? (s.externalId ? salById.get(s.externalId) ?? null : null) : salByName.get(s.playerNameEn ?? s.playerName) ?? null,
      logId: logIdOf(s),
    }));
    const salaryCoverage = rows.filter((r) => r.salary != null).length;
    return { league, season, rows, form, salaryCoverage };
  },
  ["baseball-rankings-league-data-v5"],
  { revalidate: 6 * 3600, tags: ["baseball-rankings"] },
);
