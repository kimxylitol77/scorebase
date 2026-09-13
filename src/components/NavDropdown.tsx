"use client";
// 헤더 카테고리 드롭다운 — hover(CSS) 는 그대로, 키보드·스크린리더용 disclosure 버튼과 현재 경로 활성 표시를 더한다.
// 라벨은 <Link>(클릭 = 대표 페이지), 화살표는 button[aria-expanded] — Enter/Space 로 열고 닫고, Escape·포커스 이탈로 닫는다.
// 닫힌 패널은 visibility:hidden 이라 그 안의 링크는 Tab 순서에서 빠진다(다음 메뉴로 바로 넘어감).
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { isCategoryActive, type NavCategory } from "./nav-config";
import { openChat } from "@/lib/open-chat-event";

export default function NavDropdown({ label, href, items, owns }: NavCategory) {
  const pathname = usePathname();
  const active = isCategoryActive({ label, href, items, owns }, pathname ?? "");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const hasMenu = items.length > 1;

  return (
    <div
      ref={rootRef}
      className="relative group"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }}
      onBlur={(e) => {
        // 포커스가 드롭다운 밖으로 나가면 닫는다(다른 메뉴로 Tab 이동 등)
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <span
        className={`inline-flex items-center rounded-full transition whitespace-nowrap ${
          active
            ? "bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-white"
            : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900"
        }`}
        data-active={active || undefined}
      >
        <Link
          href={href}
          className={`inline-flex items-center pl-2 2xl:pl-3 py-1.5 ${hasMenu ? "pr-1" : "pr-2 2xl:pr-3"} rounded-full ${active ? "font-semibold" : "font-medium"}`}
          aria-current={active ? "true" : undefined}
        >
          {label}
        </Link>
        {hasMenu && (
          <button
            type="button"
            aria-label={`${label} 메뉴 ${open ? "닫기" : "열기"}`}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center justify-center pl-0.5 pr-1.5 2xl:pr-2 py-1.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
          >
            <svg
              className={`w-3 h-3 transition ${open ? "opacity-100 rotate-180" : "opacity-50 group-hover:opacity-100 group-hover:rotate-180"}`}
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden
            >
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </span>

      {hasMenu && (
        <div
          id={panelId}
          className={`absolute left-0 top-full pt-2 transition-opacity duration-150 ${
            open ? "opacity-100 visible" : "opacity-0 invisible group-hover:opacity-100 group-hover:visible"
          }`}
        >
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl shadow-neutral-900/10 dark:shadow-black/40 p-1.5 min-w-[220px]">
            {items.map((it) =>
              it.action === "open-chat" ? (
                // 동작 항목 — 플로팅 챗봇을 연다(링크 아님). 헤더 우측 버튼이던 것을 폭 문제로 여기로.
                <button
                  key={it.href}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openChat();
                  }}
                  className="flex w-full items-start gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-violet-50 dark:hover:bg-violet-500/10 transition"
                >
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-violet-700 dark:text-violet-300">{it.label}</span>
                    {it.desc && <span className="block text-[11px] text-neutral-500">{it.desc}</span>}
                  </span>
                </button>
              ) : (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-neutral-900 dark:text-white">{it.label}</span>
                    {it.desc && <span className="block text-[11px] text-neutral-500">{it.desc}</span>}
                  </span>
                </Link>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
