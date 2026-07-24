// 회원 닉네임 렌더 — 상점에서 장착한 색상(nameColor) 반영. 색 미장착이면 평범한 텍스트.
// 서버/클라 공용 순수 컴포넌트. 렌더 지점(글·댓글·리더보드·프로필)에서 재사용.
import { shopItemById, RAINBOW_NAME_CLASS } from "@/lib/shop";

export default function UserName({
  name,
  nameColor,
  className = "",
}: {
  name: string;
  nameColor?: string | null;
  className?: string;
}) {
  const item = shopItemById(nameColor);
  if (item?.gradient) {
    return <span className={`${RAINBOW_NAME_CLASS} ${className}`}>{name}</span>;
  }
  if (item?.color) {
    return (
      <span className={className} style={{ color: item.color }}>
        {name}
      </span>
    );
  }
  return <span className={className}>{name}</span>;
}
