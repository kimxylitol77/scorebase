"use client";
// PREVIEW 글 본문의 "이 경기 핵심 포인트 물어보기" 인라인 프롬프트 박스.
// 자체 채팅 UI 를 만들지 않는다 — 질문을 CustomEvent 로 실어 보내면 같은 페이지의
// 플로팅 MatchChat 이 열리며 전송한다(회원 게이트·요금 방어는 그 경로가 이미 가짐).
import { useState } from "react";
import { useMe } from "@/components/use-me";

const CHIPS = ["이 경기 핵심 포인트는?", "누가 이길까?", "최근 폼 어때?"];

export default function MatchChatCta({ homeName, awayName }: { homeName?: string; awayName?: string }) {
  const me = useMe();
  const [input, setInput] = useState("");
  const member = !!me?.nickname;
  const vs = homeName && awayName ? `${homeName} vs ${awayName}` : "이 경기";

  function send(q: string) {
    const question = q.trim();
    if (!question) return;
    setInput("");
    window.dispatchEvent(new CustomEvent("scorebase:match-chat-ask", { detail: { question } }));
  }

  return (
    <section className="my-6 rounded-2xl border border-cyan-200/60 bg-cyan-50/40 p-4 dark:border-cyan-900/40 dark:bg-cyan-950/20">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 text-xs font-bold text-white">
          AI
        </span>
        <h2 className="text-sm font-bold">이 경기 핵심 포인트 물어보기</h2>
      </div>
      <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
        {vs}의 H2H·최근 폼·예측 확률 데이터를 근거로 답해드려요.
      </p>
      {member ? (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => send(c)}
                className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:border-cyan-400 hover:text-cyan-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-cyan-500 dark:hover:text-cyan-400"
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send(input);
              }}
              placeholder="자연어로 자유롭게 질문하세요"
              className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-400 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
            >
              질문
            </button>
          </div>
        </>
      ) : (
        <a
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          로그인하고 물어보기 (무료)
        </a>
      )}
    </section>
  );
}
