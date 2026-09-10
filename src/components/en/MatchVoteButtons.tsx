// MatchVoteButtons (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";
// 승부예측 투표 버튼 — 시장 탭(승부·핸디캡·오버언더)마다 원클릭 투표 후 분포·AI 비교로 전환 (익명은 localStorage sessionId)
import { useCallback, useEffect, useState } from "react";
import { useClientValue } from "@/lib/use-client-value";
import { MARKET_LABEL_EN as MARKET_LABEL, pickLabel, type VoteMarket } from "@/lib/vote-markets";

const SESSION_KEY = "scorebase-sid"; // PageViewTracker 와 동일 — 방문자 식별 재사용
// 익명 내 픽 로컬 기억 (SSR 로는 알 수 없음). 1X2 는 예전 키 그대로(기존 저장값 호환), 나머지는 시장 접미.
const PICK_KEY = (m: number, market: VoteMarket) => (market === "1X2" ? `sb-vote-${m}` : `sb-vote-${m}-${market}`);

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

/** 시장 하나의 초기 상태 — 서버(카드·/picks)가 채워 내려준다. */
export interface MarketInit {
  /** HANDICAP·OU 라인. 1X2 는 null */
  line: number | null;
  dist: Record<string, number>;
  /** 로그인 회원의 서버 픽. undefined 면 마운트 후 GET /api/vote 로 받아온다(ISR 페이지 보호). */
  myPick?: string | null;
  aiPick: string | null; // AI 픽 ("home"|"draw"|"away"|"over"|"under")
  aiProb: number | null; // 그 픽의 확률 0~1
  result: string | null; // FINISHED 시 정답 픽 (푸시면 null)
}

export interface VoteInit {
  matchId: number;
  homeName: string;
  awayName: string;
  hasDraw: boolean; // 축구·KBO 등 무승부 가능 종목만 무 버튼
  closed: boolean; // 킥오프 이후 — 투표 불가, 분포만
  /** 열려 있는 시장들. "1X2" 는 항상 있고, 라인이 있는 경기만 HANDICAP·OU 가 붙는다. */
  markets: Partial<Record<VoteMarket, MarketInit>>;
  // 내 픽·로그인 여부는 기본적으로 prop 이 아니다 — 서버에서 cookies() 를 읽으면 그 페이지가
  // 동적 강등돼 ISR 이 죽는다(2026-08-01). 생략하면 마운트 후 GET /api/vote 로 받아온다.
  loggedIn?: boolean;
}

const ORDER: VoteMarket[] = ["1X2", "HANDICAP", "OU"];
const SUB_LABEL: Record<string, string> = { home: "Home win", draw: "Draw", away: "Away win", over: "total above", under: "total below" };

