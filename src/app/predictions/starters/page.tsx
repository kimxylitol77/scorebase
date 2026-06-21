// /predictions/starters — 오늘·내일 선발 투수 매치업 보드 (KBO·MLB·NPB).
// 데이터: Match.homeStarter/awayStarter JSON (baseball-starters·mlb-starters cron 이 채움).
// ERA·WHIP·K9 비교 + 최근 3등판 폼(KBO·MLB) + AI 승률 — 매치 상세(/live)로 클릭 이동.
import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { toKoreanTeamName } from "@/lib/team-names";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import { mlbHeadshotUrl } from "@/lib/sports/mlb-stats-api";
import PitcherAvatar from "@/components/predictions/PitcherAvatar";
import AmbientGlow from "@/components/AmbientGlow";

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
  pid?: number | string;
  photoUrl?: string;
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

/** 리그별 선발 사진 URL — KBO 네이버 CDN·MLB 공식·NPB npb.jp(cron 이 enrich 시 photoUrl 저장). */
function pitcherPhoto(league: string, s: StarterJson | null): string | null {
  if (s?.photoUrl) return s.photoUrl; // NPB — cron 이 npb.jp profile HTML 에서 추출해 저장
  if (!s?.pid) return null;
  if (league === "KBO") return kboPhotoUrl(s.pid);
  if (league === "MLB") return mlbHeadshotUrl(Number(s.pid));
  return null;
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

/** 지표 비교 행 — 중앙 라벨 기준 좌우로 뻗는 바. 우위 쪽 색 강조.
 *  lowerBetter(ERA·WHIP): 값이 낮을수록 바가 길고 진함 / higherBetter(K9): 반대. */
function StatRow({ label, home, away, lowerBetter }: { label: string; home?: number; away?: number; lowerBetter: boolean }) {
  const ok = (v?: number) => v != null && !Number.isNaN(v) && v >= 0;
  const both = ok(home) && ok(away);
  // 우위 강도(0~1): 상대 대비 비율 — lowerBetter 면 상대값 비중이 내 강도
  let sh = 0.5;
  if (both && home! + away! > 0) {
    sh = lowerBetter ? away! / (home! + away!) : home! / (home! + away!);
  }
  const sa = 1 - sh;
  const homeWins = both && home !== away && sh > 0.5;
  const awayWins = both && home !== away && sa > 0.5;
  const d = label === "K/9" ? 1 : 2;
  return (
    <div className="flex items-center gap-1.5 py-[3px]">
      {/* 홈 값 + 우→좌 바 */}
      <span className={`w-11 text-right text-[13px] tabular-nums shrink-0 ${homeWins ? "font-black text-emerald-600 dark:text-emerald-400" : "text-neutral-600 dark:text-neutral-300"}`}>
        {fmt(home, d)}
      </span>
      <div className="flex-1 flex justify-end">
        <div
          className={`h-1.5 rounded-l-full ${homeWins ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"}`}
          style={{ width: `${Math.round(sh * 100)}%` }}
        />
      </div>
      <span className="w-[72px] text-center text-[10px] text-neutral-400 shrink-0">{label}</span>
      <div className="flex-1 flex justify-start">
        <div
          className={`h-1.5 rounded-r-full ${awayWins ? "bg-sky-500" : "bg-neutral-300 dark:bg-neutral-700"}`}
          style={{ width: `${Math.round(sa * 100)}%` }}
        />
      </div>
      <span className={`w-11 text-left text-[13px] tabular-nums shrink-0 ${awayWins ? "font-black text-sky-600 dark:text-sky-400" : "text-neutral-600 dark:text-neutral-300"}`}>
        {fmt(away, d)}
      </span>
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
    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <AmbientGlow />
      <nav className="text-xs text-neutral-500 mb-3">
        <Link href="/predictions/KBO" className="hover:text-neutral-700 dark:hover:text-neutral-300">예측</Link>
        <span className="mx-1">›</span>
        <span className="text-neutral-700 dark:text-neutral-300">선발 매치업</span>
      </nav>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 선발 매치업
      </span>
      <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">오늘의 선발 투수 매치업</h1>
      <p className="mt-3 text-sm text-neutral-600 leading-relaxed break-keep dark:text-neutral-400">
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
                      const ph = m.predHome != null ? Math.round(m.predHome * 100) : null;
                      const pa = m.predAway != null ? Math.round(m.predAway * 100) : null;
                      const inner = (
                        <>
                          {/* 상태 뱃지 */}
                          <div className="text-center mb-2.5">
                            {m.status === "LIVE" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> LIVE
                              </span>
                            ) : m.status === "FINISHED" ? (
                              <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[11px] font-bold text-neutral-500">
                                종료 {m.homeScore ?? 0} : {m.awayScore ?? 0}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[11px] font-bold text-neutral-500">
                                {kstTime(m.startTime)} 예정
                              </span>
                            )}
                          </div>
                          {/* 투수 대면 헤더 — 사진 + 이름 + 승패 */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex flex-col items-center w-[42%] text-center">
                              <PitcherAvatar src={pitcherPhoto(lg, hs)} name={hs?.name ?? "?"} size={64} />
                              <div className="mt-1.5 text-[13px] font-bold leading-tight truncate w-full">{hs?.name ?? "선발 미정"}</div>
                              <div className="text-[11px] text-neutral-500 truncate w-full">
                                {hName}{hs?.wins != null ? ` · ${hs.wins}승${hs.losses ?? 0}패` : ""}
                              </div>
                            </div>
                            <div className="flex flex-col items-center pt-4 shrink-0">
                              <span className="text-base font-black text-neutral-300 dark:text-neutral-600">VS</span>
                            </div>
                            <div className="flex flex-col items-center w-[42%] text-center">
                              <PitcherAvatar src={pitcherPhoto(lg, as)} name={as?.name ?? "?"} size={64} />
                              <div className="mt-1.5 text-[13px] font-bold leading-tight truncate w-full">{as?.name ?? "선발 미정"}</div>
                              <div className="text-[11px] text-neutral-500 truncate w-full">
                                {aName}{as?.wins != null ? ` · ${as.wins}승${as.losses ?? 0}패` : ""}
                              </div>
                            </div>
                          </div>
                          {/* AI 승률 게이지 */}
                          {ph != null && pa != null && (
                            <div className="mb-2.5">
                              <div className="flex justify-between text-[11px] font-bold mb-0.5">
                                <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{ph}%</span>
                                <span className="text-[10px] font-semibold text-neutral-400">AI 승률</span>
                                <span className="text-sky-600 dark:text-sky-400 tabular-nums">{pa}%</span>
                              </div>
                              <div className="flex h-1.5 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800">
                                <span className="bg-emerald-500" style={{ width: `${ph}%` }} />
                                <span className="bg-sky-500" style={{ width: `${100 - ph}%` }} />
                              </div>
                            </div>
                          )}
                          {/* 지표 비교 바 */}
                          {(hs || as) && (
                            <div className="rounded-lg bg-neutral-50 dark:bg-white/[0.04] px-2.5 py-1.5">
                              <StatRow label="ERA" home={hs?.era} away={as?.era} lowerBetter />
                              <StatRow label="WHIP" home={hs?.whip} away={as?.whip} lowerBetter />
                              <StatRow label="K/9" home={hs?.k9} away={as?.k9} lowerBetter={false} />
                              {(hs?.recentEra != null || as?.recentEra != null) && (
                                <StatRow label="최근 3등판" home={hs?.recentEra} away={as?.recentEra} lowerBetter />
                              )}
                            </div>
                          )}
                        </>
                      );
                      const cls = "block rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] p-4 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none";
                      return m.externalId ? (
                        <Link key={m.id} href={`/live/${lg}/${m.externalId}`} prefetch={false} className={`${cls} transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:ring-emerald-400/50 hover:shadow-[0_28px_70px_-30px_rgba(15,23,30,0.28)] dark:hover:bg-white/[0.06] dark:hover:ring-emerald-500/40`}>
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
