// 메인 페이지 — "AI 예측 대결" 쇼케이스 (우리 모델 vs GPT-5.5).
// 다가오는 경기의 두 AI 1X2 픽을 나란히 + 채점 누적 전적 요약. /predictions/scorecard 유도.

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

type Winner = "HOME" | "DRAW" | "AWAY";

function liveHref(league: string, externalId: string): string {
  if (league === "KBO" || league === "NPB" || league === "MLB") {
    return `/live/${league.toLowerCase()}/${externalId}`;
  }
  if (league === "LOL") return `/live/lol/${externalId}`;
  return `/live/${league}/${externalId}`;
}

function fmtKst(d: Date): string {
  return d
    .toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(/\.\s/g, "/")
    .replace("/ ", " ");
}

function pickLabel(pick: Winner, home: string, away: string): string {
  if (pick === "HOME") return home;
  if (pick === "AWAY") return away;
  return "무승부";
}

export default async function HomeAiScorecardShowcase() {
  const rows = await prisma.aiPrediction.findMany({
    where: { market: "1X2" },
    select: {
      model: true,
      pick: true,
      prob: true,
      correct: true,
      match: {
        select: {
          externalId: true,
          league: true,
          startTime: true,
          status: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });
  if (rows.length === 0) return null;

  interface Cell { pick: Winner; prob: number; correct: boolean | null }
  interface Row {
    externalId: string;
    league: string;
    startTime: Date;
    status: string;
    home: string;
    away: string;
    sb?: Cell;
    gpt?: Cell;
  }
  const byMatch = new Map<string, Row>();
  for (const r of rows) {
    const m = r.match;
    let row = byMatch.get(m.externalId);
    if (!row) {
      row = {
        externalId: m.externalId,
        league: m.league,
        startTime: m.startTime,
        status: m.status,
        home: toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name,
        away: toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name,
      };
      byMatch.set(m.externalId, row);
    }
    const cell: Cell = { pick: r.pick as Winner, prob: r.prob, correct: r.correct };
    if (r.model === "scorebase") row.sb = cell;
    else if (r.model === "gpt-5.5") row.gpt = cell;
  }
  const all = [...byMatch.values()].filter((r) => r.sb && r.gpt);

  // 누적 전적 — 두 모델 모두 채점된 경기.
  const graded = all.filter((r) => r.sb!.correct !== null && r.gpt!.correct !== null);
  const sbHit = graded.filter((r) => r.sb!.correct === true).length;
  const gptHit = graded.filter((r) => r.gpt!.correct === true).length;
  const sbRate = graded.length > 0 ? (sbHit / graded.length) * 100 : 0;
  const gptRate = graded.length > 0 ? (gptHit / graded.length) * 100 : 0;

  // 카드 — 다가오는 경기 우선, 없으면 최근 채점 경기. 리그 다양하게 최대 3개.
  const now = Date.now();
  const upcoming = all
    .filter((r) => r.status === "SCHEDULED" && r.startTime.getTime() >= now)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const pool = upcoming.length > 0
    ? upcoming
    : graded.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  const seen = new Set<string>();
  const cards: Row[] = [];
  for (const r of pool) {
    if (seen.has(r.league)) continue;
    seen.add(r.league);
    cards.push(r);
    if (cards.length >= 3) break;
  }
  if (cards.length < 3) {
    for (const r of pool) {
      if (cards.includes(r)) continue;
      cards.push(r);
      if (cards.length >= 3) break;
    }
  }
  if (cards.length === 0) return null;

  const leader = graded.length === 0 ? null : sbRate > gptRate ? "sb" : gptRate > sbRate ? "gpt" : "tie";

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-8 mb-10" aria-label="AI 예측 대결">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl sm:text-2xl font-black tracking-tight">
            <Sparkles className="h-5 w-5 text-rose-500" aria-hidden /> AI 예측 대결
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            스코어베이스 AI vs GPT-5.5 — 같은 경기를 경기 전 예측하고 결과로 채점합니다.
          </p>
        </div>
        <Link
          href="/predictions/scorecard"
          className="hidden sm:inline-block text-sm font-medium text-rose-600 dark:text-rose-400 hover:underline shrink-0"
        >
          성적표 전체 →
        </Link>
      </div>

      {graded.length >= 5 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/50">
          <span className="text-neutral-500">같은 {graded.length}경기 적중률</span>
          <span className={`font-bold tabular-nums ${leader === "sb" ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-white/70"}`}>
            우리 {sbRate.toFixed(0)}%
          </span>
          <span className="text-neutral-300 dark:text-white/20">vs</span>
          <span className={`font-bold tabular-nums ${leader === "gpt" ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-700 dark:text-white/70"}`}>
            GPT-5.5 {gptRate.toFixed(0)}%
          </span>
        </div>
      )}

      <div
        className={`grid grid-cols-1 gap-3 sm:gap-4 ${
          cards.length >= 3 ? "md:grid-cols-3" : cards.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1"
        }`}
      >
        {cards.map((c) => (
          <Link
            key={c.externalId}
            href={liveHref(c.league, c.externalId)}
            className="group block rounded-xl border border-neutral-200 bg-white p-4 sm:p-5 transition hover:border-neutral-400 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/50 dark:hover:border-neutral-600"
          >
            <div className="mb-3 flex items-center justify-between text-[11px] text-neutral-500">
              <span className="font-medium">{LEAGUE_DISPLAY[c.league] ?? c.league}</span>
              <span className="tabular-nums">{fmtKst(c.startTime)}</span>
            </div>
            <div className="mb-3 text-sm font-bold tracking-tight text-neutral-900 dark:text-white">
              {c.home} <span className="text-neutral-300 dark:text-white/20">vs</span> {c.away}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PickMini label="우리 모델" cell={c.sb!} home={c.home} away={c.away} accent="rose" />
              <PickMini label="GPT-5.5" cell={c.gpt!} home={c.home} away={c.away} accent="emerald" />
            </div>
            <div className="mt-3 text-[11px] font-medium text-rose-600 group-hover:underline dark:text-rose-400">
              경기 상세 보기 →
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function PickMini({
  label,
  cell,
  home,
  away,
  accent,
}: {
  label: string;
  cell: { pick: Winner; prob: number; correct: boolean | null };
  home: string;
  away: string;
  accent: "rose" | "emerald";
}) {
  const dot = accent === "rose" ? "bg-rose-500" : "bg-emerald-500";
  const mark = cell.correct === null ? "" : cell.correct ? " ✓" : " ✗";
  const markColor = cell.correct === true ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  return (
    <div className="rounded-lg bg-neutral-50 px-2.5 py-2 dark:bg-white/[0.03]">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-neutral-400 dark:text-white/40">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden /> {label}
      </div>
      <div className="mt-0.5 text-[13px] font-bold text-neutral-900 dark:text-white">
        {pickLabel(cell.pick, home, away)}
        <span className="ml-1 text-[10px] font-normal text-neutral-400 tabular-nums dark:text-white/30">
          {(cell.prob * 100).toFixed(0)}%
        </span>
        {mark && <span className={`text-[11px] font-bold ${markColor}`}>{mark}</span>}
      </div>
    </div>
  );
}
