// 월드컵 xG 트래커 리스트 — /world-cup 허브 "xG" 탭 + 전용 /world-cup/xg 공용. 자체 패칭(서버).
// 데이터: Match.fixtureStats (af expected_goals, [home, away] 순서). 신규 수집 없음 — 집계만.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { fifaCountryKo, fifaFlag } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";

interface XgRow {
  matchId: number;
  externalId: string;
  startTime: Date;
  status: string;
  homeName: string;
  awayName: string;
  homeRaw: string;
  awayRaw: string;
  homeScore: number | null;
  awayScore: number | null;
  homeXg: number | null;
  awayXg: number | null;
}

function nameKo(en: string): string {
  return fifaCountryKo(en) ?? toKoreanTeamName(en) ?? en;
}

function kstDate(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
}

function parseXg(fixtureStats: string | null): { home: number | null; away: number | null } {
  if (!fixtureStats) return { home: null, away: null };
  try {
    const fs = JSON.parse(fixtureStats) as Array<{ expectedGoals?: unknown }>;
    const h = Number(fs[0]?.expectedGoals);
    const a = Number(fs[1]?.expectedGoals);
    return { home: Number.isFinite(h) ? h : null, away: Number.isFinite(a) ? a : null };
  } catch {
    return { home: null, away: null };
  }
}

export async function fetchWcXgRows(): Promise<XgRow[]> {
  const matches = await prisma.match.findMany({
    where: { league: "WORLD_CUP", status: { in: ["FINISHED", "LIVE"] }, fixtureStats: { not: null } },
    orderBy: { startTime: "desc" },
    take: 200,
    select: {
      id: true, externalId: true, startTime: true, status: true,
      homeScore: true, awayScore: true, fixtureStats: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
    },
  });
  const rows: XgRow[] = [];
  for (const m of matches) {
    const { home, away } = parseXg(m.fixtureStats);
    if (home == null && away == null) continue;
    rows.push({
      matchId: m.id, externalId: m.externalId, startTime: m.startTime, status: m.status,
      homeName: nameKo(m.homeTeam.name), awayName: nameKo(m.awayTeam.name),
      homeRaw: m.homeTeam.name, awayRaw: m.awayTeam.name,
      homeScore: m.homeScore, awayScore: m.awayScore, homeXg: home, awayXg: away,
    });
  }
  return rows;
}

type Tone = "upset" | "asExpected" | "tight" | "live";
function verdict(r: XgRow): { label: string; tone: Tone } {
  if (r.status === "LIVE") return { label: "진행 중", tone: "live" };
  const hx = r.homeXg ?? 0;
  const ax = r.awayXg ?? 0;
  const hs = r.homeScore ?? 0;
  const as_ = r.awayScore ?? 0;
  const margin = hx - ax;
  const xgWinner = margin > 0.3 ? "H" : margin < -0.3 ? "A" : "T";
  const actual = hs > as_ ? "H" : hs < as_ ? "A" : "D";
  if (xgWinner === "T") return { label: "팽팽", tone: "tight" };
  if (actual === "D") {
    const fav = xgWinner === "H" ? r.homeName : r.awayName;
    return { label: `${fav} 우세→무`, tone: "upset" };
  }
  if (xgWinner !== actual) {
    const winner = actual === "H" ? r.homeName : r.awayName;
    return { label: `이변·${winner} 승`, tone: "upset" };
  }
  return { label: "xG대로", tone: "asExpected" };
}

const TONE_CLS: Record<Tone, string> = {
  upset: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  asExpected: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  tight: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  live: "bg-rose-600 text-white",
};

function xgCell(r: XgRow) {
  const h = r.homeXg;
  const a = r.awayXg;
  const hi = h != null && a != null ? (h > a ? "H" : a > h ? "A" : "") : "";
  return (
    <span className="tabular-nums">
      <span className={hi === "H" ? "font-bold text-emerald-600 dark:text-emerald-400" : ""}>{h != null ? h.toFixed(2) : "–"}</span>
      <span className="text-neutral-400 mx-1">–</span>
      <span className={hi === "A" ? "font-bold text-emerald-600 dark:text-emerald-400" : ""}>{a != null ? a.toFixed(2) : "–"}</span>
    </span>
  );
}

/** rows 를 넘기면 그대로, 없으면 자체 패칭. */
export default async function WcXgList({ rows: rowsProp }: { rows?: XgRow[] } = {}) {
  const rows = rowsProp ?? (await fetchWcXgRows());

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 p-10 text-center">
        <div className="text-sm text-neutral-500">아직 집계할 xG 데이터가 없습니다.</div>
        <div className="mt-2 text-[11px] text-neutral-400">경기 종료 후 통계가 수집되면 자동으로 표시됩니다.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden">
      <div className="hidden md:grid grid-cols-[56px_minmax(0,1fr)_72px_120px_minmax(0,120px)] gap-3 px-4 py-2 text-[10px] font-bold tracking-wider uppercase text-neutral-500 border-b border-neutral-100 dark:border-neutral-800">
        <div>날짜</div>
        <div>경기</div>
        <div className="text-center">스코어</div>
        <div className="text-center">xG (홈–원정)</div>
        <div className="text-right">판정</div>
      </div>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {rows.map((r) => {
          const v = verdict(r);
          const score = r.homeScore != null && r.awayScore != null ? `${r.homeScore} - ${r.awayScore}` : "-";
          return (
            <li key={r.matchId}>
              <Link href={`/live/WORLD_CUP/${r.externalId}`} prefetch={false} className="block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition">
                <div className="md:hidden space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-neutral-500">
                    <span>{kstDate(r.startTime)}</span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${TONE_CLS[v.tone]}`}>{v.label}</span>
                  </div>
                  <div className="text-sm font-medium truncate">
                    {fifaFlag(r.homeRaw)} {r.homeName} <span className="text-neutral-400 tabular-nums">{score}</span> {r.awayName} {fifaFlag(r.awayRaw)}
                  </div>
                  <div className="text-xs text-neutral-500">xG {xgCell(r)}</div>
                </div>
                <div className="hidden md:grid grid-cols-[56px_minmax(0,1fr)_72px_120px_minmax(0,120px)] gap-3 items-center text-sm">
                  <div className="text-[11px] text-neutral-500 tabular-nums">{kstDate(r.startTime)}</div>
                  <div className="truncate">
                    <span className="font-medium">{fifaFlag(r.homeRaw)} {r.homeName}</span>
                    <span className="text-neutral-400 mx-1.5">vs</span>
                    <span className="font-medium">{r.awayName} {fifaFlag(r.awayRaw)}</span>
                  </div>
                  <div className="text-center tabular-nums font-medium text-neutral-700 dark:text-neutral-300">{score}</div>
                  <div className="text-center">{xgCell(r)}</div>
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${TONE_CLS[v.tone]}`}>{v.label}</span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
