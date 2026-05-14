// KBO/NPB 라이브 상세 — api-sports Baseball 정규화 endpoint를 polling.
// 안 A: 이닝별 linescore + H/E/R + 점수 + 양팀 선발 (SSR 단에서 prop 전달).
// 베이스/볼카운트/투수·타자는 api-sports 미제공 → "공식 라이브로 가기" 외부 링크 노출.

"use client";

import { useEffect, useRef, useState } from "react";
import CountUp from "./CountUp";

interface BaseballLive {
  status: "PRE" | "LIVE" | "FINAL" | "DELAY";
  statusLabel: string;
  linescore: { home: (number | null)[]; away: (number | null)[] } | null;
  homeTeam: {
    name: string;
    score: number;
    hits: number | null;
    errors: number | null;
  };
  awayTeam: {
    name: string;
    score: number;
    hits: number | null;
    errors: number | null;
  };
  league: { id: number; name: string };
}

interface Props {
  gameId: string;
  /** "KBO" | "NPB" — 외부 라이브 링크 분기 */
  league: "KBO" | "NPB";
  /** 한글 팀명 (SSR 단에서 toKoreanTeamName 결과) */
  homeNameKo: string;
  awayNameKo: string;
  /** 양팀 선발투수 (DB Match.{home,away}Starter, 이미 JSON parse 된 이름) */
  homeStarter?: string | null;
  awayStarter?: string | null;
  /** 약자 (LG, 두산 등) — DB Team.shortName */
  homeAbbr?: string | null;
  awayAbbr?: string | null;
  /** 팀 로고 URL (DB Team.logoUrl) */
  homeLogo?: string | null;
  awayLogo?: string | null;
}

function TeamLogo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="w-12 h-12 sm:w-16 sm:h-16 object-contain mx-auto mb-1"
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-1 rounded-full bg-neutral-100 dark:bg-neutral-900 inline-flex items-center justify-center text-base font-bold text-neutral-400">
      {name.slice(0, 1)}
    </div>
  );
}

const POLL_LIVE_MS = 15_000;
const POLL_FINAL_MS = 60_000;

