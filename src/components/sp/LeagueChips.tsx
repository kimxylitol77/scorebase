// 리그 칩 가로 스크롤 — 홈·리그 페이지 상단 내비.
import Link from "next/link";
import { SP_LEAGUES } from "@/lib/sp/leagues";

export default function LeagueChips({ active }: { active?: string }) {
  return (
    <nav aria-label="Leagues" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
      <Link href="/" className={`sp-chip ${!active ? "sp-chip-active" : ""}`}>All</Link>
      {SP_LEAGUES.map((l) => (
        <Link key={l.code} href={`/${l.slug}`} className={`sp-chip ${active === l.code ? "sp-chip-active" : ""}`}>{l.short}</Link>
      ))}
    </nav>
  );
}
