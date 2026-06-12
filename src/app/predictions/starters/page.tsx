// /predictions/starters — 오늘·내일 선발 투수 매치업 보드 (KBO·MLB·NPB).
// 데이터: Match.homeStarter/awayStarter JSON (baseball-starters·mlb-starters cron 이 채움).
// ERA·WHIP·K9 비교 + 최근 3등판 폼(KBO·MLB) + AI 승률 — 매치 상세(/live)로 클릭 이동.
import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { toKoreanTeamName } from "@/lib/team-names";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "오늘의 선발 투수 매치업 — KBO·MLB·NPB | Scorebase",
  description:
    "오늘과 내일 KBO·MLB·NPB 선발 투수 맞대결을 한눈에 — ERA·WHIP·K/9·최근 3등판 폼 비교와 AI 승률까지. 매일 자동 갱신되는 선발 매치업 보드.",
  keywords: ["KBO 선발 투수", "MLB 선발 투수", "오늘 선발 라인업", "선발 매치업", "투수 맞대결", "스코어베이스"],
  alternates: { canonical: "/predictions/starters" },
};

interface StarterJson {
  name?: string;
  era?: number;
  whip?: number;
  k9?: number;
  wins?: number;
  losses?: number;
  ip?: string;
  hand?: string;
  recentEra?: number;
  recentIp?: number;
}

const LEAGUES = ["KBO", "MLB", "NPB"] as const;
const LEAGUE_LABEL: Record<string, string> = { KBO: "KBO", MLB: "MLB", NPB: "NPB" };

function parseStarter(raw: unknown): StarterJson | null {
  if (!raw) return null;
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    return o && typeof o === "object" ? (o as StarterJson) : null;
  } catch {
    return null;
  }
}

const fmt = (v: number | undefined, d = 2) => (v == null || Number.isNaN(v) ? "—" : v.toFixed(d));

/** 지표 셀 — 우위(승부 유리) 쪽 강조. lowerBetter: ERA·WHIP / higherBetter: K9 */
function StatRow({ label, home, away, lowerBetter }: { label: string; home?: number; away?: number; lowerBetter: boolean }) {
  const both = home != null && away != null && !Number.isNaN(home) && !Number.isNaN(away) && home !== away;
  const homeWins = both && (lowerBetter ? home! < away! : home! > away!);
  const awayWins = both && !homeWins;
  const cls = (win: boolean) =>
    `tabular-nums ${win ? "font-black text-emerald-600 dark:text-emerald-400" : "text-neutral-600 dark:text-neutral-300"}`;
  return (
    <div className="flex items-center text-sm py-1">
      <span className={`w-1/3 text-right ${cls(!!homeWins)}`}>{fmt(home, label === "K/9" ? 1 : 2)}</span>
      <span className="w-1/3 text-center text-[11px] text-neutral-400">{label}</span>
      <span className={`w-1/3 text-left ${cls(!!awayWins)}`}>{fmt(away, label === "K/9" ? 1 : 2)}</span>
    </div>
  );
}

