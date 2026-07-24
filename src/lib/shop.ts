// 프로필 꾸미기 상점 카탈로그 — 포인트 소비처. 구매/장착은 account/shop actions, 이력은 ExpLog.
// 아이템 id 는 DB(User.nameColor/avatarFrame, UserCosmetic.itemId)에 저장되므로 변경 금지(추가만).

export type CosmeticType = "nameColor" | "avatarFrame" | "title";

export interface ShopItem {
  id: string;
  type: CosmeticType;
  name: string; // 상점 표시명. title 타입은 이 값이 닉네임 옆 칭호 텍스트로도 쓰임.
  price: number; // 구매 포인트
  /** nameColor 전용 — 닉네임 색(hex). gradient=true 면 무지개 특수 렌더(color 무시). */
  color?: string;
  gradient?: boolean;
  /** avatarFrame 전용 — 아바타 테두리 ring tailwind 클래스. */
  ring?: string;
}

/** 상점 아이템 단일 진실. id 는 영구(추가만, 삭제·재사용 금지). */
export const SHOP_ITEMS: readonly ShopItem[] = [
  // 닉네임 색상
  { id: "color-blue", type: "nameColor", name: "블루", price: 500, color: "#3b82f6" },
  { id: "color-green", type: "nameColor", name: "그린", price: 500, color: "#22c55e" },
  { id: "color-purple", type: "nameColor", name: "퍼플", price: 800, color: "#a855f7" },
  { id: "color-red", type: "nameColor", name: "레드", price: 800, color: "#ef4444" },
  { id: "color-gold", type: "nameColor", name: "골드", price: 1500, color: "#f59e0b" },
  { id: "color-rainbow", type: "nameColor", name: "무지개", price: 2500, gradient: true },
  // 아바타 프레임
  { id: "frame-silver", type: "avatarFrame", name: "실버 링", price: 1000, ring: "ring-2 ring-slate-300" },
  { id: "frame-gold", type: "avatarFrame", name: "골드 링", price: 1500, ring: "ring-2 ring-amber-400" },
  {
    id: "frame-neon",
    type: "avatarFrame",
    name: "네온",
    price: 2000,
    ring: "ring-2 ring-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.85)]",
  },
  {
    id: "frame-fire",
    type: "avatarFrame",
    name: "불꽃",
    price: 2500,
    ring: "ring-2 ring-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.85)]",
  },
  // 칭호 — 닉네임 옆 배지. name 이 곧 칭호 텍스트.
  { id: "title-rookie", type: "title", name: "새내기", price: 500 },
  { id: "title-sharp", type: "title", name: "승부사", price: 1000 },
  { id: "title-veteran", type: "title", name: "고인물", price: 1500 },
  { id: "title-hitking", type: "title", name: "적중왕", price: 2000 },
  { id: "title-prophet", type: "title", name: "예언자", price: 2500 },
  { id: "title-god", type: "title", name: "분석의신", price: 3000 },
] as const;

/** id → 아이템. 없거나 null 이면 null. */
export function shopItemById(id: string | null | undefined): ShopItem | null {
  if (!id) return null;
  return SHOP_ITEMS.find((it) => it.id === id) ?? null;
}

/** 종류별 아이템 목록 (상점 진열 순서 = 배열 순서). */
export function shopItemsByType(type: CosmeticType): ShopItem[] {
  return SHOP_ITEMS.filter((it) => it.type === type);
}

/** 무지개 닉네임 그라데이션 클래스 (bg-clip-text). 렌더 지점 공통. */
export const RAINBOW_NAME_CLASS =
  "bg-gradient-to-r from-rose-500 via-amber-400 to-violet-500 bg-clip-text text-transparent";

/** 칭호 배지 클래스 — 닉네임 앞 pill. 렌더 지점 공통. */
export const TITLE_BADGE_CLASS =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300";
