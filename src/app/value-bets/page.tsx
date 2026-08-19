// /value-bets — Elo 예측 vs 배당사 implied 비교 → value > +5% 매치 list.
// SSR — 1분 revalidate. 데이터 source: Match.predHome/predDraw/predAway + 최근 OddsSnapshot.

import type { Metadata } from "next";
import Link from "next/link";
import { Gem } from "lucide-react";
import { prisma } from "@/lib/db";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import { SITE_URL } from "@/lib/site-url";
import AmbientGlow from "@/components/AmbientGlow";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { matchLiveHref } from "@/lib/links/match-live-link";

export const revalidate = 60; // ISR — force-dynamic 제거(2026-07-02, searchParams 없음)

export const metadata: Metadata = {
  title: "밸류 베트 — AI Elo 예측 vs 배당사 implied 확률 비교",
  description:
    "스코어베이스 Elo 모델의 예측 확률이 배당사 implied 확률보다 +5%p 이상 높은 매치(밸류 베트)를 자동 발굴합니다. Elo vs 시장 비교 + 시즌별 적중률 추적으로 모델의 우위를 검증.",
  keywords: [
    "밸류 베트", "value bet", "Elo 예측", "배당사 비교", "implied 확률",
    "스포츠 예측 모델", "승률 예측", "기대값",
  ],
  alternates: { canonical: `${SITE_URL}/value-bets` },
};

// 구조화 데이터 (Dataset) — Elo vs 시장 비교를 고유 데이터셋으로 인식.
const VALUE_BETS_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "스코어베이스 밸류 베트 — Elo vs 배당사",
  description:
    "Elo 모델 예측 확률과 배당사 implied 확률을 비교해 +5%p 이상 격차(밸류 베트)를 자동 발굴한 데이터.",
  url: `${SITE_URL}/value-bets`,
  keywords: ["밸류 베트", "value bet", "Elo 예측", "implied 확률"],
  creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
  isAccessibleForFree: true,
  measurementTechnique: "Elo 레이팅 예측 확률 vs 배당사 implied 확률 비교",
};

const MIN_VALUE_PCT = 5; // value ≥ +5% 매치만 list
const HORIZON_DAYS = 3;

interface ValueBet {
  matchId: number;
  league: string;
  externalId: string;
  startTime: Date;
  homeName: string;
  awayName: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  bestSide: "HOME" | "DRAW" | "AWAY";
  valuePct: number;
  eloPct: number;
  impliedPct: number;
  odds: number;
}

