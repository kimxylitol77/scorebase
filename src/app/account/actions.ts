"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { USER_COOKIE_NAME, readUserSessionCookie } from "@/lib/user-auth";
import { AVATAR_IDS, AVATAR_EDIT_MIN_LEVEL } from "@/lib/avatars";

const MAX_AVATAR_DATAURL = 300_000; // ~225KB. 160px webp 면 보통 수십KB → 넉넉한 상한 가드.

export type UploadAvatarState = { error?: string } | null;

/** 아바타 사진 업로드 — 본인만. 브라우저에서 160px webp 로 줄인 data URL 을 받아 DB 에 저장. */
export async function uploadAvatarAction(
  _prev: UploadAvatarState,
  formData: FormData,
): Promise<UploadAvatarState> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return { error: "로그인이 필요합니다." };

  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { level: true } });
  if (!me || me.level < AVATAR_EDIT_MIN_LEVEL) {
    return { error: "2등급(유소년)부터 아바타를 바꿀 수 있어요." };
  }

  const dataUrl = String(formData.get("avatarData") ?? "");
  if (!dataUrl) return { error: "파일을 선택해주세요." };
  if (!/^data:image\/(webp|png|jpeg);base64,/.test(dataUrl)) {
    return { error: "이미지를 처리하지 못했습니다. 다른 사진을 시도해주세요." };
  }
  if (dataUrl.length > MAX_AVATAR_DATAURL) return { error: "이미지가 너무 큽니다." };

  try {
    await prisma.user.update({ where: { id: session.userId }, data: { avatarUrl: dataUrl } });
  } catch (e) {
    console.error("[avatar-upload]", e);
    return { error: "저장에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }
  revalidatePath("/account");
  return null;
}

/** 아바타 프리셋 변경 — 본인만. */
export async function setAvatarAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return;
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { level: true } });
  if (!me || me.level < AVATAR_EDIT_MIN_LEVEL) return;
  const avatarId = String(formData.get("avatarId") ?? "");
  if (!AVATAR_IDS.includes(avatarId)) return;
  await prisma.user.update({
    where: { id: session.userId },
    data: { avatarUrl: avatarId },
  });
  revalidatePath("/account");
}

/** 닉네임 변경 — 본인만. 1~20자(공백 제거). 무효면 무시(client 에서 required·maxLength 1차 방어). */
export async function setNicknameAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return;
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (nickname.length < 1 || nickname.length > 20) return;
  await prisma.user.update({
    where: { id: session.userId },
    data: { nickname },
  });
  revalidatePath("/account");
}

/** 대표(좋아하는) 팀 설정 — 본인만. 존재하는 팀만. 프로필에 로고 표시. */
export async function setFavoriteTeamAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return;
  const teamId = Number(formData.get("teamId"));
  if (!Number.isInteger(teamId)) return;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) return;
  await prisma.user.update({ where: { id: session.userId }, data: { favoriteTeamId: teamId } });
  revalidatePath("/account");
}

/** 대표팀 해제 — 본인만. */
export async function clearFavoriteTeamAction(): Promise<void> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return;
  await prisma.user.update({ where: { id: session.userId }, data: { favoriteTeamId: null } });
  revalidatePath("/account");
}

export type DeleteAccountState = { error?: string } | null;

/** 회원 탈퇴 — 본인 세션 확인 후 계정 삭제. 게시글·댓글·예측·드림팀은 onDelete: Cascade 로 일괄 삭제.
 *  실패를 삼키면 "탈퇴됐다고 믿는데 계정이 남는" 최악 케이스라, P2025(이미 없음) 외에는 에러로 알린다. */
export async function deleteAccountAction(
  _prev: DeleteAccountState,
  _formData: FormData,
): Promise<DeleteAccountState> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) redirect("/login");

  try {
    await prisma.user.delete({ where: { id: session.userId } });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")) {
      return { error: "탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
    }
  }
  c.delete(USER_COOKIE_NAME);
  redirect("/");
}
