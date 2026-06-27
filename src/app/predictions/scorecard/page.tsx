// AI 예측 성적표 — 우리 통계모델 vs GPT-5.5 가 같은 경기를 맞춰온 정면 비교(1X2·핸디·OU 3개 시장) + 시장별·경기별 누적.
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

type Market = "1X2" | "HANDICAP" | "OU";
const MARKET_META: { key: Market; label: string }[] = [
  { key: "1X2", label: "1X2 승부" },
  { key: "HANDICAP", label: "핸디캡" },
  { key: "OU", label: "오버언더" },
];

export const metadata: Metadata = {
  title: "AI 예측 성적표 — 스코어베이스 AI vs GPT-5.5 승부예측 정면 비교",
  description:
    "두 AI가 같은 경기를 경기 전에 예측하고, 결과로 채점합니다. 스코어베이스 통계모델과 GPT-5.5의 1X2·핸디캡·오버언더 적중률을 시장별·경기별 기록과 함께 투명하게 공개합니다.",
  keywords: [
    "AI 예측 성적표", "GPT 승부예측", "AI 스포츠 예측 비교", "GPT-5.5 예측",
    "AI 적중률", "핸디캡 예측", "오버언더 예측", "AI 예측 대결",
  ],
  alternates: { canonical: `${SITE_URL}/predictions/scorecard` },
  openGraph: {
    title: "AI 예측 성적표 — 스코어베이스 AI vs GPT-5.5",
    description: "두 AI가 같은 경기를 두고 맞붙은 승부예측 성적표. 1X2·핸디·OU 시장별 적중 누적 공개.",
    url: `${SITE_URL}/predictions/scorecard`,
  },
};

interface Tally {
  graded: number;
  correct: number;
  rate: number;
}
function rate(correct: number, graded: number): number {
  return graded > 0 ? correct / graded : 0;
}

function pickText(market: Market, pick: string, home: string, away: string, line: number | null): string {
  if (market === "OU") return `${pick === "OVER" ? "오버" : "언더"}${line != null ? ` ${line}` : ""}`;
  if (market === "HANDICAP") return `${pick === "HOME" ? home : away}${line != null ? ` ${line > 0 ? "-" : "+"}${Math.abs(line)}` : ""}`;
  if (pick === "HOME") return home;
  if (pick === "AWAY") return away;
  return "무승부";
}

