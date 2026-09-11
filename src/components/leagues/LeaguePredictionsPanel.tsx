// 리그 허브 「예측」 탭 — 시즌 시뮬레이션 요약(우승·Top4/포스트시즌·강등 확률) + /predictions/[league] 상세로 가는 입구.
// 숫자는 공용 1h 캐시(getLeagueSeasonSim) 라 예측 페이지·홈 카드와 같다. KBO 는 공용 KBO 시뮬 캐시(같은 이유).
import Link from "next/link";
import { prisma } from "@/lib/db";
import MonteCarloBar from "@/components/charts/MonteCarloBar";
import { getLeagueSeasonSim, SIM_MIN_FINISHED } from "@/lib/predict/league-season-sim";
import { getKboSeasonSim } from "@/lib/predict/postseason-odds";
import type { MonteCarloRow } from "@/lib/predict/monte-carlo";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY, SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { seasonLabelFromStart } from "@/lib/predict/season-matches";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";

const pct = (v: number) => v * 100;

export default async function LeaguePredictionsPanel({ league }: { league: string }) {
  const name = LEAGUE_DISPLAY[league] ?? league;
  const detailHref = `/predictions/${league}`;

  // KBO — 공용 KBO 시뮬(10분 캐시, /standings/KBO 와 동일). 그 외 — 공용 리그 시뮬(1h).
  let rows: MonteCarloRow[] = [];
  let meta: { finished: number; scheduled: number; canSimulate: boolean; trustworthy: boolean; isPreviousSeason: boolean; seasonLabel: string | null; relegationCount: number } | null = null;
  if (league === "KBO") {
    const kbo = await getKboSeasonSim().catch(() => null);
    rows = kbo?.rows ?? [];
    meta = rows.length > 0 ? { finished: 0, scheduled: 0, canSimulate: true, trustworthy: true, isPreviousSeason: false, seasonLabel: null, relegationCount: 0 } : null;
  } else {
    const sim = await getLeagueSeasonSim(league).catch(() => null);
    if (sim) {
      rows = sim.rows;
      meta = sim;
    }
  }

  const teamIds = rows.map((r) => r.teamId);
  const teams = teamIds.length
    ? await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(teams.map((t) => [t.id, toKoreanTeamName(t.name, league) || t.name]));
  const label = (id: number) => nameOf.get(id) ?? `팀 ${id}`;

  const soccer = SOCCER_LEAGUES.has(league);
  const showChampion = !!meta && meta.canSimulate && meta.trustworthy && rows.length > 0;
  const champions = rows.filter((r) => r.champion >= 0.001).sort((a, b) => b.champion - a.champion).slice(0, 8);
  const second = soccer
    ? { title: "Top 4 (UCL) 진출 확률", key: "top4" as const }
    : league === "KBO"
      ? { title: "포스트시즌(5위 이내) 진출 확률", key: "top5" as const }
      : null;
  const secondRows = second ? [...rows].sort((a, b) => b[second.key] - a[second.key]).filter((r) => r[second.key] >= 0.01).slice(0, 8) : [];
  const relegation = meta && meta.relegationCount > 0 ? [...rows].sort((a, b) => b.relegation - a.relegation).filter((r) => r.relegation >= 0.02).slice(0, 6) : [];
  // 지난 시즌 결산 링크 — 시즌 경계가 있는 리그만. 지금 지난 시즌 폴백 중이면 결산이 곧 현재 화면이라 생략.
  const start = currentSeasonStart(league);
  const prevLabel = start && meta && !meta.isPreviousSeason ? seasonLabelFromStart(league, previousSeasonStart(start)) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">
            {name} 시즌 시뮬레이션
            {meta?.seasonLabel && <span className="ml-2 text-sm font-medium text-neutral-500">{meta.seasonLabel} 시즌</span>}
            {meta?.isPreviousSeason && <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">지난 시즌</span>}
          </h2>
          <p className="mt-1 text-xs text-neutral-500 break-keep">
            Elo 레이팅 기반 5,000회 몬테카를로 — 이번 시즌 완료 경기로 잔여 일정을 시뮬레이션한 확률입니다.
            {meta && meta.finished + meta.scheduled > 0 && ` 완료 ${meta.finished}경기 · 예정 ${meta.scheduled}경기.`}
          </p>
        </div>
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-4 py-2 text-sm font-bold text-rose-600 ring-1 ring-rose-500/20 transition hover:bg-rose-500/15 dark:text-rose-400"
        >
          전체 시뮬레이션 — 예상 최종 순위 · 다가오는 경기 승률 · 리더보드 →
        </Link>
      </div>

      {!showChampion ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-8 text-center text-sm text-neutral-500 space-y-2">
          {meta && meta.scheduled === 0 ? (
            <p>
              시즌이 끝났거나 다음 일정이 아직 등록되지 않았습니다. 남은 경기가 없으면 우승은 확률이 아니라 이미 정해진 결과라 계산하지 않습니다.
            </p>
          ) : !meta || !meta.canSimulate ? (
            <p>
              시뮬레이션은 이번 시즌 완료 {SIM_MIN_FINISHED}경기부터 시작합니다
              {meta ? ` (현재 ${meta.finished}경기)` : ""}. 표본이 작을 때 극단값을 내지 않기 위한 가드입니다.
            </p>
          ) : (
            <p>잔여 일정 데이터가 일부 비어 있어 우승 확률 표시를 보류하고 있습니다. 일정이 채워지면 자동으로 다시 표시됩니다.</p>
          )}
          <Link href={detailHref} className="inline-block text-rose-600 dark:text-rose-400 font-semibold hover:underline">
            예측 페이지에서 현재 순위 vs Elo 비교 보기 →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section>
            <h3 className="text-sm font-bold mb-2">{league === "MLS" ? "정규리그 1위 확률" : "우승 확률"}</h3>
            <MonteCarloBar data={champions.map((r) => ({ name: label(r.teamId), value: pct(r.champion) }))} />
          </section>
          {second && secondRows.length > 0 && (
            <section>
              <h3 className="text-sm font-bold mb-2">{second.title}</h3>
              <MonteCarloBar data={secondRows.map((r) => ({ name: label(r.teamId), value: pct(r[second.key]) }))} />
            </section>
          )}
          {relegation.length > 0 && (
            <section>
              <h3 className="text-sm font-bold mb-2">강등 확률 (하위 {meta!.relegationCount}팀)</h3>
              <MonteCarloBar variant="danger" data={relegation.map((r) => ({ name: label(r.teamId), value: pct(r.relegation) }))} />
            </section>
          )}
        </div>
      )}

      <p className="text-xs text-neutral-500 break-keep">
        같은 숫자가 홈 시즌 카드와 예측 페이지에 나갑니다(1시간마다 갱신).
        {prevLabel && (
          <>
            {" "}지난 시즌 예측이 얼마나 맞았는지는{" "}
            <Link href={`${detailHref}/${prevLabel}`} className="font-semibold text-neutral-700 hover:underline dark:text-neutral-200">
              {prevLabel} 시즌 결산
            </Link>
            에서 확인할 수 있습니다.
          </>
        )}
      </p>
    </div>
  );
}
