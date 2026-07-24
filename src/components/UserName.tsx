// 회원 닉네임 렌더 — 상점에서 장착한 색상(nameColor)·칭호(title) 반영. 미장착이면 평범한 텍스트.
// 서버/클라 공용 순수 컴포넌트. 렌더 지점(글·댓글·리더보드·프로필)에서 재사용.
import { shopItemById, RAINBOW_NAME_CLASS, TITLE_BADGE_CLASS } from "@/lib/shop";

export default function UserName({
  name,
  nameColor,
  title,
  className = "",
}: {
  name: string;
  nameColor?: string | null;
  title?: string | null;
  className?: string;
}) {
  const colorItem = shopItemById(nameColor);
  const nameEl = colorItem?.gradient ? (
    <span className={`${RAINBOW_NAME_CLASS} ${className}`}>{name}</span>
  ) : colorItem?.color ? (
    <span className={className} style={{ color: colorItem.color }}>
      {name}
    </span>
  ) : (
    <span className={className}>{name}</span>
  );

  const titleItem = shopItemById(title);
  if (!titleItem) return nameEl; // 칭호 없으면 기존 동작(단일 span) 유지

  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className={TITLE_BADGE_CLASS}>{titleItem.name}</span>
      {nameEl}
    </span>
  );
}
