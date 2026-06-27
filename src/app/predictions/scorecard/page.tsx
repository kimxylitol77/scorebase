// AI 예측 성적표 — 우리 통계모델 vs GPT-5.5 가 같은 경기를 맞춰온 정면 비교 + 경기별 적중/실패 누적.
import type { Metadata } from "next";
import Link from "next/link";
import { Check, X, Trophy, Sparkles, Clock } from "lucide-react";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import LeagueBadge from "@/components/LeagueBadge";
import CiteBox from "@/components/CiteBox";
import ScorecardTrendChart, { type TrendPoint } from "@/components/charts/ScorecardTrendChart";
import { toKoreanTeamName } from "@/lib/team-names";

export const revalidate = 1800; // 30분 ISR

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

const MODELS = {
  scorebase: { id: "scorebase", name: "스코어베이스 AI", short: "우리 모델", accent: "rose" },
  gpt: { id: "gpt-5.5", name: "GPT-5.5", short: "GPT-5.5", accent: "emerald" },
} as const;

export const metadata: Metadata = {
  title: "AI 예측 성적표 — 스코어베이스 AI vs GPT-5.5 승부예측 정면 비교",
  description:
    "두 AI가 같은 경기를 경기 전에 예측하고, 결과로 채점합니다. 스코어베이스 통계모델과 GPT-5.5의 1X2 승부예측 적중률을 경기별 적중·실패 기록과 함께 투명하게 공개합니다.",
  keywords: [
    "AI 예측 성적표", "GPT 승부예측", "AI 스포츠 예측 비교", "GPT-5.5 예측",
    "AI 적중률", "축구 승부예측", "야구 승부예측", "AI 예측 대결",
  ],
  alternates: { canonical: `${SITE_URL}/predictions/scorecard` },
  openGraph: {
    title: "AI 예측 성적표 — 스코어베이스 AI vs GPT-5.5",
    description: "두 AI가 같은 경기를 두고 맞붙은 승부예측 성적표. 경기별 적중·실패 누적 공개.",
    url: `${SITE_URL}/predictions/scorecard`,
  },
};

type Winner = "HOME" | "DRAW" | "AWAY";

interface Tally {
  graded: number;
  correct: number;
  rate: number;
  streak: number; // 양수=연승, 음수=연패
}

function emptyTally(): Tally {
  return { graded: 0, correct: 0, rate: 0, streak: 0 };
}

function pickLabel(pick: Winner, home: string, away: string): string {
  if (pick === "HOME") return home;
  if (pick === "AWAY") return away;
  return "무승부";
}

