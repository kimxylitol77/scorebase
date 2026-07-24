// 포인트 상점 — 프로필 꾸미기(닉네임 색상·아바타 프레임) 구매·장착. 마이페이지 하위.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { USER_COOKIE_NAME, readUserSessionCookie } from "@/lib/user-auth";
import { resolveAvatar } from "@/lib/analysis/analysts";
import Avatar from "@/components/experts/Avatar";
import UserName from "@/components/UserName";
import AmbientGlow from "@/components/AmbientGlow";
import ShopGrid from "./ShopGrid";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "포인트 상점 · 스코어베이스",
  robots: { index: false, follow: false },
};

export default async function ShopPage() {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) redirect("/login?from=/account/shop");

  const [user, owned] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        nickname: true,
        points: true,
        level: true,
        badge: true,
        avatarUrl: true,
        nameColor: true,
        avatarFrame: true,
      },
    }),
    prisma.userCosmetic.findMany({
      where: { userId: session.userId },
      select: { itemId: true },
    }),
  ]);
  if (!user) redirect("/login?from=/account/shop");

  const ownedIds = owned.map((o) => o.itemId);
  const avatar = resolveAvatar(user.avatarUrl, user.nickname, user.level, user.badge);

  return (
    <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <AmbientGlow />

      <div className="mb-6 px-1">
        <Link href="/account" className="text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          ← 마이페이지
        </Link>
        <div className="mt-3 flex items-end justify-between gap-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">포인트 상점</h1>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {user.points.toLocaleString()}
            </div>
            <div className="text-[11px] text-neutral-500">보유 포인트</div>
          </div>
        </div>
        <p className="mt-2 text-sm text-neutral-500 break-keep">
          활동으로 모은 포인트로 프로필을 꾸며보세요. 구매한 아이템은 장착·해제할 수 있어요.
        </p>
      </div>

      {/* 현재 장착 미리보기 */}
      <div className="mb-6 flex items-center gap-3 rounded-3xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none px-5 py-4">
        <Avatar avatar={avatar} size="md" frame={user.avatarFrame} />
        <div>
          <UserName name={user.nickname} nameColor={user.nameColor} className="text-base font-bold" />
          <div className="text-[11px] text-neutral-500">현재 내 프로필 미리보기</div>
        </div>
      </div>

      <ShopGrid points={user.points} ownedIds={ownedIds} equipped={{ nameColor: user.nameColor, avatarFrame: user.avatarFrame }} />
    </div>
  );
}
