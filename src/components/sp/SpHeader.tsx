// sportspredictions.live 헤더 — 로고 텍스트 + 4개 메뉴. 로그인 없음(열람 전용).
import Link from "next/link";
import { SP_NAME } from "@/lib/sp/site";

const NAV = [
  { href: "/", label: "Predictions" },
  { href: "/accuracy", label: "Accuracy" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
];

export default function SpHeader() {
  return (
    <header className="sticky top-0 z-40 border-b" style={{ borderColor: "var(--sp-border)", background: "rgba(6,10,30,0.85)", backdropFilter: "blur(10px)" }}>
      <div className="sp-container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="sp-display text-lg font-extrabold tracking-tight" aria-label={SP_NAME}>
          SPORTS<span style={{ color: "var(--sp-lime)" }}>PREDICTIONS</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 overflow-x-auto">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors"
              style={{ color: "var(--sp-fg-muted)" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