export default async function ScorecardPage() {
  const rows = await prisma.aiPrediction.findMany({
    where: { market: { in: ["1X2", "HANDICAP", "OU"] } },
    orderBy: { match: { startTime: "asc" } },
    select: {
      model: true, market: true, pick: true, prob: true, line: true, reason: true, correct: true,
      match: {
        select: {
          id: true, league: true, startTime: true, status: true,
          homeScore: true, awayScore: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  type Cell = { pick: string; prob: number; line: number | null; reason: string | null; correct: boolean | null };
  interface DP {
    matchId: number;
    market: Market;
    league: string;
    startTime: Date;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    home: string;
    away: string;
    sb?: Cell;
    gpt?: Cell;
  }
  // (matchId, market) 단위로 두 모델 픽을 한 행으로 묶음.
  const byKey = new Map<string, DP>();
  for (const r of rows) {
    const m = r.match;
    const mk = r.market as Market;
    const key = `${m.id}:${mk}`;
    let dp = byKey.get(key);
    if (!dp) {
      dp = {
        matchId: m.id, market: mk, league: m.league, startTime: m.startTime, status: m.status,
        homeScore: m.homeScore, awayScore: m.awayScore,
        home: toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name,
        away: toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name,
      };
      byKey.set(key, dp);
    }
    const cell: Cell = { pick: r.pick, prob: r.prob, line: r.line, reason: r.reason, correct: r.correct };
    if (r.model === MODELS.scorebase.id) dp.sb = cell;
    else if (r.model === MODELS.gpt.id) dp.gpt = cell;
  }

  // 두 모델 모두 픽 + 채점된 데이터포인트만 비교 — 타입 가드로 sb/gpt 비-null 보장(이후 d.sb!/d.gpt! 안전).
  const datapoints = [...byKey.values()].filter(
    (d): d is DP & { sb: Cell; gpt: Cell } => Boolean(d.sb) && Boolean(d.gpt),
  );
  const resolved = datapoints
    .filter((d) => d.sb!.correct !== null && d.gpt!.correct !== null)
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  const resolvedAsc = [...resolved].reverse();

  const tallyOf = (list: DP[], sel: (d: DP) => Cell): Tally => {
    let correct = 0;
    for (const d of list) if (sel(d).correct === true) correct++;
    return { graded: list.length, correct, rate: rate(correct, list.length) };
  };
  // 종합(3시장 합)
  const sbTally = tallyOf(resolved, (d) => d.sb!);
  const gptTally = tallyOf(resolved, (d) => d.gpt!);

  // 시장별 성적
  const perMarket = MARKET_META.map((mm) => {
    const list = resolved.filter((d) => d.market === mm.key);
    return {
      ...mm,
      sb: tallyOf(list, (d) => d.sb!),
      gpt: tallyOf(list, (d) => d.gpt!),
    };
  }).filter((m) => m.sb.graded > 0);

  // 누적 적중률 추이 — 종합.
  let sbHit = 0, gptHit = 0;
  const trend: TrendPoint[] = resolvedAsc.map((d, i) => {
    if (d.sb!.correct === true) sbHit++;
    if (d.gpt!.correct === true) gptHit++;
    return {
      n: i + 1,
      "우리 모델": +((sbHit / (i + 1)) * 100).toFixed(1),
      "GPT-5.5": +((gptHit / (i + 1)) * 100).toFixed(1),
    };
  });
  const showTrend = trend.length >= 10;

  // 예정 맞대결 픽 — 경기별로 3시장(1X2·핸디·OU) 묶음.
  const marketOrder: Market[] = ["1X2", "HANDICAP", "OU"];
  interface UpMatch {
    matchId: number;
    league: string;
    startTime: Date;
    home: string;
    away: string;
    markets: DP[];
    split: boolean; // 1X2 픽이 갈렸나
  }
  const upByMatch = new Map<number, UpMatch>();
  for (const d of datapoints) {
    if (d.status !== "SCHEDULED" || d.sb!.correct !== null) continue;
    let e = upByMatch.get(d.matchId);
    if (!e) {
      e = { matchId: d.matchId, league: d.league, startTime: d.startTime, home: d.home, away: d.away, markets: [], split: false };
      upByMatch.set(d.matchId, e);
    }
    e.markets.push(d);
  }
  const upcoming = [...upByMatch.values()].map((e) => {
    e.markets.sort((a, b) => marketOrder.indexOf(a.market) - marketOrder.indexOf(b.market));
    const one = e.markets.find((m) => m.market === "1X2");
    e.split = one ? one.sb!.pick !== one.gpt!.pick : false;
    return e;
  })
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .sort((a, b) => Number(b.split) - Number(a.split));

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

  const leader =
    sbTally.graded === 0 ? null
      : sbTally.rate > gptTally.rate ? "scorebase"
      : gptTally.rate > sbTally.rate ? "gpt" : "tie";

  const citeDate = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
  const citeUrl = `${SITE_URL}/predictions/scorecard`;
  const citation =
    sbTally.graded > 0
      ? `AI 예측 성적표 — 같은 경기 ${sbTally.graded}개 데이터포인트(1X2·핸디·OU)에서 스코어베이스 AI ${(sbTally.rate * 100).toFixed(1)}% vs GPT-5.5 ${(gptTally.rate * 100).toFixed(1)}% 적중률 (출처: Scorebase ${citeUrl}, ${citeDate} 기준)`
      : `AI 예측 성적표 — 스코어베이스 AI vs GPT-5.5 승부예측 정면 비교 (출처: Scorebase ${citeUrl})`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "AI 예측 성적표 — 스코어베이스 AI vs GPT-5.5",
    description:
      "두 AI가 같은 경기를 경기 전에 예측하고 결과로 채점한 1X2·핸디캡·오버언더 적중률 비교 데이터셋.",
    url: citeUrl,
    keywords: ["AI 예측 성적표", "GPT 승부예측", "AI 적중률 비교", "핸디캡 예측", "오버언더 예측"],
    creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
    isAccessibleForFree: true,
  };

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

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
          1X2 승부뿐 아니라 <strong className="text-zinc-800 dark:text-white/80">핸디캡·오버언더</strong>까지
          세 시장을 두고 맞붙어, 결과가 나오면 채점해 그대로 쌓습니다.
        </p>
      </header>

      {/* 종합 정면 비교 스코어보드 */}
      <section className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3 sm:gap-4 mb-3">
        <ModelCard tally={sbTally} model={MODELS.scorebase} isLeader={leader === "scorebase"} />
        <div className="flex flex-col items-center justify-center px-1">
          <span className="text-xs font-bold text-zinc-400 dark:text-white/30">VS</span>
        </div>
        <ModelCard tally={gptTally} model={MODELS.gpt} isLeader={leader === "gpt"} />
      </section>
      {resolved.length > 0 && (
        <p className="mb-10 text-center text-[13px] text-zinc-500 dark:text-white/40">
          1X2·핸디캡·오버언더 합산 · 같은 경기 {resolved.length}개 데이터포인트 기준
          {resolved.length < 50 && <span className="text-amber-600 dark:text-amber-400"> · 표본 누적 중(아직 통계적 결론은 이름)</span>}
        </p>
      )}

      {/* 시장별 성적 */}
      {perMarket.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Trophy className="h-4 w-4 text-rose-500" aria-hidden /> 시장별 성적
          </h2>
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200/70 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[11px] uppercase tracking-wide text-zinc-400 dark:border-white/10 dark:text-white/30">
                  <th className="px-4 py-2.5 font-medium">시장</th>
                  <th className="px-2 py-2.5 text-center font-medium text-rose-500">우리 모델</th>
                  <th className="px-2 py-2.5 text-center font-medium text-emerald-600 dark:text-emerald-400">GPT-5.5</th>
                  <th className="px-3 py-2.5 text-center font-medium">우세</th>
                </tr>
              </thead>
              <tbody>
                {perMarket.map((m) => {
                  const win = m.sb.rate > m.gpt.rate ? "sb" : m.gpt.rate > m.sb.rate ? "gpt" : "tie";
                  return (
                    <tr key={m.key} className="border-b border-zinc-50 last:border-0 dark:border-white/[0.04]">
                      <td className="px-4 py-3 font-medium text-zinc-800 dark:text-white/80">
                        {m.label}
                        <span className="ml-1.5 text-[11px] text-zinc-400 dark:text-white/30">n={m.sb.graded}</span>
                      </td>
                      <td className={`px-2 py-3 text-center tabular-nums font-semibold ${win === "sb" ? "text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-white/50"}`}>
                        {(m.sb.rate * 100).toFixed(1)}%
                        <span className="block text-[11px] font-normal text-zinc-400 dark:text-white/30">{m.sb.correct}/{m.sb.graded}</span>
                      </td>
                      <td className={`px-2 py-3 text-center tabular-nums font-semibold ${win === "gpt" ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-white/50"}`}>
                        {(m.gpt.rate * 100).toFixed(1)}%
                        <span className="block text-[11px] font-normal text-zinc-400 dark:text-white/30">{m.gpt.correct}/{m.gpt.graded}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {win === "sb" ? (
                          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">우리</span>
                        ) : win === "gpt" ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">GPT</span>
                        ) : (
                          <span className="text-[11px] text-zinc-400 dark:text-white/30">동률</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 누적 적중률 추이 */}
      {showTrend && (
        <section className="mb-12">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Sparkles className="h-4 w-4 text-rose-500" aria-hidden /> 누적 적중률 추이
          </h2>
          <p className="mb-4 text-[13px] text-zinc-500 dark:text-white/40">
            채점이 쌓일수록 두 AI의 누적 적중률(3시장 합)이 어떻게 갈리는지.
          </p>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">
            <ScorecardTrendChart data={trend} />
          </div>
        </section>
      )}

      {/* 예정 경기 맞대결 픽 — 1X2·핸디·OU 3시장 */}
      {upcoming.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Clock className="h-4 w-4 text-rose-500" aria-hidden /> 다가오는 맞대결 픽
          </h2>
          <div className="space-y-2">
            {upcoming.slice(0, 20).map((e) => (
              <div key={e.matchId} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-white/40">
                  <LeagueBadge league={e.league} />
                  <span>{fmtDate(e.startTime)} {fmtTime(e.startTime)}</span>
                  {e.split && (
                    <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300 dark:ring-amber-300/30">
                      의견 갈림
                    </span>
                  )}
                </div>
                <div className="mt-2 text-[15px] font-semibold text-zinc-900 dark:text-white">
                  {e.home} <span className="text-zinc-400 dark:text-white/30">vs</span> {e.away}
                </div>
                <div className="mt-3 space-y-1.5">
                  {e.markets.map((d) => (
                    <div key={d.market} className="grid grid-cols-[3.2rem_1fr_1fr] items-center gap-2">
                      <span className="rounded-md bg-zinc-100 px-1.5 py-1 text-center text-[10px] font-semibold text-zinc-500 dark:bg-white/[0.06] dark:text-white/50">
                        {MARKET_META.find((m) => m.key === d.market)?.label.replace(" 승부", "")}
                      </span>
                      <PickChip label={MODELS.scorebase.short} text={pickText(d.market, d.sb!.pick, e.home, e.away, d.sb!.line)} prob={d.sb!.prob} reason={null} accent="rose" />
                      <PickChip label={MODELS.gpt.short} text={pickText(d.market, d.gpt!.pick, e.home, e.away, d.gpt!.line)} prob={d.gpt!.prob} reason={null} accent="emerald" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 경기별 결과 피드 (시장 포함) */}
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
                  <th className="px-2 py-2.5 text-center font-medium">시장</th>
                  <th className="px-2 py-2.5 text-center font-medium text-rose-500">우리</th>
                  <th className="px-2 py-2.5 text-center font-medium text-emerald-600 dark:text-emerald-400">GPT</th>
                </tr>
              </thead>
              <tbody>
                {resolved.slice(0, 60).map((d) => (
                  <tr key={`${d.matchId}:${d.market}`} className="border-b border-zinc-50 last:border-0 dark:border-white/[0.04]">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <LeagueBadge league={d.league} />
                        <span className="font-medium text-zinc-800 dark:text-white/80">
                          {d.home} <span className="text-zinc-300 dark:text-white/20">·</span> {d.away}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400 dark:text-white/30">
                        {fmtDate(d.startTime)} · {d.homeScore ?? "-"}:{d.awayScore ?? "-"}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-white/[0.06] dark:text-white/50">
                        {MARKET_META.find((m) => m.key === d.market)?.label}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <ResultCell correct={d.sb!.correct === true} text={pickText(d.market, d.sb!.pick, d.home, d.away, d.sb!.line)} />
                    </td>
                    <td className="px-2 py-2.5">
                      <ResultCell correct={d.gpt!.correct === true} text={pickText(d.market, d.gpt!.pick, d.home, d.away, d.gpt!.line)} />
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
            두 AI 모두 <strong>경기 시작 전</strong>에 1X2(승·무·패)·핸디캡·오버언더 픽을 제출합니다. 스코어베이스 AI는
            Elo·Dixon-Coles + 선발/골리 + 시장 배당 블렌드 통계모델이고, GPT-5.5는 팀·리그·일정과
            <strong> 동일한 기준선(핸디/총점 라인)</strong>만 받아 (우리 모델 수치는 보지 않고) 독립 예측합니다.
            경기가 끝나면 같은 라인으로 채점합니다(축구는 정규시간 기준). 공정성을 위해 두 AI가 모두 예측한 동일 경기·시장만 비교합니다.
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
    </div>
  );
}

function PickChip({
  label,
  text,
  prob,
  reason,
  accent,
}: {
  label: string;
  text: string;
  prob: number;
  reason: string | null;
  accent: "rose" | "emerald";
}) {
  const dot = accent === "rose" ? "bg-rose-500" : "bg-emerald-500";
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100 dark:bg-white/[0.03] dark:ring-white/[0.06]">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 dark:text-white/40">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden /> {label}
      </div>
      <div className="mt-0.5 text-[13px] font-semibold text-zinc-800 dark:text-white/80">
        {text}
        <span className="ml-1 text-[11px] font-normal text-zinc-400 dark:text-white/30 tabular-nums">
          {(prob * 100).toFixed(0)}%
        </span>
      </div>
      {reason && (
        <div className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400 dark:text-white/30">{reason}</div>
      )}
    </div>
  );
}

function ResultCell({ correct, text }: { correct: boolean; text: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
          correct
            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
            : "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
        }`}
      >
        {correct ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
      </span>
      <span className="text-[10px] text-zinc-400 dark:text-white/30 truncate max-w-[72px]">{text}</span>
    </div>
  );
}
