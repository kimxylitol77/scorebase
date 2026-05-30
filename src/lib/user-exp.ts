// 경험치/포인트 지급(차감) + 등급(level) 재계산. 글작성·추천·예측적중에서 호출.
// 등급 계산 규칙은 src/lib/user-level.ts (DB 무관 순수 함수)를 단일 진실로 사용.

import "server-only";
import { prisma } from "@/lib/db";
import { expToLevel } from "@/lib/user-level";

/**
 * exp/points 증감 후, exp 가 바뀌었으면 level 을 expToLevel 로 동기화.
 * 음수 delta(어뷰징 몰수)도 허용 — exp 는 0 미만으로 내려가지 않게 바닥 처리.
 * @returns 갱신된 { exp, points, level } (변동 없으면 null)
 */
export async function awardExp(
  userId: string,
  delta: { exp?: number; points?: number },
): Promise<{ exp: number; points: number; level: number } | null> {
  const expDelta = delta.exp ?? 0;
  const pointDelta = delta.points ?? 0;
  if (expDelta === 0 && pointDelta === 0) return null;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      exp: { increment: expDelta },
      points: { increment: pointDelta },
    },
    select: { exp: true, points: true, level: true },
  });

  // exp 가 음수면 0 으로 보정(다음 차감 누적 방지) + level 재계산
  const flooredExp = Math.max(updated.exp, 0);
  const newLevel = expToLevel(flooredExp);
  if (newLevel !== updated.level || flooredExp !== updated.exp) {
    const fixed = await prisma.user.update({
      where: { id: userId },
      data: { level: newLevel, exp: flooredExp },
      select: { exp: true, points: true, level: true },
    });
    return fixed;
  }
  return updated;
}