export default async function StartersPage() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600_000);
  const todayKst = kstNow.toISOString().slice(0, 10);
  const tomorrowKst = new Date(kstNow.getTime() + 86400_000).toISOString().slice(0, 10);
  const rangeStart = new Date(`${todayKst}T00:00:00+09:00`);
  const rangeEnd = new Date(`${tomorrowKst}T23:59:59+09:00`);

  const matches = await prisma.match.findMany({
    where: {
      league: { in: LEAGUES as unknown as never },
      startTime: { gte: rangeStart, lte: rangeEnd },
      status: { in: ["SCHEDULED", "LIVE", "FINISHED"] },
    },
    select: {
      id: true,
      externalId: true,
      league: true,
      startTime: true,
      status: true,
      predHome: true,
      predAway: true,
      homeScore: true,
      awayScore: true,
      homeStarter: true,
      awayStarter: true,
      homeTeam: { select: { name: true, logoUrl: true } },
      awayTeam: { select: { name: true, logoUrl: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const days: { date: string; label: string }[] = [
    { date: todayKst, label: `오늘 (${todayKst.slice(5).replace("-", "/")})` },
    { date: tomorrowKst, label: `내일 (${tomorrowKst.slice(5).replace("-", "/")})` },
  ];
  const kstDateOf = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const kstTime = (d: Date) => {
    const k = new Date(d.getTime() + 9 * 3600_000);
    return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <nav className="text-xs text-neutral-500 mb-3">
        <Link href="/predictions/KBO" className="hover:text-neutral-700 dark:hover:text-neutral-300">예측</Link>
        <span className="mx-1">›</span>
        <span className="text-neutral-700 dark:text-neutral-300">선발 매치업</span>
      </nav>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">⚾ 오늘의 선발 투수 매치업</h1>
      <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
        KBO · MLB · NPB 선발 맞대결 — <strong>ERA · WHIP · K/9</strong> 와 최근 3등판 폼, AI 승률까지 한눈에.
        선발 발표 시 자동 갱신됩니다. <span className="text-emerald-600 dark:text-emerald-400 font-semibold">초록</span> = 해당 지표 우위.
      </p>

      {days.map(({ date, label }) => {
        const dayMatches = matches.filter((m) => kstDateOf(m.startTime) === date);
        if (dayMatches.length === 0) return null;
        return (
          <div key={date} className="mt-8">
            <h2 className="text-lg font-bold mb-3">{label}</h2>
            {LEAGUES.map((lg) => {
              const lgMatches = dayMatches.filter((m) => m.league === lg);
              if (lgMatches.length === 0) return null;
              return (
                <div key={lg} className="mb-6">
                  <div className="text-xs font-bold tracking-widest text-neutral-400 mb-2">{LEAGUE_LABEL[lg]}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {lgMatches.map((m) => {
                      const hs = parseStarter(m.homeStarter);
                      const as = parseStarter(m.awayStarter);
                      const hName = toKoreanTeamName(m.homeTeam.name, lg) || m.homeTeam.name;
                      const aName = toKoreanTeamName(m.awayTeam.name, lg) || m.awayTeam.name;
                      const inner = (
                        <>
                          {/* 헤더: 시간/상태 + 팀 */}
                          <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-2">
                            <span>
                              {m.status === "LIVE" ? (
                                <span className="text-rose-600 dark:text-rose-400 font-bold">🔴 LIVE</span>
                              ) : m.status === "FINISHED" ? (
                                `종료 ${m.homeScore ?? 0}:${m.awayScore ?? 0}`
                              ) : (
                                `${kstTime(m.startTime)} 예정`
                              )}
                            </span>
                            {m.predHome != null && m.predAway != null && (
                              <span className="tabular-nums">AI 승률 {Math.round(m.predHome * 100)}% : {Math.round(m.predAway * 100)}%</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-sm w-1/3 truncate">{hName}</span>
                            <span className="text-[10px] text-neutral-400">vs</span>
                            <span className="font-bold text-sm w-1/3 text-right truncate">{aName}</span>
                          </div>
                          {/* 선발 이름 + 시즌 성적 */}
                          <div className="flex items-center justify-between text-[13px] mb-1.5">
                            <span className="w-[44%]">
                              <span className="font-semibold">{hs?.name ?? "선발 미정"}</span>
                              {hs?.wins != null && <span className="ml-1 text-[11px] text-neutral-500">{hs.wins}승{hs.losses ?? 0}패</span>}
                            </span>
                            <span className="w-[44%] text-right">
                              {as?.wins != null && <span className="mr-1 text-[11px] text-neutral-500">{as.wins}승{as.losses ?? 0}패</span>}
                              <span className="font-semibold">{as?.name ?? "선발 미정"}</span>
                            </span>
                          </div>
                          {/* 지표 비교 */}
                          {(hs || as) && (
                            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 px-2 py-1">
                              <StatRow label="ERA" home={hs?.era} away={as?.era} lowerBetter />
                              <StatRow label="WHIP" home={hs?.whip} away={as?.whip} lowerBetter />
                              <StatRow label="K/9" home={hs?.k9} away={as?.k9} lowerBetter={false} />
                              {(hs?.recentEra != null || as?.recentEra != null) && (
                                <StatRow label="최근 3등판 ERA" home={hs?.recentEra} away={as?.recentEra} lowerBetter />
                              )}
                            </div>
                          )}
                        </>
                      );
                      const cls = "block rounded-xl border border-neutral-200 dark:border-neutral-800 p-3.5";
                      return m.externalId ? (
                        <Link key={m.id} href={`/live/${lg}/${m.externalId}`} prefetch={false} className={`${cls} hover:border-emerald-400 dark:hover:border-emerald-600 transition`}>
                          {inner}
                        </Link>
                      ) : (
                        <div key={m.id} className={cls}>{inner}</div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {matches.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-12 text-center text-sm text-neutral-500">
          오늘·내일 예정된 야구 경기가 없습니다.
        </div>
      )}

      <p className="mt-8 text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 선발 정보는 구단 발표 후 자동 수집됩니다 (KBO·NPB 당일 오전 · MLB 수일 전 확정). ERA·WHIP·K/9 는 시즌 누적,
        최근 3등판 폼은 KBO·MLB 만 제공. AI 승률은 선발 능력치가 반영된 자체 모델 추정입니다.
      </p>
    </div>
  );
}
