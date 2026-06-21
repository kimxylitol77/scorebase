// 2026 월드컵 허브 — 한 페이지 탭(개요·예측·선수·조별리그·xG). 애플 세그먼트 + lucide 라인 아이콘.
// 조별리그·xG 는 뒤 탭으로. 무거운 시뮬(5000회)은 개요·예측 탭에서만 실행. 10분 ISR.
import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { Star, Info, ChevronRight } from "lucide-react";
import { simulateWorldCup } from "@/lib/predict/world-cup-simulation";
import { WORLD_CUP_GROUPS, WORLD_CUP_TEAM_ELO } from "@/lib/predict/world-cup-elos";
import { fifaCountryKo, fifaFlag } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import WcTabBar from "@/components/world-cup/WcTabBar";
import WcXgList from "@/components/world-cup/WcXgList";
import LeagueLeaderBoard from "@/components/LeagueLeaderBoard";
import { getWorldCupPlayerStats, buildWcLeaderRows, pickCats, WC_CORE_CATS, WC_FUN_CATS } from "@/lib/sports/thesports/world-cup-player-stats";

export const revalidate = 600;

const KNOCKOUT = [
  { round: "32강", en: "Round of 32", dates: "6.28 ~ 7.3" },
  { round: "16강", en: "Round of 16", dates: "7.4 ~ 7.7" },
  { round: "8강", en: "Quarter-finals", dates: "7.9 ~ 7.11" },
  { round: "4강", en: "Semi-finals", dates: "7.14 ~ 7.15" },
  { round: "3·4위전", en: "Third place", dates: "7.18" },
  { round: "결승", en: "Final", dates: "7.19" },
];

export const metadata: Metadata = {
  title: "2026 월드컵 — 일정·결과·우승 확률·조별리그 데이터 센터",
  description:
    "2026 북중미 월드컵(미국·캐나다·멕시코, 6/11~7/19) 경기 일정과 결과, Monte Carlo 시뮬레이션 우승 확률, 조별리그 A~L 전력, 선수 랭킹·xG까지 — 48개국 데이터 허브.",
  keywords: ["2026 월드컵", "월드컵 일정", "월드컵 우승 후보", "월드컵 조별리그", "한국 월드컵 조", "월드컵 예측", "월드컵 우승 확률", "스코어베이스"],
  alternates: { canonical: "/world-cup" },
};

function kstTime(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${days[k.getUTCDay()]}) ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

const VIEWS = ["overview", "predictions", "players", "groups", "xg"] as const;

