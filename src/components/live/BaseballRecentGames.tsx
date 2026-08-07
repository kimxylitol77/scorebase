"use client";

// "최근 경기 · 상대전적" 섹션 — 홈팀/원정팀(+상대전적/경기 일정) 탭 경기별 표.
// 데이터: getBaseballRecentGames (Match 테이블, 각 최대 30경기). 경기일·홈팀·점수·원정팀·승패.
// 탭별 5경기씩 노출, "더 많은 경기 보기" 클릭마다 5경기 추가.
// - 팀 탭 결과 배지는 그 팀 기준 승·무·패 (subjectResult — 플래시스코어식, 2026-08-08).
// - 축구는 showH2h=false — 맞대결 탭이 "맞대결 히스토리(H2H)" 카드와 중복이라 제거하고
//   대신 upcoming(경기 일정) 탭을 받는다. 야구·배구는 기존 그대로.

import { useState } from "react";
import type {
  BaseballRecentGames,
  BaseballGameRow,
} from "@/lib/live/baseball-season-analysis";

export interface UpcomingRow {
  date: string; // "YY.MM.DD" (KST)
  time: string; // "HH:MM" (KST)
  homeName: string;
  awayName: string;
  leagueLabel?: string;
}

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  data: BaseballRecentGames;
  /** 맞대결 탭 표시 여부 — 별도 H2H 카드가 있는 축구는 false 로 중복 제거. */
  showH2h?: boolean;
  /** 양 팀 예정 경기(시간순) — 있으면 "경기 일정" 탭 추가. */
  upcoming?: UpcomingRow[];
}

type Tab = "home" | "away" | "h2h" | "fixtures";

const STEP = 5;

