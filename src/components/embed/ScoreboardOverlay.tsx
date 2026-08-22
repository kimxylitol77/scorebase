// 방송 오버레이 스코어보드(클라이언트) — OBS 브라우저 소스용. 투명 배경 위 팀 로고·약칭·점수·경기 시간, 5초 폴링.
// 옵션은 쿼리로: bg=transparent|dark|light · size=1~2 · clock=0|1 · names=short|full · league 배지 league=1.
"use client";

import { useEffect, useState } from "react";
import type { ScoreboardPayload } from "@/app/api/embed/scoreboard/route";

interface Props {
  league: string;
  id: string;
  bg: "transparent" | "dark" | "light";
  size: number;
  clock: boolean;
  names: "short" | "full";
  showLeague: boolean;
}

const POLL_MS = 5000;

export default function ScoreboardOverlay({ league, id, bg, size, clock, names, showLeague }: Props) {
  const [data, setData] = useState<ScoreboardPayload | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const r = await fetch(`/api/embed/scoreboard?league=${encodeURIComponent(league)}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!alive) return;
        if (!r.ok) throw new Error(String(r.status));
        setData((await r.json()) as ScoreboardPayload);
        setErr(false);
      } catch {
        if (alive) setErr(true);
      } finally {
        // 종료 경기는 느리게(60s) — 스트리머가 켜 둔 채 잊어도 부담 없게
        if (alive) timer = setTimeout(tick, data?.status === "FINISHED" ? 60_000 : POLL_MS);
      }
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // data 는 폴링 주기 판단에만 쓴다 — 의존성에 넣으면 응답마다 타이머가 리셋된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, id]);

  const dark = bg !== "light";
  const panel =
    bg === "transparent"
      ? "bg-black/75 text-white"
      : bg === "dark"
        ? "bg-neutral-950 text-white"
        : "bg-white text-neutral-900 ring-1 ring-black/10";
  const muted = dark ? "text-white/70" : "text-neutral-500";
  const s = Math.min(2.5, Math.max(0.6, size));

  if (!data) {
    return (
      <div className={`inline-flex items-center rounded-xl px-5 py-3 text-sm ${panel}`} style={{ fontSize: `${14 * s}px` }}>
        {err ? "경기를 찾을 수 없습니다" : "불러오는 중…"}
      </div>
    );
  }
  const isLive = data.status === "LIVE";
  const score = (v: number | null) => (v == null ? "–" : String(v));
  const nm = (t: ScoreboardPayload["home"]) => (names === "full" ? t.name : t.short);

  return (
    <div
      className={`inline-flex flex-col items-center rounded-2xl px-6 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] ${panel}`}
      style={{ fontSize: `${16 * s}px`, fontFamily: "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif" }}
      aria-live="polite"
    >
      {showLeague && <div className={`text-[0.6em] font-semibold tracking-wider uppercase ${muted}`}>{data.leagueLabel}</div>}
      <div className="flex items-center gap-[0.9em] leading-none">
        <span className="font-bold whitespace-nowrap">{nm(data.home)}</span>
        {data.home.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.home.logo} alt="" className="object-contain" style={{ width: "2em", height: "2em" }} />
        )}
        <span className="font-black tabular-nums whitespace-nowrap" style={{ fontSize: "1.9em" }}>
          {score(data.home.score)}
          <span className={`mx-[0.15em] ${muted}`}>-</span>
          {score(data.away.score)}
        </span>
        {data.away.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.away.logo} alt="" className="object-contain" style={{ width: "2em", height: "2em" }} />
        )}
        <span className="font-bold whitespace-nowrap">{nm(data.away)}</span>
      </div>
      {clock && (
        <div className={`mt-[0.35em] text-[0.95em] font-bold tabular-nums ${isLive ? "text-emerald-400" : muted}`}>
          {isLive && <span className="mr-[0.4em] inline-block h-[0.5em] w-[0.5em] rounded-full bg-rose-500 align-middle animate-pulse" aria-hidden />}
          {data.statusLabel}
        </div>
      )}
    </div>
  );
}
