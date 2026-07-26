"use client";
// 한/영 전환 링크 — 현재 경로를 상대 언어의 대응 경로로 매핑 (미지원 경로는 각 언어 홈).
import Link from "next/link";
import { usePathname } from "next/navigation";

// /en 에서 커버하는 한국어 경로 prefix — 이 밖의 경로는 /en 홈으로 보냄.
const EN_COVERED = /^\/(standings|predictions|scores)(\/|$)/;

export function toEnPath(pathname: string): string {
  if (pathname === "/" || pathname === "") return "/en";
  if (EN_COVERED.test(pathname)) return `/en${pathname}`;
  return "/en";
}

export function toKoPath(pathname: string): string {
  const stripped = pathname.replace(/^\/en(?=\/|$)/, "");
  return stripped === "" ? "/" : stripped;
}

export default function LangSwitch({ target }: { target: "en" | "ko" }) {
  const pathname = usePathname() ?? "/";
  const href = target === "en" ? toEnPath(pathname) : toKoPath(pathname);
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-neutral-500 dark:text-neutral-400 ring-1 ring-neutral-300 dark:ring-neutral-700 hover:text-neutral-900 dark:hover:text-white hover:ring-neutral-500 transition whitespace-nowrap"
      aria-label={target === "en" ? "Switch to English" : "한국어로 전환"}
    >
      {target === "en" ? "EN" : "한국어"}
    </Link>
  );
}
