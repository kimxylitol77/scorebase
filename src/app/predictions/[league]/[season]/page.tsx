// 과거 시즌 AI 예측 결산 페이지 — /predictions/EPL/2025-26.
// 경기 시점에 저장된 예측(Match.pred*)을 종료 후 채점한 실측(pred*Correct)으로 마켓별 적중률을 집계하고,
// SeasonStandingsArchive 의 최종 순위 요약을 붙인다. 현재 시즌 시뮬은 /predictions/[league] 담당.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { seasonWindowForLabel } from "@/lib/predict/season-window";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import { seasonLabelFor } from "@/lib/sports/season-calendar";
import { resolveSeasonYear } from "@/lib/sports/season-registry";
import { toKoreanTeamName } from "@/lib/team-names";
import TeamBadge from "@/components/TeamBadge";
import AmbientGlow from "@/components/AmbientGlow";
import StandingsSeasonNav from "@/components/standings/StandingsSeasonNav";

export const revalidate = 86400; // 완료 시즌 결산 — 사실상 동결 데이터

const SEASON_RE = /^\d{4}(-\d{2})?$/;
const MIN_EVAL = 30; // 마켓별 최소 채점 표본 — 미만이면 그 마켓 카드 미노출

interface Props {
  params: Promise<{ league: string; season: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league, season: rawSeason } = await params;
  const upper = league.toUpperCase();
  const season = decodeURIComponent(rawSeason);
  const name = LEAGUE_DISPLAY[upper] ?? upper;
  return {
    title: `${name} ${season} 시즌 AI 예측 결산`,
    description: `${name} ${season} 시즌 AI 예측 결산. 경기 시점에 기록한 승부·언더오버·핸디캡 예측을 실제 결과로 채점한 마켓별 적중률과 최종 순위.`,
    alternates: { canonical: `https://www.scorebase.kr/predictions/${upper}/${season}` },
  };
}