export default function BaseballLiveDetail({
  gameId,
  league,
  homeNameKo,
  awayNameKo,
  homeStarter,
  awayStarter,
  homeAbbr,
  awayAbbr,
  homeLogo,
  awayLogo,
}: Props) {
  const [live, setLive] = useState<BaseballLive | null>(null);
  const [loaded, setLoaded] = useState(false);

  const statusRef = useRef<BaseballLive["status"]>("PRE");
  if (live) statusRef.current = live.status;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastEtag: string | null = null;

    const fetchOnce = async () => {
      try {
        const headers: HeadersInit = lastEtag
          ? { "if-none-match": lastEtag }
          : {};
        const res = await fetch(`/api/live/baseball/${gameId}`, {
          cache: "no-store",
          headers,
        });
        if (res.status === 304) return;
        if (!res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: { live?: BaseballLive; error?: string } = await res.json();
        if (!alive) return;
        if (json.live) {
          setLive(json.live);
          setLoaded(true);
        }
      } catch {
        // ignore
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined" && document.hidden) return;
      const wait =
        statusRef.current === "LIVE" ? POLL_LIVE_MS : POLL_FINAL_MS;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, wait);
    };

    fetchOnce().then(schedule);
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
        fetchOnce();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [gameId]);

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-10 text-center text-sm text-neutral-500 animate-pulse">
        라이브 정보를 불러오는 중…
      </div>
    );
  }
  if (!live) {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-10 text-center text-sm text-neutral-500">
        라이브 정보를 가져오지 못했습니다.
      </div>
    );
  }

  const isLive = live.status === "LIVE";
  // 약자 라인은 shortName 이 있고 풀명과 다를 때만. 같으면 풀명만 표시 (중복 제거)
  const homeShort = homeAbbr && homeAbbr !== homeNameKo ? homeAbbr : null;
  const awayShort = awayAbbr && awayAbbr !== awayNameKo ? awayAbbr : null;
  // linescore 테이블 헤더용 — 약자 우선, 없으면 풀명
  const homeLabel = homeShort ?? homeNameKo;
  const awayLabel = awayShort ?? awayNameKo;

  // 이닝 칸 = max(home, away, 9). null 끝부분은 잘라서 진행 이닝까지만.
  const lsAway = live.linescore?.away ?? [];
  const lsHome = live.linescore?.home ?? [];
  const innings = Math.max(9, lsAway.length, lsHome.length);

  const officialUrl =
    league === "KBO"
      ? "https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx"
      : "https://baseball.yahoo.co.jp/npb/";
  const officialLabel = league === "KBO" ? "KBO 공식" : "Yahoo Sports JP";

  return (
    <div className="space-y-4">
      {/* 상단 스코어 보드 */}
      <div className="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-gradient-to-br from-rose-50/50 to-white dark:from-rose-500/10 dark:to-neutral-950 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold ${
              isLive
                ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
            }`}
          >
            {isLive && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            )}
            {isLive ? `LIVE · ${live.statusLabel}` : live.statusLabel || "—"}
          </span>
          {isLive && (
            <span className="text-[10px] text-rose-600/70 dark:text-rose-400/70">
              15초 자동 갱신
            </span>
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 items-center">
          <div className="text-center">
            <TeamLogo url={awayLogo} name={awayNameKo} />
            {awayShort && (
              <div className="text-xs sm:text-sm font-semibold text-neutral-500">
                {awayShort}
              </div>
            )}
            <div className="font-bold truncate">{awayNameKo}</div>
            {awayStarter && (
              <div className="text-[10px] text-neutral-400 mt-0.5 truncate">
                선발 {awayStarter}
              </div>
            )}
          </div>
          <div className="text-center font-black tabular-nums text-3xl sm:text-5xl tracking-tight">
            <CountUp
              value={live.awayTeam.score}
              className={isLive ? "text-rose-600 dark:text-rose-400" : ""}
            />
            <span className="mx-1.5 sm:mx-3 text-neutral-300 dark:text-neutral-700">
              :
            </span>
            <CountUp
              value={live.homeTeam.score}
              className={isLive ? "text-rose-600 dark:text-rose-400" : ""}
            />
          </div>
          <div className="text-center">
            <TeamLogo url={homeLogo} name={homeNameKo} />
            {homeShort && (
              <div className="text-xs sm:text-sm font-semibold text-neutral-500">
                {homeShort}
              </div>
            )}
            <div className="font-bold truncate">{homeNameKo}</div>
            {homeStarter && (
              <div className="text-[10px] text-neutral-400 mt-0.5 truncate">
                선발 {homeStarter}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 이닝별 linescore + R/H/E */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
        <table className="min-w-full text-xs sm:text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left font-bold text-neutral-500">
                팀
              </th>
              {Array.from({ length: innings }, (_, i) => (
                <th
                  key={i}
                  className="px-2 py-2 text-center font-bold text-neutral-500 tabular-nums"
                >
                  {i + 1}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-black text-neutral-900 dark:text-white border-l border-neutral-200 dark:border-neutral-800">
                R
              </th>
              <th className="px-2 py-2 text-center font-bold text-neutral-500">
                H
              </th>
              <th className="px-2 py-2 text-center font-bold text-neutral-500">
                E
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            <ScoreRow
              label={awayLabel}
              line={lsAway}
              innings={innings}
              total={live.awayTeam.score}
              hits={live.awayTeam.hits}
              errors={live.awayTeam.errors}
            />
            <ScoreRow
              label={homeLabel}
              line={lsHome}
              innings={innings}
              total={live.homeTeam.score}
              hits={live.homeTeam.hits}
              errors={live.homeTeam.errors}
            />
          </tbody>
        </table>
      </div>

      {/* 베이스/볼카운트 미제공 안내 + 공식 링크 */}
      {isLive && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 p-3 sm:p-4 text-xs text-neutral-600 dark:text-neutral-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            ⓘ {league} 는 베이스 상황·볼카운트·현재 투수/타자가 제공되지 않습니다.
            상세 라이브는 공식 페이지에서 확인 가능합니다.
          </span>
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 hover:border-rose-300 dark:hover:border-rose-500/40 font-semibold text-neutral-700 dark:text-neutral-300 transition whitespace-nowrap"
          >
            {officialLabel} →
          </a>
        </div>
      )}
    </div>
  );
}

function ScoreRow({
  label,
  line,
  innings,
  total,
  hits,
  errors,
}: {
  label: string;
  line: (number | null)[];
  innings: number;
  total: number;
  hits: number | null;
  errors: number | null;
}) {
  return (
    <tr>
      <td className="px-3 py-2 font-semibold whitespace-nowrap">{label}</td>
      {Array.from({ length: innings }, (_, i) => (
        <td
          key={i}
          className="px-2 py-2 text-center tabular-nums text-neutral-700 dark:text-neutral-300"
        >
          {line[i] ?? "-"}
        </td>
      ))}
      <td className="px-2 py-2 text-center font-black tabular-nums border-l border-neutral-200 dark:border-neutral-800">
        {total}
      </td>
      <td className="px-2 py-2 text-center tabular-nums text-neutral-500">
        {hits ?? "-"}
      </td>
      <td className="px-2 py-2 text-center tabular-nums text-neutral-500">
        {errors ?? "-"}
      </td>
    </tr>
  );
}
