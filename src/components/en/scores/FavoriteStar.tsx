// scores__FavoriteStar (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

"use client";

import { useFavorites, type FavMeta } from "../../scores/useFavorites";

interface Props {
  matchId: string;
  /** 즐겨찾기 시 함께 저장할 경기 스냅샷 — PiP 가 종료·예정 경기도 표시하는 데 사용 */
  meta?: FavMeta;
  /** 카드가 Link 로 감싸진 경우 navigation 막기 */
  stopPropagation?: boolean;
  /** 라벨 표시 — 별만 있으면 뜻이 안 읽히는 상세 페이지 헤더용. /scores 행은 미지정(아이콘만). */
  showLabel?: boolean;
  className?: string;
}

export default function FavoriteStar({
  matchId,
  meta,
  stopPropagation = true,
  showLabel = false,
  className = "",
}: Props) {
  const { isFav, toggle, mounted } = useFavorites();
  const fav = mounted && isFav(matchId);

  return (
    <button
      type="button"
      aria-label={fav ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={fav}
      onClick={(e) => {
        if (stopPropagation) {
          e.preventDefault();
          e.stopPropagation();
        }
        toggle(matchId, meta);
      }}
      className={`inline-flex items-center justify-center rounded-md transition ${
        showLabel ? "gap-1 h-7 px-2" : "w-7 h-7"
      } ${
        fav
          ? "text-amber-400 hover:bg-amber-500/10"
          : "text-neutral-400 hover:text-amber-400 hover:bg-neutral-500/10"
      } ${className}`}
    >
      {/* 채워진 별 / 빈 별 SVG */}
      {fav ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l2.99 6.06 6.69.97-4.84 4.72 1.14 6.65L12 17.27l-5.98 3.14 1.14-6.65L2.32 9.03l6.69-.97L12 2z" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="M12 2l2.99 6.06 6.69.97-4.84 4.72 1.14 6.65L12 17.27l-5.98 3.14 1.14-6.65L2.32 9.03l6.69-.97L12 2z" />
        </svg>
      )}
      {showLabel && (
        <span className="text-[11px] font-semibold whitespace-nowrap">
          {fav ? "Starred" : "Star"}
        </span>
      )}
    </button>
  );
}