export default function BaseballRecentGames({
  homeNameKo,
  awayNameKo,
  data,
  showH2h = true,
  upcoming,
}: Props) {
  const [tab, setTab] = useState<Tab>("home");
  const [visibleByTab, setVisibleByTab] = useState<Record<string, number>>({
    home: STEP,
    away: STEP,
    h2h: STEP,
  });
  if (!data.hasData) return null;

  const hasFixtures = (upcoming?.length ?? 0) > 0;
  const tabs: { key: Tab; label: string }[] = [
    { key: "home", label: `${homeNameKo} (홈)` },
    { key: "away", label: `${awayNameKo} (원정)` },
    ...(showH2h ? [{ key: "h2h" as const, label: "상대전적" }] : []),
    ...(hasFixtures ? [{ key: "fixtures" as const, label: "경기 일정" }] : []),
  ];

  const allRows =
    tab === "home" ? data.home : tab === "away" ? data.away : tab === "h2h" ? data.h2h : [];
  const rows = tab === "fixtures" ? [] : allRows.slice(0, visibleByTab[tab] ?? STEP);
  const hasMore = tab !== "fixtures" && allRows.length > (visibleByTab[tab] ?? STEP);

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <h2 className="text-base sm:text-lg font-black tracking-tight mb-3">
        최근 경기{hasFixtures ? " · 일정" : showH2h ? " · 상대전적" : ""}
      </h2>

      <div className={`grid ${tabs.length === 4 ? "grid-cols-4" : "grid-cols-3"} rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 mb-3 text-xs sm:text-sm font-bold`}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`py-2.5 px-1 truncate transition ${
              tab === t.key
                ? "bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900"
                : "bg-transparent text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "fixtures" ? (
        <FixturesTable rows={upcoming!} />
      ) : rows.length === 0 ? (
        <p className="text-center text-sm text-neutral-500 py-6">
          {tab === "h2h" ? "최근 맞대결 기록이 없습니다." : "최근 경기 기록이 없습니다."}
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-neutral-200/70 dark:border-neutral-800/70">
            {/* table-fixed + 홈/원정 대칭 폭 — 자동 배치는 팀명 길이에 따라 점수 열이
                좌우로 쏠려 헤더와 값이 어긋나 보인다(가운데 정렬 요청, 2026-08-08). */}
            <table className="w-full table-fixed text-xs sm:text-sm">
              <colgroup>
                <col className="w-[72px] sm:w-[110px]" />
                <col />
                <col className="w-[56px] sm:w-[76px]" />
                <col />
                <col className="w-[64px] sm:w-[84px]" />
              </colgroup>
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-900/60 text-[11px] uppercase tracking-wider text-neutral-500">
                  <th className="text-left font-medium py-2.5 px-2 sm:px-3">경기일</th>
                  <th className="text-right font-medium py-2.5 px-1">홈팀</th>
                  <th className="text-center font-medium py-2.5 px-2">점수</th>
                  <th className="text-left font-medium py-2.5 px-1">원정팀</th>
                  <th className="text-center font-medium py-2.5 px-2 sm:px-3">결과</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800/70">
                {rows.map((g, i) => (
                  <GameRow key={i} g={g} />
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() =>
                setVisibleByTab((v) => ({ ...v, [tab]: (v[tab] ?? STEP) + STEP }))
              }
              className="mt-3 w-full py-2.5 rounded-lg text-xs sm:text-sm font-bold text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            >
              더 많은 경기 보기 ({allRows.length - rows.length})
            </button>
          )}
        </>
      )}
    </section>
  );
}

function FixturesTable({ rows }: { rows: UpcomingRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200/70 dark:border-neutral-800/70">
      <table className="w-full table-fixed text-xs sm:text-sm">
        <colgroup>
          <col className="w-[72px] sm:w-[110px]" />
          <col />
          <col className="w-[56px] sm:w-[76px]" />
          <col />
          <col className="w-[64px] sm:w-[84px]" />
        </colgroup>
        <thead>
          <tr className="bg-neutral-50 dark:bg-neutral-900/60 text-[11px] uppercase tracking-wider text-neutral-500">
            <th className="text-left font-medium py-2.5 px-2 sm:px-3">경기일</th>
            <th className="text-right font-medium py-2.5 px-1">홈팀</th>
            <th className="text-center font-medium py-2.5 px-2">시간</th>
            <th className="text-left font-medium py-2.5 px-1">원정팀</th>
            <th className="text-center font-medium py-2.5 px-2 sm:px-3">일정</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800/70">
          {rows.map((f, i) => (
            <tr key={i}>
              <td className="text-left py-2.5 px-2 sm:px-3 tabular-nums text-neutral-500">
                {f.date}
                {f.leagueLabel && (
                  <span className="block text-[10px] leading-tight text-neutral-400 dark:text-neutral-500 truncate">
                    {f.leagueLabel}
                  </span>
                )}
              </td>
              <td className="text-right py-2.5 px-1 truncate">{f.homeName}</td>
              <td className="text-center py-2.5 px-2 tabular-nums text-neutral-500">{f.time}</td>
              <td className="text-left py-2.5 px-1 truncate">{f.awayName}</td>
              <td className="text-center py-2.5 px-2 sm:px-3">
                <span className="inline-block whitespace-nowrap rounded-full border border-neutral-300 text-neutral-500 dark:border-neutral-700 text-[11px] font-bold px-2 py-0.5">
                  예정
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GameRow({ g }: { g: BaseballGameRow }) {
  const homeWon = g.winner === "HOME";
  const awayWon = g.winner === "AWAY";
  const scoreCls = (won: boolean) =>
    won ? "text-rose-600 dark:text-rose-400 font-black" : "text-neutral-500";
  const nameCls = (side: "home" | "away") =>
    g.subjectSide === side ? "font-bold" : g.subjectSide ? "text-neutral-500" : "";
  return (
    <tr>
      <td className="text-left py-2.5 px-2 sm:px-3 tabular-nums text-neutral-500">
        {g.date}
        {g.leagueLabel && (
          <span className="block text-[10px] leading-tight text-neutral-400 dark:text-neutral-500 truncate max-w-[18vw]">
            {g.leagueLabel}
          </span>
        )}
      </td>
      <td className={`text-right py-2.5 px-1 truncate max-w-[22vw] ${nameCls("home")}`}>
        {g.homeName}
      </td>
      <td className="text-center py-2.5 px-2 tabular-nums whitespace-nowrap">
        <span className={scoreCls(homeWon)}>{g.homeScore ?? "-"}</span>
        <span className="text-neutral-300 dark:text-neutral-600 mx-1">:</span>
        <span className={scoreCls(awayWon)}>{g.awayScore ?? "-"}</span>
      </td>
      <td className={`text-left py-2.5 px-1 truncate max-w-[22vw] ${nameCls("away")}`}>
        {g.awayName}
      </td>
      <td className="text-center py-2.5 px-2 sm:px-3">
        {g.subjectResult ? <SubjectBadge r={g.subjectResult} /> : <ResultBadge winner={g.winner} />}
      </td>
    </tr>
  );
}

/** 탭 주인공 팀 기준 승·무·패 — 최근 폼 점(승 emerald·패 rose·무 중립)과 같은 색 체계. */
function SubjectBadge({ r }: { r: "W" | "D" | "L" }) {
  if (r === "W")
    return (
      <span className="inline-block whitespace-nowrap rounded-full border border-emerald-400 text-emerald-600 dark:border-emerald-500/60 dark:text-emerald-400 text-[11px] font-bold px-2 py-0.5">
        승
      </span>
    );
  if (r === "L")
    return (
      <span className="inline-block whitespace-nowrap rounded-full border border-rose-400 text-rose-600 dark:border-rose-500/60 dark:text-rose-400 text-[11px] font-bold px-2 py-0.5">
        패
      </span>
    );
  return (
    <span className="inline-block whitespace-nowrap rounded-full border border-neutral-300 text-neutral-500 dark:border-neutral-700 text-[11px] font-bold px-2 py-0.5">
      무
    </span>
  );
}

function ResultBadge({ winner }: { winner: BaseballGameRow["winner"] }) {
  if (winner === "HOME")
    return (
      <span className="inline-block whitespace-nowrap rounded-full border border-rose-400 text-rose-600 dark:border-rose-500/60 dark:text-rose-400 text-[11px] font-bold px-2 py-0.5">
        홈승
      </span>
    );
  if (winner === "AWAY")
    return (
      <span className="inline-block whitespace-nowrap rounded-full border border-blue-400 text-blue-600 dark:border-blue-500/60 dark:text-blue-400 text-[11px] font-bold px-2 py-0.5">
        원정승
      </span>
    );
  if (winner === "DRAW")
    return (
      <span className="inline-block whitespace-nowrap rounded-full border border-neutral-300 text-neutral-500 dark:border-neutral-700 text-[11px] font-bold px-2 py-0.5">
        무
      </span>
    );
  return <span className="text-neutral-400">-</span>;
}
