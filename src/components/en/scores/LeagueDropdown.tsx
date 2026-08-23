// scores__LeagueDropdown (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { enLeagueName } from "@/lib/i18n/en";

interface Props {
  leagues: string[];
  activeLeague?: string | null;
  sport: string;
  date: string;
}

export default function LeagueDropdown({
  leagues,
  activeLeague,
  sport,
  date,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDocClick);
        document.removeEventListener("keydown", onKey);
      };
    }
  }, [open]);

  if (leagues.length <= 1) return null;

  const baseHref = `/scores?sport=${sport}&date=${date}`;
  const currentLabel = activeLeague
    ? enLeagueName(activeLeague)
    : "All";

  return (
    <div ref={ref} className="relative inline-block w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full sm:w-auto flex items-center justify-between gap-2 px-4 py-2 rounded-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-semibold text-neutral-900 dark:text-white hover:border-neutral-500 transition"
      >
        <span className="truncate">{currentLabel}</span>
        <svg
          className={`shrink-0 w-4 h-4 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-30 left-0 right-0 sm:right-auto sm:min-w-[240px] mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg ring-1 ring-black/5"
        >
          <ul className="py-1">
            <li>
              <Link
                href={baseHref}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm transition ${
                  !activeLeague
                    ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-semibold"
                    : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                }`}
                role="option"
                aria-selected={!activeLeague}
              >
                All
              </Link>
            </li>
            {leagues.map((l) => {
              const isActive = activeLeague === l;
              return (
                <li key={l}>
                  <Link
                    href={`${baseHref}&league=${l}`}
                    onClick={() => setOpen(false)}
                    className={`block px-4 py-2 text-sm transition ${
                      isActive
                        ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-semibold"
                        : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                    }`}
                    role="option"
                    aria-selected={isActive}
                  >
                    {enLeagueName(l)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
