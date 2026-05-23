// 라이브 스코어 sticky bar — 헤더 바로 아래에 표시.
// /api/live/scores 호출 + 60초 polling. 매치 0건이면 자동 숨김.
// 매치는 가로 스크롤 + 각 매치 칩 클릭 시 해당 리그 페이지로 이동.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import LeagueBadge from "./LeagueBadge";
import CountUp from "./CountUp";
import { playChime } from "@/lib/sound/chime";
import { SOUND_STORAGE_KEY, SOUND_CHANGE_EVENT } from "./LiveSoundToggle";

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

interface ApiResp {
  matches?: LiveMatch[];
}

// 라이브 매치 있을 때 5초 · 없을 때 3분 · 탭 hidden 이면 일시정지.
const POLL_LIVE_MS = 5_000;
const POLL_IDLE_MS = 180_000;

export default function LiveScoresBar() {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 사운드 ON/OFF — LiveSoundToggle 컴포넌트가 localStorage + custom event 로 갱신.
  // 점수 감지 useEffect 가 매번 ref 읽음.
  const soundOnRef = useRef(false);
  // 직전 cycle 의 점수 snapshot — 변화 감지용
  const prevScoresRef = useRef<Map<string, string>>(new Map());
  // schedule() 안에서 항상 최신 matches.length 참조 위해 ref 동기화
  const countRef = useRef(0);
  countRef.current = matches.length;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // 304 응답 절약 위해 마지막 ETag 보관
    let lastEtag: string | null = null;
    // ?demo=1 검출 — useSearchParams 쓰면 layout 단에서 전체 페이지가 dynamic 강제됨.
    // mount 후 window.location 으로 직접 파싱.
    const demo = new URLSearchParams(window.location.search).get("demo") === "1";
    const url = demo ? "/api/live/scores?demo=1" : "/api/live/scores";

    const fetchOnce = async () => {
      try {
        const headers: HeadersInit = lastEtag ? { "if-none-match": lastEtag } : {};
        const res = await fetch(url, { cache: "no-store", headers });
        // 304 = 변경 없음 → state 유지
        if (res.status === 304) return;
        if (!res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: ApiResp = await res.json();
        if (!alive) return;
        setMatches(json.matches ?? []);
        setLoaded(true);
      } catch {
        // 실패 시 무시 — 다음 polling 에서 재시도
      }
    };

    // 다음 polling 예약 (라이브 매치 여부 + visibility 기준)
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined" && document.hidden) return; // 숨김 시 정지
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

  // 사운드 상태 동기화 — LiveSoundToggle 가 localStorage + custom event 발행.
  // init + storage event (다른 탭) + custom event (같은 탭 토글) 모두 수신.
  useEffect(() => {
    try {
      soundOnRef.current = localStorage.getItem(SOUND_STORAGE_KEY) === "1";
    } catch {
      // ignore
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === SOUND_STORAGE_KEY) soundOnRef.current = e.newValue === "1";
    };
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<{ soundOn: boolean }>;
      if (typeof ce.detail?.soundOn === "boolean") soundOnRef.current = ce.detail.soundOn;
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SOUND_CHANGE_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SOUND_CHANGE_EVENT, onCustom);
    };
  }, []);

  // 점수 변화 감지 → chime
  // - 첫 로드 시점에는 prev 가 비어있어 chime 안 울림 (= 페이지 진입 즉시 알림 X)
  // - 직전 cycle 의 점수가 다르면 chime
  useEffect(() => {
    const newMap = new Map<string, string>();
    let scored = false;
    for (const m of matches) {
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
  }, [matches]);

  // 첫 로딩 전 또는 매치 0건이면 렌더 자체 안 함 (CLS 방지 위해 SSR 시점에도
  // null — 라이브 매치가 있을 때만 자리 차지).
  if (!loaded || matches.length === 0) return null;

  // 매치 → 라이브 상세 페이지 URL. 야구 (KBO/NPB/MLB) 와 LOL 은 자체 라이브 페이지.
  // LiveMatch.id 는 "ab-180841" 같은 prefix 형식 → externalId 추출.
  function liveHref(m: LiveMatch): string {
    const rawId = m.id.replace(/^[a-z]+-/i, "");
    if (m.league === "KBO") return `/live/kbo/${rawId}`;
    if (m.league === "NPB") return `/live/npb/${rawId}`;
    if (m.league === "MLB") return `/live/mlb/${rawId}`;
    if (m.league === "LOL") return `/live/lol/${rawId}`;
    return `/leagues/${m.league}`;
  }

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-2 sm:px-4">
        <div
          className="flex items-stretch gap-2 overflow-x-auto py-1.5
                     [-ms-overflow-style:'none'] [scrollbar-width:'none']
                     [&::-webkit-scrollbar]:hidden"
          role="region"
          aria-label="라이브 스코어"
        >
          <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold tracking-wider uppercase text-rose-600 dark:text-rose-400">
            <span className="relative inline-flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            LIVE
          </span>
          {matches.map((m) => {
            const href = liveHref(m);
            const isExternal = /^https?:\/\//i.test(href);
            const chipCls =
              "group shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs " +
              "bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 " +
              "border border-neutral-200 dark:border-neutral-800 transition";
            const Wrap = isExternal
              ? ({ children }: { children: React.ReactNode }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={chipCls}
                    title={`${m.homeName} ${m.homeScore} - ${m.awayScore} ${m.awayName}`}
                  >
                    {children}
                  </a>
                )
              : ({ children }: { children: React.ReactNode }) => (
                  <Link
                    href={href}
                    prefetch={false}
                    className={chipCls}
                    title={`${m.homeName} ${m.homeScore} - ${m.awayScore} ${m.awayName}`}
                  >
                    {children}
                  </Link>
                );
            return (
              <Wrap key={m.id}>
              <LeagueBadge league={m.league} size="sm" />
              {/* home 좌측 통일 — 사이트 전반 규칙 */}
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                {m.homeShort}
              </span>
              <CountUp
                value={m.homeScore}
                className="font-black tabular-nums text-neutral-900 dark:text-white"
              />
              <span className="text-neutral-400">-</span>
              <CountUp
                value={m.awayScore}
                className="font-black tabular-nums text-neutral-900 dark:text-white"
              />
              {/* 점수 동시 갱신 시 두 숫자 모두 부드럽게 카운트업 */}
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                {m.awayShort}
              </span>
              <span className="ml-1 text-[10px] text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                {m.statusLabel}
              </span>
              </Wrap>
            );
          })}
        </div>
      </div>
    </div>
  );
}