async function fetchValueBets(): Promise<ValueBet[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 3600 * 1000);
  // 1) Elo 예측 있는 SCHEDULED 매치만 — LIVE 는 배당이 인플레이 값으로 갱신되는데
  // 모델 확률은 경기 전 값이라 비교가 성립하지 않음 (지는 팀 @11.94 가 "+44% 밸류" 1위로 뜨던 버그).
  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: new Date(now.getTime() - 3 * 3600 * 1000), lte: horizon },
      predHome: { not: null },
      predAway: { not: null },
    },
    include: { homeTeam: true, awayTeam: true },
    take: 500,
  });
  if (matches.length === 0) return [];

  // 2) 각 매치의 최근 OddsSnapshot 1개 (raw query — distinct on)
  const matchIds = matches.map((m) => m.id);
  const snapshots: Array<{
    matchId: number;
    homeOdds: number;
    drawOdds: number | null;
    awayOdds: number;
  }> = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT ON ("matchId") "matchId", "homeOdds", "drawOdds", "awayOdds"
    FROM "OddsSnapshot"
    WHERE "matchId" = ANY($1::int[])
    ORDER BY "matchId", "fetchedAt" DESC
  `, matchIds);
  const snapByMatch = new Map(snapshots.map((s) => [s.matchId, s]));

  // 3) value 계산
  const bets: ValueBet[] = [];
  for (const m of matches) {
    const snap = snapByMatch.get(m.id);
    if (!snap) continue;
    const iH = 1 / snap.homeOdds;
    const iA = 1 / snap.awayOdds;
    const iD = snap.drawOdds != null ? 1 / snap.drawOdds : 0;
    const totalI = iH + iA + iD;
    if (totalI <= 0) continue;
    const implH = iH / totalI;
    const implD = iD > 0 ? iD / totalI : null;
    const implA = iA / totalI;

    const valH = (m.predHome! - implH) * 100;
    const valA = (m.predAway! - implA) * 100;
    const valD =
      m.predDraw != null && implD != null ? (m.predDraw - implD) * 100 : -Infinity;

    let bestSide: "HOME" | "DRAW" | "AWAY" = "HOME";
    let bestValue = valH;
    let bestElo = m.predHome!;
    let bestImpl = implH;
    let bestOdds = snap.homeOdds;
    if (valD > bestValue) {
      bestSide = "DRAW";
      bestValue = valD;
      bestElo = m.predDraw!;
      bestImpl = implD!;
      bestOdds = snap.drawOdds!;
    }
    if (valA > bestValue) {
      bestSide = "AWAY";
      bestValue = valA;
      bestElo = m.predAway!;
      bestImpl = implA;
      bestOdds = snap.awayOdds;
    }
    if (bestValue < MIN_VALUE_PCT) continue;
    bets.push({
      matchId: m.id,
      league: m.league,
      externalId: m.externalId,
      startTime: m.startTime,
      homeName: toKoreanTeamName(m.homeTeam.name, m.league),
      awayName: toKoreanTeamName(m.awayTeam.name, m.league),
      status: m.status,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      bestSide,
      valuePct: bestValue,
      eloPct: bestElo,
      impliedPct: bestImpl,
      odds: bestOdds,
    });
  }
  return bets.sort((a, b) => b.valuePct - a.valuePct);
}

function fmtKstTime(d: Date): string {
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function sideLabel(side: "HOME" | "DRAW" | "AWAY", home: string, away: string): string {
  if (side === "HOME") return home;
  if (side === "AWAY") return away;
  return "무";
}

export default async function ValueBetsPage() {
  const bets = await fetchValueBets();

  return (
    <main className="relative mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <AmbientGlow />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(VALUE_BETS_JSONLD) }}
      />
      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 밸류 베트
        </span>
        <h1 className="flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          <Gem className="h-7 w-7 shrink-0 text-rose-500 sm:h-8 sm:w-8" aria-hidden /> 밸류 베트
        </h1>
        <p className="text-sm text-neutral-500 break-keep dark:text-neutral-400">
          Scorebase Elo 모델 예측 확률이 배당사 implied 보다 <strong>+{MIN_VALUE_PCT}% 이상</strong> 높은 매치만 표시.
          <br className="hidden sm:block" />
          value % 큰 순 정렬. 향후 {HORIZON_DAYS}일 안 시작 전(SCHEDULED) 매치만 대상.
        </p>
        <div className="text-[11px] text-neutral-400 break-keep">
          ⓘ 베팅 권유 X — 모델 cross-check 용. 종료된 매치는 적중률 보드 별도 페이지에서.
        </div>
      </header>

      {bets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 p-10 text-center dark:border-white/10 dark:bg-white/[0.02]">
          <div className="text-sm text-neutral-500 break-keep">
            현재 value ≥ +{MIN_VALUE_PCT}% 매치 없음.
          </div>
          <div className="mt-2 text-[11px] text-neutral-400 break-keep">
            배당사 implied 가 우리 Elo 와 비슷한 상태 — 시장이 효율적. 새 매치 들어오면 자동 표시.
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <div className="hidden md:grid grid-cols-[100px_90px_minmax(0,1fr)_70px_120px_80px] gap-3 px-4 py-2 text-[10px] font-bold tracking-wider uppercase text-neutral-500 border-b border-black/5 dark:border-white/5">
            <div>리그</div>
            <div>시간</div>
            <div>매치</div>
            <div className="text-center">픽</div>
            <div className="text-center">Elo vs 배당사</div>
            <div className="text-right">Value</div>
          </div>
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {bets.map((b) => (
              <li key={b.matchId}>
                <Link
                  href={matchLiveHref(b.league, b.externalId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  className="block px-4 py-3 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                >
                  <div className="md:hidden space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-neutral-500">
                      <span>{LEAGUE_DISPLAY[b.league] ?? b.league}</span>
                      <span>{fmtKstTime(b.startTime)}</span>
                    </div>
                    <div className="text-sm font-medium truncate">
                      {b.homeName} <span className="text-neutral-400">vs</span> {b.awayName}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-rose-600 dark:text-rose-400 font-bold">
                        {sideLabel(b.bestSide, b.homeName, b.awayName)} @ {b.odds.toFixed(2)}
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-black tabular-nums">
                        +{b.valuePct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="hidden md:grid grid-cols-[100px_90px_minmax(0,1fr)_70px_120px_80px] gap-3 items-center text-sm">
                    <div className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate">
                      {LEAGUE_DISPLAY[b.league] ?? b.league}
                    </div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">
                      {fmtKstTime(b.startTime)}
                    </div>
                    <div className="truncate">
                      <span className="font-medium">{b.homeName}</span>
                      <span className="text-neutral-400 mx-1.5">vs</span>
                      <span className="font-medium">{b.awayName}</span>
                      {b.status === "LIVE" && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                          LIVE {b.homeScore ?? "-"}:{b.awayScore ?? "-"}
                        </span>
                      )}
                    </div>
                    <div className="text-center">
                      <div className="text-rose-600 dark:text-rose-400 font-bold text-[13px]">
                        {sideLabel(b.bestSide, b.homeName, b.awayName)}
                      </div>
                      <div className="text-[10px] text-neutral-500 tabular-nums">
                        @ {b.odds.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-center text-[11px] tabular-nums text-neutral-600 dark:text-neutral-400">
                      <span className="font-bold">{(b.eloPct * 100).toFixed(0)}%</span>
                      <span className="text-neutral-400 mx-1">vs</span>
                      <span>{(b.impliedPct * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-right text-emerald-600 dark:text-emerald-400 font-black tabular-nums text-base">
                      +{b.valuePct.toFixed(1)}%
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SEO 본문 — 밸류 베트 개념 + 가치 페이지 내부링크 (thin 탈출) */}
      <section className="border-t border-black/5 dark:border-white/10 pt-8 space-y-3">
        <h2 className="text-base sm:text-lg font-bold tracking-tight">밸류 베트란?</h2>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          밸류 베트(value bet)는 우리 Elo 모델이 추정한 승리 확률이 배당사의 implied 확률보다
          의미 있게(여기선 +5%p 이상) 높은 매치를 말합니다. 시장이 특정 팀을 과소평가했을 때
          모델이 그 격차를 포착합니다. 베팅 권유가 아니라{" "}
          <strong>모델과 시장의 시각 차이를 보여주는 데이터</strong>입니다.
        </p>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          모델의 실제 성적은{" "}
          <Link
            href="/predictions/accuracy"
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            적중률 보드
          </Link>
          에서, 시즌 우승 확률은{" "}
          <Link
            href="/predictions"
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            시즌 예측
          </Link>
          에서 확인할 수 있습니다.
        </p>
      </section>
    </main>
  );
}
