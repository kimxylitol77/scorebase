// /scores 페이지 상단의 "지금 진행 중" 라이브 매치 카드들.
// /api/live/scores (server 캐시 30초) + 클라이언트 60초 polling.
// LiveScoresBar (헤더 sticky chip) 와 데이터 동일, 표시만 큰 카드.
// sport prop 으로 종목 필터링.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { leaguesForSport, type SportCode } from "@/lib/sports/sport-leagues";
import LeagueBadge from "./LeagueBadge";
import CountUp from "./CountUp";
import LiveEventsPanel from "./LiveEventsPanel";
import { playChime, unlockAudio, armAudioUnlock } from "@/lib/sound/chime";

interface LiveMatch {
  id: string;
  league: string;
  leagueLabel: string;
  homeName: string;
  awayName: string;
  homeShort: string;
  awayShort: string;
  homeScore: number;
  awayScore: number;
  statusLabel: string;
  startTime: string;
}

// 라이브 매치 있을 때 15초 · 없을 때 3분 · 탭 hidden 정지.
const POLL_LIVE_MS = 15_000;
const POLL_IDLE_MS = 180_000;

const SOUND_STORAGE_KEY = "scorebase-live-sound";

export default function ScoresLiveCards({ sport }: { sport: SportCode }) {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 어느 카드를 펼쳤는지 (events panel) — 한 번에 한 카드만 expand
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 점수 변화 사운드 ON/OFF (localStorage 저장)
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(false);
  soundOnRef.current = soundOn;
  // 직전 cycle 의 점수 snapshot — 변화 감지용
  const prevScoresRef = useRef<Map<string, string>>(new Map());
  const countRef = useRef(0);
  countRef.current = matches.length;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastEtag: string | null = null;
    const demo =
      new URLSearchParams(window.location.search).get("demo") === "1";
    const url = demo ? "/api/live/scores?demo=1" : "/api/live/scores";

    const fetchOnce = async () => {
      try {
        const headers: HeadersInit = lastEtag
          ? { "if-none-match": lastEtag }
          : {};
        const res = await fetch(url, { cache: "no-store", headers });
        if (res.status === 304) return;
        if (!res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: { matches?: LiveMatch[] } = await res.json();
        if (!alive) return;
        setMatches(json.matches ?? []);
        setLoaded(true);
      } catch {
        // 실패 시 무시
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined" && document.hidden) return;
      const wait = countRef.current > 0 ? POLL_LIVE_MS : POLL_IDLE_MS;
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
    const onFocus = () => fetchOnce();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // 사운드 설정 init (localStorage)
  useEffect(() => {
    try {
      const on = localStorage.getItem(SOUND_STORAGE_KEY) === "1";
      setSoundOn(on);
      // 이미 ON 상태로 로드된 경우 — 첫 user gesture 에 AudioContext unlock 예약
      // (자동재생 정책상 새로고침 후엔 클릭 한 번 있어야 소리가 남)
      if (on) armAudioUnlock();
    } catch {
      // SSR 또는 localStorage 비활성 환경 — ignore
    }
  }, []);

  // 점수 변화 감지 → chime
  // - 첫 로드 시점에는 prev 가 비어있어 chime 안 울림 (= 페이지 진입 시 점수 발표 X)
  // - 같은 매치 ID 의 점수가 직전 cycle 과 다르면 chime
  useEffect(() => {
    const filtered = matches.filter((m) =>
      new Set(leaguesForSport(sport)).has(m.league),
    );
    const newMap = new Map<string, string>();
    let scored = false;
    for (const m of filtered) {
      const key = `${m.homeScore}-${m.awayScore}`;
      newMap.set(m.id, key);
      const prev = prevScoresRef.current.get(m.id);
      if (prev && prev !== key) scored = true;
    }
    const isFirstLoad = prevScoresRef.current.size === 0;
    prevScoresRef.current = newMap;
    if (scored && !isFirstLoad && soundOnRef.current) {
      playChime();
    }
  }, [matches, sport]);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    if (next) {
      // 첫 ON 시점에 user gesture 안에서 AudioContext 활성화 + sample chime
      unlockAudio();
      playChime();
    }
  }

  if (!loaded) return null;
  const allowed = new Set(leaguesForSport(sport));
  const filtered = matches.filter((m) => allowed.has(m.league));
  if (filtered.length === 0) return null;
  // af-prefix = API-Football fixture id (축구). events 확장 가능 종목.
  const canExpand = (m: { id: string }) => m.id.startsWith("af-");

  return (
    <section className="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/30 dark:bg-rose-500/5 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase text-rose-600 dark:text-rose-400">
          <span className="relative inline-flex w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          진행 중 {filtered.length}경기
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? "점수 변화 사운드 끄기" : "점수 변화 사운드 켜기"}
            title={soundOn ? "점수 변화 사운드 ON" : "점수 변화 사운드 OFF"}
            className={`inline-flex items-center justify-center w-6 h-6 rounded-md transition ${
              soundOn
                ? "text-rose-600 dark:text-rose-400 bg-rose-100/60 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25"
                : "text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
            }`}
          >
            {soundOn ? (
              // 🔔 알림 켬
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            ) : (
              // 🔕 알림 끔 (사선)
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                <path d="M18 8a6 6 0 0 0-9.33-5" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
          <span className="text-[10px] text-rose-600/70 dark:text-rose-400/70 tabular-nums">
            15초 자동 갱신
          </span>
        </div>
      </div>
      {/* 모바일: 가로 swipe carousel (scroll-snap) / 데스크탑: 그리드 2~3열 */}
      <div
        className="flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-2 overflow-x-auto sm:overflow-visible snap-x snap-mandatory -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 sm:pb-0 [&::-webkit-scrollbar]:hidden"
        role="region"
        aria-label="라이브 매치 캐러셀"
      >
        {filtered.map((m) => {
          const expanded = expandedId === m.id;
          return (
            <div
              key={m.id}
              className="group shrink-0 w-[80%] sm:w-auto snap-start rounded-xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 hover:border-rose-300 dark:hover:border-rose-500/40 transition overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <Link
                  href={`/leagues/${m.league}`}
                  className="flex items-center gap-2 flex-1 min-w-0"
                  title={`${m.awayName} ${m.awayScore} - ${m.homeScore} ${m.homeName}`}
                >
                  <span className="shrink-0">
                    <LeagueBadge league={m.league} size="sm" />
                  </span>
                  <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                    <div className="text-right truncate font-medium text-sm">
                      {m.awayShort}
                    </div>
                    <div className="text-center font-black tabular-nums text-base text-rose-600 dark:text-rose-400 min-w-[3rem]">
                      <CountUp value={m.awayScore} /> -{" "}
                      <CountUp value={m.homeScore} />
                    </div>
                    <div className="truncate font-medium text-sm">
                      {m.homeShort}
                    </div>
                  </div>
                </Link>
                <span className="shrink-0 text-[10px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                  {m.statusLabel}
                </span>
                {canExpand(m) && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : m.id)}
                    aria-expanded={expanded}
                    aria-label={expanded ? "이벤트 접기" : "이벤트 펼치기"}
                    className="shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-md text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}
              </div>
              {expanded && canExpand(m) && (
                <div className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40">
                  <LiveEventsPanel matchId={m.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
