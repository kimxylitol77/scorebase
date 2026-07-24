"use client";

// 상점 아이템 그리드 — 종류별 진열 + 구매/장착/해제. 구매 결과 메시지는 상단 배너.
import { useActionState } from "react";
import {
  purchaseCosmeticAction,
  equipCosmeticAction,
  unequipCosmeticAction,
  type PurchaseState,
} from "./actions";
import { shopItemsByType, RAINBOW_NAME_CLASS, type ShopItem, type CosmeticType } from "@/lib/shop";

const SECTIONS: { type: CosmeticType; label: string }[] = [
  { type: "nameColor", label: "닉네임 색상" },
  { type: "avatarFrame", label: "아바타 프레임" },
];

export default function ShopGrid({
  points,
  ownedIds,
  equipped,
}: {
  points: number;
  ownedIds: string[];
  equipped: { nameColor: string | null; avatarFrame: string | null };
}) {
  const [state, purchase, pending] = useActionState<PurchaseState, FormData>(
    purchaseCosmeticAction,
    null,
  );
  const owned = new Set(ownedIds);

  return (
    <div className="space-y-6">
      {state?.message && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
          {state.message}
        </div>
      )}
      {state?.error && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
          {state.error}
        </div>
      )}

      {SECTIONS.map((sec) => (
        <section
          key={sec.type}
          className="rounded-3xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none overflow-hidden"
        >
          <div className="px-5 py-3.5 text-sm font-semibold border-b border-black/5 dark:border-white/10">
            {sec.label}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
            {shopItemsByType(sec.type).map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                points={points}
                isOwned={owned.has(item.id)}
                isEquipped={equipped[item.type] === item.id}
                purchase={purchase}
                pending={pending}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ItemCard({
  item,
  points,
  isOwned,
  isEquipped,
  purchase,
  pending,
}: {
  item: ShopItem;
  points: number;
  isOwned: boolean;
  isEquipped: boolean;
  purchase: (fd: FormData) => void;
  pending: boolean;
}) {
  const canAfford = points >= item.price;

  return (
    <div
      className={`flex flex-col items-center rounded-2xl border p-3 text-center transition-colors ${
        isEquipped
          ? "border-blue-400 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-500/10"
          : "border-black/5 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.03]"
      }`}
    >
      <Preview item={item} />
      <div className="mt-2 text-xs font-semibold">{item.name}</div>

      {isEquipped ? (
        <form action={unequipCosmeticAction} className="mt-2 w-full">
          <input type="hidden" name="type" value={item.type} />
          <button
            type="submit"
            className="w-full rounded-xl bg-blue-500 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-600 transition-colors"
          >
            장착 중 · 해제
          </button>
        </form>
      ) : isOwned ? (
        <form action={equipCosmeticAction} className="mt-2 w-full">
          <input type="hidden" name="itemId" value={item.id} />
          <button
            type="submit"
            className="w-full rounded-xl bg-neutral-800 py-1.5 text-[11px] font-semibold text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
          >
            장착
          </button>
        </form>
      ) : (
        <form action={purchase} className="mt-2 w-full">
          <input type="hidden" name="itemId" value={item.id} />
          <button
            type="submit"
            disabled={pending || !canAfford}
            className="w-full rounded-xl bg-emerald-500 py-1.5 text-[11px] font-semibold text-white enabled:hover:bg-emerald-600 disabled:opacity-40 transition-colors"
          >
            {canAfford ? `${item.price.toLocaleString()}P 구매` : "포인트 부족"}
          </button>
        </form>
      )}
    </div>
  );
}

/** 아이템 미리보기 — 색상은 샘플 닉네임, 프레임은 링 두른 원. */
function Preview({ item }: { item: ShopItem }) {
  if (item.type === "nameColor") {
    if (item.gradient) {
      return <span className={`text-lg font-extrabold ${RAINBOW_NAME_CLASS}`}>가나다</span>;
    }
    return (
      <span className="text-lg font-extrabold" style={{ color: item.color }}>
        가나다
      </span>
    );
  }
  // avatarFrame
  return (
    <span
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-300 text-lg dark:bg-neutral-600 ${item.ring ?? ""}`}
      aria-hidden
    >
      ⚽
    </span>
  );
}
