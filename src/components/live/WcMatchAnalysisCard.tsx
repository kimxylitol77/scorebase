// 월드컵 매치 분석 카드 — 국가대항전은 클럽 시즌 데이터(순위·시즌성적)가 없어
// 페이지가 비어 보이던 문제 해결 (2026-06-10, 네이버 패리티 + AI 시뮬 차별화).
//   ① 국가 비교 — 대륙·FIFA 랭킹·본선 진출·최고 성적·직전 대회 (정적 facts)
//   ② 상위 라운드 진출 예측 — 몬테카를로 5,000회 시뮬 (32강~우승, 1h 캐시)
//   ③ 최근 A매치 — 양팀 최근 5경기 스코어 + W/D/L + 승률
// 데이터 없는 항목은 행 단위로 자동 생략.

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { simulateWorldCup, type WorldCupResult } from "@/lib/predict/world-cup-simulation";
import { getWcCountryFacts } from "@/lib/sports/wc-country-facts";
import { toKoreanTeamName } from "@/lib/team-names";

interface Props {
  homeTeamId: number;
  awayTeamId: number;
  homeName: string; // 영문 (facts·시뮬 매칭)
  awayName: string;
  homeNameKo: string;
  awayNameKo: string;
  homeFifaRank: number | null;
  awayFifaRank: number | null;
  /** 이 매치 시작 시각 — 최근 A매치 조회 기준 */
  startTime: Date;
}

// WC 시뮬 — 본선 48개국 팀 로드 + 5,000회. 1시간 캐시 (predictions 페이지와 동일 모델).
const getWcSimulation = unstable_cache(
  async (): Promise<WorldCupResult[]> => {
    const teams = await prisma.team.findMany({
      where: { league: "WORLD_CUP" },
      select: { id: true, name: true },
    });
    if (teams.length < 40) return [];
    return simulateWorldCup(new Map(teams.map((t) => [t.id, t.name])), 5000);
  },
  ["wc-match-simulation"],
  { revalidate: 3600 },
);

interface RecentResult {
  league: string;
  vs: string;
  vsKo: string;
  score: string;
  outcome: "W" | "D" | "L";
  date: string;
  venue: string | null;
}

// af fixture raw(대부분 JSON 문자열로 저장)에서 경기장 이름만 best-effort 추출.
function venueFromRaw(raw: unknown): string | null {
  try {
    const p = (typeof raw === "string" ? JSON.parse(raw) : raw) as
      | { fixture?: { venue?: { name?: string | null } } }
      | null;
    return p?.fixture?.venue?.name ?? null;
  } catch {
    return null;
  }
}

async function recentInternationals(teamId: number, before: Date): Promise<RecentResult[]> {
  const rows = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      homeScore: { not: null },
      awayScore: { not: null },
      startTime: { lt: before },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    orderBy: { startTime: "desc" },
    take: 5,
    select: {
      league: true, homeScore: true, awayScore: true, homeTeamId: true, startTime: true, raw: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
    },
  });
  return rows.map((r) => {
    const isHome = r.homeTeamId === teamId;
    const my = isHome ? r.homeScore! : r.awayScore!;
    const opp = isHome ? r.awayScore! : r.homeScore!;
    const vs = isHome ? r.awayTeam.name : r.homeTeam.name;
    return {
      league: r.league,
      vs,
      vsKo: toKoreanTeamName(vs, "WORLD_CUP"),
      score: `${my}:${opp}`,
      outcome: my > opp ? "W" : my === opp ? "D" : "L",
      date: r.startTime
        .toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric", timeZone: "Asia/Seoul" })
        .replace(/\s/g, "").replace(/\.$/, ""),
      venue: venueFromRaw(r.raw),
    } as RecentResult;
  });
}

const OUTCOME_CLS: Record<string, string> = {
  W: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  D: "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300",
  L: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

/** 가운데 라벨, 좌우 값 비교 행 (네이버 스타일) — 우세 측 강조. */
function CompareRow({
  label, home, away, highlight,
}: { label: string; home: string; away: string; highlight?: "home" | "away" | null }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0 text-[13px]">
      <span className={`text-right tabular-nums ${highlight === "home" ? "font-bold text-blue-600 dark:text-blue-400" : "text-neutral-800 dark:text-neutral-200"}`}>
        {home}
      </span>
      <span className="text-[11px] text-neutral-400 whitespace-nowrap min-w-[72px] text-center">{label}</span>
      <span className={`tabular-nums ${highlight === "away" ? "font-bold text-blue-600 dark:text-blue-400" : "text-neutral-800 dark:text-neutral-200"}`}>
        {away}
      </span>
    </div>
  );
}

