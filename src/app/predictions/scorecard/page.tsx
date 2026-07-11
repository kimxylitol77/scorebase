// AI 예측 성적표 — 여러 AI(스코어베이스 정량모델·GPT·Grok·Gemini·Qwen)가 같은 경기를 경기 전 예측하고
// 결과로 채점하는 N자 리더보드 + 다가오는 경기의 전 모델 픽(AI 원탁) + 시장별·경기별 누적.
import type { Metadata } from "next";
import Link from "next/link";
import { Check, X, Trophy, Sparkles, Clock, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import LeagueBadge from "@/components/LeagueBadge";
import CiteBox from "@/components/CiteBox";
import { toKoreanTeamName } from "@/lib/team-names";
import { SITE_URL } from "@/lib/site-url"; // www 강제 정규화(apex 새어나감 방지)
import { ogPageImage } from "@/lib/seo/og";
import { isGptScorecardModel } from "@/lib/predict/gpt-scorecard-model";

export const revalidate = 1800; // 30분 ISR

type Market = "1X2" | "HANDICAP" | "OU";
const MARKET_META: { key: Market; label: string }[] = [
  { key: "1X2", label: "1X2 승부" },
  { key: "HANDICAP", label: "핸디캡" },
  { key: "OU", label: "오버언더" },
];

// 모델 표시 메타 — gpt-5.5/5.6 은 "gpt" 로 통합. accent 는 panelists.ts 와 맞춤.
type Accent = "rose" | "emerald" | "sky" | "amber" | "teal" | "violet";
const MODEL_META: Record<string, { label: string; accent: Accent; order: number }> = {
  scorebase: { label: "스코어베이스", accent: "rose", order: 0 },
  gpt: { label: "GPT-5.6 Sol", accent: "emerald", order: 1 },
  grok: { label: "Grok", accent: "sky", order: 2 },
  gemini: { label: "Gemini", accent: "amber", order: 3 },
  "qwen2.5-32b": { label: "Qwen", accent: "teal", order: 4 },
  claude: { label: "Claude", accent: "violet", order: 5 },
};
function normModel(m: string): string {
  return isGptScorecardModel(m) ? "gpt" : m;
}
function metaOf(m: string) {
  return MODEL_META[m] ?? { label: m, accent: "emerald" as Accent, order: 9 };
}

// 정적 Tailwind 클래스(동적 문자열 조합 금지 — purge 회피).
const ACCENT: Record<Accent, { text: string; dot: string; bar: string; soft: string; ring: string }> = {
  rose: { text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500", bar: "bg-rose-500", soft: "bg-rose-500/10", ring: "ring-rose-400/60 dark:ring-rose-400/40" },
  emerald: { text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", bar: "bg-emerald-500", soft: "bg-emerald-500/10", ring: "ring-emerald-400/60 dark:ring-emerald-400/40" },
  sky: { text: "text-sky-600 dark:text-sky-400", dot: "bg-sky-500", bar: "bg-sky-500", soft: "bg-sky-500/10", ring: "ring-sky-400/60 dark:ring-sky-400/40" },
  amber: { text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", bar: "bg-amber-500", soft: "bg-amber-500/10", ring: "ring-amber-400/60 dark:ring-amber-400/40" },
  teal: { text: "text-teal-600 dark:text-teal-400", dot: "bg-teal-500", bar: "bg-teal-500", soft: "bg-teal-500/10", ring: "ring-teal-400/60 dark:ring-teal-400/40" },
  violet: { text: "text-violet-600 dark:text-violet-400", dot: "bg-violet-500", bar: "bg-violet-500", soft: "bg-violet-500/10", ring: "ring-violet-400/60 dark:ring-violet-400/40" },
};

export const metadata: Metadata = {
  title: "AI 예측 성적표 — 스코어베이스·GPT·Grok·Gemini·Qwen 승부예측 리더보드",
  description:
    "여러 AI가 같은 경기를 경기 전에 예측하고 결과로 채점합니다. 스코어베이스 통계모델·GPT·Grok·Gemini·Qwen의 1X2·핸디캡·오버언더 적중률을 투명하게 공개하는 멀티 AI 리더보드.",
  keywords: [
    "AI 예측 성적표", "멀티 AI 승부예측", "AI 적중률 비교", "GPT 예측", "Grok 예측",
    "Gemini 예측", "AI 스포츠 예측 리더보드", "핸디캡 예측", "오버언더 예측",
  ],
  alternates: { canonical: `${SITE_URL}/predictions/scorecard` },
  openGraph: {
    title: "AI 예측 성적표 — 멀티 AI 승부예측 리더보드",
    description: "스코어베이스·GPT·Grok·Gemini·Qwen이 같은 경기를 두고 맞붙는 승부예측 성적표.",
    url: `${SITE_URL}/predictions/scorecard`,
    images: ogPageImage({ title: "AI 예측 성적표", subtitle: "멀티 AI 승부예측 리더보드", tag: "AI 대결" }),
  },
};

interface Cell {
  pick: string;
  prob: number;
  line: number | null;
  reason: string | null;
  correct: boolean | null;
}
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
  cells: Map<string, Cell>; // model → cell
}
interface Tally {
  predicted: number;
  graded: number;
  correct: number;
  rate: number;
}

function pickText(market: Market, pick: string, home: string, away: string, line: number | null): string {
  if (market === "OU") return `${pick === "OVER" ? "오버" : "언더"}${line != null ? ` ${line}` : ""}`;
  if (market === "HANDICAP") return `${pick === "HOME" ? home : away}${line != null ? ` ${pick === "HOME" ? "-" : "+"}${Math.abs(line)}` : ""}`;
  if (pick === "HOME") return home;
  if (pick === "AWAY") return away;
  return "무승부";
}
function shortPick(pick: string, home: string, away: string): string {
  if (pick === "HOME") return home;
  if (pick === "AWAY") return away;
  if (pick === "DRAW") return "무";
  return pick;
}

export default async function ScorecardPage() {
  const rows = await prisma.aiPrediction.findMany({
    where: { market: { in: ["1X2", "HANDICAP", "OU"] } },
    orderBy: { match: { startTime: "asc" } },
    select: {
      model: true, market: true, pick: true, prob: true, line: true, reason: true, correct: true,
      match: {
        select: {
          id: true, league: true, startTime: true, status: true, homeScore: true, awayScore: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  // (matchId, market) 단위로 전 모델 픽을 한 데이터포인트로 묶음.
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
        cells: new Map(),
      };
      byKey.set(key, dp);
    }
    const nm = normModel(r.model);
    const existing = dp.cells.get(nm);
    // gpt 통합 시 채점된 쪽(과거 5.5)을 우선 보존.
    if (!existing || (existing.correct === null && r.correct !== null)) {
      dp.cells.set(nm, { pick: r.pick, prob: r.prob, line: r.line, reason: r.reason, correct: r.correct });
    }
  }

  const datapoints = [...byKey.values()];

  // 데이터에 실제 존재하는 모델(정렬은 MODEL_META order).
  const present = [...new Set(rows.map((r) => normModel(r.model)))].sort(
    (a, b) => metaOf(a).order - metaOf(b).order,
  );

  // 모델별 누적 성적(채점된 것 기준) + 예측 수.
  const tallyOf = (model: string, filter?: (d: DP) => boolean): Tally => {
    let predicted = 0, graded = 0, correct = 0;
    for (const d of datapoints) {
      if (filter && !filter(d)) continue;
      const c = d.cells.get(model);
      if (!c) continue;
      predicted++;
      if (c.correct !== null) {
        graded++;
        if (c.correct) correct++;
      }
    }
    return { predicted, graded, correct, rate: graded > 0 ? correct / graded : 0 };
  };

  const board = present
    .map((m) => ({ model: m, ...metaOf(m), tally: tallyOf(m) }))
    // 실적 있는 모델 먼저(적중률 desc), 채점 대기 모델은 뒤로(예측 수 desc).
    .sort((a, b) => {
      const ag = a.tally.graded > 0, bg = b.tally.graded > 0;
      if (ag !== bg) return ag ? -1 : 1;
      if (ag) return b.tally.rate - a.tally.rate;
      return b.tally.predicted - a.tally.predicted;
    });
  // 소표본 왜곡 방지 — 채점 30건 미만 모델은 순위에 안 올리고 "표본 누적 중" 구간에 성적만 표시.
  // (예: 첫날 12건 중 8건 맞춘 모델이 900건짜리 기록 위에 1위로 뜨는 왜곡 차단)
  const RANK_MIN = 30;
  const gradedModels = board.filter((b) => b.tally.graded >= RANK_MIN);
  const provisionalModels = board.filter((b) => b.tally.graded > 0 && b.tally.graded < RANK_MIN);
  const pendingModels = board.filter((b) => b.tally.graded === 0);
  const maxRate = Math.max(0.0001, ...gradedModels.map((b) => b.tally.rate));

  // 시장별 성적(채점된 모델만).
  const perMarket = MARKET_META.map((mm) => ({
    ...mm,
    models: present
      .map((m) => ({ model: m, ...metaOf(m), tally: tallyOf(m, (d) => d.market === mm.key) }))
      .filter((x) => x.tally.graded > 0)
      .sort((a, b) => b.tally.rate - a.tally.rate),
  })).filter((mm) => mm.models.length > 0);

  // 다가오는 맞대결(AI 원탁) — 예정 경기의 1X2 를 전 모델 나란히 + 컨센서스.
  interface UpMatch {
    matchId: number;
    league: string;
    startTime: Date;
    home: string;
    away: string;
    picks: { model: string; pick: string; prob: number }[];
  }
  const upMap = new Map<number, UpMatch>();
  for (const d of datapoints) {
    if (d.market !== "1X2" || d.status !== "SCHEDULED") continue;
    const picks = present
      .map((m) => {
        const c = d.cells.get(m);
        return c ? { model: m, pick: c.pick, prob: c.prob } : null;
      })
      .filter((x): x is { model: string; pick: string; prob: number } => x !== null);
    if (picks.length === 0) continue;
    upMap.set(d.matchId, { matchId: d.matchId, league: d.league, startTime: d.startTime, home: d.home, away: d.away, picks });
  }
  const upcoming = [...upMap.values()].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // 컨센서스(다수결) 계산.
  const consensusOf = (picks: { pick: string }[]) => {
    const cnt = new Map<string, number>();
    for (const p of picks) cnt.set(p.pick, (cnt.get(p.pick) ?? 0) + 1);
    let best = "", n = 0;
    for (const [k, v] of cnt) if (v > n) { best = k; n = v; }
    return { pick: best, agree: n, total: picks.length };
  };

  // 경기별 성적 피드 — 채점된 데이터포인트, 최근순.
  const resolved = datapoints
    .filter((d) => [...d.cells.values()].some((c) => c.correct !== null))
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  // AI 원탁 만장일치 성적 — 5개+ 모델이 전원 같은 1X2 픽을 낸 경기의 채점 결과.
  // 첫 채점이 쌓이는 순간부터 페이지 최상단에 자동 등장한다.
  const unanBase = datapoints.filter((d) => {
    if (d.market !== "1X2" || d.cells.size < 5) return false;
    return new Set([...d.cells.values()].map((c) => c.pick)).size === 1;
  });
  const unanGraded = unanBase.filter((d) => [...d.cells.values()].every((c) => c.correct !== null));
  const unanWins = unanGraded.filter((d) => [...d.cells.values()][0].correct === true).length;
  const unanPending = unanBase.length - unanGraded.length;
  const unanRate = unanGraded.length > 0 ? unanWins / unanGraded.length : 0;

  const fmtDate = (d: Date) => d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
  const fmtTime = (d: Date) => d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

  const leader = gradedModels[0];
  const citeDate = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
  const citeUrl = `${SITE_URL}/predictions/scorecard`;
  const citation =
    leader
      ? `AI 예측 성적표 — ${gradedModels.map((m) => `${m.label} ${(m.tally.rate * 100).toFixed(1)}%`).join(", ")} (채점 ${leader.tally.graded}경기 기준, ${present.length}개 AI 리더보드 · 출처 Scorebase ${citeUrl}, ${citeDate})`
      : `AI 예측 성적표 — 멀티 AI 승부예측 리더보드 (출처 Scorebase ${citeUrl})`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "AI 예측 성적표 — 멀티 AI 승부예측 리더보드",
    description: "여러 AI가 같은 경기를 경기 전에 예측하고 결과로 채점한 1X2·핸디캡·오버언더 적중률 비교 데이터셋.",
    url: citeUrl,
    keywords: ["AI 예측 성적표", "멀티 AI 승부예측", "AI 적중률 비교", "Grok 예측", "Gemini 예측"],
    creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
    isAccessibleForFree: true,
  };

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <Users className="h-3 w-3" aria-hidden /> 멀티 AI 리더보드
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
          AI 예측 성적표
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
          스코어베이스 통계모델과 <strong className="text-zinc-800 dark:text-white/80">GPT·Grok·Gemini·Qwen</strong> 등
          여러 AI가 <strong className="text-zinc-800 dark:text-white/80">정확히 같은 경기</strong>를 경기 전에 예측합니다.
          1X2·핸디캡·오버언더 세 시장을 두고 맞붙어, 결과가 나오면 <strong className="text-zinc-800 dark:text-white/80">전패까지 그대로</strong> 채점해 쌓습니다.
        </p>
      </header>

      {/* AI 원탁 만장일치 성적 — 첫 채점부터 자동 등장 */}
      {unanGraded.length > 0 && (
        <section className="mb-12">
          <div className="rounded-3xl bg-gradient-to-br from-rose-500/[0.07] to-amber-500/[0.07] p-6 ring-1 ring-rose-500/20 dark:from-rose-500/10 dark:to-amber-500/10">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 dark:text-rose-400">
              <Users className="h-3.5 w-3.5" aria-hidden /> AI 원탁 만장일치
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <span className="text-4xl sm:text-5xl font-bold tabular-nums text-zinc-900 dark:text-white">
                  {(unanRate * 100).toFixed(1)}%
                </span>
                <span className="ml-2 text-[14px] text-zinc-500 dark:text-white/50 tabular-nums">
                  {unanWins}승 {unanGraded.length - unanWins}패
                </span>
              </div>
              {unanPending > 0 && (
                <span className="rounded-full bg-white/60 px-3 py-1 text-[12px] font-medium text-zinc-600 ring-1 ring-zinc-200/70 dark:bg-white/[0.06] dark:text-white/60 dark:ring-white/10 tabular-nums">
                  채점 대기 {unanPending}경기
                </span>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-zinc-600 dark:text-white/50">
              통계모델과 AI {present.length}개가 <strong className="text-zinc-800 dark:text-white/75">전원 같은 팀</strong>을 찍은
              경기의 실제 적중률입니다. 서로 다른 모델이 모두 동의할수록 강한 신호인지, 숫자로 검증합니다.
            </p>
          </div>
        </section>
      )}

      {/* 리더보드 */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
          <Trophy className="h-4 w-4 text-rose-500" aria-hidden /> 누적 적중률 리더보드
        </h2>
        <div className="space-y-2">
          {gradedModels.map((b, i) => {
            const a = ACCENT[b.accent];
            return (
              <div
                key={b.model}
                className={`relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 dark:bg-white/[0.04] ${i === 0 ? a.ring + " ring-2" : "ring-zinc-200/70 dark:ring-white/10"}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 shrink-0 text-center text-sm font-bold ${i === 0 ? a.text : "text-zinc-400 dark:text-white/30"}`}>
                    {i + 1}
                  </span>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.dot}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-semibold text-zinc-900 dark:text-white">
                        {b.label}
                        {i === 0 && <span className="ml-1.5 align-middle text-[10px] font-bold text-amber-500">1위</span>}
                      </span>
                      <span className={`shrink-0 text-xl font-bold tabular-nums ${a.text}`}>
                        {(b.tally.rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                      <div className={`h-full rounded-full ${a.bar}`} style={{ width: `${(b.tally.rate / maxRate) * 100}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] tabular-nums text-zinc-400 dark:text-white/30">
                      {b.tally.correct} / {b.tally.graded} 적중
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {(provisionalModels.length > 0 || pendingModels.length > 0) && (
          <div className="mt-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200/70 dark:bg-white/[0.02] dark:ring-white/10">
            <div className="mb-2 text-[12px] font-medium text-zinc-500 dark:text-white/40">
              표본 누적 중 — 채점 {RANK_MIN}건부터 순위에 반영됩니다
            </div>
            <div className="flex flex-wrap gap-2">
              {provisionalModels.map((b) => {
                const a = ACCENT[b.accent];
                return (
                  <span key={b.model} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${a.soft} ${a.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                    {b.label}
                    <span className="tabular-nums">{(b.tally.rate * 100).toFixed(1)}%</span>
                    <span className="tabular-nums opacity-70">{b.tally.correct}/{b.tally.graded}</span>
                  </span>
                );
              })}
              {pendingModels.map((b) => {
                const a = ACCENT[b.accent];
                return (
                  <span key={b.model} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${a.soft} ${a.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                    {b.label}
                    <span className="tabular-nums opacity-70">예측 {b.tally.predicted} · 채점 대기</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {leader && (
          <p className="mt-3 text-center text-[13px] text-zinc-500 dark:text-white/40">
            채점 {leader.tally.graded}경기 기준 · 같은 경기·같은 라인으로 공정 비교
            {leader.tally.graded < 50 && <span className="text-amber-600 dark:text-amber-400"> · 표본 누적 중</span>}
          </p>
        )}
      </section>

      {/* 다가오는 맞대결 — AI 원탁 */}
      {upcoming.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Clock className="h-4 w-4 text-rose-500" aria-hidden /> 다가오는 맞대결 — AI 원탁
          </h2>
          <p className="mb-4 text-[13px] text-zinc-500 dark:text-white/40">
            예정 경기를 두고 각 AI가 낸 1X2 픽. 다수결이 갈릴수록 어려운 경기입니다.
          </p>
          <div className="space-y-2">
            {upcoming.slice(0, 20).map((e) => {
              const con = consensusOf(e.picks);
              const split = con.agree < con.total;
              return (
                <div key={e.matchId} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-white/40">
                    <LeagueBadge league={e.league} />
                    <span>{fmtDate(e.startTime)} {fmtTime(e.startTime)}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${split ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
                      {split ? `의견 갈림 ${con.agree}/${con.total}` : `만장일치 ${con.total}`}
                    </span>
                  </div>
                  <div className="mt-2 text-[15px] font-semibold text-zinc-900 dark:text-white">
                    {e.home} <span className="text-zinc-400 dark:text-white/30">vs</span> {e.away}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {e.picks.map((p) => {
                      const a = ACCENT[metaOf(p.model).accent];
                      return (
                        <span key={p.model} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-[12px] ring-1 ring-zinc-100 dark:bg-white/[0.03] dark:ring-white/[0.06]">
                          <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                          <span className="text-zinc-400 dark:text-white/40">{metaOf(p.model).label}</span>
                          <span className="font-semibold text-zinc-800 dark:text-white/80">{shortPick(p.pick, e.home, e.away)}</span>
                          <span className="tabular-nums text-zinc-400 dark:text-white/30">{(p.prob * 100).toFixed(0)}%</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 시장별 성적 */}
      {perMarket.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Sparkles className="h-4 w-4 text-rose-500" aria-hidden /> 시장별 성적
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {perMarket.map((mm) => (
              <div key={mm.key} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
                <div className="mb-2 text-[13px] font-bold text-zinc-800 dark:text-white/80">{mm.label}</div>
                <div className="space-y-1.5">
                  {mm.models.map((x) => {
                    const a = ACCENT[x.accent];
                    return (
                      <div key={x.model} className="flex items-center justify-between text-[12px]">
                        <span className="flex items-center gap-1.5 text-zinc-500 dark:text-white/50">
                          <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden /> {x.label}
                        </span>
                        <span className={`font-semibold tabular-nums ${a.text}`}>
                          {(x.tally.rate * 100).toFixed(1)}%
                          <span className="ml-1 font-normal text-zinc-400 dark:text-white/30">({x.tally.correct}/{x.tally.graded})</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 경기별 성적 피드 */}
      {resolved.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
            <Trophy className="h-4 w-4 text-rose-500" aria-hidden /> 경기별 성적
          </h2>
          <div className="space-y-2">
            {resolved.slice(0, 40).map((d) => (
              <div key={`${d.matchId}:${d.market}`} className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-white/40">
                  <LeagueBadge league={d.league} />
                  <span className="font-medium text-zinc-700 dark:text-white/70">{d.home} · {d.away}</span>
                  <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-white/[0.06] dark:text-white/50">
                    {MARKET_META.find((m) => m.key === d.market)?.label}
                  </span>
                  <span className="tabular-nums text-zinc-400 dark:text-white/30">{d.homeScore ?? "-"}:{d.awayScore ?? "-"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {present.map((m) => {
                    const c = d.cells.get(m);
                    if (!c || c.correct === null) return null;
                    const a = ACCENT[metaOf(m).accent];
                    return (
                      <span key={m} className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 px-2 py-1 text-[11px] ring-1 ring-zinc-100 dark:bg-white/[0.03] dark:ring-white/[0.06]">
                        <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                        <span className="text-zinc-400 dark:text-white/40">{metaOf(m).label}</span>
                        <span className="font-medium text-zinc-700 dark:text-white/70">{pickText(d.market, c.pick, d.home, d.away, c.line)}</span>
                        {c.correct ? (
                          <Check className="h-3 w-3 text-emerald-500" aria-hidden />
                        ) : (
                          <X className="h-3 w-3 text-rose-500" aria-hidden />
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 방법론 + 인용 */}
      <section className="space-y-4">
        <div className="rounded-2xl bg-zinc-50 p-5 text-[13px] leading-relaxed text-zinc-600 ring-1 ring-zinc-200/70 dark:bg-white/[0.03] dark:text-white/50 dark:ring-white/10">
          <p className="font-semibold text-zinc-700 dark:text-white/70">계산 방법</p>
          <p className="mt-1.5">
            모든 AI가 <strong>경기 시작 전</strong>에 1X2·핸디캡·오버언더 픽을 제출합니다. 스코어베이스 AI는
            Elo·Dixon-Coles + 선발/골리 + 시장 배당 블렌드 통계모델이고, 나머지 AI(GPT·Grok·Gemini·Qwen)는
            같은 경기 데이터(순위·최근 폼·홈/원정·휴식일·상대전적)와 <strong>동일한 기준선</strong>을 받아
            (우리 모델 수치는 보지 않고) 독립 예측합니다. 경기가 끝나면 같은 라인으로 채점합니다(축구는 정규시간 기준).
            공정성을 위해 같은 경기·같은 시장만 비교하며, 각 모델의 예측 시점 이후 종료된 경기부터 성적에 반영됩니다.
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
