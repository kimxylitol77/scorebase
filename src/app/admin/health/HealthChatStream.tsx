// 채팅 UI 로 표시하는 봇 상태 — 좌측 = 필드 봇 보고, 우측 = 스코어베이스 AI 종합.

export interface ChatMessage {
  /** "bot" = 좌측 (감시 봇), "ai" = 우측 (스코어베이스 AI 비서) */
  side: "bot" | "ai";
  /** 표시 이름 */
  name: string;
  /** 본문 */
  text: string;
  /** "정상" | "지연" | "다운" | "경고" | "info" */
  tone?: "ok" | "warn" | "down" | "info";
  /** ISO 시각 */
  at: string;
}

function fmtKstShort(iso: string): string {
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export default function HealthChatStream({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] p-3 sm:p-4 space-y-2.5">
      {messages.map((m, i) => (
        <ChatBubble key={i} msg={m} />
      ))}
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isAi = msg.side === "ai";
  const toneRing: Record<NonNullable<ChatMessage["tone"]>, string> = {
    ok: "ring-emerald-400/40",
    warn: "ring-amber-400/40",
    down: "ring-rose-400/40",
    info: "ring-neutral-300/40",
  };
  const aiBg =
    "bg-blue-50 dark:bg-blue-500/15 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-500/30";
  const botBg =
    "bg-white dark:bg-white/[0.04] text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-white/10";
  return (
    <div className={`flex ${isAi ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%] sm:max-w-[75%] flex flex-col gap-0.5">
        <div
          className={`text-[10px] text-neutral-500 px-1 flex items-center gap-1 ${isAi ? "justify-end" : "justify-start"}`}
        >
          <span className="font-semibold">{msg.name}</span>
          <span className="text-neutral-400">·</span>
          <span className="tabular-nums">{fmtKstShort(msg.at)}</span>
        </div>
        <div
          className={`rounded-2xl px-3 py-2 text-[13px] sm:text-sm leading-relaxed border ${
            isAi ? aiBg : botBg
          } ${msg.tone ? `ring-1 ${toneRing[msg.tone]}` : ""} ${isAi ? "rounded-tr-sm" : "rounded-tl-sm"}`}
        >
          <pre className="whitespace-pre-wrap font-sans break-words">{msg.text}</pre>
        </div>
      </div>
    </div>
  );
}