export default async function WcMatchAnalysisCard({
  homeTeamId, awayTeamId, homeName, awayName, homeNameKo, awayNameKo,
  homeFifaRank, awayFifaRank, startTime,
}: Props) {
  const homeFacts = getWcCountryFacts(homeName);
  const awayFacts = getWcCountryFacts(awayName);
  const [sim, homeRecent, awayRecent] = await Promise.all([
    getWcSimulation().catch(() => [] as WorldCupResult[]),
    recentInternationals(homeTeamId, startTime),
    recentInternationals(awayTeamId, startTime),
  ]);
  const homeSim = sim.find((r) => r.teamId === homeTeamId) ?? null;
  const awaySim = sim.find((r) => r.teamId === awayTeamId) ?? null;

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const winRate = (rs: RecentResult[]) =>
    rs.length > 0 ? Math.round((rs.filter((r) => r.outcome === "W").length / rs.length) * 100) : null;
  const hwr = winRate(homeRecent);
  const awr = winRate(awayRecent);

  const hasFacts = homeFacts || awayFacts || homeFifaRank || awayFifaRank;
  const hasSim = homeSim && awaySim;
  const hasRecent = homeRecent.length > 0 || awayRecent.length > 0;
  if (!hasFacts && !hasSim && !hasRecent) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-5">
      {/* ① 국가 비교 */}
      {hasFacts && (
        <div>
          <div className="flex justify-between text-[11px] text-neutral-500 mb-1">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">{homeNameKo}</span>
            <span>국가 비교</span>
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">{awayNameKo}</span>
          </div>
          {homeFacts && awayFacts && (
            <CompareRow label="소속 대륙" home={homeFacts.continent} away={awayFacts.continent} />
          )}
          {homeFifaRank != null && awayFifaRank != null && (
            <CompareRow
              label="FIFA 랭킹"
              home={`${homeFifaRank}위`}
              away={`${awayFifaRank}위`}
              highlight={homeFifaRank < awayFifaRank ? "home" : "away"}
            />
          )}
          {homeFacts && awayFacts && (
            <>
              <CompareRow
                label="본선 진출"
                home={`${homeFacts.appearances}회`}
                away={`${awayFacts.appearances}회`}
                highlight={
                  homeFacts.appearances === awayFacts.appearances
                    ? null
                    : homeFacts.appearances > awayFacts.appearances ? "home" : "away"
                }
              />
              <CompareRow label="최고 성적" home={homeFacts.best} away={awayFacts.best} />
              <CompareRow label="직전 대회" home={homeFacts.last} away={awayFacts.last} />
            </>
          )}
        </div>
      )}

      {/* ② 상위 라운드 진출 예측 — 몬테카를로 시뮬 */}
      {hasSim && (
        <div>
          <div className="flex justify-between text-[11px] text-neutral-500 mb-1">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">{homeNameKo}</span>
            <span>상위 라운드 진출 예측 · AI 시뮬 5,000회</span>
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">{awayNameKo}</span>
          </div>
          <CompareRow label="32강 진출" home={pct(homeSim!.groupPass)} away={pct(awaySim!.groupPass)}
            highlight={homeSim!.groupPass >= awaySim!.groupPass ? "home" : "away"} />
          <CompareRow label="16강 진출" home={pct(homeSim!.r16)} away={pct(awaySim!.r16)}
            highlight={homeSim!.r16 >= awaySim!.r16 ? "home" : "away"} />
          <CompareRow label="8강 진출" home={pct(homeSim!.qf)} away={pct(awaySim!.qf)}
            highlight={homeSim!.qf >= awaySim!.qf ? "home" : "away"} />
          <CompareRow label="우승" home={pct(homeSim!.champion)} away={pct(awaySim!.champion)}
            highlight={homeSim!.champion >= awaySim!.champion ? "home" : "away"} />
        </div>
      )}

      {/* ③ 최근 A매치 — 몇대몇 + 승률 */}
      {hasRecent && (
        <div>
          <div className="flex justify-between text-[11px] text-neutral-500 mb-1.5">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
              {homeNameKo}{hwr != null && <span className="font-normal text-neutral-500"> · 최근 승률 {hwr}%</span>}
            </span>
            <span>최근 A매치</span>
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
              {awr != null && <span className="font-normal text-neutral-500">최근 승률 {awr}% · </span>}{awayNameKo}
            </span>
          </div>
          {/* 와이드 화면에서 좌우 가장자리로 흩어지지 않게 — 각 컬럼 콘텐츠를 중앙으로 모음 */}
          <div className="grid grid-cols-2 gap-3 justify-items-center">
            {[{ list: homeRecent }, { list: awayRecent }].map((side, si) => (
              <div key={si} className="space-y-1 w-full max-w-[240px]">
                {side.list.map((r, i) => (
                  <div key={i} className="text-[12px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${OUTCOME_CLS[r.outcome]}`}>
                        {r.outcome}
                      </span>
                      <span className="tabular-nums font-semibold text-neutral-800 dark:text-neutral-200 shrink-0">{r.score}</span>
                      <span className="truncate text-neutral-500">vs {r.vsKo}</span>
                    </div>
                    <div className="flex items-center gap-1 pl-[22px] mt-0.5 text-[10px] text-neutral-400 leading-tight">
                      <span className="shrink-0 tabular-nums">{r.date}</span>
                      {r.venue && <span className="truncate">· {r.venue}</span>}
                    </div>
                  </div>
                ))}
                {side.list.length === 0 && (
                  <div className="text-[12px] text-neutral-400">최근 기록 없음</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