export default async function WorldCupHub({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: rawView } = await searchParams;
  const view = (VIEWS as readonly string[]).includes(rawView ?? "") ? (rawView as string) : "overview";

  const teams = await prisma.team.findMany({ where: { league: "WORLD_CUP" }, select: { id: true, name: true } });
  const byName = new Map(teams.map((t) => [t.name, t]));
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const nameKo = (en: string) => fifaCountryKo(en) ?? toKoreanTeamName(en) ?? en;

  // 무거운 시뮬은 개요·예측 탭에서만
  const needSim = view === "overview" || view === "predictions";
  const sim = needSim && teams.length >= 32 ? simulateWorldCup(teamNameById, 5000) : [];
  const ranked = [...sim].sort((a, b) => b.champion - a.champion);
  const koreaSim = sim.find((r) => r.teamName === "South Korea") ?? null;
  const koreaTeam = byName.get("South Korea") ?? null;

  // 경기 일정 — 개요만
  const now = new Date();
  const [recentOrLive, upcoming] =
    view === "overview"
      ? await Promise.all([
          prisma.match.findMany({
            where: { league: "WORLD_CUP", startTime: { gte: new Date(now.getTime() - 36 * 3600_000), lte: now } },
            orderBy: { startTime: "desc" }, take: 8,
            select: { id: true, externalId: true, startTime: true, status: true, homeScore: true, awayScore: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
          }),
          prisma.match.findMany({
            where: { league: "WORLD_CUP", status: "SCHEDULED", startTime: { gte: now, lte: new Date(now.getTime() + 7 * 86400_000) } },
            orderBy: { startTime: "asc" }, take: 12,
            select: { id: true, externalId: true, startTime: true, status: true, homeScore: true, awayScore: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
          }),
        ])
      : [[], []];

  // 선수 랭킹 — 선수 탭만
  const allWcRows = view === "players" ? buildWcLeaderRows(await getWorldCupPlayerStats()) : null;
  const wcCoreRows = allWcRows ? pickCats(allWcRows, WC_CORE_CATS) : null;
  const wcFunRows = allWcRows ? pickCats(allWcRows, WC_FUN_CATS) : null;

  type MatchRow = (typeof recentOrLive)[number];
  const matchLine = (m: MatchRow) => {
    const h = nameKo(m.homeTeam.name);
    const a = nameKo(m.awayTeam.name);
    const live = m.status === "LIVE";
    const done = m.status === "FINISHED";
    const center = live || done ? `${m.homeScore ?? 0} - ${m.awayScore ?? 0}` : "vs";
    const inner = (
      <span className="flex items-center gap-2 text-sm py-2">
        <span className="w-32 sm:w-40 text-right font-medium truncate">{fifaFlag(m.homeTeam.name)} {h}</span>
        <span className={`w-14 text-center tabular-nums font-bold ${live ? "text-rose-600 dark:text-rose-400" : done ? "" : "text-neutral-400"}`}>{center}</span>
        <span className="w-32 sm:w-40 font-medium truncate">{a} {fifaFlag(m.awayTeam.name)}</span>
        <span className="ml-auto text-xs text-neutral-500 tabular-nums whitespace-nowrap flex items-center gap-1">
          {live ? (<><span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />LIVE</>) : done ? "종료" : kstTime(m.startTime)}
        </span>
      </span>
    );
    return m.externalId ? (
      <Link href={`/live/WORLD_CUP/${m.externalId}`} className="block px-2 -mx-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-900" prefetch={false}>{inner}</Link>
    ) : (
      <div className="px-2 -mx-2">{inner}</div>
    );
  };

  const card = "rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">2026 FIFA 월드컵 데이터 센터</h1>
        <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
          북중미(미국·캐나다·멕시코) 개최 · 6/11 ~ 7/19 · 사상 첫 <strong>48개국</strong> 본선. 일정·결과, Monte Carlo 우승 확률, 선수 랭킹, xG까지 한곳에서. 대한민국은 개최국 멕시코와 <strong>A조</strong>.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          <Link href="/scores" className="hover:text-neutral-800 dark:hover:text-neutral-200" prefetch={false}>라이브 스코어</Link>
          <Link href="/national-teams" className="hover:text-neutral-800 dark:hover:text-neutral-200" prefetch={false}>출전국 48개국</Link>
          <Link href="/leagues/WORLD_CUP" className="hover:text-neutral-800 dark:hover:text-neutral-200" prefetch={false}>분석 글</Link>
          <Link href="/predictions/fifa-ranking" className="hover:text-neutral-800 dark:hover:text-neutral-200" prefetch={false}>FIFA 랭킹</Link>
        </div>
      </header>

      <WcTabBar current={view} />

      {/* ── 개요 ── */}
      {view === "overview" && (
        <div className="space-y-6">
          {(recentOrLive.length > 0 || upcoming.length > 0) && (
            <section className={card}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-semibold">경기 일정 · 결과</h2>
                <span className="text-xs text-neutral-500">한국시간 · 최근 36시간 + 향후 7일</span>
              </div>
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {recentOrLive.map((m) => <div key={m.id}>{matchLine(m)}</div>)}
                {upcoming.map((m) => <div key={m.id}>{matchLine(m)}</div>)}
              </div>
            </section>
          )}

          {koreaSim && (
            <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-900/10 p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-semibold">대한민국 — A조</h2>
                {koreaTeam && (
                  <Link href={`/national-teams/${koreaTeam.id}`} className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline" prefetch={false}>스쿼드·일정 →</Link>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[["32강 진출", koreaSim.groupPass], ["16강", koreaSim.r16], ["8강", koreaSim.qf], ["우승", koreaSim.champion]].map(([label, v]) => (
                  <div key={label as string} className="rounded-xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3">
                    <div className="text-xs text-neutral-500">{label}</div>
                    <div className="mt-1 text-xl font-black tabular-nums">{((v as number) * 100).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                같은 조: {WORLD_CUP_GROUPS.A.filter((n) => n !== "South Korea").map((n) => `${fifaFlag(n)} ${nameKo(n)}`).join(" · ")} — Monte Carlo 5,000회 기준.
              </p>
            </section>
          )}

          {ranked.length > 0 && (
            <section className={card}>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-semibold">우승 확률 TOP 3</h2>
                <span className="text-xs text-neutral-500">Elo 기반 Monte Carlo 5,000회</span>
              </div>
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {ranked.slice(0, 3).map((r, i) => {
                  const max = ranked[0].champion || 1;
                  const team = byName.get(r.teamName);
                  const row = (
                    <span className="flex items-center gap-3 text-sm py-2.5">
                      <span className="w-5 text-right tabular-nums text-neutral-400 font-bold">{i + 1}</span>
                      <span className="text-base">{fifaFlag(r.teamName)}</span>
                      <span className="font-medium w-28 sm:w-36 truncate">{nameKo(r.teamName)}</span>
                      <span className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden"><span className="block h-full bg-amber-500" style={{ width: `${(r.champion / max) * 100}%` }} /></span>
                      <span className="tabular-nums text-neutral-600 dark:text-neutral-300 font-semibold w-14 text-right">{(r.champion * 100).toFixed(1)}%</span>
                    </span>
                  );
                  return <li key={r.teamName}>{team ? <Link href={`/national-teams/${team.id}`} className="block px-2 -mx-2 hover:bg-neutral-50 dark:hover:bg-neutral-900 rounded-lg" prefetch={false}>{row}</Link> : row}</li>;
                })}
              </ul>
              <Link href="/world-cup?view=predictions" className="mt-4 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-500/20 transition" prefetch={false}>
                전체 우승 확률·단계별 시뮬레이션 보기 <ChevronRight className="w-4 h-4" aria-hidden />
              </Link>
            </section>
          )}

          <section className={card}>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-semibold">토너먼트 일정</h2>
              <span className="text-xs text-neutral-500">대진은 조별리그 후 확정 · 현지 기준</span>
            </div>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {KNOCKOUT.map((k) => (
                <li key={k.round} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-semibold">{k.round} <span className="text-xs font-normal text-neutral-400">{k.en}</span></span>
                  <span className="tabular-nums text-neutral-600 dark:text-neutral-300">{k.dates}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {/* ── 예측 (단계별 확률) ── */}
      {view === "predictions" && (
        <div className="space-y-4">
          {ranked.length > 0 ? (
            <section className={`${card} overflow-x-auto`}>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-semibold">단계별 진출 확률</h2>
                <span className="text-xs text-neutral-500">Elo 기반 Monte Carlo 5,000회 · 10분 갱신</span>
              </div>
              <table className="w-full text-sm min-w-[460px]">
                <thead className="text-[11px] text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="text-left font-medium py-2">팀</th>
                    <th className="text-right font-medium py-2 px-2">32강</th>
                    <th className="text-right font-medium py-2 px-2">16강</th>
                    <th className="text-right font-medium py-2 px-2">8강</th>
                    <th className="text-right font-medium py-2 pl-2">우승</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {ranked.slice(0, 20).map((r) => {
                    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
                    return (
                      <tr key={r.teamName} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                        <td className="py-2 truncate"><span className="mr-1.5">{fifaFlag(r.teamName)}</span>{nameKo(r.teamName)}</td>
                        <td className="text-right tabular-nums py-2 px-2 text-neutral-500">{pct(r.groupPass)}</td>
                        <td className="text-right tabular-nums py-2 px-2 text-neutral-500">{pct(r.r16)}</td>
                        <td className="text-right tabular-nums py-2 px-2 text-neutral-500">{pct(r.qf)}</td>
                        <td className="text-right tabular-nums py-2 pl-2 font-bold text-amber-600 dark:text-amber-400">{pct(r.champion)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Link href="/predictions/WORLD_CUP" className="mt-4 inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 hover:underline" prefetch={false}>
                풀 시뮬레이션 · 3위 와일드카드 경쟁 <ChevronRight className="w-4 h-4" aria-hidden />
              </Link>
            </section>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 p-10 text-center text-sm text-neutral-500">출전국 데이터가 모이면 시뮬레이션이 표시됩니다.</div>
          )}
        </div>
      )}

      {/* ── 선수 (Best XI + 랭킹) ── */}
      {view === "players" && (
        <div className="space-y-6">
          <Link href="/world-cup/team-of-day" prefetch={false} className="flex items-center justify-between gap-2 rounded-2xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3.5 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition">
            <span className="flex items-center gap-2.5">
              <Star className="w-5 h-5 text-amber-500 shrink-0" aria-hidden />
              <span>
                <span className="block text-sm font-bold text-amber-800 dark:text-amber-200">오늘의 베스트 XI</span>
                <span className="block text-[11px] text-amber-700/80 dark:text-amber-300/70">매일 경기 평점 기반 팀 오브 더 데이 · 4-2-3-1</span>
              </span>
            </span>
            <ChevronRight className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
          </Link>
          {wcCoreRows && <div><h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-3">선수 랭킹</h2><LeagueLeaderBoard league="WORLD_CUP" season="2026 본선" rowsByCategory={wcCoreRows} footer="2026 본선 누적 · 라이브 경기 약 2분 간격 실시간 갱신" /></div>}
          {wcFunRows && <div><h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-3">이색 랭킹</h2><LeagueLeaderBoard league="WORLD_CUP" season="2026 본선" rowsByCategory={wcFunRows} footer="가성비·파울유도·빅찬스미스·골대·제공권 지배율·드리블 성공률·결정력" /></div>}
          {!wcCoreRows && <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 p-10 text-center text-sm text-neutral-500">선수 기록이 집계되면 랭킹이 표시됩니다.</div>}
        </div>
      )}

      {/* ── 조별리그 A~L ── */}
      {view === "groups" && (
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-bold tracking-tight">조별리그 A~L</h2>
            <Link href="/national-teams" className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline" prefetch={false}>48개국 상세 →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(WORLD_CUP_GROUPS).map(([group, names]) => {
              const sorted = [...names].sort((a, b) => (WORLD_CUP_TEAM_ELO[b] ?? 0) - (WORLD_CUP_TEAM_ELO[a] ?? 0));
              return (
                <div key={group} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="font-bold text-sm">{group}조</h3>
                    <Link href={`/world-cup/best-xi/${group.toLowerCase()}`} className="text-[11px] text-neutral-500 hover:underline" prefetch={false}>베스트 XI</Link>
                  </div>
                  <ul className="space-y-1.5">
                    {sorted.map((name) => {
                      const team = byName.get(name);
                      const label = (
                        <span className="flex items-center gap-2 text-sm">
                          <span>{fifaFlag(name)}</span>
                          <span className="truncate">{nameKo(name)}</span>
                          <span className="ml-auto tabular-nums text-[11px] text-neutral-400">{WORLD_CUP_TEAM_ELO[name] ?? ""}</span>
                        </span>
                      );
                      return <li key={name}>{team ? <Link href={`/national-teams/${team.id}`} className="block hover:underline" prefetch={false}>{label}</Link> : label}</li>;
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── xG ── */}
      {view === "xg" && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-500">전 경기 <strong>xG(기대득점)</strong> vs 실제 스코어 — 누가 이길 만했는지, 어디서 이변·결정력이 갈렸는지. 최근 경기 순.</p>
          <WcXgList />
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-neutral-500 leading-relaxed">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
        <span>우승·진출 확률은 자체 Elo 시드 기반 Monte Carlo 시뮬레이션(10분 갱신)으로, 배당·전망과 다를 수 있습니다.</span>
      </p>
    </div>
  );
}
