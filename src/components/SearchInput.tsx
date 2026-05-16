"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Props {
  /** "compact" 헤더용 작은 입력 / "full" /search 페이지용 큰 입력 */
  variant?: "compact" | "full";
  defaultValue?: string;
  autoFocus?: boolean;
  /** 모바일 메뉴에서 호출하면 메뉴 자동 닫음 */
  onSubmit?: () => void;
}

interface Suggestion {
  type: "team" | "player";
  id: number | string;
  name: string;
  subtitle: string;
  league: string;
  logoUrl?: string | null;
  href: string;
}

export default function SearchInput({
  variant = "compact",
  defaultValue = "",
  autoFocus = false,
  onSubmit,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 닫기
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // debounce 자동완성 fetch
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search/autocomplete?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (!r.ok) return;
        const j = (await r.json()) as { items?: Suggestion[] };
        setItems(j.items ?? []);
        setOpen(true);
      } catch {
        // ignore
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    setOpen(false);
    onSubmit?.();
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const inputClass =
    variant === "full"
      ? "w-full pl-11 pr-4 py-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      : "w-44 lg:w-56 pl-8 pr-3 py-1.5 rounded-full text-sm bg-neutral-100 dark:bg-neutral-900 border border-transparent hover:bg-neutral-200/70 dark:hover:bg-neutral-800 focus:outline-none focus:bg-white dark:focus:bg-neutral-950 focus:border-neutral-300 dark:focus:border-neutral-700 focus:ring-2 focus:ring-blue-500 transition";
  const iconClass =
    variant === "full"
      ? "absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400"
      : "absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none";

  return (
    <div ref={wrapRef} className="relative">
      <form onSubmit={handleSubmit} className="relative">
        <SearchIcon className={iconClass} />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder={variant === "full" ? "팀·선수·기사 검색" : "검색"}
          autoFocus={autoFocus}
          className={inputClass}
        />
      </form>

      {open && items.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 shadow-lg z-50 overflow-hidden max-h-80 overflow-y-auto min-w-[260px]">
          <ul>
            {items.map((it, i) => (
              <li key={`${it.type}-${it.id}-${i}`}>
                <Link
                  href={it.href}
                  prefetch={false}
                  onClick={() => {
                    setOpen(false);
                    onSubmit?.();
                  }}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-white/5 transition"
                >
                  {it.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-[9px] font-bold text-neutral-500 shrink-0">
                      {it.type === "team" ? "T" : "P"}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{it.name}</div>
                    <div className="text-[10px] text-neutral-500 truncate">{it.subtitle}</div>
                  </div>
                  <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                    {it.type === "team" ? "팀" : "선수"}
                  </span>
                </Link>
              </li>
            ))}
            <li className="border-t border-neutral-100 dark:border-white/5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSubmit?.();
                  router.push(`/search?q=${encodeURIComponent(value.trim())}`);
                }}
                className="w-full text-left px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 transition"
              >
                🔎 기사에서도 검색 →
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
