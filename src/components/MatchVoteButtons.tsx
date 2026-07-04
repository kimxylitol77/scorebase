"use client";
// 승부예측 투표 버튼 — 원클릭 투표 후 분포·AI 비교로 전환 (익명은 localStorage sessionId)
import { useEffect, useState } from "react";

const SESSION_KEY = "scorebase-sid"; // PageViewTracker 와 동일 — 방문자 식별 재사용
const PICK_KEY = (m: number) => `sb-vote-${m}`; // 익명 내 픽 로컬 기억 (SSR 로는 알 수 없음)

function sessionId(): string {
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return "";
  }
}

export interface VoteInit {
  matchId: number;
  homeName: string;
  awayName: string;
  hasDraw: boolean; // 축구·KBO 등 무승부 가능 종목만 무 버튼
  closed: boolean; // 킥오프 이후 — 투표 불가, 분포만
  dist: Record<string, number>;
  myPick: string | null; // 로그인 회원의 기존 픽 (익명은 null → localStorage 폴백)
  loggedIn: boolean;
  aiPick: string | null; // AI 최고확률 픽 ("home"|"draw"|"away")
  aiProb: number | null; // 그 픽의 확률 0~1
  result: string | null; // FINISHED 시 실제 결과 pick 값
}

const LABEL: Record<string, string> = { home: "홈 승", draw: "무", away: "원정 승" };

export default function MatchVoteButtons(init: VoteInit) {
  const [myPick, setMyPick] = useState<string | null>(init.myPick);
  const [dist, setDist] = useState(init.dist);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 익명 사용자의 기존 픽 복원 (SSR 은 sessionId 를 모름)
  useEffect(() => {
    if (!init.myPick) {
      try {
        const saved = localStorage.getItem(PICK_KEY(init.matchId));
        if (saved) setMyPick(saved);
      } catch { /* private mode 무시 */ }
    }
  }, [init.matchId, init.myPick]);

  const vote = async (pick: string) => {
    if (busy || init.closed) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: init.matchId, pick, sessionId: sessionId() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "투표에 실패했습니다.");
        return;
      }
      setMyPick(pick);
      setDist(data.dist);
      try {
        localStorage.setItem(PICK_KEY(init.matchId), pick);
      } catch { /* 무시 */ }
    } catch {
      setErr("네트워크 오류 — 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const picks = init.hasDraw ? ["home", "draw", "away"] : ["home", "away"];
  const total = picks.reduce((s, p) => s + (dist[p] ?? 0), 0);
  const nameOf = (p: string) => (p === "home" ? init.homeName : p === "away" ? init.awayName : "무승부");
  const voted = myPick != null;

  // 투표 전 + 열려 있음 → 버튼
  if (!voted && !init.closed) {
    return (
      <div>
        <div className="flex gap-1.5">
          {picks.map((p) => (
            <button
              key={p}
              onClick={() => vote(p)}
              disabled={busy}
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 disabled:opacity-50 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200 dark:hover:border-rose-500/50 dark:hover:text-rose-300"
            >
              <span className="block truncate">{p === "draw" ? "무" : nameOf(p)}</span>
              <span className="mt-0.5 block text-[10px] font-normal text-neutral-400">{LABEL[p]}</span>
            </button>
          ))}
        </div>
        {err && <p className="mt-1.5 text-[11px] text-rose-500">{err}</p>}
        {total >= 3 && <p className="mt-1.5 text-[11px] text-neutral-400">{total.toLocaleString()}명이 투표했어요</p>}
      </div>
    );
  }

  // 투표 후 or 마감 → 분포 + AI 비교
  return (
    <div>
      <div className="space-y-1">
        {picks.map((p) => {
          const n = dist[p] ?? 0;
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          const mine = myPick === p;
          const isResult = init.result === p;
          return (
            <div key={p} className="flex items-center gap-2 text-xs">
              <span className={`w-20 shrink-0 truncate sm:w-24 ${mine ? "font-bold text-rose-600 dark:text-rose-400" : "text-neutral-600 dark:text-neutral-300"}`}>
                {p === "draw" ? "무승부" : nameOf(p)}
                {mine && " ✓"}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]">
                <div className={`h-full rounded-full ${mine ? "bg-rose-500" : "bg-neutral-300 dark:bg-neutral-600"}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`w-10 shrink-0 text-right tabular-nums ${isResult ? "font-bold text-emerald-600 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400"}`}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
        {init.aiPick && (
          <span>
            AI 픽 <span className="font-semibold text-neutral-700 dark:text-neutral-200">{init.aiPick === "draw" ? "무승부" : nameOf(init.aiPick)}</span>
            {init.aiProb != null && ` ${Math.round(init.aiProb * 100)}%`}
            {voted && myPick !== init.aiPick && <span className="ml-1 text-rose-500">— AI 와 다른 픽!</span>}
          </span>
        )}
        {init.result && myPick && (
          <span className={myPick === init.result ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-neutral-400"}>
            {myPick === init.result ? "적중!" : "빗나감"}
          </span>
        )}
        {voted && !init.loggedIn && !init.result && (
          <a href="/login" className="font-medium text-rose-600 hover:underline dark:text-rose-400">
            로그인하면 적중률·랭킹에 기록돼요 →
          </a>
        )}
      </div>
    </div>
  );
}
