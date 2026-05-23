"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

interface Props {
  /** "icon" 만 (헤더용) | "full" 라벨 포함 (모바일 메뉴용) */
  variant?: "icon" | "full";
}

export default function ThemeToggle({ variant = "icon" }: Props) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    // dark/light 별 background/color 도 함께 갱신 — flash 방지 (다음 새로고침 SSR 도 cookie 인식)
    const h = document.documentElement;
    if (next === "dark") {
      h.style.backgroundColor = "#0a0a0a";
      h.style.color = "#ededed";
      h.style.colorScheme = "dark";
    } else {
      h.style.backgroundColor = "#ffffff";
      h.style.color = "#0a0a0a";
      h.style.colorScheme = "light";
    }
    try {
      localStorage.setItem("theme", next);
      document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
    setTheme(next);
  }

  // FOUC 방지를 위해 마운트 전에는 같은 크기의 placeholder
  if (!mounted) {
    if (variant === "full") {
      return <div className="h-10" aria-hidden />;
    }
    return <div className="w-10 h-10" aria-hidden />;
  }

  const next = theme === "dark" ? "라이트 모드" : "다크 모드";

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
        aria-label={`${next}로 전환`}
      >
        <span className="w-5 h-5 flex items-center justify-center">
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </span>
        <span className="text-sm font-medium flex-1 text-left">
          {theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${next}로 전환`}
      title={`${next}로 전환`}
      className="inline-flex items-center justify-center w-10 h-10 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
