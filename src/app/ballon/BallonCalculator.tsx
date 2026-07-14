"use client";
// 발롱도르 지수 인터랙티브 계산기 — 가중치 슬라이더로 후보 순위를 실시간 재정렬한다.
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import type { BallonCandidate } from "@/lib/ballon";

interface Weights {
  goal: number;
  assist: number;
  rating: number;
  team: number;
  wc: number;
}
const DEFAULT: Weights = { goal: 1, assist: 1, rating: 1, team: 1, wc: 1 };

const PRESETS: { label: string; w: Weights }[] = [
  { label: "밸런스", w: { goal: 1, assist: 1, rating: 1, team: 1, wc: 1 } },
  { label: "순수 득점왕", w: { goal: 2, assist: 0.5, rating: 0.5, team: 0.3, wc: 1 } },
  { label: "창조력 중시", w: { goal: 1, assist: 2, rating: 1.2, team: 0.3, wc: 1 } },
  { label: "월드컵 임팩트", w: { goal: 1, assist: 1, rating: 0.8, team: 0.5, wc: 2 } },
];

const SLIDERS: { key: keyof Weights; label: string; hint?: string }[] = [
  { key: "goal", label: "골" },
  { key: "assist", label: "도움" },
  { key: "rating", label: "선수 평점" },
  { key: "team", label: "팀 성적" },
  { key: "wc", label: "월드컵 비중", hint: "0이면 월드컵 성적 제외" },
];

function score(c: BallonCandidate, w: Weights): number {
  return (
    c.baseGoalPts * w.goal +
    c.baseAssistPts * w.assist +
    c.ratingPts * w.rating +
    c.teamPts * w.team +
    (c.wcGoalPts * w.goal + c.wcAssistPts * w.assist) * w.wc
  );
}

