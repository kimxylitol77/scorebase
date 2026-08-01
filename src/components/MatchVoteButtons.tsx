"use client";
// 승부예측 투표 버튼 — 원클릭 투표 후 분포·AI 비교로 전환 (익명은 localStorage sessionId)
import { useCallback, useEffect, useState } from "react";
import { useClientValue } from "@/lib/use-client-value";

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
  // 내 픽·로그인 여부는 기본적으로 prop 이 아니다 — 서버에서 cookies() 를 읽으면 그 페이지가
  // 동적 강등돼 ISR 이 죽는다(2026-08-01). 생략하면 마운트 후 GET /api/vote 로 받아온다.
  // 이미 force-dynamic 인 개인 페이지(/picks)만 서버 값을 넘겨 요청을 아낀다.
  myPick?: string | null;
  loggedIn?: boolean;
  aiPick: string | null; // AI 최고확률 픽 ("home"|"draw"|"away")
  aiProb: number | null; // 그 픽의 확률 0~1
  result: string | null; // FINISHED 시 실제 결과 pick 값
}

const LABEL: Record<string, string> = { home: "홈 승", draw: "무", away: "원정 승" };

export default function MatchVoteButtons(init: VoteInit) {
  const [dist, setDist] = useState(init.dist);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 익명 사용자의 기존 픽 복원 (SSR 은 sessionId 를 모름).
  // 렌더 중엔 읽을 수 없고 effect 에서 setState 하면 한 프레임 어긋나므로
  // 마운트 후 값을 그대로 읽어 쓴다.
  const readSaved = useCallback(() => {
    try {
      return localStorage.getItem(PICK_KEY(init.matchId));
    } catch {
      return null; // private mode 무시
    }
  }, [init.matchId]);
  const savedPick = useClientValue<string | null>(readSaved, null);

  // 로그인 회원의 서버 픽 — 페이지를 동적으로 만들지 않으려고 여기서 따로 받는다.
  // 비로그인이면 {myPick:null, loggedIn:false} 라 localStorage 폴백이 그대로 살아 있다.
  const [serverPick, setServerPick] = useState<string | null>(init.myPick ?? null);
  const [loggedIn, setLoggedIn] = useState(!!init.loggedIn);
  // 서버가 개인화를 넘겨준 페이지(/picks)는 다시 물을 필요가 없다.
  const askServer = init.myPick === undefined;
  useEffect(() => {
    if (!askServer) return;
    let alive = true;
    fetch(`/api/vote?matchId=${init.matchId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { myPick?: string | null; loggedIn?: boolean } | null) => {
        if (!alive || !d) return;
        if (d.myPick) setServerPick(d.myPick);
        setLoggedIn(!!d.loggedIn);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [init.matchId, askServer]);

  // 이번 세션에서 투표한 값이 있으면 그게 우선.
  const [votedPick, setVotedPick] = useState<string | null>(null);
  const myPick = votedPick ?? serverPick ?? savedPick;
  const setMyPick = setVotedPick;

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
      // 투표 응답이 로그인 여부를 알려준다 — GET 이 늦게 와도 안내 문구가 어긋나지 않게.
      if (typeof data.loggedIn === "boolean") setLoggedIn(data.loggedIn);
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
        {voted && !loggedIn && !init.result && (
          <a href="/login" className="font-medium text-rose-600 hover:underline dark:text-rose-400">
            로그인하면 적중률·랭킹에 기록돼요 →
          </a>
        )}
      </div>
    </div>
  );
}
