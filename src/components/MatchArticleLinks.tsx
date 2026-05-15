// 라이브 페이지 상단 — 매치 관련 article 빠른 이동 버튼.
// 경기 전: PREVIEW 링크. 경기 후: RECAP 링크. 둘 다 있으면 둘 다.

import Link from "next/link";

interface Props {
  previewSlug: string | null;
  recapSlug: string | null;
  matchStatus: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
}

export default function MatchArticleLinks({
  previewSlug,
  recapSlug,
  matchStatus,
}: Props) {
  // 경기 종료면 RECAP 우선, 그 외엔 PREVIEW 우선
  const showPreview = previewSlug && matchStatus !== "FINISHED";
  const showRecap = recapSlug && matchStatus === "FINISHED";
  // FINISHED 면 PREVIEW 도 함께 표시 (참고용)
  const previewAsRef = previewSlug && matchStatus === "FINISHED";

  if (!showPreview && !showRecap && !previewAsRef) return null;

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
    </div>
  );
}