export default function BallonCalculator({ candidates }: { candidates: BallonCandidate[] }) {
  const [w, setW] = useState<Weights>(DEFAULT);
  const [copied, setCopied] = useState(false);
  const ready = useRef(false);

  // URL 쿼리 ↔ 가중치 동기화 — 링크를 열면 같은 순위가 재현되도록 공유 가능하게 한다.
  const URL_KEYS: Record<keyof Weights, string> = {
    goal: "g", assist: "a", rating: "r", team: "t", wc: "w",
  };
  // 마운트 시 URL 에서 초기 가중치 로드 (서버는 DEFAULT 렌더 → 클라에서 갱신, hydration 안전).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const next = { ...DEFAULT };
    (Object.keys(URL_KEYS) as (keyof Weights)[]).forEach((k) => {
      const v = sp.get(URL_KEYS[k]);
      if (v != null) {
        const n = Number(v);
        if (Number.isFinite(n)) next[k] = Math.min(2, Math.max(0, Math.round(n * 10) / 10));
      }
    });
    setW(next);
    ready.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 가중치 변경 시 URL 갱신 (기본값과 다른 것만 — 히스토리 오염 없이 replaceState).
  useEffect(() => {
    if (!ready.current) return;
    const sp = new URLSearchParams();
    (Object.keys(URL_KEYS) as (keyof Weights)[]).forEach((k) => {
      if (w[k] !== DEFAULT[k]) sp.set(URL_KEYS[k], String(w[k]));
    });
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [w]);

  const isDefault = (Object.keys(DEFAULT) as (keyof Weights)[]).every((k) => w[k] === DEFAULT[k]);

  // 밸런스 기준 순위 (움직임 표시용).
  const baselineRank = useMemo(() => {
    const m = new Map<string, number>();
    [...candidates]
      .sort((a, b) => score(b, DEFAULT) - score(a, DEFAULT))
      .forEach((c, i) => m.set(c.afId, i));
    return m;
  }, [candidates]);

  const ranked = useMemo(
    () =>
      [...candidates]
        .map((c) => ({ c, s: score(c, w) }))
        .sort((a, b) => b.s - a.s),
    [candidates, w],
  );
  const maxScore = ranked[0]?.s || 1;

  // 현재 가중치로 만든 순위를 공유 — Web Share(모바일 네이티브 시트) + 클립보드 폴백.
  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const top3 = ranked
      .slice(0, 3)
      .map((r, i) => `${i + 1}. ${r.c.name}`)
      .join(" · ");
    const title = "발롱도르 순위 지수 계산기";
    const text = `내가 만든 발롱도르 순위 — ${top3}`;
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title, text, url });
      } catch {
        // 공유 시트 취소 — 무시
      }
      return;
    }
    try {
      await nav?.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 거부 — 무시
    }
  }

  return (
    <div>
      {/* 컨트롤 */}
      <section className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setW(p.w)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] transition"
            >
              {p.label}
            </button>
          ))}
          {!isDefault && (
            <button
              onClick={() => setW(DEFAULT)}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition"
            >
              초기화
            </button>
          )}
          <button
            onClick={share}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
              <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            </svg>
            {copied ? "링크 복사됨" : "내 순위 공유"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {SLIDERS.map((s) => (
            <label key={s.key} className="block">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">
                  {s.label}
                  {s.hint && (
                    <span className="ml-1.5 text-[11px] font-normal text-neutral-400">{s.hint}</span>
                  )}
                </span>
                <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  ×{w[s.key].toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={w[s.key]}
                onChange={(e) => setW((prev) => ({ ...prev, [s.key]: Number(e.target.value) }))}
                className="mt-1 w-full accent-emerald-500"
              />
            </label>
          ))}
        </div>
      </section>

      {/* 랭킹 */}
      <ol className="mt-5 space-y-2">
        {ranked.map(({ c, s }, i) => {
          const base = baselineRank.get(c.afId) ?? i;
          const move = base - i; // +면 상승
          return (
            <li
              key={c.afId}
              className="rounded-2xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 px-3 sm:px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {/* 순위 */}
                <div className="w-7 shrink-0 text-center">
                  <div className="text-base font-black tabular-nums leading-none">{i + 1}</div>
                  {!isDefault && move !== 0 && (
                    <div
                      className={`text-[10px] font-bold leading-tight ${
                        move > 0 ? "text-emerald-500" : "text-rose-500"
                      }`}
                    >
                      {move > 0 ? "▲" : "▼"}
                      {Math.abs(move)}
                    </div>
                  )}
                </div>

                {/* 사진 */}
                {c.photoUrl ? (
                  <Image
                    src={c.photoUrl}
                    alt={c.name}
                    width={44}
                    height={44}
                    className="rounded-full object-cover shrink-0 bg-neutral-100 dark:bg-neutral-800 w-11 h-11"
                    unoptimized
                  />
                ) : (
                  <span className="w-11 h-11 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0" />
                )}

                {/* 이름·팀 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {c.href ? (
                      <Link href={c.href} className="font-bold truncate hover:underline">
                        {c.name}
                      </Link>
                    ) : (
                      <span className="font-bold truncate">{c.name}</span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    <span className="inline-flex items-center gap-1 align-middle">
                      {c.mainTeamLogoUrl ? (
                        <TeamBadge logoUrl={c.mainTeamLogoUrl} size={16} className="bg-white rounded-sm" />
                      ) : c.mainIsNational && c.mainFlag ? (
                        <span>{c.mainFlag}</span>
                      ) : null}
                      {c.teamName}
                    </span>
                    {c.teamRankPos != null && (
                      <span className="text-neutral-400"> · {c.mainLeagueLabel} {c.teamRankPos}위</span>
                    )}
                    {c.ratingAvg != null && (
                      <span className="text-neutral-400"> · 평점 {c.ratingAvg.toFixed(2)}</span>
                    )}
                  </div>
                </div>

                {/* 지수 */}
                <div className="shrink-0 text-right">
                  <div className="text-lg font-black tabular-nums leading-none">{Math.round(s)}</div>
                  <div className="text-[10px] text-neutral-400 leading-tight">지수</div>
                </div>
              </div>

              {/* 리그별 골·도움 브레이크다운 + 점수바 */}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400 pl-10">
                {c.leagues.map((lg) => (
                  <span
                    key={lg.code}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${
                      lg.isWorldCup
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
                        : "bg-neutral-100 dark:bg-white/[0.06]"
                    }`}
                  >
                    {lg.logoUrl ? (
                      <TeamBadge logoUrl={lg.logoUrl} size={14} className="rounded-[2px]" />
                    ) : (
                      <span>{lg.flag}</span>
                    )}
                    {lg.label} {lg.goals}골{lg.assists > 0 ? ` ${lg.assists}도움` : ""}
                  </span>
                ))}
              </div>
              <div className="mt-2 ml-10 h-1 rounded-full bg-neutral-100 dark:bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.max(3, (s / maxScore) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