export default async function PredictionSeasonArchivePage({ params }: Props) {
  const { league, season: rawSeason } = await params;
  const upper = league.toUpperCase();
  const season = decodeURIComponent(rawSeason);
  const name = LEAGUE_DISPLAY[upper] ?? upper;
  if (!SEASON_RE.test(season) || !LEAGUE_DISPLAY[upper]) notFound();

  // 현재 시즌 라벨이면 시뮬 페이지로 — 결산은 완료 시즌 전용.
  let currentLabel: string | null = null;
  try {
    currentLabel = seasonLabelFor(upper, await resolveSeasonYear(upper));
  } catch {
    // 시즌 판정 실패 — 결산 렌더 유지
  }
  if (currentLabel === season) redirect(`/predictions/${upper}`);

  const window = seasonWindowForLabel(upper, season);

  // 그 시즌 채점 완료 매치 — pred*Correct 는 evaluate cron 이 종료 후 채운 실측값.
  const matches = window
    ? await prisma.match.findMany({
        where: { league: upper, status: "FINISHED", startTime: { gte: window.from, lt: window.to } },
        select: {
          predHome: true,
          predDraw: true,
          predAway: true,
          predCorrect: true,
          predDcCorrect: true,
          predOverCorrect: true,
          predBttsCorrect: true,
          predHcCorrect: true,
        },
      })
    : [];

  const tally = (pick: (m: (typeof matches)[number]) => boolean | null) => {
    let n = 0;
    let hit = 0;
    for (const m of matches) {
      const c = pick(m);
      if (c == null) continue;
      n++;
      if (c) hit++;
    }
    return { n, hit };
  };
  const x12 = tally((m) => m.predCorrect);
  const thr = strongPickThreshold(upper);
  const strong = tally((m) => {
    if (m.predCorrect == null || m.predHome == null) return null;
    const top = Math.max(m.predHome, m.predDraw ?? 0, m.predAway ?? 0);
    return top >= thr ? m.predCorrect : null;
  });
  const markets = [
    { key: "1X2", label: "승부 (1X2)", ...x12 },
    { key: "STRONG", label: `고확신 픽 (≥${Math.round(thr * 100)}%)`, ...strong },
    { key: "OU", label: "언더오버", ...tally((m) => m.predOverCorrect) },
    { key: "HC", label: "핸디캡", ...tally((m) => m.predHcCorrect) },
    { key: "DC", label: "더블찬스", ...tally((m) => m.predDcCorrect) },
    { key: "BTTS", label: "양팀득점", ...tally((m) => m.predBttsCorrect) },
  ].filter((mk) => mk.n >= MIN_EVAL);

  // 최종 순위 요약 — 아카이브 정본. 없으면 섹션 생략.
  interface ArchRow { teamId: number | null; name: string; ko?: string; logo?: string | null; position: number; points?: number; group?: string | null }
  let finalRows: ArchRow[] = [];
  try {
    const arch = await prisma.seasonStandingsArchive.findUnique({
      where: { league_seasonLabel: { league: upper, seasonLabel: season } },
      select: { rows: true },
    });
    finalRows = (((arch?.rows as unknown as ArchRow[]) ?? []) as ArchRow[])
      .filter((r) => !r.group)
      .sort((a, b) => a.position - b.position);
  } catch {
    // 아카이브 조회 실패는 결산을 죽이지 않는다
  }

  // 예측 기록도 최종 순위도 없으면 보여줄 것이 없다
  if (markets.length === 0 && finalRows.length === 0) notFound();

  const champ = finalRows[0];
  const pct = (mk: { n: number; hit: number }) => ((mk.hit / mk.n) * 100).toFixed(1);

  return (
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-5">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores" className="hover:underline">
          라이브 스코어
        </Link>
        <span>›</span>
        <Link href={`/predictions/${upper}`} className="hover:underline">
          {name} 예측
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{season}</span>
      </nav>

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> AI 예측 결산
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          {name} {season} 시즌 결산
        </h1>
        <p className="text-sm text-neutral-500 break-keep">
          경기 시점에 기록한 AI 예측을 종료 후 실제 결과로 채점한 실측 적중률입니다.
          {champ && (
            <>
              {" "}
              그 시즌 우승은 <span className="font-semibold text-neutral-700 dark:text-neutral-300">{champ.ko ?? toKoreanTeamName(champ.name, upper)}</span>.
            </>
          )}
        </p>
        <StandingsSeasonNav league={upper} active={season} basePath="/predictions" />
      </header>

      {markets.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight break-keep">마켓별 적중률</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {markets.map((mk) => (
              <div
                key={mk.key}
                className="rounded-2xl bg-white ring-1 ring-black/5 px-4 py-3.5 dark:bg-white/[0.04] dark:ring-white/10"
              >
                <div className="text-[11px] font-semibold text-neutral-500">{mk.label}</div>
                <div className="mt-1 text-2xl font-black tabular-nums">
                  {pct(mk)}
                  <span className="text-sm font-bold text-neutral-400">%</span>
                </div>
                <div className="text-[11px] text-neutral-400 tabular-nums">
                  {mk.hit}/{mk.n} 적중
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-neutral-400 break-keep">
            ⓘ 채점 표본 {MIN_EVAL}경기 이상 마켓만 표시. 예측·채점 방식은 현재 시즌 적중률 보드와 동일합니다.{" "}
            <Link href="/predictions/accuracy" className="underline hover:text-neutral-600 dark:hover:text-neutral-300">
              적중률 보드
            </Link>
          </p>
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 px-5 py-8 text-center text-sm text-neutral-500 break-keep">
          이 시즌에는 AI 예측 기록이 없습니다. AI 예측 수집을 시작하기 전 시즌입니다.
        </p>
      )}

      {finalRows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight break-keep">시즌 최종 순위 (상위 5)</h2>
          <div className="rounded-2xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
            <ul className="divide-y divide-neutral-100 dark:divide-white/5">
              {finalRows.slice(0, 5).map((r) => (
                <li key={r.position} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-5 text-right tabular-nums font-bold text-neutral-500">{r.position}</span>
                  {r.position === 1 && <span aria-hidden>🏆</span>}
                  <TeamBadge logoUrl={r.logo ?? null} size={18} className="bg-white rounded-sm shrink-0" />
                  {r.teamId ? (
                    <Link href={`/teams/${r.teamId}`} prefetch={false} className="font-semibold truncate hover:underline">
                      {r.ko ?? toKoreanTeamName(r.name, upper)}
                    </Link>
                  ) : (
                    <span className="font-semibold truncate">{r.ko ?? toKoreanTeamName(r.name, upper)}</span>
                  )}
                  {r.points != null && (
                    <span className="ml-auto tabular-nums text-neutral-500">승점 {r.points}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <Link
            href={`/standings/${upper}/${season}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 dark:text-neutral-300 hover:underline"
          >
            {season} 전체 최종 순위 보기 →
          </Link>
        </section>
      )}
    </div>
  );
}