export default function MatchVoteButtons(init: VoteInit) {
  const open = ORDER.filter((mk) => init.markets[mk]);
  const [market, setMarket] = useState<VoteMarket>(open[0] ?? "1X2");
  const [dists, setDists] = useState<Partial<Record<VoteMarket, Record<string, number>>>>(() => {
    const o: Partial<Record<VoteMarket, Record<string, number>>> = {};
    for (const mk of open) o[mk] = init.markets[mk]!.dist;
    return o;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 익명 사용자의 기존 픽 복원 (SSR 은 sessionId 를 모름). 렌더 중엔 읽을 수 없어 마운트 후 값을 읽는다.
  // ⚠️ useClientValue 의 getSnapshot 은 매번 같은 값(원시값)을 돌려줘야 한다 — 객체를 새로 만들면
  // "getSnapshot should be cached" 무한 루프(2026-09-10 실측, scores-ux-tier3 와 같은 함정). 문자열로 합쳐 읽는다.
  const readSaved = useCallback(() => {
    try {
      return ORDER.map((mk) => localStorage.getItem(PICK_KEY(init.matchId, mk)) ?? "").join("|");
    } catch {
      return "||"; // private mode 무시
    }
  }, [init.matchId]);
  const savedRaw = useClientValue<string>(readSaved, "||");
  const savedPicks: Partial<Record<VoteMarket, string>> = {};
  savedRaw.split("|").forEach((v, i) => {
    if (v) savedPicks[ORDER[i]] = v;
  });

  // 로그인 회원의 서버 픽 — 페이지를 동적으로 만들지 않으려고 여기서 따로 받는다.
  const [serverPicks, setServerPicks] = useState<Partial<Record<VoteMarket, string>>>(() => {
    const o: Partial<Record<VoteMarket, string>> = {};
    for (const mk of open) {
      const p = init.markets[mk]!.myPick;
      if (p) o[mk] = p;
    }
    return o;
  });
  const [loggedIn, setLoggedIn] = useState(!!init.loggedIn);
  // 서버가 개인화를 넘겨준 페이지(/picks)는 다시 물을 필요가 없다.
  const askServer = open.every((mk) => init.markets[mk]!.myPick === undefined);
  useEffect(() => {
    if (!askServer) return;
    let alive = true;
    fetch(`/api/vote?matchId=${init.matchId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { myPicks?: Record<string, string>; loggedIn?: boolean } | null) => {
        if (!alive || !d) return;
        if (d.myPicks) setServerPicks(d.myPicks as Partial<Record<VoteMarket, string>>);
        setLoggedIn(!!d.loggedIn);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [init.matchId, askServer]);

  // 이번 세션에서 투표한 값이 있으면 그게 우선.
  const [votedPicks, setVotedPicks] = useState<Partial<Record<VoteMarket, string>>>({});

  const vote = async (mk: VoteMarket, pick: string) => {
    if (busy || init.closed) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: init.matchId, market: mk, pick, sessionId: sessionId() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Vote failed.");
        return;
      }
      setVotedPicks((prev) => ({ ...prev, [mk]: pick }));
      setDists((prev) => ({ ...prev, [mk]: data.dist }));
      // 투표 응답이 로그인 여부를 알려준다 — GET 이 늦게 와도 안내 문구가 어긋나지 않게.
      if (typeof data.loggedIn === "boolean") setLoggedIn(data.loggedIn);
      try {
        localStorage.setItem(PICK_KEY(init.matchId, mk), pick);
      } catch { /* 무시 */ }
    } catch {
      setErr("Network error — please try again shortly.");
    } finally {
      setBusy(false);
    }
  };

  const m = init.markets[market] ?? init.markets["1X2"]!;
  const dist = dists[market] ?? m.dist;
  const myPick = votedPicks[market] ?? serverPicks[market] ?? savedPicks[market] ?? null;
  const picks =
    market === "OU" ? ["over", "under"] : market === "HANDICAP" ? ["home", "away"] : init.hasDraw ? ["home", "draw", "away"] : ["home", "away"];
  const total = picks.reduce((s, p) => s + (dist[p] ?? 0), 0);
  const label = (p: string) => pickLabel(market, p, init.homeName, init.awayName, m.line, "en");
  const voted = myPick != null;
  const votedCount = open.filter((mk) => (votedPicks[mk] ?? serverPicks[mk] ?? savedPicks[mk]) != null).length;

  const tabs =
    open.length > 1 ? (
      <div className="mb-2 flex gap-1 text-[11px]">
        {open.map((mk) => {
          const ln = init.markets[mk]!.line;
          const done = (votedPicks[mk] ?? serverPicks[mk] ?? savedPicks[mk]) != null;
          const active = mk === market;
          return (
            <button
              key={mk}
              type="button"
              onClick={() => setMarket(mk)}
              className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${
                active
                  ? "bg-rose-500 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
              }`}
            >
              {MARKET_LABEL[mk]}
              {ln != null && <span className="ml-1 tabular-nums opacity-80">{mk === "HANDICAP" ? `±${ln}` : ln}</span>}
              {done && <span className="ml-1">✓</span>}
            </button>
          );
        })}
      </div>
    ) : null;

  // 투표 전 + 열려 있음 → 버튼
  if (!voted && !init.closed) {
    return (
      <div>
        {tabs}
        <div className="flex gap-1.5">
          {picks.map((p) => (
            <button
              key={p}
              onClick={() => vote(market, p)}
              disabled={busy}
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:border-rose-300 hover:text-rose-600 disabled:opacity-50 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200 dark:hover:border-rose-500/50 dark:hover:text-rose-300"
            >
              <span className="block truncate">{p === "draw" ? "D" : label(p)}</span>
              <span className="mt-0.5 block text-[10px] font-normal text-neutral-400">{SUB_LABEL[p]}</span>
            </button>
          ))}
        </div>
        {err && <p className="mt-1.5 text-[11px] text-rose-500">{err}</p>}
        {total >= 3 && <p className="mt-1.5 text-[11px] text-neutral-400">{total.toLocaleString()} people voted</p>}
        {open.length > 1 && votedCount === 0 && (
          <p className="mt-1 text-[10px] text-neutral-400">One vote each on 1X2, handicap and over/under</p>
        )}
      </div>
    );
  }

  // 투표 후 or 마감 → 분포 + AI 비교
  return (
    <div>
      {tabs}
      <div className="space-y-1">
        {picks.map((p) => {
          const n = dist[p] ?? 0;
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          const mine = myPick === p;
          const isResult = m.result === p;
          return (
            <div key={p} className="flex items-center gap-2 text-xs">
              <span className={`w-24 shrink-0 truncate sm:w-28 ${mine ? "font-bold text-rose-600 dark:text-rose-400" : "text-neutral-600 dark:text-neutral-300"}`}>
                {label(p)}
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
        {m.aiPick && (
          <span>
            AI pick <span className="font-semibold text-neutral-700 dark:text-neutral-200">{label(m.aiPick)}</span>
            {m.aiProb != null && ` ${Math.round(m.aiProb * 100)}%`}
            {voted && myPick !== m.aiPick && <span className="ml-1 text-rose-500">— differs from the AI!</span>}
          </span>
        )}
        {m.result && myPick && (
          <span className={myPick === m.result ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-neutral-400"}>
            {myPick === m.result ? "Hit!" : "missed"}
          </span>
        )}
        {init.closed && m.result == null && market !== "1X2" && myPick && (
          <span className="text-neutral-400">void — landed on the line (push)</span>
        )}
        {voted && !loggedIn && !m.result && (
          <a href="/login" className="font-medium text-rose-600 hover:underline dark:text-rose-400">
            Sign in to track accuracy and rank →
          </a>
        )}
      </div>
    </div>
  );
}
