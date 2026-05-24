// 라이브 페이지 상단 — 매치 관련 빠른 이동 버튼.
// 프리뷰 / 리뷰 / 부상자 명단.

import Link from "next/link";

interface Props {
  previewSlug: string | null;
  recapSlug: string | null;
  matchStatus: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  /** 리그 코드 — 부상자 명단 link 생성 (INJURY_LEAGUES 매칭 시) */
  league?: string;
}

// /injuries/[league] page 의 VALID 와 동일 — 실제 부상자 페이지가 있는 리그만 link 노출.
// 신규 리그 (K1/J1/SAUDI/EREDIVISIE 등) 는 페이지 없으니 link 제거해 404 방지.
const INJURY_LEAGUES = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS",
]);

export default function MatchArticleLinks({
  previewSlug,
  recapSlug,
  matchStatus,
  league,
}: Props) {
  // 경기 종료면 RECAP 우선, 그 외엔 PREVIEW 우선
  const showPreview = previewSlug && matchStatus !== "FINISHED";
  const showRecap = recapSlug && matchStatus === "FINISHED";
  // FINISHED 면 PREVIEW 도 함께 표시 (참고용)
  const previewAsRef = previewSlug && matchStatus === "FINISHED";
  const showInjury = league && INJURY_LEAGUES.has(league);

  if (!showPreview && !showRecap && !previewAsRef && !showInjury) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {showRecap && (
        <Link
          href={`/articles/${recapSlug}`}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          📝 경기 리뷰 보기
        </Link>
      )}
      {showPreview && (
        <Link
          href={`/articles/${previewSlug}`}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition"
        >
          📊 경기 프리뷰 보기
        </Link>
      )}
      {previewAsRef && (
        <Link
          href={`/articles/${previewSlug}`}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 transition"
        >
          📊 프리뷰
        </Link>
      )}
      {showInjury && (
        <Link
          href={`/injuries/${league}`}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25 transition"
        >
          🩹 부상자 명단
        </Link>
      )}
    </div>
  );
}
