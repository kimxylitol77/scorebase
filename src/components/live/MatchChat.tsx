"use client";
// 경기 상세 페이지 우하단 플로팅 AI 챗. 버튼을 누르면 패널이 열리고, 그 경기 데이터로 답한다.

import { useEffect, useState } from "react";
import { useMe } from "@/components/use-me";
import { setMatchChatMounted } from "./match-chat-presence";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const CHIPS = ["이 경기 어때?", "누가 이겨?", "무슨 근거야?"];

export default function MatchChat({
  matchId,
  homeName,
  awayName,
}: {
  matchId: number;
  homeName?: string;
  awayName?: string;
}) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // 인라인 CTA(MatchChatCta)가 창을 열며 넘긴 질문 — 열림 렌더 후 전송해야 해서 상태로 받는다.
  const [pending, setPending] = useState<string | null>(null);

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || loading) return;
    setInput("");
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next);
    setLoading(true);
    try {
      const res = await fetch("/api/match-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, messages: next }),
      });
      const data = await res.json();
      const reply = res.ok
        ? (data.reply as string)
        : (data.error as string) ?? "오류가 발생했습니다.";
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "네트워크 오류가 발생했습니다." }]);
    } finally {
      setLoading(false);
    }
  }

  const vs = homeName && awayName ? `${homeName} vs ${awayName}` : "이 경기";
  const visible = !!me?.nickname;

  // 전역 플로팅 챗봇(layout)에게 자리를 넘겨받는다 — 우하단이 겹치기 때문.
  // 비회원이라 이 챗봇이 안 뜨면 false 를 보내 전역 챗봇이 그대로 남게 한다.
  useEffect(() => {
    setMatchChatMounted(visible);
    return () => setMatchChatMounted(false);
  }, [visible]);

  // 본문 인라인 프롬프트 박스(MatchChatCta, PREVIEW 글)가 쏘는 열기 신호.
  // 질문이 실려 오면 창을 열고 바로 전송한다.
  useEffect(() => {
    const onAsk = (e: Event) => {
      setOpen(true);
      const q = (e as CustomEvent<{ question?: string }>).detail?.question?.trim();
      if (q) setPending(q);
    };
    window.addEventListener("scorebase:match-chat-ask", onAsk);
    return () => window.removeEventListener("scorebase:match-chat-ask", onAsk);
  }, []);
  useEffect(() => {
    if (pending == null || loading) return;
    const q = pending;
    setPending(null);
    void ask(q);
    // ask 는 렌더마다 새 함수라 deps 에 넣으면 매 렌더 재실행 — pending 가드로 1회만 태운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, loading]);

  // 회원 한정 노출 (2026-08-12) — 실험 단계 과금 노출면 축소. 서버(/api/match-chat)도
  // 같은 조건으로 401 을 내므로 여기는 표시 게이트일 뿐이다(방어는 서버가 한다).
  // useMe 는 localStorage 캐시가 있어 하드로드 직후에도 회원 여부를 바로 안다 → 깜빡임 없음.
  if (!visible) return null;

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-50 flex max-h-[70vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 text-xs font-bold text-white">
                AI
              </span>
              <span className="text-sm font-semibold">경기 AI 챗봇</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="text-xl leading-none text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              ×
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {vs}에 대해 궁금한 걸 물어보세요. 예측·배당·최근 폼을 근거로 답해드려요.
              </p>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-neutral-900"
                      : "max-w-[90%] whitespace-pre-line rounded-2xl bg-neutral-100 px-3 py-2 text-sm leading-relaxed text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
            {msgs.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => ask(c)}
                    className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 transition hover:border-cyan-400 hover:text-cyan-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-cyan-500 dark:hover:text-cyan-400"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") ask(input);
                }}
                placeholder="직접 물어보기"
                className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-cyan-400 dark:border-neutral-700 dark:bg-neutral-900"
              />
              <button
                onClick={() => ask(input)}
                disabled={loading || !input.trim()}
                aria-label="보내기"
                className="rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
              >
                전송
              </button>
            </div>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
              AI 분석은 참고용이며 베팅을 권유하지 않습니다.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="AI 챗봇 열기"
        className="fixed bottom-6 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 sm:right-6"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/20 text-[11px] font-bold">
          AI
        </span>
        {open ? "닫기" : "이 경기 물어보기"}
      </button>
    </>
  );
}
