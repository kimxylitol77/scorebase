// 순위표 시즌 전환 칩 — 현재 시즌(/standings/[league]) ↔ 아카이브 시즌(/standings/[league]/[season]).
// 지난 시즌 목록은 SeasonStandingsArchive 정본. 아카이브가 없는 리그는 아무것도 렌더하지 않는다.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { seasonLabelFor } from "@/lib/sports/season-calendar";
import { resolveSeasonYear } from "@/lib/sports/season-registry";

export default async function StandingsSeasonNav({
  league,
  active,
  basePath = "/standings",
}: {
  league: string;
  /** "current" = 현재 시즌 페이지, 그 외 = 보고 있는 아카이브 시즌 라벨 */
  active: "current" | string;
  /** 순위표(/standings) 외에 예측 결산(/predictions)도 같은 칩을 쓴다 */
  basePath?: "/standings" | "/predictions";
}) {
  let past: string[] = [];
  try {
    const currentLabel = seasonLabelFor(league, await resolveSeasonYear(league));
    const rows = await prisma.seasonStandingsArchive.findMany({
      where: { league, seasonLabel: { not: currentLabel } },
      orderBy: { seasonLabel: "desc" },
      select: { seasonLabel: true, rows: true },
    });
    past = rows.filter((r) => Array.isArray(r.rows) && r.rows.length > 0).map((r) => r.seasonLabel);
  } catch {
    return null; // 시즌 판정·조회 실패는 칩만 생략 — 순위표 본문은 영향 없음
  }
  if (past.length === 0) return null;

  const chip = (isActive: boolean) =>
    `rounded-full px-3 py-1 text-[11px] font-semibold transition ${
      isActive
        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
    }`;

  return (
    <nav className="flex flex-wrap items-center gap-1.5" aria-label="시즌 선택">
      <span className="text-[11px] text-neutral-500 mr-0.5">시즌</span>
      <Link href={`${basePath}/${league}`} className={chip(active === "current")}>
        이번 시즌
      </Link>
      {past.map((s) => (
        <Link key={s} href={`${basePath}/${league}/${s}`} className={chip(active === s)}>
          {s}
        </Link>
      ))}
    </nav>
  );
}
