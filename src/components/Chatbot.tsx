"use client";

// 우측 하단 플로팅 챗봇. /api/chat 으로 POST.
// Phase 1 — 대화 히스토리는 클라이언트 메모리만 (새로고침 시 사라짐).

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const GREETING: Message = {
  role: "assistant",
  content:
    "안녕하세요! Scorebase 챗봇이에요.\n궁금한 점이나 버그·오류 제보를 남겨주세요. 운영자에게 전달해 드립니다.",
};

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 인사말은 서버에 보내지 않음 — 모델 system 과 중복.
        body: JSON.stringify({
          messages: next.filter((m) => m !== GREETING),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "응답 실패");
        setMessages(next);
      } else {
        setMessages([...next, { role: "assistant", content: data.reply }]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="챗봇 열기"
        style={{ bottom: "1.25rem", right: "1.25rem", top: "auto", left: "auto" }}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg transition hover:scale-105 dark:bg-white dark:text-neutral-900"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      style={{ bottom: "1.25rem", right: "1.25rem", top: "auto", left: "auto" }}
      className="fixed bottom-5 right-5 z-50 flex h-[min(560px,80dvh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
    >
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div>
          <p className="text-sm font-semibold">Scorebase 챗봇</p>
          <p className="text-xs text-neutral-500">데이터 기반 경기 Q&A</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="닫기"
          className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-neutral-900"
                : "mr-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 text-sm text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
            }
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-neutral-100 px-3 py-2 text-sm text-neutral-500 dark:bg-neutral-800">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
            </span>
          </div>
        )}
        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-neutral-200 p-3 dark:border-neutral-800"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="오늘 EPL 경기 알려줘"
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            전송
          </button>
        </div>
        <p className="mt-2 text-[10px] text-neutral-400">
          AI 답변은 참고용입니다. 데이터는 사이트 DB 기준.
        </p>
      </form>
    </div>
  );
}
