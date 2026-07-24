// 프로필 꾸미기 상점 카탈로그 — 포인트 소비처. 구매/장착은 account/shop actions, 이력은 ExpLog.
// 아이템 id 는 DB(User.nameColor/avatarFrame, UserCosmetic.itemId)에 저장되므로 변경 금지(추가만).

export type CosmeticType = "nameColor" | "avatarFrame";

export interface ShopItem {
  id: string;
  type: CosmeticType;
  name: string;
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
