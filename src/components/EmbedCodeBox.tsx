"use client";
// 임베드 코드 복사 박스 — 위젯 iframe + 출처 백링크 스니펫을 클립보드로 복사.
import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function EmbedCodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard 차단 환경: textarea 선택 fallback
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
      document.body.removeChild(ta);
    }
  };
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.03] p-3 pr-12 text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-all">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold hover:opacity-90 transition"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}
