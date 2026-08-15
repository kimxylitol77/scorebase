// 시즌 리그 리더보드 — 탭(카테고리) + Top N 표.
// Phase 1: 축구 (GOAL · ASSIST · YELLOW · RED). Phase 2 에서 다른 종목 카테고리 추가.

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { leaderPlayerHref } from "@/lib/links/leaderboard-link";
import { CATEGORIES_BY_LEAGUE, LEAGUE_TO_SPORT } from "@/components/leaderboard-categories";

export interface LeaderRow {
  rank: number;
  playerName: string;
  playerNameEn: string | null;
  teamName: string;
  teamShort: string | null;
  value: number;
  unit: string | null;
  appearances: number | null;
  photoUrl: string | null;
  /** 팀 로고 URL (클럽 리그, attachLeaderTeamLogos 가 채움) — PC 중앙 컬럼용. */
  teamLogo?: string | null;
  /** 국기 이모지 (국가대항, attachLeaderTeamLogos 가 채움). */
  teamFlag?: string | null;
  externalId: string | null;
}

interface Props {
  league: string;
  season: string;
  rowsByCategory: Record<string, LeaderRow[]>;
  /** footer 문구 override — 기본 "{season} 시즌 · 매일 자동 갱신" */
  footer?: string;
}

export default function LeagueLeaderBoard({ league, season, rowsByCategory, footer }: Props) {
  const sport = LEAGUE_TO_SPORT[league] ?? "SOCCER";
  const allCats = CATEGORIES_BY_LEAGUE[sport] ?? [];
  // 데이터 있는 카테고리만 노출
  const cats = allCats.filter(
    (c) => (rowsByCategory[c.key]?.length ?? 0) > 0,
  );
  const [active, setActive] = useState<string>(cats[0]?.key ?? "");

  if (cats.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-8 text-center text-sm text-neutral-500">
        리더보드 데이터가 아직 준비되지 않았습니다. 매일 자동으로 갱신됩니다.
      </section>
    );
  }

  const rows = rowsByCategory[active] ?? [];
  const activeCat = cats.find((c) => c.key === active) ?? cats[0];
  const decimals = activeCat.decimals ?? 0;

  return (
    <section className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-hidden dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      {/* 탭 */}
      <div className="flex overflow-x-auto bg-neutral-50 dark:bg-white/[0.03] border-b border-neutral-200 dark:border-white/10 [&::-webkit-scrollbar]:hidden">
        {cats.map((c) => (
          <button
            key={c.key}
            onClick={() => setActive(c.key)}
            className={`shrink-0 px-4 py-3 text-sm font-semibold transition border-b-2 ${
              active === c.key
                ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 표 */}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((r) => {
          const href = leaderPlayerHref(league, r.externalId, SOCCER_LEAGUES.has(league));
          // 1·2·3위 시상대 배경 강조 (금·은·동)
          const rankBg =
            r.rank === 1
              ? "bg-amber-50 dark:bg-amber-400/10"
              : r.rank === 2
                ? "bg-slate-100 dark:bg-slate-300/10"
                : r.rank === 3
                  ? "bg-orange-50 dark:bg-orange-400/10"
                  : "";
          const Wrap = href
            ? ({ children }: { children: React.ReactNode }) => (
                <Link
                  href={href}
                  prefetch={false}
                  className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 ${rankBg} hover:bg-neutral-50 dark:hover:bg-white/[0.04] transition`}
                >
                  {children}
                </Link>
              )
            : ({ children }: { children: React.ReactNode }) => (
                <div className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 ${rankBg}`}>
                  {children}
                </div>
              );
          return (
            <Wrap key={r.rank}>
              <span className="w-6 text-center text-xs font-bold tabular-nums text-neutral-400 shrink-0">
                {r.rank}
              </span>
              {r.photoUrl ? (
                <Image
                  src={r.photoUrl}
                  alt={r.playerName}
                  width={36}
                  height={36}
                  className="rounded-full object-cover shrink-0 bg-neutral-100 dark:bg-neutral-800"
                  unoptimized
                />
              ) : (
                <span className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 flex items-center justify-center text-[10px] text-neutral-400">
                  {r.playerName.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-semibold truncate ${href ? "group-hover:text-blue-600" : ""}`}
                >
                  {r.playerName}
                </div>
                {/* 모바일: 팀·경기수는 이름 아래 서브라인 (현행 유지) */}
                <div className="sm:hidden text-[11px] text-neutral-500 truncate">
                  {r.teamName}
                  {r.appearances != null && r.appearances > 0
                    ? ` · ${r.appearances}경기`
                    : ""}
                </div>
              </div>
              {/* PC: 이름 옆 빈 공간에 팀 로고·팀명·경기수 — 한 줄이 넓어 서브라인 대신 중앙 컬럼 */}
              <div className="hidden sm:flex items-center gap-1.5 min-w-0 flex-1 text-xs text-neutral-500">
                {r.teamFlag ? (
                  <span className="text-sm leading-none shrink-0">{r.teamFlag}</span>
                ) : r.teamLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.teamLogo} alt="" width={18} height={18} loading="lazy" className="object-contain shrink-0" style={{ width: 18, height: 18 }} />
                ) : null}
                <span className="truncate">{r.teamName}</span>
                {r.appearances != null && r.appearances > 0 && (
                  <span className="shrink-0 text-neutral-400">· {r.appearances}경기</span>
                )}
              </div>
              {/* 단위 라벨은 활성 탭이 이미 말해주므로 생략 — 값 숫자만 우측 정렬.
                  › 는 링크 없는 행에도 invisible 로 자리를 차지시켜 숫자 세로 정렬 유지. */}
              <div className="text-right shrink-0">
                <div className="text-lg sm:text-xl font-black tabular-nums">
                  {decimals > 0 ? r.value.toFixed(decimals) : Math.round(r.value)}
                </div>
              </div>
              <span
                className={`text-neutral-300 dark:text-neutral-600 text-xs shrink-0 ${href ? "" : "invisible"}`}
              >
                ›
              </span>
            </Wrap>
          );
        })}
      </div>

      <div className="px-3 sm:px-4 py-2 text-[11px] text-neutral-400 bg-neutral-50/50 dark:bg-neutral-900/40 border-t border-neutral-200 dark:border-neutral-800">
        {footer ?? `${season} 시즌 · 매일 자동 갱신`}
      </div>
    </section>
  );
}
