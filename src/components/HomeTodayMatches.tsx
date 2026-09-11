"use client";
// 홈 「오늘 주요 경기 6」 — 서버가 고른 후보(ISR 1h)를 첫 렌더에 그대로 그리고(서버 now·관심팀 없음 → HTML 과 일치),
// 마운트 후 관심팀(localStorage)·현재 시각으로 같은 순위 함수를 다시 돌린다. 상태·점수는 /api/matches/by-ids 로 갱신
// (LIVE 가 있으면 60s 주기) — 홈 ISR 이 1h 라 LIVE 배지·점수가 낡은 채 보이지 않게.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import TeamLogoImg from "./TeamLogoImg";
import { useFavoriteTeams } from "./scores/useFavoriteTeams";
import { rankTodayMatches, type HomeMatch } from "@/lib/home/today-matches-rank";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { kstHHmm } from "@/lib/threads/kst";

type Fresh = Pick<HomeMatch, "status" | "homeScore" | "awayScore">;

export default function HomeTodayMatches({
  candidates,
  serverNowMs,
  todayEndMs,
}: {
  candidates: HomeMatch[];
  serverNowMs: number;
  todayEndMs: number;
}) {
  const { teams, mounted } = useFavoriteTeams();
  // 갱신 응답과 함께 받은 클라이언트 시각 — 렌더 중 Date.now() 를 부르지 않기 위해(react-hooks/purity) 콜백에서 저장
  const [fresh, setFresh] = useState<{ nowMs: number; byId: Record<number, Fresh> } | null>(null);

  const merged = useMemo(
    () => candidates.map((m) => (fresh?.byId[m.id] ? { ...m, ...fresh.byId[m.id] } : m)),
    [candidates, fresh],
  );
  // 첫 렌더(mounted=false)는 서버와 같은 입력 → hydration 불일치 없음.
  const favIds = useMemo(() => (mounted ? teams.map((t) => t.id) : []), [mounted, teams]);
  const cards = useMemo(
    () => rankTodayMatches(merged, fresh?.nowMs ?? serverNowMs, favIds),
    [merged, fresh, serverNowMs, favIds],
  );
  const favSet = useMemo(() => new Set(favIds), [favIds]);
  const hasLive = cards.some((m) => m.status === "LIVE");

  useEffect(() => {
    if (!mounted || candidates.length === 0) return;
    const ids = candidates.map((m) => m.id).join(",");
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/matches/by-ids?ids=${ids}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { matches: Array<{ id: number; status: string; homeScore: number | null; awayScore: number | null }> };
        if (stop) return;
        const byId: Record<number, Fresh> = {};
        for (const m of j.matches) byId[m.id] = { status: m.status, homeScore: m.homeScore, awayScore: m.awayScore };
        setFresh({ nowMs: Date.now(), byId });
      } catch {
        // 갱신 실패는 ISR 스냅샷 그대로 — 표시를 깨지 않는다
      }
    };
    void load();
    if (!hasLive) return () => { stop = true; };
    const t = setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [mounted, candidates, hasLive]);

  if (cards.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-5 sm:mt-6" aria-labelledby="today-matches-title">
      <div className="flex items-center justify-between mb-2.5">
        <h2 id="today-matches-title" className="text-base sm:text-lg font-bold tracking-tight">
          오늘 주요 경기
        </h2>
        <Link href="/scores" className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
          전체 경기 →
        </Link>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        {cards.map((m) => (
          <li key={m.id}>
            <MatchCard m={m} fav={favSet.has(m.homeTeamId) || favSet.has(m.awayTeamId)} todayEndMs={todayEndMs} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function MatchCard({ m, fav, todayEndMs }: { m: HomeMatch; fav: boolean; todayEndMs: number }) {
  const live = m.status === "LIVE";
  const done = m.status === "FINISHED";
  const showScore = (live || done) && m.homeScore != null && m.awayScore != null;
  return (
    <Link
      href={m.href}
      prefetch={false}
      className="block rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 px-3.5 py-3 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-md transition"
    >
      <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-2">
        <span className="flex items-center gap-1 truncate">
          {fav && <Star className="h-3 w-3 text-amber-500" fill="currentColor" aria-label="내 팀" />}
          {LEAGUE_DISPLAY[m.league] ?? m.league}
        </span>
        {live ? (
          <span className="flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            LIVE
          </span>
        ) : done ? (
          <span>종료</span>
        ) : (
          <span className="tabular-nums">
            {m.startMs >= todayEndMs ? "내일 " : ""}
            {kstHHmm(new Date(m.startMs))}
          </span>
        )}
      </div>
      <TeamLine name={m.homeName} logo={m.homeLogo} score={showScore ? m.homeScore : null} />
      <TeamLine name={m.awayName} logo={m.awayLogo} score={showScore ? m.awayScore : null} />
      <OddsLine m={m} />
    </Link>
  );
}

function TeamLine({ name, logo, score }: { name: string; logo: string | null; score: number | null }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <TeamLogoImg
        url={logo}
        name={name}
        size={20}
        className="h-5 w-5 object-contain shrink-0"
        fallbackClassName="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-bold text-neutral-500 shrink-0"
      />
      <span className="flex-1 min-w-0 truncate text-sm font-semibold">{name}</span>
      {score != null && <span className="text-sm font-black tabular-nums">{score}</span>}
    </div>
  );
}

/** 배당(원배당, 승/무/패) 우선, 없으면 모델 확률, 둘 다 없으면 준비 중 — 카드마다 하나는 반드시 말한다. */
function OddsLine({ m }: { m: HomeMatch }) {
  const cell = (label: string, value: string) => (
    <span className="flex items-baseline justify-center gap-1 rounded-md bg-neutral-50 dark:bg-white/[0.04] py-1">
      <span className="text-neutral-400">{label}</span>
      <span className="font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">{value}</span>
    </span>
  );
  if (m.odds) {
    const o = m.odds;
    return (
      <div className={`mt-2 grid ${o.draw != null ? "grid-cols-3" : "grid-cols-2"} gap-1 text-[11px]`} aria-label="배당">
        {cell("승", o.home.toFixed(2))}
        {o.draw != null && cell("무", o.draw.toFixed(2))}
        {cell("패", o.away.toFixed(2))}
      </div>
    );
  }
  if (m.prob) {
    const p = m.prob;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    return (
      <div className={`mt-2 grid ${p.draw != null ? "grid-cols-3" : "grid-cols-2"} gap-1 text-[11px]`} aria-label="모델 확률">
        {cell("승", pct(p.home))}
        {p.draw != null && cell("무", pct(p.draw))}
        {cell("패", pct(p.away))}
      </div>
    );
  }
  return <div className="mt-2 text-[11px] text-neutral-400">배당 준비 중</div>;
}
