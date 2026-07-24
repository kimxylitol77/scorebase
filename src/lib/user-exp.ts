// 경험치/포인트 지급(차감) + 등급(level) 재계산 + 변동 이력(ExpLog) 기록.
// 글작성·댓글·추천·예측적중·삭제(회수)에서 호출. 등급 규칙은 src/lib/user-level.ts.

import "server-only";
import { prisma } from "@/lib/db";
import { EXP_REWARDS, POINT_REWARDS, expToLevel } from "@/lib/user-level";

/**
 * exp/points 증감 후 level 동기화 + ExpLog 기록.
 * 음수 delta(어뷰징 몰수·삭제 회수)도 허용 — exp 는 0 미만으로 내려가지 않게 바닥 처리.
 * @param reason ExpLog 사유 (post_create | comment | prediction_hit | recommend_received | post_delete | comment_delete ...)
 * @returns 갱신된 { exp, points, level } (변동 없으면 null)
 */
export async function awardExp(
  userId: string,
  delta: { exp?: number; points?: number },
  reason: string,
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

  // 변동 이력 (어뷰징 추적·롤백용)
  await prisma.expLog.create({
    data: { userId, exp: expDelta, points: pointDelta, reason },
  });

  // exp 음수면 0 보정 + level 재계산
  const flooredExp = Math.max(updated.exp, 0);
  const newLevel = expToLevel(flooredExp);
  if (newLevel !== updated.level || flooredExp !== updated.exp) {
    return prisma.user.update({
      where: { id: userId },
      data: { level: newLevel, exp: flooredExp },
      select: { exp: true, points: true, level: true },
    });
  }
  return updated;
}

/**
 * 출석(로그인) 보상 — KST 하루 1회. exp/points 지급 + lastAttendanceAt 갱신.
 * 이메일 로그인·구글 OAuth 콜백 양쪽에서 호출 (경로별 중복 방지용 공통 헬퍼).
 * 오늘 이미 받았으면 아무것도 하지 않음. 실패해도 로그인 흐름은 막지 않도록 호출부에서 catch.
 */
export async function awardAttendance(userId: string): Promise<void> {
  const KST = 9 * 3600 * 1000;
  const nk = new Date(Date.now() + KST);
  const todayStart = new Date(
    Date.UTC(nk.getUTCFullYear(), nk.getUTCMonth(), nk.getUTCDate()) - KST,
  );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastAttendanceAt: true },
  });
  if (user?.lastAttendanceAt && user.lastAttendanceAt >= todayStart) return; // 오늘 이미 출석

  await prisma.user.update({
    where: { id: userId },
    data: { lastAttendanceAt: new Date() },
  });
  await awardExp(
    userId,
    { exp: EXP_REWARDS.attendance, points: POINT_REWARDS.attendance },
    "attendance",
  );
}
