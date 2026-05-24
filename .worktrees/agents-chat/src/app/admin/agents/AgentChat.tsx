// /admin/agents 의 client 컴포넌트 — 페르소나 탭 + 채팅창.
"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONA_LIST, type Persona, type PersonaKey } from "@/lib/agents/personas";

interface Msg {
  id?: number;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string | null;
  createdAt?: string;
  pending?: boolean;
}

const COLOR_TO_CLASSES: Record<string, { bg: string; text: string; ring: string; activeBg: string }> = {
  amber:   { bg: "bg-amber-50 dark:bg-amber-500/10",     text: "text-amber-700 dark:text-amber-300",     ring: "ring-amber-400",     activeBg: "bg-amber-500" },
  rose:    { bg: "bg-rose-50 dark:bg-rose-500/10",       text: "text-rose-700 dark:text-rose-300",       ring: "ring-rose-400",      activeBg: "bg-rose-500" },
  fuchsia: { bg: "bg-fuchsia-50 dark:bg-fuchsia-500/10", text: "text-fuchsia-700 dark:text-fuchsia-300", ring: "ring-fuchsia-400",   activeBg: "bg-fuchsia-500" },
  blue:    { bg: "bg-blue-50 dark:bg-blue-500/10",       text: "text-blue-700 dark:text-blue-300",       ring: "ring-blue-400",      activeBg: "bg-blue-500" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-400",   activeBg: "bg-emerald-500" },
};

export default function AgentChat() {
  const [activeKey, setActiveKey] = useState<PersonaKey>("engineering");
  const [messagesByPersona, setMessagesByPersona] = useState<Record<PersonaKey, Msg[]>>({
    legal: [], marketing: [], design: [], engineering: [], seo: [],
  });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const persona = PERSONA_LIST.find((p) => p.key === activeKey)!;
  const messages = messagesByPersona[activeKey];
  const color = COLOR_TO_CLASSES[persona.color] ?? COLOR_TO_CLASSES.blue;

  // 페르소나 전환 시 history 로드 (캐시 없으면)
  useEffect(() => {
    if (messages.length > 0) return;
    fetch(`/api/admin/agents/history?persona=${activeKey}`)
      .then((r) => r.json())
      .then((d: { messages?: Msg[] }) => {
        if (d.messages) {
          setMessagesByPersona((m) => ({ ...m, [activeKey]: d.messages! }));
        }
      })
      .catch(() => {});
  }, [activeKey, messages.length]);

  // 메시지 추가될 때 스크롤 맨 아래로
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");

    // optimistic — 사용자 메시지 즉시 표시
    const userMsg: Msg = { role: "user", content: text };
    setMessagesByPersona((m) => ({
      ...m,
      [activeKey]: [...m[activeKey], userMsg, { role: "assistant", content: "...", pending: true }],
    }));

    try {
      const r = await fetch("/api/admin/agents/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona: activeKey, message: text }),
      });
      const data = (await r.json()) as { reply?: string; model?: string; error?: string; detail?: string };
      if (!r.ok || !data.reply) {
        throw new Error(data.detail || data.error || `HTTP ${r.status}`);
      }
      // pending 제거 + 실제 응답
      setMessagesByPersona((m) => ({
        ...m,
        [activeKey]: [
          ...m[activeKey].slice(0, -1),
          { role: "assistant", content: data.reply!, model: data.model },
        ],
      }));
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setMessagesByPersona((m) => ({
        ...m,
        [activeKey]: [
          ...m[activeKey].slice(0, -1),
          { role: "assistant", content: `❌ 오류: ${errMsg}` },
        ],
      }));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <header>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">에이전트 회의실</h1>
        <p className="text-sm text-neutral-500 mt-1">
          5명의 전문 에이전트와 채팅. 페르소나마다 대화 기록은 영구 보관 (DB).
        </p>
      </header>

      {/* 페르소나 탭 */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        {PERSONA_LIST.map((p) => {
          const isActive = p.key === activeKey;
          const c = COLOR_TO_CLASSES[p.color] ?? COLOR_TO_CLASSES.blue;
          return (
            <button
              key={p.key}
              onClick={() => setActiveKey(p.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                isActive
                  ? `${c.activeBg} text-white shadow-md`
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              <span aria-hidden>{p.emoji}</span>
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>

      <div className={`text-xs ${color.text}`}>{persona.description}</div>

      {/* 채팅창 */}
      <div
        ref={scrollRef}
        className="h-[55vh] sm:h-[60vh] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/40 overflow-y-auto p-3 sm:p-4 space-y-3"
      >
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-sm text-neutral-400">
            {persona.emoji} {persona.name} 에이전트와 대화를 시작하세요.
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={m.id ?? i} msg={m} color={color} />
        ))}
      </div>

      {/* 입력창 */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`${persona.name} 에이전트에게 질문 (Enter 전송, Shift+Enter 줄바꿈)`}
          rows={3}
          disabled={sending}
          className="w-full resize-none bg-transparent focus:outline-none text-sm placeholder:text-neutral-400"
        />
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-neutral-400">
            {persona.emoji} {persona.name} · {sending ? "응답 중..." : "준비됨"}
          </div>
          <button
            type="button"
            onClick={send}
            disabled={sending || !input.trim()}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold text-white transition ${color.activeBg} disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90`}
          >
            전송
          </button>
        </div>
      </div>
    </main>
  );
}

function MessageBubble({
  msg,
  color,
}: {
  msg: Msg;
  color: { bg: string; text: string; ring: string; activeBg: string };
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
            : `${color.bg} ${color.text} border border-current/10`
        } ${msg.pending ? "animate-pulse" : ""}`}
      >
        {msg.content}
        {msg.model && !isUser && (
          <div className="text-[10px] opacity-60 mt-1.5 font-mono">{msg.model}</div>
        )}
      </div>
    </div>
  );
}
