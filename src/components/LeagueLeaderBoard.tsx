// 시즌 리그 리더보드 — 탭(카테고리) + Top N 표.
// Phase 1: 축구 (GOAL · ASSIST · YELLOW · RED). Phase 2 에서 다른 종목 카테고리 추가.

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { leaderPlayerHref } from "@/lib/links/leaderboard-link";

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
  externalId: string | null;
}

interface CategoryDef {
  key: string;
  label: string;
  emoji: string;
  decimals?: number; // value 표시 자릿수 (정수면 0)
}

// 종목별 카테고리 정의. league prop 으로 lookup.
const CATEGORIES_BY_LEAGUE: Record<string, CategoryDef[]> = {
  // 축구
  SOCCER: [
    { key: "GOAL", label: "득점", emoji: "⚽" },
    { key: "ASSIST", label: "도움", emoji: "🎯" },
    // CHANCE·RATING·DEFENSE·SAVE 는 월드컵(실시간 playerStats 집계)만 데이터 공급 — 빅5는 탭 미노출
    { key: "CHANCE", label: "키패스", emoji: "🔑" },
    { key: "RATING", label: "평점", emoji: "⭐", decimals: 2 },
    { key: "DEFENSE", label: "수비", emoji: "🛡️" },
    { key: "SAVE", label: "세이브", emoji: "🧤" },
    { key: "YELLOW", label: "옐로", emoji: "🟨" },
    { key: "RED", label: "레드", emoji: "🟥" },
    // 이색 랭킹 (월드컵 전용 — predictions 의 별도 섹션이 이 키들만 공급)
    { key: "VALUE", label: "가성비", emoji: "💰", decimals: 1 },
    { key: "FOULED", label: "파울유도", emoji: "🤕" },
    { key: "BIGMISS", label: "빅찬스미스", emoji: "😱" },
    { key: "WOODWORK", label: "골대", emoji: "🪵" },
    { key: "AERIAL", label: "제공권%", emoji: "🎈" },
    { key: "DRIBBLE", label: "드리블%", emoji: "⚡" },
    { key: "CLINICAL", label: "결정력", emoji: "🥶" },
  ],
  // Phase 2 예정
  BASEBALL: [
    { key: "BA", label: "타율", emoji: "⚾", decimals: 3 },
    { key: "HR", label: "홈런", emoji: "💥" },
    { key: "RBI", label: "타점", emoji: "🏃" },
    { key: "ERA", label: "ERA", emoji: "🥎", decimals: 2 },
    { key: "WIN", label: "승", emoji: "🏆" },
    { key: "K", label: "탈삼진", emoji: "❌" },
  ],
  NBA: [
    { key: "PTS", label: "득점", emoji: "🏀", decimals: 1 },
    { key: "AST", label: "어시", emoji: "🎯", decimals: 1 },
    { key: "REB", label: "리바", emoji: "💪", decimals: 1 },
    { key: "STL", label: "스틸", emoji: "🦅", decimals: 1 },
    { key: "BLK", label: "블락", emoji: "🛡️", decimals: 1 },
  ],
  NHL: [
    { key: "GOAL_NHL", label: "골", emoji: "🥅" },
    { key: "ASSIST_NHL", label: "어시", emoji: "🎯" },
    { key: "POINTS", label: "포인트", emoji: "📈" },
    { key: "SAVE_PCT", label: "세이브%", emoji: "🧤", decimals: 3 },
  ],
  LOL: [
    { key: "KDA", label: "KDA", emoji: "🎮", decimals: 2 },
    { key: "CS", label: "CS", emoji: "💰", decimals: 1 },
    { key: "KILL", label: "킬", emoji: "⚔️", decimals: 1 },
  ],
};

const LEAGUE_TO_SPORT: Record<string, keyof typeof CATEGORIES_BY_LEAGUE> = {
  EPL: "SOCCER",
  LALIGA: "SOCCER",
  BUNDESLIGA: "SOCCER",
  SERIE_A: "SOCCER",
  LIGUE_1: "SOCCER",
  MLS: "SOCCER",
  UCL: "SOCCER",
  WORLD_CUP: "SOCCER",
  KBO: "BASEBALL",
  NPB: "BASEBALL",
  MLB: "BASEBALL",
  NBA: "NBA",
  NHL: "NHL",
  LOL: "LOL",
};

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
                <div className="text-[11px] text-neutral-500 truncate">
                  {r.teamName}
                  {r.appearances != null && r.appearances > 0
                    ? ` · ${r.appearances}경기`
                    : ""}
                </div>
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
