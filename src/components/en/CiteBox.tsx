// 데이터 인용 유도 박스 (영어판) — 출처·링크 원클릭 복사. scripts/en-mirror 로 자동 생성.
"use client";
// 데이터 페이지 인용 유도 박스 — 출처 문구·링크 원클릭 복사 (백링크 자석)

import { useState } from "react";

export default function CiteBox({
  citation,
  url,
}: {
  citation: string;
  url: string;
}) {
  const [copied, setCopied] = useState<"cite" | "link" | null>(null);

  const copy = async (text: string, which: "cite" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard 미지원/권한 거부 — 사용자가 박스 텍스트를 직접 선택 복사 가능
    }
  };

  return (
    <aside className="mt-8 rounded-[1.25rem] bg-zinc-100 px-5 py-4 text-xs leading-relaxed text-zinc-600 ring-1 ring-black/5 dark:bg-white/[0.04] dark:text-white/55 dark:ring-white/10">
      <div className="mb-2 font-semibold text-zinc-900 dark:text-white">
        Cite this data
      </div>
      <p className="mb-3">
        You are free to use these figures in blogs and articles as long as you credit the source below.
        Wholesale copying or redistribution is not permitted.
      </p>
      <div className="select-all break-keep rounded-lg bg-white px-3 py-2 text-[11px] text-zinc-700 ring-1 ring-black/5 dark:bg-black/20 dark:text-white/70 dark:ring-white/10">
        {citation}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => copy(citation, "cite")}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-white/90"
        >
          {copied === "cite" ? "Copied ✓" : "Copy citation"}
        </button>
        <button
          type="button"
          onClick={() => copy(url, "link")}
          className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-700 ring-1 ring-black/10 transition hover:bg-zinc-50 dark:bg-white/10 dark:text-white dark:ring-white/15 dark:hover:bg-white/15"
        >
          {copied === "link" ? "Copied ✓" : "Copy link"}
        </button>
      </div>
    </aside>
  );
}