export default async function ScorecardPage() {
  const rows = await prisma.aiPrediction.findMany({
    where: { market: "1X2" },
    orderBy: { match: { startTime: "asc" } },
    select: {
      model: true,
      pick: true,
      prob: true,
      reason: true,
      correct: true,
      match: {
        select: {
          id: true,
          league: true,
          startTime: true,
          status: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  // matchId 기준으로 두 모델 픽을 한 행으로 묶음.
  type Cell = { pick: Winner; prob: number; reason: string | null; correct: boolean | null };
  interface Row {
    matchId: number;
    league: string;
    startTime: Date;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    home: string;
    away: string;
    scorebase?: Cell;
    gpt?: Cell;
  }
  const byMatch = new Map<number, Row>();
  for (const r of rows) {
    const m = r.match;
    let row = byMatch.get(m.id);
    if (!row) {
      row = {
        matchId: m.id,
        league: m.league,
        startTime: m.startTime,
        status: m.status,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        home: toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name,
        away: toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name,
      };
      byMatch.set(m.id, row);
    }
    const cell: Cell = { pick: r.pick as Winner, prob: r.prob, reason: r.reason, correct: r.correct };
    if (r.model === MODELS.scorebase.id) row.scorebase = cell;
    else if (r.model === MODELS.gpt.id) row.gpt = cell;
  }

  // 두 모델 모두 픽한 경기만 정면 비교 대상.
  const all = [...byMatch.values()].filter((r) => r.scorebase && r.gpt);
  const resolved = all
    .filter((r) => r.scorebase!.correct !== null && r.gpt!.correct !== null)
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  // 두 AI 픽이 갈린 경기 = 정면 대결의 핵심 볼거리.
  const isSplit = (r: Row) => r.scorebase!.pick !== r.gpt!.pick;
  const upcoming = all
    .filter((r) => r.status === "SCHEDULED" && r.scorebase!.correct === null)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    // 갈린 경기 먼저 (시간 순서는 그룹 내 유지)
    .sort((a, b) => Number(isSplit(b)) - Number(isSplit(a)));

  // 누적 전적·연승 — startTime asc 로 계산.
  const resolvedAsc = [...resolved].reverse();
  const tallyOf = (sel: (r: Row) => Cell): Tally => {
    const t = emptyTally();
    let streak = 0;
    for (const r of resolvedAsc) {
      const ok = sel(r).correct === true;
      t.graded++;
      if (ok) t.correct++;
      if (ok) streak = streak >= 0 ? streak + 1 : 1;
      else streak = streak <= 0 ? streak - 1 : -1;
    }
    t.rate = t.graded > 0 ? t.correct / t.graded : 0;
    t.streak = streak;
    return t;
  };
  const sbTally = tallyOf((r) => r.scorebase!);
  const gptTally = tallyOf((r) => r.gpt!);

  // 누적 적중률 추이 — 채점 경기가 충분히 쌓였을 때만 곡선 노출.
  let sbHit = 0, gptHit = 0;
  const trend: TrendPoint[] = resolvedAsc.map((r, i) => {
    if (r.scorebase!.correct === true) sbHit++;
    if (r.gpt!.correct === true) gptHit++;
    return {
      n: i + 1,
      "우리 모델": +((sbHit / (i + 1)) * 100).toFixed(1),
      "GPT-5.5": +((gptHit / (i + 1)) * 100).toFixed(1),
    };
  });
  const showTrend = trend.length >= 10;

  // 정면 승부 — 한쪽만 맞춘 경기 집계 (누가 더 자주 단독 적중했나).
  let sbOnly = 0, gptOnly = 0, bothRight = 0, bothWrong = 0;
  for (const r of resolved) {
    const s = r.scorebase!.correct === true;
    const g = r.gpt!.correct === true;
    if (s && g) bothRight++;
    else if (s && !g) sbOnly++;
    else if (!s && g) gptOnly++;
    else bothWrong++;
  }

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

  const leader =
    sbTally.graded === 0
      ? null
      : sbTally.rate > gptTally.rate
        ? "scorebase"
        : gptTally.rate > sbTally.rate
          ? "gpt"
          : "tie";

  const citeDate = new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const citeUrl = `${SITE_URL}/predictions/scorecard`;
  const citation =
    sbTally.graded > 0
      ? `AI 예측 성적표 — 같은 ${sbTally.graded}경기에서 스코어베이스 AI ${(sbTally.rate * 100).toFixed(1)}% vs GPT-5.5 ${(gptTally.rate * 100).toFixed(1)}% 1X2 적중률 (출처: Scorebase ${citeUrl}, ${citeDate} 기준)`
      : `AI 예측 성적표 — 스코어베이스 AI vs GPT-5.5 승부예측 정면 비교 (출처: Scorebase ${citeUrl})`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "AI 예측 성적표 — 스코어베이스 AI vs GPT-5.5",
    description:
      "두 AI가 같은 경기를 경기 전에 예측하고 결과로 채점한 1X2 승부예측 적중률 비교 데이터셋.",
    url: citeUrl,
    keywords: ["AI 예측 성적표", "GPT 승부예측", "AI 적중률 비교"],
    creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
    isAccessibleForFree: true,
  };

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <AmbientGlow />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <Sparkles className="h-3 w-3" aria-hidden /> 멀티 AI 비교
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
          AI 예측 성적표
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
          스코어베이스 통계모델과 <strong className="text-zinc-800 dark:text-white/80">GPT-5.5</strong>가
          <strong className="text-zinc-800 dark:text-white/80"> 정확히 같은 경기</strong>를 경기 전에 예측합니다.
          결과가 나오면 채점해 경기별 적중·실패를 그대로 쌓습니다. 누가 더 잘 맞히는지, 숨김 없이.
        </p>
      </header>

      {/* 정면 비교 스코어보드 */}
      <section className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3 sm:gap-4 mb-10">
        <ModelCard tally={sbTally} model={MODELS.scorebase} isLeader={leader === "scorebase"} />
        <div className="flex flex-col items-center justify-center px-1">
          <span className="text-xs font-bold text-zinc-400 dark:text-white/30">VS</span>
        </div>
        <ModelCard tally={gptTally} model={MODELS.gpt} isLeader={leader === "gpt"} />
      </section>

      {resolved.length > 0 && (
        <p className="-mt-4 mb-10 text-center text-[13px] text-zinc-500 dark:text-white/40">
          같은 {resolved.length}경기 기준 · 양쪽 적중 {bothRight} · 우리만 적중 {sbOnly} · GPT만 적중 {gptOnly} · 둘 다 실패 {bothWrong}
        </p>
      )}

      {/* 누적 적중률 추이 */}
      {showTrend && (
        <section className="mb-12">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Sparkles className="h-4 w-4 text-rose-500" aria-hidden /> 누적 적중률 추이
          </h2>
          <p className="mb-4 text-[13px] text-zinc-500 dark:text-white/40">
            채점 경기가 쌓일수록 두 AI의 누적 1X2 적중률이 어떻게 갈리는지.
          </p>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">
            <ScorecardTrendChart data={trend} />
          </div>
        </section>
      )}

      {/* 예정 경기 맞대결 픽 */}
      {upcoming.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Clock className="h-4 w-4 text-rose-500" aria-hidden /> 다가오는 맞대결 픽
          </h2>
          <div className="space-y-2">
            {upcoming.slice(0, 20).map((r) => (
              <div
                key={r.matchId}
                className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70 shadow-sm dark:bg-white/[0.04] dark:ring-white/10"
              >
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-white/40">
                  <LeagueBadge league={r.league} />
                  <span>{fmtDate(r.startTime)} {fmtTime(r.startTime)}</span>
                  {isSplit(r) && (
                    <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300 dark:ring-amber-300/30">
                      의견 갈림
                    </span>
                  )}
                </div>
                <div className="mt-2 text-[15px] font-semibold text-zinc-900 dark:text-white">
                  {r.home} <span className="text-zinc-400 dark:text-white/30">vs</span> {r.away}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <PickChip label={MODELS.scorebase.short} cell={r.scorebase!} home={r.home} away={r.away} accent="rose" />
                  <PickChip label={MODELS.gpt.short} cell={r.gpt!} home={r.home} away={r.away} accent="emerald" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 경기별 결과 피드 */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
          <Trophy className="h-4 w-4 text-rose-500" aria-hidden /> 경기별 성적
        </h2>
        {resolved.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-zinc-200/70 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">
            <p className="text-[15px] text-zinc-600 dark:text-white/60">
              아직 채점된 경기가 없습니다. 예정 경기가 끝나는 대로 적중·실패가 이곳에 쌓입니다.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200/70 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[11px] uppercase tracking-wide text-zinc-400 dark:border-white/10 dark:text-white/30">
                  <th className="px-3 py-2.5 font-medium">경기</th>
                  <th className="px-2 py-2.5 text-center font-medium">결과</th>
                  <th className="px-2 py-2.5 text-center font-medium text-rose-500">우리</th>
                  <th className="px-2 py-2.5 text-center font-medium text-emerald-600 dark:text-emerald-400">GPT</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((r) => (
                  <tr key={r.matchId} className="border-b border-zinc-50 last:border-0 dark:border-white/[0.04]">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <LeagueBadge league={r.league} />
                        <span className="font-medium text-zinc-800 dark:text-white/80">
                          {r.home} <span className="text-zinc-300 dark:text-white/20">·</span> {r.away}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-white/30">{fmtDate(r.startTime)}</div>
                    </td>
                    <td className="px-2 py-2.5 text-center font-semibold tabular-nums text-zinc-700 dark:text-white/70">
                      {r.homeScore ?? "-"}:{r.awayScore ?? "-"}
                    </td>
                    <td className="px-2 py-2.5">
                      <ResultCell cell={r.scorebase!} home={r.home} away={r.away} />
                    </td>
                    <td className="px-2 py-2.5">
                      <ResultCell cell={r.gpt!} home={r.home} away={r.away} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 방법론 + 인용 */}
      <section className="space-y-4">
        <div className="rounded-2xl bg-zinc-50 p-5 text-[13px] leading-relaxed text-zinc-600 ring-1 ring-zinc-200/70 dark:bg-white/[0.03] dark:text-white/50 dark:ring-white/10">
          <p className="font-semibold text-zinc-700 dark:text-white/70">계산 방법</p>
          <p className="mt-1.5">
            두 AI 모두 <strong>경기 시작 전</strong>에 1X2(승·무·패) 픽을 제출합니다. 스코어베이스 AI는
            Elo·Dixon-Coles + 선발/골리 + 시장 배당 블렌드 통계모델이고, GPT-5.5는 팀·리그·일정 정보만 받아
            (우리 모델 수치는 보지 않고) 독립 예측합니다. 경기가 끝나면 픽이 실제 승자와 같은지로 채점합니다
            (축구는 정규시간 기준). 공정성을 위해 두 AI가 모두 예측한 동일 경기만 비교합니다.
          </p>
          <p className="mt-2 text-zinc-500 dark:text-white/40">
            전체 리그·시장별 적중률은{" "}
            <Link href="/predictions/accuracy" className="font-medium text-rose-600 underline-offset-2 hover:underline dark:text-rose-400">
              AI 예측 적중률 보드
            </Link>
            에서 확인하세요.
          </p>
        </div>
        <CiteBox citation={citation} url={citeUrl} />
      </section>
    </main>
  );
}

function ModelCard({
  tally,
  model,
  isLeader,
}: {
  tally: Tally;
  model: { name: string; short: string; accent: string };
  isLeader: boolean;
}) {
  const accent = model.accent === "rose" ? "rose" : "emerald";
  const ring = isLeader
    ? accent === "rose"
      ? "ring-2 ring-rose-400/60 dark:ring-rose-400/40"
      : "ring-2 ring-emerald-400/60 dark:ring-emerald-400/40"
    : "ring-1 ring-zinc-200/70 dark:ring-white/10";
  const rateColor = accent === "rose" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className={`relative rounded-3xl bg-white p-5 sm:p-6 shadow-sm dark:bg-white/[0.04] ${ring}`}>
      {isLeader && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-bold text-amber-950 shadow">
          <Trophy className="h-2.5 w-2.5" aria-hidden /> 우세
        </span>
      )}
      <div className="text-[13px] font-semibold text-zinc-500 dark:text-white/50">{model.name}</div>
      <div className={`mt-2 text-4xl sm:text-5xl font-bold tabular-nums ${rateColor}`}>
        {tally.graded > 0 ? `${(tally.rate * 100).toFixed(1)}%` : "—"}
      </div>
      <div className="mt-1 text-[13px] text-zinc-500 dark:text-white/40 tabular-nums">
        {tally.graded > 0 ? `${tally.correct} / ${tally.graded} 적중` : "채점 대기"}
      </div>
      {tally.graded > 0 && tally.streak !== 0 && (
        <div className="mt-2 text-[12px] font-medium tabular-nums">
          {tally.streak > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">{tally.streak}연속 적중</span>
          ) : (
            <span className="text-zinc-400 dark:text-white/30">{-tally.streak}연속 실패</span>
          )}
        </div>
      )}
    </div>
  );
}

function PickChip({
  label,
  cell,
  home,
  away,
  accent,
}: {
  label: string;
  cell: { pick: Winner; prob: number; reason: string | null };
  home: string;
  away: string;
  accent: "rose" | "emerald";
}) {
  const dot = accent === "rose" ? "bg-rose-500" : "bg-emerald-500";
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100 dark:bg-white/[0.03] dark:ring-white/[0.06]">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 dark:text-white/40">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden /> {label}
      </div>
      <div className="mt-0.5 text-[13px] font-semibold text-zinc-800 dark:text-white/80">
        {pickLabel(cell.pick, home, away)}
        <span className="ml-1 text-[11px] font-normal text-zinc-400 dark:text-white/30 tabular-nums">
          {(cell.prob * 100).toFixed(0)}%
        </span>
      </div>
      {cell.reason && (
        <div className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400 dark:text-white/30">{cell.reason}</div>
      )}
    </div>
  );
}

function ResultCell({
  cell,
  home,
  away,
}: {
  cell: { pick: Winner; correct: boolean | null };
  home: string;
  away: string;
}) {
  const ok = cell.correct === true;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
          ok
            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
            : "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
        }`}
      >
        {ok ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
      </span>
      <span className="text-[10px] text-zinc-400 dark:text-white/30 truncate max-w-[64px]">
        {pickLabel(cell.pick, home, away)}
      </span>
    </div>
  );
}
